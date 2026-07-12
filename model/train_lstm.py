"""
EchoSense — LSTM Training Script
=================================
Trains a stacked LSTM on MediaPipe landmark sequences to recognise dynamic
ASL gestures (e.g. hello, thank_you, please …).

Expected data layout (produced by collect_gestures.py):
    model/data/sequences/
        hello/       0.npy  1.npy  …  29.npy
        thank_you/   0.npy  1.npy  …  29.npy
        …

Each .npy file is float32 shape (30, 63):
    30 frames × (21 landmarks × x,y,z).

Usage:
    python model/train_lstm.py

Outputs (all saved to model/saved/):
    asl_lstm.h5           — best checkpoint by val_accuracy
    asl_lstm_final.h5     — weights after all epochs
    lstm_training_curves.png
    lstm_class_indices.json  — {label: index} used during training
    tfjs_lstm/            — TF.js export (drop into public/models/lstm/)
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
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import (
    ModelCheckpoint, EarlyStopping, ReduceLROnPlateau, TensorBoard
)
from tensorflow.keras.utils import to_categorical
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix


# ── Paths ─────────────────────────────────────────────────────────────────────
MODEL_DIR   = os.path.dirname(__file__)
SEQ_DIR     = os.path.join(MODEL_DIR, 'data', 'sequences')
SAVED_DIR   = os.path.join(MODEL_DIR, 'saved')
TFJS_DIR    = os.path.join(SAVED_DIR, 'tfjs_lstm')
BEST_H5     = os.path.join(SAVED_DIR, 'asl_lstm.h5')
FINAL_H5    = os.path.join(SAVED_DIR, 'asl_lstm_final.h5')
CURVES_PNG  = os.path.join(SAVED_DIR, 'lstm_training_curves.png')
INDEX_JSON  = os.path.join(SAVED_DIR, 'lstm_class_indices.json')

os.makedirs(SAVED_DIR, exist_ok=True)
os.makedirs(TFJS_DIR, exist_ok=True)

# ── Hyper-parameters ──────────────────────────────────────────────────────────
SEQUENCE_LENGTH = 30     # frames per sequence
N_FEATURES      = 63     # 21 landmarks × (x, y, z)
EPOCHS          = 50
BATCH_SIZE      = 32
LR              = 1e-3
VAL_SPLIT       = 0.2
RANDOM_SEED     = 42

# Canonical class order — MUST match LSTM_LABELS in src/utils/modelConfig.ts.
# The app maps model output index i -> LSTM_LABELS[i], so training must use
# this exact order (NOT alphabetical). If you train on a subset, update
# LSTM_LABELS in modelConfig.ts to the class list this script prints.
CANONICAL_LABELS = [
    'hello', 'thank_you', 'please', 'sorry', 'help',
    'more', 'finished', 'want', 'understand', 'where',
    'name', 'pain', 'water', 'eat', 'friend',
    # Rejection class — record random hand motion, static holds, and
    # fingerspelling transitions. The app discards 'other' predictions,
    # which stops the closed-set softmax from firing a sign on
    # everything else the camera sees.
    'other',
]

print("\n" + "=" * 56)
print("  EchoSense — train_lstm.py")
print("=" * 56)


# ── 1. Load dataset ───────────────────────────────────────────────────────────
print("\n[1/6] Loading sequences from", SEQ_DIR, "...")

if not os.path.isdir(SEQ_DIR):
    print(f"\n[ERROR] Sequence directory not found: {SEQ_DIR}")
    print("Run collect_gestures.py first:\n")
    print("  python model/collect_gestures.py hello")
    print("  python model/collect_gestures.py thank_you")
    print("  ...\n")
    sys.exit(1)

dirs_found = {
    d for d in os.listdir(SEQ_DIR)
    if os.path.isdir(os.path.join(SEQ_DIR, d))
}

unknown = dirs_found - set(CANONICAL_LABELS)
if unknown:
    print(f"\n[ERROR] Sequence folder(s) not in CANONICAL_LABELS: {sorted(unknown)}")
    print("Rename them to match LSTM_LABELS in src/utils/modelConfig.ts, or add")
    print("them to CANONICAL_LABELS here AND to LSTM_LABELS in modelConfig.ts.")
    sys.exit(1)

# Order classes canonically (modelConfig.ts order), never alphabetically —
# the app maps output index i -> LSTM_LABELS[i].
labels_found = [l for l in CANONICAL_LABELS if l in dirs_found]

if len(labels_found) < 2:
    print(f"\n[ERROR] Need at least 2 gesture classes. Found: {labels_found}")
    sys.exit(1)

print(f"      Classes found : {labels_found}")

missing = [l for l in CANONICAL_LABELS if l not in dirs_found]
if missing:
    print(f"\n      [WARN] Training on a SUBSET — no data for: {missing}")
    print("      The app's LSTM_LABELS in src/utils/modelConfig.ts must be")
    print("      updated to exactly this trained class list (in this order):")
    print(f"      {labels_found}\n")

sequences, raw_labels = [], []

for label in labels_found:
    label_dir = os.path.join(SEQ_DIR, label)
    npy_files = sorted(
        [f for f in os.listdir(label_dir) if f.endswith('.npy')],
        key=lambda x: int(x.replace('.npy', ''))
    )
    for fname in npy_files:
        path = os.path.join(label_dir, fname)
        seq  = np.load(path)
        if seq.shape == (SEQUENCE_LENGTH, N_FEATURES):
            sequences.append(seq)
            raw_labels.append(label)
        else:
            print(f"      [WARN] Skipping {path} — shape {seq.shape} != ({SEQUENCE_LENGTH},{N_FEATURES})")

print(f"      Total sequences loaded : {len(sequences)}")

if len(sequences) == 0:
    print("\n[ERROR] No valid sequences found. Check your data.\n")
    sys.exit(1)

# Encode labels in canonical order (LabelEncoder would sort alphabetically
# and mislabel every prediction in the app)
label_to_idx = {label: idx for idx, label in enumerate(labels_found)}
class_names  = labels_found
y_encoded  = np.array([label_to_idx[l] for l in raw_labels])
n_classes  = len(class_names)
y_onehot   = to_categorical(y_encoded, num_classes=n_classes)
X          = np.array(sequences, dtype=np.float32)

print(f"      X shape : {X.shape}")
print(f"      y shape : {y_onehot.shape}")
print(f"      Classes : {class_names}")

# Save class index map
class_indices = {label: int(idx) for idx, label in enumerate(class_names)}
with open(INDEX_JSON, 'w') as f:
    json.dump(class_indices, f, indent=2)
print(f"      Class indices saved → {INDEX_JSON}")

# Distribution
print("\n      Sequence counts per class:")
for lbl in labels_found:
    count = raw_labels.count(lbl)
    bar   = '█' * min(count, 40)
    print(f"        {lbl:<20} {count:>4}  {bar}")


# ── 2. Train / val split ──────────────────────────────────────────────────────
print("\n[2/6] Splitting data ...")

X_train, X_val, y_train, y_val = train_test_split(
    X, y_onehot,
    test_size=VAL_SPLIT,
    random_state=RANDOM_SEED,
    stratify=y_encoded,
)

print(f"      Train : {X_train.shape[0]}  Val : {X_val.shape[0]}")


# ── 3. Build LSTM model ───────────────────────────────────────────────────────
print("\n[3/6] Building LSTM model ...")

model = Sequential([
    LSTM(64, return_sequences=True,
         input_shape=(SEQUENCE_LENGTH, N_FEATURES),
         name='lstm_1'),
    LSTM(128, return_sequences=True, name='lstm_2'),
    LSTM(64,  return_sequences=False, name='lstm_3'),
    Dense(64, activation='relu', name='dense_1'),
    Dropout(0.5, name='dropout'),
    Dense(n_classes, activation='softmax', name='output'),
], name='asl_lstm')

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=LR),
    loss='categorical_crossentropy',
    metrics=['accuracy'],
)

model.summary()


# ── 4. Train ──────────────────────────────────────────────────────────────────
print(f"\n[4/6] Training {EPOCHS} epochs ...")

callbacks = [
    ModelCheckpoint(
        filepath=BEST_H5,
        monitor='val_accuracy',
        save_best_only=True,
        verbose=1,
    ),
    ReduceLROnPlateau(
        monitor='val_loss',
        factor=0.5,
        patience=5,
        min_lr=1e-6,
        verbose=1,
    ),
    EarlyStopping(
        monitor='val_accuracy',
        patience=12,
        restore_best_weights=True,
        verbose=1,
    ),
    TensorBoard(
        log_dir=os.path.join(SAVED_DIR, 'logs', 'lstm'),
        histogram_freq=0,
    ),
]

history = model.fit(
    X_train, y_train,
    validation_data=(X_val, y_val),
    epochs=EPOCHS,
    batch_size=BATCH_SIZE,
    callbacks=callbacks,
    verbose=1,
)

model.save(FINAL_H5)
print(f"\n      Final model saved → {FINAL_H5}")


# ── 5. Evaluation ─────────────────────────────────────────────────────────────
print("\n[5/6] Evaluating on validation set ...")

y_pred_probs = model.predict(X_val, verbose=0)
y_pred       = np.argmax(y_pred_probs, axis=1)
y_true       = np.argmax(y_val, axis=1)

val_loss, val_acc = model.evaluate(X_val, y_val, verbose=0)
print(f"\n      Val accuracy : {val_acc:.4f}")
print(f"      Val loss     : {val_loss:.4f}")

print("\n      Classification Report:")
print(classification_report(y_true, y_pred, target_names=class_names))

# Confusion matrix
cm = confusion_matrix(y_true, y_pred)
print("      Confusion Matrix (rows=true, cols=pred):")
header = "  ".join(f"{c[:6]:>6}" for c in class_names)
print(f"             {header}")
for i, row in enumerate(cm):
    row_str = "  ".join(f"{v:>6}" for v in row)
    print(f"  {class_names[i]:<12} {row_str}")


# ── 5b. Training curves ───────────────────────────────────────────────────────
print(f"\n      Saving training curves → {CURVES_PNG}")

acc      = history.history['accuracy']
val_acc_ = history.history['val_accuracy']
loss     = history.history['loss']
val_loss_= history.history['val_loss']
epochs   = range(1, len(acc) + 1)

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
fig.suptitle('EchoSense — LSTM Dynamic Gesture Classifier Training',
             fontsize=14, fontweight='bold')

ax1.plot(epochs, acc,      '#1D9E75', linewidth=2,  label='Train accuracy')
ax1.plot(epochs, val_acc_, '#0F6E56', linewidth=2,  label='Val accuracy', linestyle='--')
ax1.set_title('Accuracy')
ax1.set_xlabel('Epoch')
ax1.set_ylabel('Accuracy')
ax1.legend()
ax1.set_ylim([0, 1])
ax1.grid(True, alpha=0.3)

ax2.plot(epochs, loss,      '#F0A876', linewidth=2,  label='Train loss')
ax2.plot(epochs, val_loss_, '#D4784E', linewidth=2,  label='Val loss', linestyle='--')
ax2.set_title('Loss')
ax2.set_xlabel('Epoch')
ax2.set_ylabel('Loss')
ax2.legend()
ax2.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig(CURVES_PNG, dpi=150)
plt.close()


# ── Summary ───────────────────────────────────────────────────────────────────
best_epoch = int(np.argmax(history.history['val_accuracy'])) + 1
best_acc   = max(history.history['val_accuracy'])

print("\n" + "=" * 56)
print("  Training Complete")
print("=" * 56)
print(f"  Classes            : {class_names}")
print(f"  Best epoch         : {best_epoch}")
print(f"  Best val_accuracy  : {best_acc:.4f}")
print(f"  Final val_accuracy : {val_acc_[-1]:.4f}")
print(f"  Best checkpoint    : {BEST_H5}")
print(f"  Training curves    : {CURVES_PNG}")
print("=" * 56)


# ── 6. TensorFlow.js export ───────────────────────────────────────────────────
print(f"\n[6/6] Exporting to TF.js → {TFJS_DIR} ...")

try:
    import tensorflowjs as tfjs
    tfjs.converters.save_keras_model(model, TFJS_DIR)

    # Keras 3 writes a topology format the tfjs browser runtime cannot
    # parse — rewrite model.json to legacy Keras 2 format in place.
    fixer = os.path.join(MODEL_DIR, '..', 'scripts', 'fix_tfjs_model_json.py')
    subprocess.run(
        [sys.executable, fixer, os.path.join(TFJS_DIR, 'model.json')],
        check=True,
    )

    tfjs_files = os.listdir(TFJS_DIR)
    print(f"\n  [OK] TF.js export successful. Files:")
    for fname in sorted(tfjs_files):
        size = os.path.getsize(os.path.join(TFJS_DIR, fname))
        print(f"       {fname:<40} {size / 1024:.1f} KB")
    print(f"\n  Next step:")
    print(f"    cp {TFJS_DIR}/* public/models/lstm/")
    print(f"    (then hard-refresh the app — the LSTM activates automatically)\n")
except Exception as e:
    print(f"\n  [ERROR] TF.js export failed: {e}")
    print(f"\n  Run manually:")
    print(f"  tensorflowjs_converter --input_format=keras {BEST_H5} {TFJS_DIR}")
    print(f"  python3 scripts/fix_tfjs_model_json.py {TFJS_DIR}/model.json\n")
