export type SignToken = {
  type: 'WORD' | 'LETTER' | 'NUMBER' | 'PUNCTUATION'
  value: string        // normalized English value
  raw: string          // original gestureKey
  timestamp?: number
}

// Maps gesture keys to their sentence-context English values.
// Note: Open_Palm maps to PLEASE here (more useful than STOP in sentences).
const WORD_MAP: Record<string, string> = {
  'Thumb_Up':       'YES',
  'Thumb_Down':     'NO',
  'Open_Palm':      'PLEASE',
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
  'ASL_BATHROOM':   'BATHROOM',
  'ASL_FOOD':       'FOOD',
  'ASL_YES':        'YES',
  'ASL_NO':         'NO',
  'ASL_WHAT':       'WHAT',
  'ASL_WHO':        'WHO',
  'ASL_WHEN':       'WHEN',
  'ASL_HOW':        'HOW',
  'ASL_SICK':       'SICK',
  'ASL_GOOD':       'GOOD',
  'ASL_BAD':        'BAD',
  'ASL_WORK':       'WORK',
  'ASL_HOME':       'HOME',
  'ASL_SCHOOL':     'SCHOOL',
  'ASL_MONEY':      'MONEY',
  'ASL_TIME':       'TIME',
  'ASL_THANK':      'THANK',
  'ASL_YOU':        'YOU',
  'ASL_GO':         'GO',
}

// Gestures that act as word boundaries — they break letter grouping
// without producing a token themselves.
const WORD_BOUNDARY = new Set(['ASL_SPACE'])

// Gestures that delete the last committed token.
const DELETE_TOKEN = new Set(['ASL_DELETE'])

// ── Simple word dictionary for letter-grouping validation ────────────
const COMMON_WORDS = new Set([
  'a','an','the','i','me','my','you','your','we',
  'is','am','are','was','be','do','did','have',
  'has','can','will','would','should','could',
  'yes','no','hi','hello','help','stop','wait',
  'eat','drink','water','food','pain','hurt',
  'more','done','name','where','what','who','how',
  'please','sorry','thank','love','want','need',
  'go','come','here','there','now','today',
  'good','bad','hot','cold','sick','fine','ok',
  'bathroom','hospital','phone','family','friend',
  'mom','dad','baby','home','work','school',
  'one','two','three','four','five','six',
  'seven','eight','nine','ten',
  'hi','bye','no','ok','dr','mr','ms',
  'not','but','and','or','for','with','from',
  'this','that','they','them','she','her','he','him',
  'it','its','our','all','just','get','got','let',
  'why','may','must','too','very','much','like',
  'back','call','know','think','feel','see','look',
  'tell','ask','say','take','give','make','keep',
])

export function isLikelyWord(word: string): boolean {
  const lower = word.toLowerCase()
  if (lower.length === 1) return true
  if (lower.length === 2) {
    return ['ok','hi','no','me','my','is','am',
            'be','do','go','we','an','at','by',
            'if','in','of','on','or','so','to',
            'up','us','he','it'].includes(lower)
  }
  return COMMON_WORDS.has(lower)
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

    // WORD BOUNDARY — ASL_SPACE ends any active letter/digit run
    if (WORD_BOUNDARY.has(sign)) {
      i++
      continue
    }

    // DELETE — pop last token (backspace)
    if (DELETE_TOKEN.has(sign)) {
      tokens.pop()
      i++
      continue
    }

    // LETTER GROUPING — consecutive ASL_A..Z (with no SPACE between) → WORD or individual LETTER tokens
    if (isLetter(sign)) {
      let word = ''
      while (
        i < signs.length &&
        isLetter(signs[i]) &&
        !WORD_BOUNDARY.has(signs[i])
      ) {
        word += signs[i][4]
        i++
      }

      if (isLikelyWord(word)) {
        // Recognized word — emit as single WORD token
        tokens.push({ type: 'WORD', value: word, raw: word })
      } else {
        // Not a recognizable word — break back into individual letters
        for (const letter of word) {
          tokens.push({ type: 'LETTER', value: letter, raw: `ASL_${letter}` })
        }
      }
      continue
    }

    // NUMBER GROUPING — consecutive ASL_0..9 → NUMBER token
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
