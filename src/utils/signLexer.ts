export type SignToken = {
  type: 'WORD' | 'LETTER' | 'NUMBER' | 'PUNCTUATION'
  value: string        // normalized English value
  raw: string          // original gestureKey
  timestamp?: number
}

const WORD_MAP: Record<string, string> = {
  'Thumb_Up':       'YES',
  'Thumb_Down':     'NO',
  'Open_Palm':      'STOP',
  'Closed_Fist':    'WAIT',
  'Victory':        'HELLO',
  'ILoveYou':       'LOVE',
  'Pointing_Up':    'MOMENT',
  'ASL_PLEASE':     'PLEASE',
  'ASL_THANKYOU':   'THANK_YOU',
  'ASL_SORRY':      'SORRY',
  'ASL_HELP':       'HELP',
  'ASL_MORE':       'MORE',
  'ASL_FINISHED':   'FINISHED',
  'ASL_WANT':       'WANT',
  'ASL_UNDERSTAND': 'UNDERSTAND',
  'ASL_WHERE':      'WHERE',
  'ASL_NAME':       'NAME',
  'ASL_PAIN':       'PAIN',
  'ASL_WATER':      'WATER',
  'ASL_EAT':        'EAT',
  'ASL_FRIEND':     'FRIEND',
}

function isLetter(sign: string): boolean {
  return sign.startsWith('ASL_') && sign.length === 5 &&
    sign[4] >= 'A' && sign[4] <= 'Z'
}

function isDigit(sign: string): boolean {
  return /^ASL_[0-9]$/.test(sign)
}

export function lexSigns(signs: string[]): SignToken[] {
  const tokens: SignToken[] = []
  let i = 0

  while (i < signs.length) {
    const sign = signs[i]

    // LETTER GROUPING — consecutive ASL_A..Z → single WORD token
    if (isLetter(sign)) {
      let word = ''
      const start = i
      while (i < signs.length && isLetter(signs[i])) {
        word += signs[i][4]
        i++
      }
      tokens.push({ type: 'WORD', value: word, raw: word })
      continue
    }

    // NUMBER GROUPING — consecutive ASL_0..9 → single NUMBER token
    if (isDigit(sign)) {
      let num = ''
      while (i < signs.length && isDigit(signs[i])) {
        num += signs[i][4]
        i++
      }
      tokens.push({ type: 'NUMBER', value: num, raw: num })
      continue
    }

    // KNOWN WORD SIGNS
    if (WORD_MAP[sign]) {
      tokens.push({ type: 'WORD', value: WORD_MAP[sign], raw: sign })
    }

    i++
  }

  return tokens
}
