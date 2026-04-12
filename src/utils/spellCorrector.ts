import Anthropic from '@anthropic-ai/sdk'

// ── Small common-word dictionary for the fast-path ─────────────────
const COMMON_WORDS = new Set([
  'a','an','the','i','me','my','you','your','we','us','he','she','it',
  'is','am','are','was','were','be','do','did','have','has','had',
  'yes','no','hi','ok','okay','hello','help','stop','wait','go','come',
  'eat','drink','water','food','pain','hurt','more','done','name',
  'where','what','who','how','when','why','please','sorry','thank','thanks',
  'love','want','need','like','home','work','school','family','friend',
  'mom','dad','baby','good','bad','hot','cold','sick','fine','now',
  'today','tomorrow','yesterday','bathroom','hospital','phone',
  'one','two','three','four','five','six','seven','eight','nine','ten',
  'morning','night','day','week','year','time','money','car','bus',
  'happy','sad','angry','tired','hungry','thirsty','afraid','calm',
])

function titleCase(s: string): string {
  if (s.length === 0) return s
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

// ── Strategy 3 — Offline fallback rules ─────────────────────────────
function offlineFallback(raw: string): string {
  if (raw.length <= 2) return raw.toUpperCase()

  // Collapse consecutive duplicate letters: "HELLLLO" → "HELLO"
  let out = raw[0]
  for (let i = 1; i < raw.length; i++) {
    if (raw[i] !== raw[i - 1]) out += raw[i]
  }

  // If no vowels, insert 'E' after each consonant pair
  const vowels = 'AEIOUY'
  const hasVowel = [...out].some((c) => vowels.includes(c.toUpperCase()))
  if (!hasVowel && out.length >= 3) {
    let withVowels = ''
    for (let i = 0; i < out.length; i++) {
      withVowels += out[i]
      if (i < out.length - 1 && i % 2 === 1) withVowels += 'e'
    }
    out = withVowels
  }

  return titleCase(out)
}

// ── Public API ──────────────────────────────────────────────────────
export async function autocorrectWord(raw: string): Promise<string> {
  if (!raw || raw.length === 0) return ''

  const trimmed = raw.trim().toUpperCase()

  // Strategy 1 — direct dictionary match
  if (COMMON_WORDS.has(trimmed.toLowerCase())) {
    return titleCase(trimmed)
  }

  // Strategy 2 — Anthropic API correction
  const apiKey = (import.meta as Record<string, unknown> & { env: Record<string, string> }).env
    .VITE_ANTHROPIC_KEY

  if (!apiKey) {
    return offlineFallback(trimmed)
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const prompt = `A user spelled this word using ASL finger spelling (letter by letter):
"${trimmed}"

This may contain missing vowels, transposed letters, or small errors because ASL fingerspelling is difficult to do precisely.

Return ONLY the single most likely intended English word, correctly spelled, with first letter capitalized. No explanation. No punctuation except the word itself.

If the letters genuinely spell a real word already, return that word.
If no reasonable word can be inferred, return the original string capitalized.`

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 20,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()
      // Strip quotes, punctuation, whitespace
      .replace(/^["'`]+|["'`.,!?]+$/g, '')
      .trim()

    if (!text || text.length === 0) {
      return offlineFallback(trimmed)
    }
    return text
  } catch (err) {
    console.warn('[spellCorrector] API error — using offline fallback:', err)
    return offlineFallback(trimmed)
  }
}
