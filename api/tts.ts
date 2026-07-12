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
  setHeader(name: string, value: string): void
  send(data: unknown): void
}

const MAX_BODY_BYTES = 8 * 1024
const MAX_TEXT_LENGTH = 1000
const VOICE_ID_RE = /^[A-Za-z0-9]{8,64}$/
const RATE_LIMIT = 20 // requests per window per IP
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' })
    return
  }
  if (isRateLimited(req)) {
    res.status(429).json({ error: 'Too many requests — please slow down.' })
    return
  }

  const apiKey = process.env.ELEVENLABS_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'ELEVENLABS_KEY is not configured on the server.' })
    return
  }

  if (Number(req.headers['content-length'] ?? '0') > MAX_BODY_BYTES) {
    res.status(413).json({ error: 'Request body too large.' })
    return
  }

  // Vercel pre-parses JSON bodies into req.body
  const { text, voiceId } = ((typeof req.body === 'object' && req.body) || {}) as {
    text?: unknown
    voiceId?: unknown
  }

  if (
    typeof text !== 'string' ||
    text.trim().length === 0 ||
    text.length > MAX_TEXT_LENGTH
  ) {
    res.status(400).json({
      error: `text must be a non-empty string of at most ${MAX_TEXT_LENGTH} characters.`,
    })
    return
  }
  if (typeof voiceId !== 'string' || !VOICE_ID_RE.test(voiceId)) {
    res.status(400).json({ error: 'Invalid voiceId.' })
    return
  }

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    },
  )

  if (!upstream.ok) {
    res.status(502).json({ error: 'Upstream TTS request failed.' })
    return
  }

  // TTS clips are short (<= 1000 chars of text) — buffering the audio is
  // simpler than streaming, and the client reads the full body anyway.
  const audio = Buffer.from(await upstream.arrayBuffer())
  res.setHeader('Content-Type', 'audio/mpeg')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200).send(audio)
}
