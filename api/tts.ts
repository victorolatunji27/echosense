// NOTE: helpers are inlined (not shared via ./_utils) because Vercel's
// Node ESM runtime fails extensionless relative imports at cold start
// (ERR_MODULE_NOT_FOUND). Keep these functions self-contained.

const MAX_BODY_BYTES = 8 * 1024
const MAX_TEXT_LENGTH = 1000
const VOICE_ID_RE = /^[A-Za-z0-9]{8,64}$/
const RATE_LIMIT = 20 // requests per window per IP
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

  const apiKey = process.env.ELEVENLABS_KEY
  if (!apiKey) {
    return jsonError(500, 'ELEVENLABS_KEY is not configured on the server.')
  }

  const { body, error } = await readJsonBody(req)
  if (error) return error

  const { text, voiceId } = (body ?? {}) as { text?: unknown; voiceId?: unknown }

  if (
    typeof text !== 'string' ||
    text.trim().length === 0 ||
    text.length > MAX_TEXT_LENGTH
  ) {
    return jsonError(
      400,
      `text must be a non-empty string of at most ${MAX_TEXT_LENGTH} characters.`,
    )
  }
  if (typeof voiceId !== 'string' || !VOICE_ID_RE.test(voiceId)) {
    return jsonError(400, 'Invalid voiceId.')
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

  if (!upstream.ok || !upstream.body) {
    return jsonError(502, 'Upstream TTS request failed.')
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  })
}
