# LSTM Model — ASL Dynamic Gesture Classifier

Drop your trained TensorFlow.js model files here:
- model.json
- group1-shard1of1.bin

## How to train
1. Record 30 sequences × 30 frames for each gesture
   using: model/venv/bin/python model/collect_gestures.py [label]
   (record every label listed below)
2. Run: model/venv/bin/python model/train_lstm.py
   — trains, exports to TensorFlow.js, and fixes the model.json
   topology automatically (scripts/fix_tfjs_model_json.py)
3. Copy model/saved/tfjs_lstm/* here — LSTM activates automatically

Class order is canonical (LSTM_LABELS in modelConfig.ts), never
alphabetical. If you train on a subset of gestures, update
LSTM_LABELS to exactly the trained class list the script prints.

## Model input
- Shape: [1, 30, 63]
- 30 frames × 21 landmarks × 3 coordinates (x,y,z)
- Labels must match LSTM_LABELS in modelConfig.ts

## Gestures supported
hello, thank_you, please, sorry, help, more,
finished, want, understand, where, name,
pain, water, eat, friend

## The 'other' rejection class
Also record an `other` class: random hand motion, static holds, and
fingerspelling transitions (30+ sequences, the more varied the better).
A closed-set softmax must answer *something* for every input — without
a rejection class, waving your hand randomly will confidently predict
one of the real signs. The app discards `other` predictions, letting
the waterfall fall through to the CNN. A motion gate (LSTM_MIN_MOTION)
additionally skips the LSTM for static holds.
