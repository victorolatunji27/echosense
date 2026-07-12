import Anthropic from '@anthropic-ai/sdk'

// NOTE: helpers are inlined (not shared via ./_utils) because Vercel's
// Node ESM runtime fails extensionless relative imports at cold start
// (ERR_MODULE_NOT_FOUND). Keep these functions self-contained.

// Only the exact models the app uses may pass through the proxy.
const ALLOWED_MODELS = new Set(['claude-sonnet-4-6'])
const MAX_BODY_BYTES = 32 * 1024
const MAX_OUTPUT_TOKENS = 1024
const MAX_MESSAGES = 40
const RATE_LIMIT = 30 // requests per window per IP
const RATE_WINDOW_MS = 60_000

const buckets = new Map<string, { count: number; resetAt: number }>()

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status })
}

/**
 * Best-effort per-IP fixed-window rate limit. State lives in the module
 * scope of a serverless instance, so the effective ceiling is
 * (limit × warm instances) — enough to stop casual abuse of the proxied
 * keys without an external store.
 */
function checkRateLimit(req: Request): Response | null {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const now = Date.now()

  if (buckets.size > 10_000) {
    for (const [key, bucket] of buckets) {
      if (now >= bucket.resetAt) buckets.delete(key)
    }
  }

  const bucket = buckets.get(ip)
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return null
  }
  if (bucket.count >= RATE_LIMIT) {
    return jsonError(429, 'Too many requests — please slow down.')
  }
  bucket.count += 1
  return null
}

async function readJsonBody(
  req: Request,
): Promise<{ body?: unknown; error?: Response }> {
  const declared = Number(req.headers.get('content-length') ?? '0')
  if (declared > MAX_BODY_BYTES) {
    return { error: jsonError(413, 'Request body too large.') }
  }

  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) {
    return { error: jsonError(413, 'Request body too large.') }
  }

  try {
    return { body: JSON.parse(text) }
  } catch {
    return { error: jsonError(400, 'Invalid JSON body.') }
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonError(405, 'Method not allowed.')
  }

  const limited = checkRateLimit(req)
  if (limited) return limited

  const apiKey = process.env.ANTHROPIC_KEY
  if (!apiKey) {
    return jsonError(500, 'ANTHROPIC_KEY is not configured on the server.')
  }

  const { body, error } = await readJsonBody(req)
  if (error) return error

  const { model, max_tokens, messages } = (body ?? {}) as {
    model?: unknown
    max_tokens?: unknown
    messages?: unknown
  }

  if (typeof model !== 'string' || !ALLOWED_MODELS.has(model)) {
    return jsonError(400, 'Model not allowed.')
  }
  if (
    typeof max_tokens !== 'number' ||
    !Number.isInteger(max_tokens) ||
    max_tokens < 1 ||
    max_tokens > MAX_OUTPUT_TOKENS
  ) {
    return jsonError(
      400,
      `max_tokens must be an integer between 1 and ${MAX_OUTPUT_TOKENS}.`,
    )
  }
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    messages.length > MAX_MESSAGES
  ) {
    return jsonError(400, `messages must be an array of 1–${MAX_MESSAGES} items.`)
  }

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model,
      max_tokens,
      messages: messages as Anthropic.MessageParam[],
    })
    return Response.json(message)
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? (err.status ?? 502) : 502
    return jsonError(status, 'Upstream Anthropic request failed.')
  }
}
