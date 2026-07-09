// Thin client for the /api/anthropic serverless proxy. All Anthropic
// traffic goes through it so the API key never reaches the browser.

type ContentBlock = { type: string; text?: string }
type ProxyMessage = { content?: ContentBlock[] }

export const CLAUDE_MODEL = 'claude-sonnet-4-6'

/**
 * Sends a single-turn prompt to Claude via the serverless proxy and
 * returns the concatenated text of the response.
 *
 * `accessToken` (Auth0) is attached as X-Auth-Token to mark the call as
 * originating from an authenticated EchoSense session.
 *
 * Throws on any network or non-2xx failure — callers keep their own
 * offline fallbacks.
 */
export async function createClaudeMessage(
  prompt: string,
  maxTokens: number,
  accessToken?: string,
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (accessToken) headers['X-Auth-Token'] = accessToken

  const res = await fetch('/api/anthropic', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    throw new Error(`/api/anthropic responded ${res.status}`)
  }

  const message = (await res.json()) as ProxyMessage
  return (message.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text ?? '')
    .join('')
    .trim()
}
