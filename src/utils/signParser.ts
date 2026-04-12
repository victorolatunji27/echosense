import type { SignToken } from './signLexer'

export type DetectedPattern =
  | 'topic-comment'
  | 'verb-object'
  | 'negation'
  | 'question'
  | 'greeting'
  | 'single-word'
  | 'spelling'
  | 'unknown'

export type ParsedPhrase = {
  aslTokens: string[]              // original token order (ASL gloss)
  aslStructure: string             // human-readable gloss with annotation
  isQuestion: boolean
  isNegated: boolean
  hasTopic: boolean
  topicWord: string | null
  commentWords: string[]
  detectedPattern: DetectedPattern
  confidence: 'high' | 'medium' | 'low'
}

const QUESTION_WORDS = new Set(['WHERE', 'WHAT', 'WHO', 'WHEN', 'HOW', 'NAME'])
const GREETINGS = new Set(['HELLO', 'HI', 'BYE', 'GOODBYE', 'THANK_YOU', 'SORRY', 'LOVE'])
const OBJECTS = new Set(['WATER', 'FOOD', 'FRIEND', 'NAME', 'BATHROOM', 'PAIN', 'HOME', 'SCHOOL', 'WORK', 'MONEY', 'MOMENT', 'TIME'])
const VERBS = new Set(['WANT', 'EAT', 'HELP', 'UNDERSTAND', 'LOVE', 'FINISHED', 'STOP', 'WAIT', 'NEED', 'MORE'])

const KNOWN_VOCAB = new Set<string>([
  ...QUESTION_WORDS,
  ...GREETINGS,
  ...OBJECTS,
  ...VERBS,
  'YES', 'NO', 'PLEASE', 'THANK', 'THANK_YOU', 'GOOD', 'BAD', 'SICK',
])

function isSingleLetter(v: string): boolean {
  return v.length === 1 && v >= 'A' && v <= 'Z'
}

export function parseSigns(tokens: SignToken[]): ParsedPhrase {
  const values = tokens.map((t) => t.value)

  // ── Detect properties ─────────────────────────────────────────────
  const isQuestion = values.some((v) => QUESTION_WORDS.has(v))
  const isNegated = values.includes('NO') && values.length > 1

  // Topic-comment: object before verb
  let topicWord: string | null = null
  let commentWords: string[] = []
  const firstToken = values[0]
  if (firstToken && OBJECTS.has(firstToken) && values.some((v) => VERBS.has(v))) {
    topicWord = firstToken
    commentWords = values.slice(1)
  }
  const hasTopic = topicWord !== null

  // ── Detect pattern ────────────────────────────────────────────────
  let detectedPattern: DetectedPattern = 'unknown'

  if (values.length === 0) {
    detectedPattern = 'unknown'
  } else if (values.length === 1) {
    if (GREETINGS.has(values[0])) {
      detectedPattern = 'greeting'
    } else {
      detectedPattern = 'single-word'
    }
  } else if (values.every(isSingleLetter)) {
    detectedPattern = 'spelling'
  } else if (values.some((v) => GREETINGS.has(v)) && values.length <= 2) {
    detectedPattern = 'greeting'
  } else if (isQuestion) {
    detectedPattern = 'question'
  } else if (isNegated) {
    detectedPattern = 'negation'
  } else if (hasTopic) {
    detectedPattern = 'topic-comment'
  } else {
    // Verb-object: verb then noun
    const verbIdx = values.findIndex((v) => VERBS.has(v))
    const nounIdx = values.findIndex((v) => OBJECTS.has(v))
    if (verbIdx !== -1 && nounIdx !== -1 && verbIdx < nounIdx) {
      detectedPattern = 'verb-object'
    } else {
      detectedPattern = 'unknown'
    }
  }

  // ── Confidence scoring ───────────────────────────────────────────
  const allKnown = values.every((v) => KNOWN_VOCAB.has(v) || isSingleLetter(v))
  const anyLetters = values.some(isSingleLetter)

  let confidence: 'high' | 'medium' | 'low'
  if (detectedPattern === 'unknown') {
    confidence = 'low'
  } else if (detectedPattern === 'single-word' && !GREETINGS.has(values[0])) {
    confidence = 'low'
  } else if (allKnown && !anyLetters) {
    confidence = 'high'
  } else if (detectedPattern === 'spelling') {
    confidence = 'high'
  } else {
    confidence = 'medium'
  }

  // ── Build human-readable structure gloss ──────────────────────────
  const glossTokens = values
    .map((v) => (isSingleLetter(v) && values.length > 1 ? v : v))
    .join(detectedPattern === 'spelling' ? '-' : ' ')
  const aslStructure = `${glossTokens} [${detectedPattern}, ${confidence}]`

  return {
    aslTokens: values,
    aslStructure,
    isQuestion,
    isNegated,
    hasTopic,
    topicWord,
    commentWords,
    detectedPattern,
    confidence,
  }
}
