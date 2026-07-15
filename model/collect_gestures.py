"""
EchoSense — Gesture Sequence Collector
=======================================
Opens the webcam, runs MediaPipe HandLandmarker (2 hands) and FaceLandmarker
(blendshapes) in parallel, and records fixed-length combined feature
sequences for a single gesture label.

Usage:
    python model/collect_gestures.py <label> [--sequences N] [--frames F]

Examples:
    python model/collect_gestures.py hello
    python model/collect_gestures.py thank_you --sequences 40
    python model/collect_gestures.py please --sequences 30 --frames 30

Arguments:
    label          Name of the gesture (used as the folder name)
    --sequences    How many sequences to record  (default: 30)
    --frames       Frames per sequence           (default: 30)

Output:
    model/data/sequences/<label>/0.npy
    model/data/sequences/<label>/1.npy
    ...

Each .npy file is a float32 array of shape (frames, 138):
    right hand (21 landmarks × x,y,z = 63) +
    left hand  (21 landmarks × x,y,z = 63) +
    12 compact face blendshape features (brow, eye, mouth)
    = 138 features per frame.
    A missing hand or face is zero-padded, never omitted, so every frame
    is the same length. Hand slot order is fixed [right, left] regardless
    of MediaPipe's raw detection order — mirrors
    src/utils/frameFeatures.ts's orderHandsByHandedness exactly, so this
    tool and the web app never disagree on layout.

    NOTE: this is a wider format than earlier recordings (which were
    (frames, 63), single hand only). This tool warns at start if a label's
    existing recordings are in the old format — see the shape check in
    collect(). model/train_lstm.py has NOT been updated to consume the wide
    format yet (that's a separate step) — until then, it will skip any
    138-wide sequences it finds with a shape-mismatch warning.

Controls (during recording):
    SPACE — start next sequence immediately (skip countdown)
    Q / ESC — quit
"""

import argparse
import os
import sys
import time
import urllib.request

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

# ── Constants ─────────────────────────────────────────────────────────────────
SEQ_DIR       = os.path.join(os.path.dirname(__file__), 'data', 'sequences')
COUNTDOWN_SEC = 2      # pause between sequences
FONT          = cv2.FONT_HERSHEY_SIMPLEX

# MediaPipe Tasks HandLandmarker/FaceLandmarker — the same landmark family
# the web app uses (@mediapipe/tasks-vision). The legacy mp.solutions API
# no longer ships in current mediapipe wheels.
HAND_LANDMARKER_MODEL = os.path.join(os.path.dirname(__file__), 'hand_landmarker.task')
HAND_LANDMARKER_URL   = (
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/'
    'hand_landmarker/float16/1/hand_landmarker.task'
)
FACE_LANDMARKER_MODEL = os.path.join(os.path.dirname(__file__), 'face_landmarker.task')
FACE_LANDMARKER_URL   = (
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/'
    'face_landmarker/float16/1/face_landmarker.task'
)

# ── Combined feature layout — MUST match src/utils/modelConfig.ts and
#    src/utils/frameFeatures.ts exactly ────────────────────────────────────
HAND_FEATURE_COUNT = 63  # 21 landmarks × (x, y, z)

# Compact non-manual feature set. Order is fixed — do not reorder without
# also updating FACE_BLENDSHAPE_KEYS in src/utils/frameFeatures.ts.
FACE_BLENDSHAPE_KEYS = [
    'browDownLeft', 'browDownRight', 'browInnerUp',
    'browOuterUpLeft', 'browOuterUpRight',
    'eyeWideLeft', 'eyeWideRight', 'eyeSquintLeft', 'eyeSquintRight',
    'jawOpen', 'mouthPucker', 'mouthFunnel',
]
FACE_FEATURE_COUNT = len(FACE_BLENDSHAPE_KEYS)  # 12

FRAME_FEATURE_COUNT = HAND_FEATURE_COUNT * 2 + FACE_FEATURE_COUNT  # 138

# 21-landmark skeleton, same connection list the app draws
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (5, 9), (9, 10), (10, 11), (11, 12),
    (9, 13), (13, 14), (14, 15), (15, 16),
    (13, 17), (17, 18), (18, 19), (19, 20),
    (0, 17),
]

# BGR colors distinguishing hands, matching the blue/orange scheme in
# src/components/DevCaptureOverlay.tsx
RIGHT_COLOR = (250, 165, 96)   # blue-ish
LEFT_COLOR  = (96, 146, 248)   # orange-ish


def make_hand_landmarker() -> mp_vision.HandLandmarker:
    if not os.path.exists(HAND_LANDMARKER_MODEL):
        print(f"Downloading hand_landmarker.task → {HAND_LANDMARKER_MODEL} ...")
        urllib.request.urlretrieve(HAND_LANDMARKER_URL, HAND_LANDMARKER_MODEL)
    options = mp_vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=HAND_LANDMARKER_MODEL),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_hands=2,
        min_hand_detection_confidence=0.6,
        min_tracking_confidence=0.5,
    )
    return mp_vision.HandLandmarker.create_from_options(options)


def make_face_landmarker() -> mp_vision.FaceLandmarker:
    if not os.path.exists(FACE_LANDMARKER_MODEL):
        print(f"Downloading face_landmarker.task → {FACE_LANDMARKER_MODEL} ...")
        urllib.request.urlretrieve(FACE_LANDMARKER_URL, FACE_LANDMARKER_MODEL)
    options = mp_vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=FACE_LANDMARKER_MODEL),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_faces=1,
        min_face_detection_confidence=0.5,
        output_face_blendshapes=True,
    )
    return mp_vision.FaceLandmarker.create_from_options(options)


# ── Helpers ───────────────────────────────────────────────────────────────────
def order_hands_by_handedness(hand_result):
    """Returns (right, left) — each a list of 21 MediaPipe landmarks, or
    None if that hand isn't tracked. Uses handedness labels for a stable
    slot order; falls back to detection order if handedness is missing or
    duplicated. Mirrors src/utils/frameFeatures.ts's
    orderHandsByHandedness exactly — do not let these drift apart."""
    right = left = None
    if not hand_result.hand_landmarks:
        return right, left
    for i, lm in enumerate(hand_result.hand_landmarks):
        label = (
            hand_result.handedness[i][0].category_name
            if hand_result.handedness and i < len(hand_result.handedness)
            else None
        )
        if label == 'Right' and right is None:
            right = lm
        elif label == 'Left' and left is None:
            left = lm
        elif right is None:
            right = lm
        elif left is None:
            left = lm
    return right, left


def flatten_hand(lm) -> np.ndarray:
    """(21, 3) landmark list -> flat (63,) float32 array, or zeros if lm is None."""
    if lm is None:
        return np.zeros(HAND_FEATURE_COUNT, dtype=np.float32)
    return np.array([[p.x, p.y, p.z] for p in lm], dtype=np.float32).flatten()


def extract_face_features(face_result) -> np.ndarray:
    """Compact (12,) blendshape feature vector, or zeros if no face is
    detected. Mirrors src/utils/frameFeatures.ts's extractFaceFeatures."""
    if not face_result.face_blendshapes:
        return np.zeros(FACE_FEATURE_COUNT, dtype=np.float32)
    by_name = {c.category_name: c.score for c in face_result.face_blendshapes[0]}
    return np.array(
        [by_name.get(k, 0.0) for k in FACE_BLENDSHAPE_KEYS], dtype=np.float32
    )


def extract_combined_features(hand_result, face_result):
    """Returns (vector, hand_detected). vector is always (138,) float32,
    zero-padded for a missing hand or face. hand_detected mirrors the old
    single-hand behavior: a frame only counts toward the sequence if at
    least one hand is visible (face-only frames don't advance recording)."""
    right, left = order_hands_by_handedness(hand_result)
    hand_detected = right is not None or left is not None
    vec = np.concatenate([
        flatten_hand(right),
        flatten_hand(left),
        extract_face_features(face_result),
    ])
    return vec, hand_detected


def draw_landmarks(frame, hand_result):
    """Draw both hands' 21-point skeletons in distinguishing colors
    (replaces mp.solutions.drawing_utils). Right = blue-ish, left =
    orange-ish, matching src/components/DevCaptureOverlay.tsx."""
    if not hand_result.hand_landmarks:
        return
    h, w = frame.shape[:2]
    for i, hand_lm in enumerate(hand_result.hand_landmarks):
        label = (
            hand_result.handedness[i][0].category_name
            if hand_result.handedness and i < len(hand_result.handedness)
            else None
        )
        color = RIGHT_COLOR if label == 'Right' else LEFT_COLOR if label == 'Left' else (200, 200, 200)
        pts = [(int(l.x * w), int(l.y * h)) for l in hand_lm]
        for a, b in HAND_CONNECTIONS:
            cv2.line(frame, pts[a], pts[b], color, 2, cv2.LINE_AA)
        for p in pts:
            cv2.circle(frame, p, 4, color, cv2.FILLED, cv2.LINE_AA)


def overlay_text(frame, lines: list[tuple[str, tuple, float, int, tuple]]):
    """Draw multiple text lines with background rectangles for legibility."""
    for text, origin, scale, thickness, color in lines:
        (tw, th), bl = cv2.getTextSize(text, FONT, scale, thickness)
        x, y = origin
        cv2.rectangle(frame, (x - 4, y - th - 4), (x + tw + 4, y + bl + 4),
                       (0, 0, 0), cv2.FILLED)
        cv2.putText(frame, text, origin, FONT, scale, color, thickness, cv2.LINE_AA)


def warn_if_legacy_format(out_dir: str, label: str):
    """If this label already has recordings from before the two-hand/face
    upgrade (shape (frames, 63)), warn loudly rather than silently mixing
    formats within one label's folder."""
    existing = [f for f in os.listdir(out_dir) if f.endswith('.npy')]
    if not existing:
        return
    sample = np.load(os.path.join(out_dir, existing[0]))
    if sample.shape[-1] != FRAME_FEATURE_COUNT:
        print(
            f"\n[WARN] '{label}' already has {len(existing)} recording(s) in the OLD "
            f"single-hand format (last dim {sample.shape[-1]}, expected "
            f"{FRAME_FEATURE_COUNT}). New recordings will be two-hand+face format and "
            f"will NOT match those files. Either delete the old files and re-record "
            f"'{label}' from scratch, or keep them separate until train_lstm.py is "
            f"updated to consume the wider format.\n"
        )


# ── Main ──────────────────────────────────────────────────────────────────────
def collect(label: str, n_sequences: int, n_frames: int):
    out_dir = os.path.join(SEQ_DIR, label)
    os.makedirs(out_dir, exist_ok=True)

    warn_if_legacy_format(out_dir, label)

    # Find highest existing sequence index so we can append, not overwrite
    existing = [
        int(f.replace('.npy', ''))
        for f in os.listdir(out_dir)
        if f.endswith('.npy') and f.replace('.npy', '').isdigit()
    ]
    start_idx = max(existing) + 1 if existing else 0
    end_idx   = start_idx + n_sequences

    print(f"\n{'=' * 52}")
    print(f"  EchoSense — collect_gestures.py")
    print(f"{'=' * 52}")
    print(f"  Label      : {label}")
    print(f"  Sequences  : {n_sequences}  (#{start_idx} → #{end_idx - 1})")
    print(f"  Frames/seq : {n_frames}")
    print(f"  Features   : {FRAME_FEATURE_COUNT} (2 hands × 63 + {FACE_FEATURE_COUNT} face)")
    print(f"  Output dir : {out_dir}")
    print(f"{'=' * 52}")
    print("\nControls:  SPACE = skip countdown   Q/ESC = quit\n")

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[ERROR] Cannot open webcam.")
        if sys.platform == 'darwin':
            print(
                "\nOn macOS this is almost always a Camera permission issue:\n"
                "  System Settings → Privacy & Security → Camera → enable the\n"
                "  app you're running this from (Terminal / VS Code), then\n"
                "  QUIT and REOPEN that app and rerun this script.\n"
            )
        sys.exit(1)

    timestamp_ms = 0  # must increase monotonically for RunningMode.VIDEO

    with make_hand_landmarker() as hand_landmarker, make_face_landmarker() as face_landmarker:

        for seq_idx in range(start_idx, end_idx):
            # ── Countdown ────────────────────────────────────────────────────
            deadline = time.time() + COUNTDOWN_SEC
            while time.time() < deadline:
                ok, frame = cap.read()
                if not ok:
                    break
                frame = cv2.flip(frame, 1)
                remaining = deadline - time.time()
                h, w = frame.shape[:2]

                overlay_text(frame, [
                    (f"Gesture: {label}", (10, 30), 0.8, 2, (100, 255, 180)),
                    (f"Seq {seq_idx}/{end_idx - 1}  —  Get ready...",
                     (10, 65), 0.65, 1, (255, 255, 255)),
                    (f"Starting in {remaining:.1f}s  [SPACE to skip]",
                     (10, 95), 0.6, 1, (200, 200, 200)),
                ])
                cv2.imshow("EchoSense — Collect Gestures", frame)
                key = cv2.waitKey(1) & 0xFF
                if key in (ord('q'), 27):
                    print("\nQuit.")
                    cap.release()
                    cv2.destroyAllWindows()
                    return
                if key == ord(' '):
                    break

            # ── Record sequence ───────────────────────────────────────────────
            sequence = []
            frame_idx = 0

            while frame_idx < n_frames:
                ok, frame = cap.read()
                if not ok:
                    break
                frame = cv2.flip(frame, 1)
                rgb   = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                timestamp_ms += 33
                hand_result = hand_landmarker.detect_for_video(mp_image, timestamp_ms)
                face_result = face_landmarker.detect_for_video(mp_image, timestamp_ms)

                draw_landmarks(frame, hand_result)

                vec, hand_detected = extract_combined_features(hand_result, face_result)
                if hand_detected:
                    sequence.append(vec)
                    frame_idx += 1
                    # Green progress bar
                    bar_w = int(frame.shape[1] * frame_idx / n_frames)
                    cv2.rectangle(frame, (0, frame.shape[0] - 8),
                                  (bar_w, frame.shape[0]), (50, 200, 100), cv2.FILLED)

                face_detected = bool(face_result.face_landmarks)
                hand_status = (
                    f"{'Hand' if hand_detected else 'No hand'} · "
                    f"{'Face' if face_detected else 'no face'}"
                )
                color = (50, 220, 100) if hand_detected else (50, 100, 255)

                overlay_text(frame, [
                    (f"RECORDING  seq {seq_idx}/{end_idx - 1}", (10, 30), 0.8, 2, (50, 50, 255)),
                    (f"Gesture: {label}", (10, 65), 0.7, 1, (255, 255, 255)),
                    (f"Frame {frame_idx}/{n_frames}  —  {hand_status}",
                     (10, 95), 0.6, 1, color),
                ])
                cv2.imshow("EchoSense — Collect Gestures", frame)
                key = cv2.waitKey(1) & 0xFF
                if key in (ord('q'), 27):
                    print("\nQuit.")
                    cap.release()
                    cv2.destroyAllWindows()
                    return

            # ── Save ─────────────────────────────────────────────────────────
            if len(sequence) == n_frames:
                arr = np.array(sequence, dtype=np.float32)   # (30, 138)
                np.save(os.path.join(out_dir, f"{seq_idx}.npy"), arr)
                print(f"  [OK] seq {seq_idx:>3}  shape={arr.shape}  → {out_dir}/{seq_idx}.npy")
            else:
                print(f"  [SKIP] seq {seq_idx} — only {len(sequence)} frames captured, discarding.")

    cap.release()
    cv2.destroyAllWindows()

    total = len([f for f in os.listdir(out_dir) if f.endswith('.npy')])
    print(f"\n{'=' * 52}")
    print(f"  Done. {n_sequences} new sequences recorded.")
    print(f"  Total sequences for '{label}': {total}")
    print(f"{'=' * 52}\n")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description="Record MediaPipe two-hand + face landmark sequences for a gesture label."
    )
    parser.add_argument('label',
                        help="Gesture name, e.g. 'hello', 'thank_you'")
    parser.add_argument('--sequences', type=int, default=30,
                        help="Number of sequences to record (default: 30)")
    parser.add_argument('--frames', type=int, default=30,
                        help="Frames per sequence (default: 30)")
    args = parser.parse_args()

    collect(
        label=args.label,
        n_sequences=args.sequences,
        n_frames=args.frames,
    )
