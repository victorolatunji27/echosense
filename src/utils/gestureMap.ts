export const GESTURE_MAP: Record<string, string> = {
  // MediaPipe built-ins
  Thumb_Up: 'Yes',
  Thumb_Down: 'No',
  Open_Palm: 'Stop',
  Closed_Fist: 'Wait',
  Victory: 'Hello',
  ILoveYou: 'I love you',
  Pointing_Up: 'One moment',

  // ASL Alphabet
  ASL_A: 'A', ASL_B: 'B', ASL_C: 'C', ASL_D: 'D', ASL_E: 'E',
  ASL_F: 'F', ASL_G: 'G', ASL_H: 'H', ASL_I: 'I', ASL_J: 'J',
  ASL_K: 'K', ASL_L: 'L', ASL_M: 'M', ASL_N: 'N', ASL_O: 'O',
  ASL_P: 'P', ASL_Q: 'Q', ASL_R: 'R', ASL_S: 'S', ASL_T: 'T',
  ASL_U: 'U', ASL_V: 'V', ASL_W: 'W', ASL_X: 'X', ASL_Y: 'Y',
  ASL_Z: 'Z',

  // Numbers
  ASL_0: '0', ASL_1: '1', ASL_2: '2', ASL_3: '3', ASL_4: '4',
  ASL_5: '5', ASL_6: '6', ASL_7: '7', ASL_8: '8', ASL_9: '9',

  // Common words
  ASL_PLEASE: 'Please',
  ASL_THANKYOU: 'Thank you',
  ASL_SORRY: 'Sorry',
  ASL_HELP: 'Help',
  ASL_MORE: 'More',
  ASL_FINISHED: 'Finished',
  ASL_WANT: 'Want',
  ASL_UNDERSTAND: 'Understand',
  ASL_NAME: 'Name',
  ASL_WHERE: 'Where',
  ASL_BATHROOM: 'Bathroom',
  ASL_PAIN: 'Pain / Hurt',
  ASL_WATER: 'Water',
  ASL_EAT: 'Eat',
  ASL_FRIEND: 'Friend',
  ASL_FOOD: 'Food',
  ASL_YES: 'Yes',
  ASL_NO: 'No',
  ASL_WHAT: 'What',
  ASL_WHO: 'Who',
  ASL_WHEN: 'When',
  ASL_HOW: 'How',
  ASL_SICK: 'Sick',
  ASL_GOOD: 'Good',
  ASL_BAD: 'Bad',
  ASL_WORK: 'Work',
  ASL_HOME: 'Home',
  ASL_SCHOOL: 'School',
  ASL_MONEY: 'Money',
  ASL_TIME: 'Time',
  ASL_YOU: 'You',
  ASL_GO: 'Go',

  // CNN special classes
  ASL_SPACE: '(space)',
  ASL_NOTHING: '',

  None: '',
}

export function getDisplayText(gestureName: string | null): string {
  if (gestureName === null) return ''
  return GESTURE_MAP[gestureName] ?? ''
}

/**
 * Strict map of gestures that the Phrase panel treats as whole words.
 * Any gesture NOT in this map (single letters, digits, etc.) is ignored
 * by Phrase mode entirely — it will not display or commit.
 */
export const PHRASE_PRIORITY_MAP: Record<string, string> = {
  // MediaPipe built-ins — always treated as whole words in phrase mode
  Victory:       'Hello',
  ILoveYou:      'I love you',
  Thumb_Up:      'Yes',
  Thumb_Down:    'No',
  Open_Palm:     'Stop',
  Closed_Fist:   'Wait',
  Pointing_Up:   'One moment',

  // Custom word gestures
  ASL_PLEASE:    'Please',
  ASL_THANKYOU:  'Thank you',
  ASL_SORRY:     'Sorry',
  ASL_HELP:      'Help',
  ASL_MORE:      'More',
  ASL_FINISHED:  'Finished',
  ASL_WANT:      'Want',
  ASL_UNDERSTAND:'Understand',
  ASL_WHERE:     'Where',
  ASL_NAME:      'Name',
  ASL_PAIN:      'Pain',
  ASL_WATER:     'Water',
  ASL_EAT:       'Eat',
  ASL_FRIEND:    'Friend',
  ASL_BATHROOM:  'Bathroom',
  ASL_FOOD:      'Food',
  ASL_YES:       'Yes',
  ASL_NO:        'No',
  ASL_WHAT:      'What',
  ASL_WHO:       'Who',
  ASL_WHEN:      'When',
  ASL_HOW:       'How',
  ASL_SICK:      'Sick',
  ASL_GOOD:      'Good',
  ASL_BAD:       'Bad',
  ASL_WORK:      'Work',
  ASL_HOME:      'Home',
  ASL_SCHOOL:    'School',
  ASL_MONEY:     'Money',
  ASL_TIME:      'Time',
}

/** Returns true if the gesture is eligible to commit in Phrase mode. */
export function isPhraseGesture(key: string | null): boolean {
  if (!key) return false
  if (key === 'None' || key === 'ASL_NOTHING') return false
  // Reject single ASL letters
  if (key.startsWith('ASL_') && key.length === 5 && key[4] >= 'A' && key[4] <= 'Z') return false
  // Reject ASL numbers
  if (key.startsWith('ASL_') && key.length === 5 && key[4] >= '0' && key[4] <= '9') return false
  // Accept only if in priority map
  return key in PHRASE_PRIORITY_MAP
}

export const VOCABULARY_SECTIONS: Array<{
  section: string
  entries: Array<{ key: string; label: string }>
}> = [
  {
    section: 'Quick responses',
    entries: [
      { key: 'Thumb_Up', label: 'Yes' },
      { key: 'Thumb_Down', label: 'No' },
      { key: 'Open_Palm', label: 'Stop' },
      { key: 'Closed_Fist', label: 'Wait' },
      { key: 'Victory', label: 'Hello' },
      { key: 'ILoveYou', label: 'I love you' },
      { key: 'Pointing_Up', label: 'One moment' },
    ],
  },
  {
    section: 'Alphabet',
    entries: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => ({
      key: `ASL_${l}`,
      label: l,
    })),
  },
  {
    section: 'Numbers',
    entries: '0123456789'.split('').map((n) => ({
      key: `ASL_${n}`,
      label: n,
    })),
  },
  {
    section: 'Common words',
    entries: [
      { key: 'ASL_PLEASE', label: 'Please' },
      { key: 'ASL_THANKYOU', label: 'Thank you' },
      { key: 'ASL_SORRY', label: 'Sorry' },
      { key: 'ASL_HELP', label: 'Help' },
      { key: 'ASL_MORE', label: 'More' },
      { key: 'ASL_FINISHED', label: 'Finished' },
      { key: 'ASL_WANT', label: 'Want' },
      { key: 'ASL_UNDERSTAND', label: 'Understand' },
      { key: 'ASL_NAME', label: 'Name' },
      { key: 'ASL_WHERE', label: 'Where' },
      { key: 'ASL_BATHROOM', label: 'Bathroom' },
      { key: 'ASL_PAIN', label: 'Pain / Hurt' },
      { key: 'ASL_WATER', label: 'Water' },
      { key: 'ASL_EAT', label: 'Eat' },
      { key: 'ASL_FRIEND', label: 'Friend' },
      { key: 'ASL_FOOD', label: 'Food' },
      { key: 'ASL_YES', label: 'Yes' },
      { key: 'ASL_NO', label: 'No' },
      { key: 'ASL_WHAT', label: 'What' },
      { key: 'ASL_WHO', label: 'Who' },
      { key: 'ASL_WHEN', label: 'When' },
      { key: 'ASL_HOW', label: 'How' },
      { key: 'ASL_SICK', label: 'Sick' },
      { key: 'ASL_GOOD', label: 'Good' },
      { key: 'ASL_BAD', label: 'Bad' },
      { key: 'ASL_WORK', label: 'Work' },
      { key: 'ASL_HOME', label: 'Home' },
      { key: 'ASL_SCHOOL', label: 'School' },
      { key: 'ASL_MONEY', label: 'Money' },
      { key: 'ASL_TIME', label: 'Time' },
    ],
  },
]
