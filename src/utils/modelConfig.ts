// Path where trained models will be placed.
// Drop model.json + weight shards here when ready.
export const CNN_MODEL_PATH = '/models/cnn/model.json'

export const LSTM_MODEL_PATH = '/models/lstm/model.json'

// ASL alphabet in training order.
// This MUST match the order used during model training — do not reorder.
// Order matches ImageDataGenerator alphabetical sort from training:
// A B C D DELETE E F G H I J K L M N NOTHING O P Q R S SPACE T U V W X Y Z
export const CNN_LABELS: string[] = [
  'A', 'B', 'C', 'D', 'DELETE',
  'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'NOTHING',
  'O', 'P', 'Q', 'R', 'S', 'SPACE',
  'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
]

// Dynamic gesture labels in training order.
// Must match CANONICAL_LABELS in model/train_lstm.py exactly.
// 'other' is a rejection class (random motion / static holds / letter
// transitions) — it has no LSTM_DISPLAY_MAP entry, so predictions of it
// are discarded and the waterfall falls through to the CNN.
export const LSTM_LABELS: string[] = [
  'hello', 'thank_you', 'please', 'sorry', 'help',
  'more', 'finished', 'want', 'understand', 'where',
  'name', 'pain', 'water', 'eat', 'friend',
  'other',
]

// Minimum confidence to accept a CNN prediction.
// Below this threshold the classifier returns null.
export const CNN_CONFIDENCE_THRESHOLD = 0.75

// Minimum confidence for LSTM gesture acceptance.
export const LSTM_CONFIDENCE_THRESHOLD = 0.82

// Minimum mean frame-to-frame landmark displacement (normalized coords)
// for a buffer to count as a dynamic sign. Static holds measure ~0.005;
// every recorded dynamic sign measures >= 0.009. Below this the LSTM is
// skipped so it can't hijack static signs from the CNN.
export const LSTM_MIN_MOTION = 0.007

// Number of landmark frames the LSTM expects.
// Must match sequence length used in training.
export const LSTM_SEQUENCE_LENGTH = 30

// Number of features per frame:
// 21 landmarks × 3 coordinates (x, y, z) = 63
export const LANDMARK_FEATURE_COUNT = 63

// ── Two-hand + non-manual (face) feature layout ─────────────────────────
//
// Widens capture beyond the single-hand-only pipeline above so a future
// model can consume both hands and ASL's grammatical facial markers
// (question form, negation, topic marking, intensity). This is plumbing
// only — LSTM_LABELS / LANDMARK_FEATURE_COUNT above still describe the
// CURRENT single-hand model. Nothing consumes FRAME_FEATURE_COUNT yet;
// that's Prompt 6B.

// 21 landmarks × (x, y, z) per hand — same layout as LANDMARK_FEATURE_COUNT,
// named separately here since this section describes the two-hand vector.
export const HAND_FEATURE_COUNT = 63

// Two hands, fixed slot order [right, left]. A missing hand is zero-padded
// rather than omitted, so every frame vector is the same length regardless
// of how many hands are actually in frame.
export const TWO_HAND_FEATURE_COUNT = HAND_FEATURE_COUNT * 2 // 126

// Compact non-manual feature set extracted from MediaPipe FaceLandmarker's
// 52 blendshape categories — brow raise/lower, eye openness, and mouth
// shape, the ARKit blendshape names that carry ASL grammar signal (question
// form, negation, intensity). Order is fixed and MUST match
// FACE_BLENDSHAPE_KEYS in src/utils/frameFeatures.ts and the mirrored list
// in model/collect_gestures.py.
export const FACE_FEATURE_COUNT = 12

// Combined per-frame vector: both hands + compact face features.
export const FRAME_FEATURE_COUNT = TWO_HAND_FEATURE_COUNT + FACE_FEATURE_COUNT // 138

// Gates the two-hand + face capture pipeline (FaceLandmarker model load,
// wide buffer collection, dev capture overlay). Turning this off drops back
// to hand-only capture with zero added cost from face tracking. The
// existing single-hand CNN/LSTM/geometric classifiers are unaffected
// either way — they only ever read the primary hand.
export const ENABLE_WIDE_CAPTURE = true
