export type Landmark = { x: number; y: number; z: number }

// ── Helpers ──────────────────────────────────────────────────────────────────

function isFingerExtended(
  lm: Landmark[],
  tipIdx: number,
  pipIdx: number,
  _mcpIdx: number
): boolean {
  return lm[tipIdx].y < lm[pipIdx].y - 0.02
}

function isThumbExtended(lm: Landmark[]): boolean {
  return (
    Math.abs(lm[4].x - lm[3].x) > 0.04 ||
    Math.abs(lm[4].x - lm[2].x) > 0.06
  )
}

function fingersExtended(lm: Landmark[]): [boolean, boolean, boolean, boolean, boolean] {
  return [
    isThumbExtended(lm),
    isFingerExtended(lm, 8, 6, 5),   // index
    isFingerExtended(lm, 12, 10, 9), // middle
    isFingerExtended(lm, 16, 14, 13),// ring
    isFingerExtended(lm, 20, 18, 17),// pinky
  ]
}

function dist(a: Landmark, b: Landmark): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)
}

// ── Main classifier ───────────────────────────────────────────────────────────

export function classifyASLGesture(lm: Landmark[]): string | null {
  if (!lm || lm.length < 21) return null

  const [thumb, index, middle, ring, pinky] = fingersExtended(lm)

  // ── Highly distinctive patterns first ──────────────────────────────────────

  // ASL_Y: thumb + pinky only
  if (thumb && !index && !middle && !ring && pinky) return 'ASL_Y'

  // ASL_I: pinky only
  if (!thumb && !index && !middle && !ring && pinky) return 'ASL_I'

  // ASL_L: index + thumb, others curled, large spread
  if (thumb && index && !middle && !ring && !pinky) {
    if (dist(lm[8], lm[4]) > 0.20) return 'ASL_L'
  }

  // ASL_K: index + middle + thumb extended, ring + pinky curled
  if (thumb && index && middle && !ring && !pinky) return 'ASL_K'

  // ASL_3: thumb + index + middle (same as K — K wins above, check score)
  // Use same check — K and 3 are visually identical; K takes priority.

  // ASL_W: index + middle + ring, no thumb, no pinky
  if (!thumb && index && middle && ring && !pinky) return 'ASL_W'

  // ASL_4: index + middle + ring + pinky, no thumb
  if (!thumb && index && middle && ring && pinky) return 'ASL_4'

  // ASL_B: all 4 fingers extended, thumb not extended
  if (!thumb && index && middle && ring && pinky) return 'ASL_B'
  // Note: ASL_4 and ASL_B share the same static shape — ASL_4 wins above.

  // ── Index + middle combos ──────────────────────────────────────────────────

  if (!thumb && index && middle && !ring && !pinky) {
    const tipDist = dist(lm[8], lm[12])
    // ASL_R: index + middle crossed (tips very close)
    if (tipDist < 0.04) return 'ASL_R'
    // ASL_U: side by side (tips close but not crossed)
    if (tipDist < 0.06) return 'ASL_U'
    // ASL_V / ASL_2: V shape (wider spread)
    return 'ASL_V'
  }

  // ── Index only ─────────────────────────────────────────────────────────────

  if (!thumb && index && !middle && !ring && !pinky) {
    // ASL_D: index up, middle tip touches thumb
    if (dist(lm[12], lm[4]) < 0.08) return 'ASL_D'
    // ASL_X: index hooked (tip above pip but below mcp)
    if (lm[8].y < lm[5].y && lm[8].y > lm[6].y) return 'ASL_X'
    // ASL_G: index points sideways
    if (Math.abs(lm[8].x - lm[5].x) > Math.abs(lm[8].y - lm[5].y)) return 'ASL_G'
    // ASL_1: plain index up
    return 'ASL_1'
  }

  // ── Thumb + index combos (non-L) ──────────────────────────────────────────

  if (thumb && index && !middle && !ring && !pinky) {
    // Both pointing down → ASL_Q
    if (lm[8].y > lm[5].y && lm[4].y > lm[3].y) return 'ASL_Q'
    // Otherwise covered by ASL_L above (dist > 0.20)
    // Fall through to ASL_3 checks handled above
  }

  // ASL_H: index + middle pointing sideways (horizontal)
  if (!thumb && index && middle && !ring && !pinky) {
    if (Math.abs(lm[8].x - lm[5].x) > Math.abs(lm[8].y - lm[5].y)) return 'ASL_H'
  }

  // ── F / 9 / 6 / 7 / 8: pinch patterns ────────────────────────────────────

  // ASL_F / ASL_9: index + thumb circle, middle + ring + pinky extended
  if (!thumb && !index && middle && ring && pinky) {
    if (dist(lm[8], lm[4]) < 0.06) return 'ASL_F'
  }

  // ASL_6: pinky + thumb touch, others extended
  if (index && middle && ring && pinky) {
    if (dist(lm[20], lm[4]) < 0.07) return 'ASL_6'
  }

  // ASL_7: ring + thumb touch, others extended
  if (thumb && index && middle && !ring && pinky) {
    if (dist(lm[16], lm[4]) < 0.07) return 'ASL_7'
  }

  // ASL_8: middle + thumb touch
  if (thumb && index && !middle && ring && pinky) {
    if (dist(lm[12], lm[4]) < 0.07) return 'ASL_8'
  }

  // ── C / O shapes ──────────────────────────────────────────────────────────

  if (!index && !middle && !ring && !pinky) {
    const indexThumbDist = dist(lm[8], lm[4])
    // ASL_O / ASL_0: all fingers curve to meet thumb
    if (indexThumbDist < 0.07) return 'ASL_O'
    // ASL_C: partial curve (C gap)
    if (indexThumbDist > 0.10 && indexThumbDist < 0.25) return 'ASL_C'
  }

  // ── P / Q: fingers pointing down ─────────────────────────────────────────

  if (!thumb && index && middle && !ring && !pinky) {
    if (lm[8].y > lm[5].y && lm[12].y > lm[9].y) return 'ASL_P'
  }

  // ── ASL_WANT: claw/grab hand ──────────────────────────────────────────────
  // All four fingers bent (not extended) but fingertips extend outward rather
  // than curling under into a closed fist.  Distinguishable from fist shapes
  // (A, S, E, T, N, M) by the average distance of fingertips from the palm base.
  //
  // Closed fist: tips curl under and sit close to landmark 0 (wrist).
  //   avg tip-to-wrist distance ≈ 0.08 – 0.13
  // Claw/want: tips splay forward and stay far from the wrist.
  //   avg tip-to-wrist distance ≈ 0.16 – 0.22
  //
  // Check fires for any thumb state (WANT is signed with thumb sometimes spread).

  if (!index && !middle && !ring && !pinky) {
    const avgTipDist = (
      dist(lm[8],  lm[0]) +
      dist(lm[12], lm[0]) +
      dist(lm[16], lm[0]) +
      dist(lm[20], lm[0])
    ) / 4
    if (avgTipDist > 0.16) return 'ASL_WANT'
  }

  // ── All-curled fist variants ──────────────────────────────────────────────

  if (!thumb && !index && !middle && !ring && !pinky) {
    // ASL_T: thumb between index and middle
    if (dist(lm[4], lm[6]) < 0.07) return 'ASL_T'
    // ASL_E: all bent, tips near MCPs
    const allNearMcp =
      dist(lm[8], lm[5]) < 0.10 &&
      dist(lm[12], lm[9]) < 0.10 &&
      dist(lm[16], lm[13]) < 0.10
    if (allNearMcp) return 'ASL_E'
    // ASL_N: index + middle fold over thumb (2-finger)
    if (dist(lm[4], lm[7]) < 0.09 && dist(lm[4], lm[11]) < 0.09) return 'ASL_N'
    // ASL_M: index + middle + ring fold over thumb
    if (
      dist(lm[4], lm[7]) < 0.10 &&
      dist(lm[4], lm[11]) < 0.10 &&
      dist(lm[4], lm[15]) < 0.10
    ) return 'ASL_M'
    // ASL_S: thumb sits across fingers (thumb x between index and pinky MCPs)
    if (
      lm[4].x > Math.min(lm[5].x, lm[17].x) &&
      lm[4].x < Math.max(lm[5].x, lm[17].x)
    ) return 'ASL_S'
    // ASL_A: thumb rests alongside index finger
    if (Math.abs(lm[4].x - lm[5].x) < 0.08) return 'ASL_A'
  }

  // ASL_5: all five extended
  if (thumb && index && middle && ring && pinky) return 'ASL_5'

  // ── Common word stubs (require motion — not detectable statically) ─────────
  // TODO: motion-based detection requires frame sequence analysis
  // ASL_PLEASE, ASL_THANKYOU, ASL_SORRY, ASL_MORE, ASL_WANT, etc.

  return null
}
