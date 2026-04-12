import Anthropic from '@anthropic-ai/sdk'
import type { ParsedPhrase } from './signParser'

const VERB_MAP: Record<string, string> = {
  WANT: 'want',
  EAT: 'eat',
  HELP: 'help',
  UNDERSTAND: 'understand',
  LOVE: 'love',
  FINISHED: 'am done',
  STOP: 'stop',
  WAIT: 'wait',
}

const NOUN_MAP: Record<string, string> = {
  WATER: 'water',
  FRIEND: 'friend',
  PAIN: 'pain',
  NAME: 'name',
  BATHROOM: 'the bathroom',
  MORE: 'more',
}

// Rule-based fallback — used when API is unavailable or key is missing
function buildFallbackSentence(parsed: ParsedPhrase): string {
  const { tokens, isQuestion, isNegated, inferredSubject, topicWord } = parsed

  if (tokens.includes('HELLO')) return 'Hello!'
  if (tokens.includes('THANK_YOU')) return 'Thank you!'
  if (tokens.includes('SORRY')) return 'I am sorry.'
  if (tokens.includes('YES')) return 'Yes.'
  if (tokens.includes('NO') && tokens.length === 1) return 'No.'
  if (tokens.includes('PLEASE') && tokens.includes('HELP')) return 'Please help me.'
  if (tokens.includes('LOVE') && tokens.length <= 2) return 'I love you.'
  if (tokens.includes('MORE')) return 'I want more.'
  if (tokens.includes('FINISHED')) return 'I am done.'
  if (tokens.includes('WAIT')) return 'Wait.'

  if (isQuestion && tokens.includes('NAME')) return 'What is your name?'

  const verb = tokens.find((t) => VERB_MAP[t])
  const noun = topicWord ?? tokens.find((t) => NOUN_MAP[t]) ?? null

  if (isQuestion && noun) {
    return `Where is ${NOUN_MAP[noun] ?? noun.toLowerCase()}?`
  }

  if (verb && noun) {
    const neg = isNegated ? "don't " : ''
    const obj = NOUN_MAP[noun] ?? noun.toLowerCase()
    return `${inferredSubject} ${neg}${VERB_MAP[verb]} ${obj}.`
      .replace(/\s+/g, ' ')
      .trim()
  }

  if (verb) {
    const neg = isNegated ? "don't " : ''
    return `${inferredSubject} ${neg}${VERB_MAP[verb]}.`
  }

  // Last resort: join words naturally
  return tokens
    .map((t) => t.toLowerCase().replace(/_/g, ' '))
    .join(' ')
}

export async function evaluateToSentence(
  parsed: ParsedPhrase,
  rawSigns: string[],
): Promise<string> {
  const apiKey = (import.meta as Record<string, unknown> & { env: Record<string, string> }).env
    .VITE_ANTHROPIC_KEY

  if (!apiKey) {
    console.warn('[SentenceEvaluator] VITE_ANTHROPIC_KEY not set — using fallback')
    return buildFallbackSentence(parsed)
  }

  const client = new Anthropic({
    apiKey,
    dangerouslyAllowBrowser: true,
  })

  const signsStr = parsed.tokens.join(' → ')
  const contextParts = [
    parsed.isQuestion ? 'This is a question.' : '',
    parsed.isNegated ? 'This contains negation.' : '',
    parsed.topicWord ? `Topic word: ${parsed.topicWord}` : '',
  ].filter(Boolean)
  const context = contextParts.length > 0 ? '\n' + contextParts.join(' ') : ''

  const prompt = `You are an ASL-to-English translator.

A person is communicating using American Sign Language.
The signs they made (in order) were: ${signsStr}${context}

Rules:
- ASL omits words like I, me, my, am, is, are, the, a
- ASL topic-comment structure means the object often comes before the verb
- Negation (NO/NOT) comes after the verb in ASL
- WHERE questions appear at the end in ASL
- Spelled words (consecutive letters) are real words
- Produce ONE natural English sentence or short phrase
- If it's a question, end with ?
- Keep it simple and literal — do not over-interpret
- If the signs are too ambiguous, return the most likely meaning
- Maximum 15 words in your response
- Return ONLY the English sentence, nothing else`

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 60,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    return text || buildFallbackSentence(parsed)
  } catch (err) {
    console.error('[SentenceEvaluator] API error — using fallback:', err)
    return buildFallbackSentence(parsed)
  }
}
