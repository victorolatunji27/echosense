"""
EchoSense — Gesture Sequence Collector
=======================================
Opens the webcam, runs MediaPipe Hands, and records fixed-length landmark
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

Each .npy file is a float32 array of shape (frames, 63):
    21 landmarks × (x, y, z) = 63 features per frame.
    Coordinates are in MediaPipe normalized form [0.0, 1.0].

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

# MediaPipe Tasks HandLandmarker — the same landmark family the web app
# uses (@mediapipe/tasks-vision). The legacy mp.solutions API no longer
# ships in current mediapipe wheels.
LANDMARKER_MODEL = os.path.join(os.path.dirname(__file__), 'hand_landmarker.task')
LANDMARKER_URL   = (
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/'
    'hand_landmarker/float16/1/hand_landmarker.task'
)

# 21-landmark skeleton, same connection list the app draws
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (5, 9), (9, 10), (10, 11), (11, 12),
    (9, 13), (13, 14), (14, 15), (15, 16),
    (13, 17), (17, 18), (18, 19), (19, 20),
    (0, 17),
]


def make_landmarker() -> mp_vision.HandLandmarker:
    if not os.path.exists(LANDMARKER_MODEL):
        print(f"Downloading hand_landmarker.task → {LANDMARKER_MODEL} ...")
        urllib.request.urlretrieve(LANDMARKER_URL, LANDMARKER_MODEL)
    options = mp_vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=LANDMARKER_MODEL),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_hands=1,
        min_hand_detection_confidence=0.6,
        min_tracking_confidence=0.5,
    )
    return mp_vision.HandLandmarker.create_from_options(options)


# ── Helpers ───────────────────────────────────────────────────────────────────
def extract_landmarks(result) -> np.ndarray | None:
    """Return (63,) float32 array from the first detected hand, or None."""
    if not result.hand_landmarks:
        return None
    lm = result.hand_landmarks[0]
    return np.array([[l.x, l.y, l.z] for l in lm], dtype=np.float32).flatten()


def draw_landmarks(frame, result):
    """Draw the 21-point skeleton (replaces mp.solutions.drawing_utils)."""
    if not result.hand_landmarks:
        return
    h, w = frame.shape[:2]
    pts = [(int(l.x * w), int(l.y * h)) for l in result.hand_landmarks[0]]
    for a, b in HAND_CONNECTIONS:
        cv2.line(frame, pts[a], pts[b], (90, 160, 90), 2, cv2.LINE_AA)
    for p in pts:
        cv2.circle(frame, p, 4, (110, 169, 200), cv2.FILLED, cv2.LINE_AA)


def overlay_text(frame, lines: list[tuple[str, tuple, float, int, tuple]]):
    """Draw multiple text lines with background rectangles for legibility."""
    for text, origin, scale, thickness, color in lines:
        (tw, th), bl = cv2.getTextSize(text, FONT, scale, thickness)
        x, y = origin
        cv2.rectangle(frame, (x - 4, y - th - 4), (x + tw + 4, y + bl + 4),
                       (0, 0, 0), cv2.FILLED)
        cv2.putText(frame, text, origin, FONT, scale, color, thickness, cv2.LINE_AA)


# ── Main ──────────────────────────────────────────────────────────────────────
def collect(label: str, n_sequences: int, n_frames: int):
    out_dir = os.path.join(SEQ_DIR, label)
    os.makedirs(out_dir, exist_ok=True)

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
    print(f"  Output dir : {out_dir}")
    print(f"{'=' * 52}")
    print("\nControls:  SPACE = skip countdown   Q/ESC = quit\n")

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[ERROR] Cannot open webcam.")
        sys.exit(1)

    timestamp_ms = 0  # must increase monotonically for RunningMode.VIDEO

    with make_landmarker() as landmarker:

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
                result = landmarker.detect_for_video(mp_image, timestamp_ms)

                draw_landmarks(frame, result)

                landmarks = extract_landmarks(result)
                if landmarks is not None:
                    sequence.append(landmarks)
                    frame_idx += 1
                    # Green progress bar
                    bar_w = int(frame.shape[1] * frame_idx / n_frames)
                    cv2.rectangle(frame, (0, frame.shape[0] - 8),
                                  (bar_w, frame.shape[0]), (50, 200, 100), cv2.FILLED)

                hand_status = "Hand detected" if landmarks is not None else "No hand — waiting..."
                color       = (50, 220, 100) if landmarks is not None else (50, 100, 255)

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
                arr = np.array(sequence, dtype=np.float32)   # (30, 63)
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
        description="Record MediaPipe hand landmark sequences for a gesture label."
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
