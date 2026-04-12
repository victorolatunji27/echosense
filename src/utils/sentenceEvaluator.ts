import Anthropic from '@anthropic-ai/sdk'
import type { ParsedPhrase } from './signParser'

// ── FAST_MAP — instant responses for common single/double signs ─────
const FAST_MAP: Record<string, string> = {
  'LOVE':             'I love you.',
  'HELLO':            'Hello!',
  'THANK_YOU':        'Thank you!',
  'SORRY':            'I am sorry.',
  'YES':              'Yes.',
  'NO':               'No.',
  'HELP':             'I need help.',
  'WATER':            'I need water.',
  'EAT':              'I want to eat.',
  'PAIN':             'I am in pain.',
  'FINISHED':         'I am finished.',
  'MORE':             'I want more.',
  'UNDERSTAND':       'I understand.',
  'STOP':             'Stop.',
  'WAIT':             'Please wait.',
  'BATHROOM':         'I need the bathroom.',
  'FRIEND':           'Hello, friend.',
  'NAME':             'What is your name?',
  'WHERE':            'Where?',
  'PLEASE':           'Please.',
  'MOMENT':           'One moment.',
  // Two-sign combos
  'LOVE FRIEND':      'I love you, friend.',
  'THANK_YOU FRIEND': 'Thank you, my friend.',
  'HELLO FRIEND':     'Hello, my friend!',
  'HELP PLEASE':      'Please help me.',
  'WATER PLEASE':     'Water, please.',
  'WATER WANT':       'I want water.',
  'EAT WANT':         'I want to eat.',
  'MORE PLEASE':      'More, please.',
  'SORRY PLEASE':     'I am sorry, please forgive me.',
  'UNDERSTAND NO':    'I do not understand.',
  'EAT FINISHED':     'I am done eating.',
  'WANT MORE':        'I want more.',
  'PAIN HELP':        'I am in pain, please help.',
  'NAME WHAT':        'What is your name?',
  'WHERE BATHROOM':   'Where is the bathroom?',
}

// ── EXPANSION_MAP — semantic expansion for the LLM prompt ───────────
const EXPANSION_MAP: Record<string, string> = {
  'YES':          'affirmative / yes',
  'NO':           'negative / no',
  'HELLO':        'greeting / hello',
  'LOVE':         'I love you',
  'STOP':         'stop / halt',
  'WAIT':         'wait / one moment',
  'MOMENT':       'one moment / just a second',
  'PLEASE':       'please (polite request)',
  'THANK_YOU':    'thank you / thanks',
  'SORRY':        'I am sorry / apologies',
  'HELP':         'I need help / please help me',
  'MORE':         'I want more / give me more',
  'FINISHED':     'I am finished / all done',
  'WANT':         'I want / I need',
  'UNDERSTAND':   'I understand / I get it',
  'WHERE':        'where is / where are',
  'NAME':         'what is your name / my name',
  'PAIN':         'I am in pain / it hurts',
  'WATER':        'I need water / water please',
  'EAT':          'I want to eat / food please',
  'FRIEND':       'my friend / a friend',
  'BATHROOM':     'I need the bathroom',
}

// ── Fallback helpers ────────────────────────────────────────────────
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

// ── Rule-based fallback ─────────────────────────────────────────────
function buildFallbackSentence(parsed: ParsedPhrase): string {
  const { aslTokens, detectedPattern, isQuestion, isNegated } = parsed

  if (aslTokens.length === 0) return 'Yes.'

  // Single token
  if (aslTokens.length === 1) {
    const t = aslTokens[0]
    if (SINGLE_TOKEN[t]) return SINGLE_TOKEN[t]
    if (t.length === 1) return `${t}.`
    return titleCaseWord(t) + '.'
  }

  // All letters (spelling)
  const allLetters = aslTokens.every((t) => t.length === 1)
  if (allLetters) {
    const word = aslTokens.join('')
    const lower = word.toLowerCase()
    if (lower === 'hi') return 'Hi!'
    if (lower === 'ok') return 'Okay.'
    if (lower === 'no') return 'No.'
    if (word.length >= 2 && word.length <= 4) {
      return `My name is ${titleCaseWord(word)}.`
    }
    return `${titleCaseWord(word)}.`
  }

  // Negation
  if (detectedPattern === 'negation' || isNegated) {
    const verb = aslTokens.find((t) => NEG_VERB[t])
    if (verb) return `I don't ${NEG_VERB[verb]}.`
    return 'No.'
  }

  // Topic-comment
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
    if (loc) return `Where is ${NOUN_TO_NL[loc]}?`
    if (aslTokens.includes('NAME')) return 'What is your name?'
    if (aslTokens.includes('WHAT')) return 'What?'
    if (aslTokens.includes('WHO')) return 'Who?'
    if (aslTokens.includes('WHEN')) return 'When?'
    if (aslTokens.includes('HOW')) return 'How?'
    return aslTokens.map(titleCaseWord).join(' ') + '?'
  }

  // Verb-object
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

  // Unknown / mixed
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

// ── Grammar validation ──────────────────────────────────────────────
function isValidSentence(s: string): boolean {
  if (!s || s.length < 2) return false
  const trimmed = s.trim()
  // Must end with punctuation
  if (!/[.!?]$/.test(trimmed)) return false
  // Must start with capital letter
  if (!/^[A-Z]/.test(trimmed)) return false
  // Must not contain raw gesture key names
  if (/ASL_|GESTURE_|_MAP/.test(trimmed)) return false
  // Reject single-word fragments unless they are approved short responses
  const words = trimmed.split(/\s+/)
  const SHORT_OK = new Set(['Hello!', 'Hi!', 'Yes.', 'No.', 'Stop.', 'Wait.', 'Where?', 'What?', 'Who?', 'When?', 'How?'])
  if (words.length === 1 && !SHORT_OK.has(trimmed)) return false
  // Reject nonsense / refusal
  const lower = trimmed.toLowerCase()
  if (lower.includes("don't know") || lower.includes('unclear') || lower.includes('cannot determine')) return false
  return true
}

// ── Prompt ──────────────────────────────────────────────────────────
function buildPrompt(parsed: ParsedPhrase): string {
  const expanded = parsed.aslTokens.map((t) => EXPANSION_MAP[t] || t)
  const numbered = parsed.aslTokens
    .map((t, i) => `${i + 1}. ${t} = "${expanded[i]}"`)
    .join('\n')

  return `You are an expert ASL-to-English sentence evaluator.

## Input signs (in ASL order, with full meanings)
${numbered}

## Context
Pattern: ${parsed.detectedPattern}
Is question: ${parsed.isQuestion}
Is negated: ${parsed.isNegated}

## Critical rules
1. ALWAYS output a complete, grammatically correct English sentence. Never output fragments.
2. "LOVE" or "ILoveYou" sign ALWAYS becomes "I love you." — never just "love".
3. Single greeting signs become complete sentences:
   "HELLO" → "Hello!" not just "Hello"
   "THANK_YOU" → "Thank you!"
   "SORRY" → "I am sorry."
4. Expand all ASL topic-comment to English SVO:
   "WATER WANT" → "I want water."
   "EAT FINISHED" → "I am done eating."
5. Add pronouns (I, you, my, we) that ASL omits.
6. Negation after verb becomes "don't/doesn't":
   "UNDERSTAND NO" → "I don't understand."
7. Multiple signs form ONE coherent sentence. Do not output multiple sentences for one input.
8. If signs seem contradictory or random, find the most charitable single-sentence interpretation that uses ALL the concepts.
9. Always end with correct punctuation (. or ?).
10. Maximum 15 words.

## Output
Return ONLY the final English sentence.
No explanation. No alternatives. No quotation marks. Just the sentence.`
}

// ── Public API ───────────────────────────────────────────────────────
export async function evaluateToSentence(parsed: ParsedPhrase): Promise<string> {
  if (parsed.aslTokens.length === 0) return ''

  // FAST PATH — common cases never hit the LLM
  const forwardKey = parsed.aslTokens.join(' ')
  if (FAST_MAP[forwardKey]) return FAST_MAP[forwardKey]

  const reverseKey = [...parsed.aslTokens].reverse().join(' ')
  if (FAST_MAP[reverseKey]) return FAST_MAP[reverseKey]

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
      .replace(/^["'`]+|["'`]+$/g, '')
      .trim()

    if (!text) return buildFallbackSentence(parsed)

    // Capitalize first letter, ensure terminal punctuation
    let cleaned = text.charAt(0).toUpperCase() + text.slice(1)
    if (!/[.!?]$/.test(cleaned)) {
      cleaned = cleaned + (parsed.isQuestion ? '?' : '.')
    }

    // Validate — if it's a fragment or contains raw keys, fall back
    if (!isValidSentence(cleaned)) {
      return buildFallbackSentence(parsed)
    }

    return cleaned
  } catch (err) {
    console.error('[SentenceEvaluator] API error — using fallback:', err)
    return buildFallbackSentence(parsed)
  }
}
