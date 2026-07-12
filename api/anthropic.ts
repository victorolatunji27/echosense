import Anthropic from '@anthropic-ai/sdk'

// Vercel invokes these functions with the legacy Node (req, res)
// signature (IncomingMessage / ServerResponse + helpers), NOT web
// Request/Response — verified from production runtime logs. Minimal
// structural types below avoid a dependency on @vercel/node.
interface VercelRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}
interface VercelResponse {
  status(code: number): VercelResponse
  json(obj: unknown): void
}

// Only the exact models the app uses may pass through the proxy.
const ALLOWED_MODELS = new Set(['claude-sonnet-4-6'])
const MAX_BODY_BYTES = 32 * 1024
const MAX_OUTPUT_TOKENS = 1024
const MAX_MESSAGES = 40
const RATE_LIMIT = 30 // requests per window per IP
const RATE_WINDOW_MS = 60_000

const buckets = new Map<string, { count: number; resetAt: number }>()

/**
 * Best-effort per-IP fixed-window rate limit. State lives in the module
 * scope of a serverless instance, so the effective ceiling is
 * (limit × warm instances) — enough to stop casual abuse of the proxied
 * keys without an external store.
 */
function isRateLimited(req: VercelRequest): boolean {
  const forwarded = req.headers['x-forwarded-for']
  const ip =
    (Array.isArray(forwarded) ? forwarded[0] : forwarded)
      ?.split(',')[0]
      ?.trim() || 'unknown'
  const now = Date.now()

  if (buckets.size > 10_000) {
    for (const [key, bucket] of buckets) {
      if (now >= bucket.resetAt) buckets.delete(key)
    }
  }

  const bucket = buckets.get(ip)
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  if (bucket.count >= RATE_LIMIT) return true
  bucket.count += 1
  return false
}

function bodyTooLarge(req: VercelRequest, maxBytes: number): boolean {
  return Number(req.headers['content-length'] ?? '0') > maxBytes
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }
  if (isRateLimited(req)) {
    res.status(429).json({ error: 'Too many requests — please slow down.' })
    return
  }

  const apiKey = process.env.ANTHROPIC_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_KEY is not configured on the server.' })
    return
  }

  if (bodyTooLarge(req, MAX_BODY_BYTES)) {
    res.status(413).json({ error: 'Request body too large.' })
    return
  }

  // Vercel pre-parses JSON bodies into req.body
  const { model, max_tokens, messages } = ((typeof req.body === 'object' && req.body) || {}) as {
    model?: unknown
    max_tokens?: unknown
    messages?: unknown
  }

  if (typeof model !== 'string' || !ALLOWED_MODELS.has(model)) {
    res.status(400).json({ error: 'Model not allowed.' })
    return
  }
  if (
    typeof max_tokens !== 'number' ||
    !Number.isInteger(max_tokens) ||
    max_tokens < 1 ||
    max_tokens > MAX_OUTPUT_TOKENS
  ) {
    res.status(400).json({
      error: `max_tokens must be an integer between 1 and ${MAX_OUTPUT_TOKENS}.`,
    })
    return
  }
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > MAX_MESSAGES
  ) {
    res.status(400).json({ error: `messages must be an array of 1–${MAX_MESSAGES} items.` })
    return
  }

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model,
      max_tokens,
      messages: messages as Anthropic.MessageParam[],
    })
    res.status(200).json(message)
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? (err.status ?? 502) : 502
    res.status(status).json({ error: 'Upstream Anthropic request failed.' })
  }
}
