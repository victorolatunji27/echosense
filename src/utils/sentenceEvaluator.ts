import Anthropic from '@anthropic-ai/sdk'
import type { ParsedPhrase } from './signParser'

// ── Fallback maps ─────────────────────────────────────────────────────
const SINGLE_TOKEN: Record<string, string> = {
  'HELLO':      'Hello!',
  'HI':         'Hi!',
  'BYE':        'Goodbye.',
  'GOODBYE':    'Goodbye.',
  'THANK_YOU':  'Thank you!',
  'THANK':      'Thank you!',
  'SORRY':      'I am sorry.',
  'LOVE':       'I love you.',
  'HELP':       'I need help.',
  'WATER':      'I need water.',
  'FOOD':       'I need food.',
  'EAT':        'I want to eat.',
  'PAIN':       'I am in pain.',
  'YES':        'Yes.',
  'NO':         'No.',
  'STOP':       'Stop.',
  'WAIT':       'Please wait.',
  'MORE':       'I want more.',
  'FINISHED':   'I am finished.',
  'UNDERSTAND': 'I understand.',
  'FRIEND':     'My friend.',
  'NAME':       'What is your name?',
  'WHERE':      'Where?',
  'BATHROOM':   'I need the bathroom.',
  'HOME':       'I want to go home.',
  'SCHOOL':     'I am at school.',
  'WORK':       'I am at work.',
  'SICK':       'I am sick.',
  'GOOD':       'Good.',
  'BAD':        'Bad.',
  'PLEASE':     'Please.',
  'MOMENT':     'One moment.',
}

const NOUN_TO_NL: Record<string, string> = {
  WATER: 'water', FOOD: 'food', FRIEND: 'my friend',
  PAIN: 'pain', BATHROOM: 'the bathroom', NAME: 'name',
  HOME: 'home', SCHOOL: 'school', WORK: 'work',
  MONEY: 'money', TIME: 'the time',
}

const VERB_TO_NL: Record<string, string> = {
  WANT: 'want', EAT: 'want to eat', HELP: 'need help with',
  UNDERSTAND: 'understand', FINISHED: 'am finished with',
  MORE: 'want more', LOVE: 'love', NEED: 'need',
}

const NEG_VERB: Record<string, string> = {
  EAT: 'eat', WANT: 'want', UNDERSTAND: 'understand',
  HELP: 'help', STOP: 'want to stop', FINISHED: 'finish',
  LOVE: 'love', MORE: 'want more',
}

function titleCaseWord(t: string): string {
  if (t.length === 0) return t
  if (t.length === 1) return t
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()
}

// ── Rule-based fallback (offline / API failure path) ────────────────
function buildFallbackSentence(parsed: ParsedPhrase): string {
  const { aslTokens, detectedPattern, isQuestion, isNegated } = parsed

  if (aslTokens.length === 0) return ''

  // FAILSAFE 4 — single token
  if (aslTokens.length === 1) {
    const t = aslTokens[0]
    if (SINGLE_TOKEN[t]) return SINGLE_TOKEN[t]
    if (t.length === 1) return `${t}.`
    return titleCaseWord(t) + '.'
  }

  // FAILSAFE 2 + 6 — all single letters (spelling)
  const allLetters = aslTokens.every((t) => t.length === 1)
  if (allLetters) {
    const word = aslTokens.join('')
    // 2-letter common words
    const lower = word.toLowerCase()
    if (lower === 'hi') return 'Hi!'
    if (lower === 'ok') return 'Okay.'
    if (lower === 'no') return 'No.'
    // Looks like initials (3+ letters, all uppercase abbreviation)
    if (word.length >= 2 && word.length <= 4) {
      // Try as-name: "John" if it looks pronounceable, else as initials
      return `My name is ${titleCaseWord(word)}.`
    }
    return `${titleCaseWord(word)}.`
  }

  // FAILSAFE 3 — negation (use last polarity)
  if (detectedPattern === 'negation' || isNegated) {
    const verb = aslTokens.find((t) => NEG_VERB[t])
    if (verb) {
      return `I don't ${NEG_VERB[verb]}.`
    }
    return 'No.'
  }

  // Topic-comment pattern
  if (detectedPattern === 'topic-comment') {
    const topic = aslTokens[0]
    const comment = aslTokens[1] || ''
    const topicNL = NOUN_TO_NL[topic] || topic.toLowerCase()
    const commentNL = VERB_TO_NL[comment] || comment.toLowerCase()
    return `I ${commentNL} ${topicNL}.`.replace(/\s+/g, ' ')
  }

  // Question
  if (isQuestion || detectedPattern === 'question') {
    const loc = aslTokens.find((t) => NOUN_TO_NL[t])
    if (loc) {
      return `Where is ${NOUN_TO_NL[loc]}?`
    }
    if (aslTokens.includes('NAME')) return 'What is your name?'
    if (aslTokens.includes('WHAT')) return 'What?'
    if (aslTokens.includes('WHO')) return 'Who?'
    if (aslTokens.includes('WHEN')) return 'When?'
    if (aslTokens.includes('HOW')) return 'How?'
    return aslTokens.map(titleCaseWord).join(' ') + '?'
  }

  // Verb-object pattern
  if (detectedPattern === 'verb-object') {
    const verb = aslTokens.find((t) => VERB_TO_NL[t]) ?? aslTokens[0]
    const noun = aslTokens.find((t) => NOUN_TO_NL[t]) ?? aslTokens[1]
    const verbNL = VERB_TO_NL[verb] || verb.toLowerCase()
    const nounNL = NOUN_TO_NL[noun] || noun.toLowerCase()
    return `I ${verbNL} ${nounNL}.`.replace(/\s+/g, ' ')
  }

  // Greeting
  if (detectedPattern === 'greeting') {
    const greeting = aslTokens.find((t) => SINGLE_TOKEN[t])
    if (greeting) return SINGLE_TOKEN[greeting]
  }

  // FAILSAFE 5 — unknown / mixed: incorporate all concepts
  const meaningful = aslTokens.filter((t) => t !== 'YES' && t !== 'NO')
  if (meaningful.length === 0) return 'Yes.'

  const parts = meaningful.map((t) =>
    t.length === 1 ? t : (NOUN_TO_NL[t] || VERB_TO_NL[t] || t.toLowerCase())
  )

  if (parts.length === 1) return `I need ${parts[0]}.`
  if (parts.length === 2) return `I need ${parts[0]} and ${parts[1]}.`

  const last = parts.pop()
  return `I need ${parts.join(', ')}, and ${last}.`
}

// ── Prompt builder ───────────────────────────────────────────────────
function buildPrompt(parsed: ParsedPhrase): string {
  return `You are an expert ASL-to-English sentence evaluator.

## Your job
Convert the following ASL sign sequence into a single, grammatically correct English sentence.

## ASL input (in ASL word order)
Signs: ${parsed.aslTokens.join(' → ')}
ASL structure: ${parsed.aslStructure}
Pattern: ${parsed.detectedPattern}
Confidence: ${parsed.confidence}
Is question: ${parsed.isQuestion}
Is negated: ${parsed.isNegated}

## ASL grammar rules you must apply
1. ASL uses topic-comment structure — the object often comes BEFORE the verb. "WATER WANT" in ASL = "I want water" in English.
2. ASL drops pronouns (I, me, my, you, the, a). Infer and add them in English.
3. ASL negation comes AFTER the verb. "EAT NO" = "I don't want to eat."
4. ASL questions put the WH-word at the END. "BATHROOM WHERE" = "Where is the bathroom?"
5. Consecutive single letters are fingerspelled words — read them as a word if they form one, or as an abbreviation/name if they don't.

## Failsafe rules (ALWAYS apply these)

FAILSAFE 1 — Unknown combination:
If the token sequence doesn't match a known ASL pattern and you can't determine meaning, output the most charitable interpretation as a simple list sentence.
Example: "PAIN FRIEND WATER" → "My friend is in pain and needs water."

FAILSAFE 2 — Single letter sequence:
If all tokens are single letters, try to read them as a spelled word first. If they don't spell a word, treat each as an initial or part of a name.
Example: "H I" → "Hi!"  ·  "J O H N" → "My name is John."

FAILSAFE 3 — Contradictory negation:
If the sentence has both YES and NO, use the LAST token's polarity to determine meaning.

FAILSAFE 4 — Too few tokens:
If there is only 1 token, generate the simplest possible sentence.
Examples: "WATER" → "I need water."  ·  "HELP" → "I need help."  ·  "HELLO" → "Hello!"

FAILSAFE 5 — Nonsensical combination:
If combining the words literally makes no logical sense, find the most semantically related grouping and produce a sentence that uses ALL the concepts even if loosely.

FAILSAFE 6 — Letters that don't form a word:
Treat as a proper noun (name) or abbreviation and incorporate naturally.
Example: "N Y C" → "I need to go to NYC."

## Output rules
- Output ONLY the final English sentence.
- No explanation, no alternatives, no preamble.
- Always grammatically correct English.
- Maximum 20 words.
- Never output "I don't know" or "unclear" — always produce a sentence using the failsafes.
- First person ("I") unless context clearly implies second person ("you").
- End with . or ?`
}

// ── Public API ───────────────────────────────────────────────────────
export async function evaluateToSentence(parsed: ParsedPhrase): Promise<string> {
  const apiKey = (import.meta as Record<string, unknown> & { env: Record<string, string> }).env
    .VITE_ANTHROPIC_KEY

  if (!apiKey) {
    console.warn('[SentenceEvaluator] VITE_ANTHROPIC_KEY not set — using fallback')
    return buildFallbackSentence(parsed)
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 80,
      messages: [{ role: 'user', content: buildPrompt(parsed) }],
    })

    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    // Validate — must be a non-empty sentence with real content
    if (!text || text.length < 2) {
      return buildFallbackSentence(parsed)
    }

    // Reject phrases the failsafe is supposed to prevent
    const lower = text.toLowerCase()
    if (lower.includes("don't know") || lower.includes('unclear') || lower.includes('cannot')) {
      return buildFallbackSentence(parsed)
    }

    // Capitalize first letter, ensure terminal punctuation
    const cleaned = text.charAt(0).toUpperCase() + text.slice(1)
    if (!/[.!?]$/.test(cleaned)) {
      return cleaned + (parsed.isQuestion ? '?' : '.')
    }
    return cleaned
  } catch (err) {
    console.error('[SentenceEvaluator] API error — using fallback:', err)
    return buildFallbackSentence(parsed)
  }
}
