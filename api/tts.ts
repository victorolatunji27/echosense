import { checkRateLimit, jsonError, readJsonBody } from './_utils'

const MAX_BODY_BYTES = 8 * 1024
const MAX_TEXT_LENGTH = 1000
const VOICE_ID_RE = /^[A-Za-z0-9]{8,64}$/
const RATE_LIMIT = 20 // requests per window per IP
const RATE_WINDOW_MS = 60_000

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonError(405, 'Method not allowed.')
  }

  const limited = checkRateLimit(req, RATE_LIMIT, RATE_WINDOW_MS)
  if (limited) return limited

  const apiKey = process.env.ELEVENLABS_KEY
  if (!apiKey) {
    return jsonError(500, 'ELEVENLABS_KEY is not configured on the server.')
  }

  const { body, error } = await readJsonBody(req, MAX_BODY_BYTES)
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
