import type { SignToken } from './signLexer'

export type ParsedPhrase = {
  tokens: string[]         // normalized token values
  inferredSubject: string  // usually "I" or "you"
  isQuestion: boolean
  isNegated: boolean
  topicWord: string | null // the ASL topic if detected
}

const QUESTION_WORDS = new Set(['WHERE', 'WHAT', 'WHO', 'NAME'])

const OBJECTS = new Set(['WATER', 'FOOD', 'FRIEND', 'NAME', 'BATHROOM', 'PAIN'])

const VERBS = new Set(['WANT', 'EAT', 'HELP', 'UNDERSTAND', 'LOVE', 'FINISHED', 'STOP'])

export function parseSigns(tokens: SignToken[]): ParsedPhrase {
  const values = tokens.map((t) => t.value)

  const isQuestion =
    values.some((v) => QUESTION_WORDS.has(v)) ||
    // Spelled word ending with ? pattern not yet supported — NAME covers the common case
    false

  // Negation: NO appears after at least one other token
  const isNegated = values.includes('NO') && values.length > 1

  // Topic-comment: object before a verb → object is the topic
  let topicWord: string | null = null
  const firstToken = values[0]
  if (firstToken && OBJECTS.has(firstToken) && values.some((v) => VERBS.has(v))) {
    topicWord = firstToken
  }

  // Subject inference: FRIEND present → talking about another person → "you"
  const inferredSubject = values.includes('FRIEND') ? 'you' : 'I'

  return { tokens: values, inferredSubject, isQuestion, isNegated, topicWord }
}
