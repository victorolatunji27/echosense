"""
EchoSense — Multimodal (two-hand + face) Sequence Trainer
==========================================================
Trains a DUAL-HEAD sequence model on the combined two-hand + face vector
recorded by collect_gestures.py (Prompt 6A/6B):

  - Manual-sign head  : which sign (hello, help, want, you, ...)
  - Non-manual head   : facial grammar marker
                        (statement / yesno_question / wh_question / negation)

so the same manual sign resolves to different meanings based on the face
("you go" vs "you go?" vs "you not go").

Input shape: (30, 138) — see FRAME_FEATURE_COUNT in src/utils/modelConfig.ts.

Data layout (produced by collect_gestures.py):
    model/data/sequences/
        you/                     ← flat files = marker 'statement'
            0.npy 1.npy ...
        you/yesno_question/      ← marker subfolder
            0.npy 1.npy ...
        you/wh_question/
            ...
        help/
            0.npy ...            ← two-hand sign, statement

Each .npy is float32 (30, 138). Old 63-wide single-hand recordings from
before Prompt 6A are SKIPPED with a warning (re-record them wide).

Usage:
    python model/train_multimodal.py

Outputs (model/saved/):
    multimodal.h5                 — best checkpoint
    multimodal_class_indices.json — {sign_labels, marker_labels}
    multimodal_training_curves.png
    tfjs_multimodal/              — TF.js export (drop into public/models/multimodal/)
"""

import os
import sys
import json
import subprocess

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

import tensorflow as tf
from tensorflow.keras.layers import LSTM, Dense, Dropout, Input
from tensorflow.keras.models import Model
from tensorflow.keras.callbacks import ModelCheckpoint, EarlyStopping, ReduceLROnPlateau
from tensorflow.keras.utils import to_categorical
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

# ── Paths ─────────────────────────────────────────────────────────────────────
# ECHOSENSE_SEQ_DIR / ECHOSENSE_SAVED_DIR override the defaults (used for
# isolated dry runs / alternate datasets); normal runs need neither.
MODEL_DIR   = os.path.dirname(__file__)
SEQ_DIR     = os.environ.get('ECHOSENSE_SEQ_DIR', os.path.join(MODEL_DIR, 'data', 'sequences'))
SAVED_DIR   = os.environ.get('ECHOSENSE_SAVED_DIR', os.path.join(MODEL_DIR, 'saved'))
TFJS_DIR    = os.path.join(SAVED_DIR, 'tfjs_multimodal')
BEST_H5     = os.path.join(SAVED_DIR, 'multimodal.h5')
CURVES_PNG  = os.path.join(SAVED_DIR, 'multimodal_training_curves.png')
INDEX_JSON  = os.path.join(SAVED_DIR, 'multimodal_class_indices.json')

os.makedirs(SAVED_DIR, exist_ok=True)
os.makedirs(TFJS_DIR, exist_ok=True)

# ── Layout / hyper-parameters ─────────────────────────────────────────────────
SEQUENCE_LENGTH = 30
N_FEATURES      = 138     # FRAME_FEATURE_COUNT: 2 hands × 63 + 12 face
EPOCHS          = 60
BATCH_SIZE      = 32
LR              = 1e-3
VAL_SPLIT       = 0.2
RANDOM_SEED     = 42

# Canonical manual-sign order — MUST match MULTIMODAL_SIGN_LABELS in
# src/utils/modelConfig.ts. Signs with recorded data are kept in THIS order
# (never alphabetical). If you train a subset, this script prints the exact
# list to paste back into modelConfig.ts.
CANONICAL_SIGNS = [
    'hello', 'thank_you', 'please', 'sorry', 'help',
    'more', 'finished', 'want', 'understand', 'where',
    'name', 'pain', 'water', 'eat', 'friend',
    'you', 'go', 'other',
]

# Non-manual markers — MUST match NMM_LABELS in src/utils/modelConfig.ts.
# 'statement' is the neutral default and the label for flat (non-subfolder)
# recordings.
CANONICAL_MARKERS = ['statement', 'yesno_question', 'wh_question', 'negation']

print("\n" + "=" * 56)
print("  EchoSense — train_multimodal.py")
print("=" * 56)


# ── 1. Load dataset ───────────────────────────────────────────────────────────
def load_sequences():
    """Walks SEQ_DIR. A sign folder's flat *.npy files are marker
    'statement'; each <marker> subfolder supplies that marker. Only
    138-wide sequences are accepted."""
    if not os.path.isdir(SEQ_DIR):
        print(f"\n[ERROR] Sequence directory not found: {SEQ_DIR}")
        print("Record data first, e.g.:")
        print("  python model/collect_gestures.py you statement")
        print("  python model/collect_gestures.py you yesno_question\n")
        sys.exit(1)

    sequences, sign_labels, marker_labels = [], [], []
    skipped_wide = 0
    sign_dirs = sorted(
        d for d in os.listdir(SEQ_DIR) if os.path.isdir(os.path.join(SEQ_DIR, d))
    )

    for sign in sign_dirs:
        if sign not in CANONICAL_SIGNS:
            print(f"      [WARN] Sign folder '{sign}' not in CANONICAL_SIGNS — skipping. "
                  f"Add it to CANONICAL_SIGNS here AND MULTIMODAL_SIGN_LABELS in modelConfig.ts.")
            continue
        sign_dir = os.path.join(SEQ_DIR, sign)

        # (a) flat files = statement
        _load_marker_dir(sign_dir, sign, 'statement', sequences, sign_labels, marker_labels,
                         recurse=False)
        # (b) marker subfolders
        for marker in CANONICAL_MARKERS:
            sub = os.path.join(sign_dir, marker)
            if os.path.isdir(sub):
                _load_marker_dir(sub, sign, marker, sequences, sign_labels, marker_labels,
                                 recurse=False)

    return sequences, sign_labels, marker_labels


def _load_marker_dir(path, sign, marker, sequences, sign_labels, marker_labels, recurse):
    for fname in sorted(f for f in os.listdir(path) if f.endswith('.npy')):
        arr = np.load(os.path.join(path, fname))
        if arr.shape == (SEQUENCE_LENGTH, N_FEATURES):
            sequences.append(arr)
            sign_labels.append(sign)
            marker_labels.append(marker)
        elif arr.shape == (SEQUENCE_LENGTH, 63):
            # Old single-hand format from before Prompt 6A — can't use here.
            _load_marker_dir.skipped = getattr(_load_marker_dir, 'skipped', 0) + 1


print("\n[1/6] Loading 138-wide sequences ...")
sequences, raw_signs, raw_markers = load_sequences()
skipped = getattr(_load_marker_dir, 'skipped', 0)
if skipped:
    print(f"      [WARN] Skipped {skipped} old 63-wide sequence(s) — re-record them "
          f"with the current collect_gestures.py to include them.")

if len(sequences) == 0:
    print("\n[ERROR] No 138-wide sequences found. Record two-hand + face data first:")
    print("  python model/collect_gestures.py you statement")
    print("  python model/collect_gestures.py you yesno_question\n")
    sys.exit(1)

# Keep only signs / markers that actually have data, in canonical order
sign_labels   = [s for s in CANONICAL_SIGNS if s in set(raw_signs)]
marker_labels = [m for m in CANONICAL_MARKERS if m in set(raw_markers)]

if len(sign_labels) < 2:
    print(f"\n[ERROR] Need at least 2 sign classes. Found: {sign_labels}\n")
    sys.exit(1)

sign_to_idx   = {s: i for i, s in enumerate(sign_labels)}
marker_to_idx = {m: i for i, m in enumerate(marker_labels)}

X       = np.array(sequences, dtype=np.float32)
y_sign  = to_categorical([sign_to_idx[s] for s in raw_signs], len(sign_labels))
y_mark  = to_categorical([marker_to_idx[m] for m in raw_markers], len(marker_labels))

print(f"      Sequences : {len(sequences)}   X shape: {X.shape}")
print(f"      Signs     : {sign_labels}")
print(f"      Markers   : {marker_labels}")

# Distribution
print("\n      Per-sign counts:")
for s in sign_labels:
    print(f"        {s:<14} {raw_signs.count(s):>4}")
print("      Per-marker counts:")
for m in marker_labels:
    print(f"        {m:<16} {raw_markers.count(m):>4}")

with open(INDEX_JSON, 'w') as f:
    json.dump({'sign_labels': sign_labels, 'marker_labels': marker_labels}, f, indent=2)
print(f"      Class indices saved → {INDEX_JSON}")


# ── 2. Split ──────────────────────────────────────────────────────────────────
print("\n[2/6] Splitting data ...")
idx = np.arange(len(X))
# Stratify on the sign head (usually the scarcer dimension)
train_idx, val_idx = train_test_split(
    idx, test_size=VAL_SPLIT, random_state=RANDOM_SEED,
    stratify=np.argmax(y_sign, axis=1) if len(sign_labels) > 1 else None,
)
X_train, X_val = X[train_idx], X[val_idx]
ys_train, ys_val = y_sign[train_idx], y_sign[val_idx]
ym_train, ym_val = y_mark[train_idx], y_mark[val_idx]
print(f"      Train: {len(train_idx)}   Val: {len(val_idx)}")


# ── 3. Build dual-head model ──────────────────────────────────────────────────
print("\n[3/6] Building dual-head LSTM ...")
inp = Input(shape=(SEQUENCE_LENGTH, N_FEATURES), name='frames')
x = LSTM(96, return_sequences=True, name='lstm_1')(inp)
x = LSTM(128, return_sequences=True, name='lstm_2')(x)
x = LSTM(64, return_sequences=False, name='lstm_3')(x)
x = Dense(64, activation='relu', name='dense_shared')(x)
x = Dropout(0.5, name='dropout')(x)
sign_out   = Dense(len(sign_labels), activation='softmax', name='sign')(x)
marker_out = Dense(len(marker_labels), activation='softmax', name='marker')(x)

model = Model(inputs=inp, outputs=[sign_out, marker_out], name='multimodal')
model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=LR),
    loss={'sign': 'categorical_crossentropy', 'marker': 'categorical_crossentropy'},
    # Manual sign is the primary signal; marker is grammatical overlay.
    loss_weights={'sign': 1.0, 'marker': 0.5},
    metrics={'sign': 'accuracy', 'marker': 'accuracy'},
)
model.summary()


# ── 4. Train ──────────────────────────────────────────────────────────────────
print(f"\n[4/6] Training up to {EPOCHS} epochs ...")
callbacks = [
    ModelCheckpoint(BEST_H5, monitor='val_sign_accuracy', mode='max',
                    save_best_only=True, verbose=1),
    ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=5, min_lr=1e-6, verbose=1),
    EarlyStopping(monitor='val_sign_accuracy', mode='max', patience=15,
                  restore_best_weights=True, verbose=1),
]
history = model.fit(
    X_train, {'sign': ys_train, 'marker': ym_train},
    validation_data=(X_val, {'sign': ys_val, 'marker': ym_val}),
    epochs=EPOCHS, batch_size=BATCH_SIZE, callbacks=callbacks, verbose=1,
)


# ── 5. Evaluate ───────────────────────────────────────────────────────────────
print("\n[5/6] Validation report (NOTE: this is the TRAIN/VAL split, NOT a")
print("      real held-out webcam test — record fresh captures and measure)")
ps, pm = model.predict(X_val, verbose=0)
print("\n      Sign head:")
print(classification_report(
    np.argmax(ys_val, axis=1), np.argmax(ps, axis=1),
    labels=list(range(len(sign_labels))), target_names=sign_labels, zero_division=0))
if len(marker_labels) > 1:
    print("      Marker head:")
    print(classification_report(
        np.argmax(ym_val, axis=1), np.argmax(pm, axis=1),
        labels=list(range(len(marker_labels))), target_names=marker_labels, zero_division=0))

# Curves
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
fig.suptitle('EchoSense — Multimodal Dual-Head Training', fontweight='bold')
ax1.plot(history.history['sign_accuracy'], label='sign train')
ax1.plot(history.history['val_sign_accuracy'], '--', label='sign val')
if 'marker_accuracy' in history.history:
    ax1.plot(history.history['marker_accuracy'], label='marker train')
    ax1.plot(history.history['val_marker_accuracy'], '--', label='marker val')
ax1.set_title('Accuracy'); ax1.set_ylim([0, 1]); ax1.legend(); ax1.grid(alpha=0.3)
ax2.plot(history.history['loss'], label='train loss')
ax2.plot(history.history['val_loss'], '--', label='val loss')
ax2.set_title('Loss'); ax2.legend(); ax2.grid(alpha=0.3)
plt.tight_layout(); plt.savefig(CURVES_PNG, dpi=150); plt.close()
print(f"\n      Curves → {CURVES_PNG}")

print("\n" + "=" * 56)
print("  Update src/utils/modelConfig.ts to match EXACTLY:")
print(f"    MULTIMODAL_SIGN_LABELS = {sign_labels}")
print(f"    NMM_LABELS             = {marker_labels}")
print("=" * 56)


# ── 6. TF.js export ───────────────────────────────────────────────────────────
print(f"\n[6/6] Exporting to TF.js → {TFJS_DIR} ...")
try:
    import tensorflowjs as tfjs
    tfjs.converters.save_keras_model(model, TFJS_DIR)
    fixer = os.path.join(MODEL_DIR, '..', 'scripts', 'fix_tfjs_model_json.py')
    subprocess.run([sys.executable, fixer, os.path.join(TFJS_DIR, 'model.json')], check=True)
    print("\n  [OK] Export complete. Next:")
    print(f"    mkdir -p public/models/multimodal")
    print(f"    cp {TFJS_DIR}/* public/models/multimodal/")
    print(f"    (then hard-refresh — the multimodal tier activates automatically)\n")
except Exception as e:
    print(f"\n  [ERROR] TF.js export failed: {e}")
    print(f"  Run manually:")
    print(f"    tensorflowjs_converter --input_format=keras {BEST_H5} {TFJS_DIR}")
    print(f"    python3 scripts/fix_tfjs_model_json.py {TFJS_DIR}/model.json\n")
