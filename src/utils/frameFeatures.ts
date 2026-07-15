import type { Category, Classifications, NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { Landmark } from './aslClassifier'
import { HAND_FEATURE_COUNT, FACE_FEATURE_COUNT, FRAME_FEATURE_COUNT } from './modelConfig'

// ── Two-hand ordering ────────────────────────────────────────────────────
//
// MediaPipe returns 0–2 hands per frame in detection order (not a stable
// left/right order). We re-sort into fixed [right, left] slots using the
// handedness classifier so downstream consumers (buffer, overlay, future
// model) always see the same hand in the same position.

export interface TwoHandSlots {
  right: Landmark[] | null
  left: Landmark[] | null
  // Index into the original MediaPipe detection arrays (results.landmarks /
  // results.gestures) that this slot came from, or null if the slot is
  // empty. Lets callers pull the matching per-hand gesture/handedness score
  // without re-deriving the ordering.
  rightIndex: number | null
  leftIndex: number | null
}

/**
 * Splits MediaPipe's per-detection landmark/handedness arrays into stable
 * [right, left] slots. MediaPipe may return the two hands in either order;
 * handedness labels (from its classifier, already mirrored for a selfie-
 * view camera) tell us which is which. If handedness is missing or both
 * hands report the same label, hands fill the first empty slot in
 * detection order so a tracked hand is never silently dropped.
 */
export function orderHandsByHandedness(
  landmarksList: NormalizedLandmark[][],
  handedness: Category[][],
): TwoHandSlots {
  const result: TwoHandSlots = { right: null, left: null, rightIndex: null, leftIndex: null }
  for (let i = 0; i < landmarksList.length; i++) {
    const label = handedness[i]?.[0]?.categoryName
    const lm = landmarksList[i] as unknown as Landmark[]
    if (label === 'Right' && result.right === null) {
      result.right = lm
      result.rightIndex = i
    } else if (label === 'Left' && result.left === null) {
      result.left = lm
      result.leftIndex = i
    } else if (result.right === null) {
      result.right = lm
      result.rightIndex = i
    } else if (result.left === null) {
      result.left = lm
      result.leftIndex = i
    }
  }
  return result
}

const ZERO_HAND: readonly number[] = Object.freeze(new Array(HAND_FEATURE_COUNT).fill(0))

function flattenHand(hand: Landmark[] | null): number[] {
  if (!hand) return ZERO_HAND as number[]
  const out = new Array(HAND_FEATURE_COUNT)
  for (let i = 0; i < hand.length; i++) {
    out[i * 3] = hand[i].x
    out[i * 3 + 1] = hand[i].y
    out[i * 3 + 2] = hand[i].z
  }
  return out
}

/** Flattens both hand slots to the fixed [right(63), left(63)] layout. */
export function flattenTwoHands(hands: TwoHandSlots): number[] {
  return [...flattenHand(hands.right), ...flattenHand(hands.left)]
}

// ── Face (non-manual marker) features ────────────────────────────────────
//
// Compact subset of MediaPipe FaceLandmarker's 52 ARKit-style blendshapes.
// Order is fixed — do not reorder without also updating
// model/collect_gestures.py's FACE_BLENDSHAPE_KEYS to match.
export const FACE_BLENDSHAPE_KEYS: readonly string[] = Object.freeze([
  // Brow raise / lower — question form, topic marking, negation
  'browDownLeft', 'browDownRight', 'browInnerUp',
  'browOuterUpLeft', 'browOuterUpRight',
  // Eye openness — widening for questions/surprise, squinting for negation
  'eyeWideLeft', 'eyeWideRight', 'eyeSquintLeft', 'eyeSquintRight',
  // Mouth shape — adverbial / intensity marking
  'jawOpen', 'mouthPucker', 'mouthFunnel',
])

if (FACE_BLENDSHAPE_KEYS.length !== FACE_FEATURE_COUNT) {
  throw new Error(
    `FACE_BLENDSHAPE_KEYS has ${FACE_BLENDSHAPE_KEYS.length} entries, expected ` +
    `FACE_FEATURE_COUNT=${FACE_FEATURE_COUNT} (src/utils/modelConfig.ts)`,
  )
}

/**
 * Extracts the compact face feature vector from FaceLandmarker's
 * blendshapes output. Returns a zero vector when no face is detected, so
 * downstream frame vectors stay a fixed length either way.
 */
export function extractFaceFeatures(blendshapes: Classifications[] | undefined): number[] {
  const categories = blendshapes?.[0]?.categories
  if (!categories) return new Array(FACE_FEATURE_COUNT).fill(0)

  const byName = new Map<string, number>()
  for (const c of categories) byName.set(c.categoryName, c.score)

  return FACE_BLENDSHAPE_KEYS.map((key) => byName.get(key) ?? 0)
}

// ── Combined frame vector ─────────────────────────────────────────────────

/** Combined per-frame vector: [rightHand(63), leftHand(63), face(12)]. */
export function buildFrameVector(hands: TwoHandSlots, faceFeatures: number[] | null): number[] {
  const face = faceFeatures ?? new Array(FACE_FEATURE_COUNT).fill(0)
  const vector = [...flattenTwoHands(hands), ...face]
  if (import.meta.env.DEV && vector.length !== FRAME_FEATURE_COUNT) {
    console.error(
      `[frameFeatures] built vector length ${vector.length}, expected ${FRAME_FEATURE_COUNT}`,
    )
  }
  return vector
}
