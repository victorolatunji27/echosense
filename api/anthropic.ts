import Anthropic from '@anthropic-ai/sdk'
import { checkRateLimit, jsonError, readJsonBody } from './_utils'

// Only the exact models the app uses may pass through the proxy.
const ALLOWED_MODELS = new Set(['claude-sonnet-4-6'])
const MAX_BODY_BYTES = 32 * 1024
const MAX_OUTPUT_TOKENS = 1024
const MAX_MESSAGES = 40
const RATE_LIMIT = 30 // requests per window per IP
const RATE_WINDOW_MS = 60_000

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonError(405, 'Method not allowed.')
  }

  const limited = checkRateLimit(req, RATE_LIMIT, RATE_WINDOW_MS)
  if (limited) return limited

  const apiKey = process.env.ANTHROPIC_KEY
  if (!apiKey) {
    return jsonError(500, 'ANTHROPIC_KEY is not configured on the server.')
  }

  const { body, error } = await readJsonBody(req, MAX_BODY_BYTES)
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
