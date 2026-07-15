#!/usr/bin/env bash
#
# EchoSense — guided multimodal recording session
# ================================================
# Walks through every (sign, non-manual-marker) recording needed to train the
# two-hand + face model (model/train_multimodal.py). Each entry opens the
# collector's webcam window; inside it: SPACE skips the countdown, Q/ESC quits
# that take. This script pauses between takes so you can reset between signs.
#
# Usage:
#   bash model/record_all.sh              # default 30 sequences per take
#   SEQUENCES=20 bash model/record_all.sh # faster: 20 per take
#   START_AT=13 bash model/record_all.sh  # resume from take #13 (see the list it prints)
#
# The collector APPENDS (never overwrites), so re-running a sign just adds more
# takes. Quitting a take (Q) and continuing is fine.
#
# Run from the repo root: bash model/record_all.sh
set -u

cd "$(dirname "$0")/.." || exit 1
PY=model/venv/bin/python
SEQUENCES="${SEQUENCES:-30}"
START_AT="${START_AT:-1}"

if [ ! -x "$PY" ]; then
  echo "ERROR: $PY not found. Create the venv first (see requirements.txt)."
  exit 1
fi

# ── The recording plan ─────────────────────────────────────────────────────
# "<sign> <marker>" — 'statement' is the neutral face. The 5 expressive signs
# are recorded under all four markers (that's what teaches the marker head);
# the rest are statement-only. Sign help/more/finished with BOTH hands.
TAKES=(
  # Expressive signs — all four facial markers
  "you statement"        "you yesno_question"        "you wh_question"        "you negation"
  "go statement"         "go yesno_question"         "go wh_question"         "go negation"
  "want statement"       "want yesno_question"       "want wh_question"       "want negation"
  "understand statement" "understand yesno_question" "understand wh_question" "understand negation"
  "help statement"       "help yesno_question"       "help wh_question"       "help negation"
  # Remaining signs — statement (neutral face) only
  "hello statement"      "thank_you statement"       "please statement"       "sorry statement"
  "more statement"       "finished statement"        "where statement"        "name statement"
  "pain statement"       "water statement"           "eat statement"          "friend statement"
  # Rejection class — random motion / static holds / letter transitions, varied faces
  "other statement"
)

TOTAL=${#TAKES[@]}

echo "============================================================"
echo "  EchoSense — multimodal recording session"
echo "============================================================"
echo "  Takes        : $TOTAL   (starting at #$START_AT)"
echo "  Seqs/take    : $SEQUENCES"
echo "  Two-hand     : sign help / more / finished with BOTH hands"
echo "  Expressions  : hold the marked face for the WHOLE take"
echo "                 yesno = brows up · wh = brows furrowed · negation = headshake"
echo "  Controls     : SPACE skip countdown · Q/ESC end a take"
echo "============================================================"
echo

for i in "${!TAKES[@]}"; do
  n=$((i + 1))
  [ "$n" -lt "$START_AT" ] && continue
  take="${TAKES[$i]}"
  sign="${take%% *}"
  marker="${take##* }"

  echo "------------------------------------------------------------"
  echo "  Take $n / $TOTAL   →   sign: $sign   marker: $marker"
  echo "------------------------------------------------------------"
  read -r -p "  Press ENTER to record (or type s to skip, q to quit): " ans
  case "$ans" in
    q|Q) echo "  Stopped at take $n. Resume later with: START_AT=$n bash model/record_all.sh"; exit 0 ;;
    s|S) echo "  Skipped take $n ($take)."; continue ;;
  esac

  $PY model/collect_gestures.py "$sign" "$marker" --sequences "$SEQUENCES"
done

echo
echo "============================================================"
echo "  All takes done. Next:"
echo "    $PY model/train_multimodal.py"
echo "    mkdir -p public/models/multimodal"
echo "    cp model/saved/tfjs_multimodal/* public/models/multimodal/"
echo "  Then paste the printed MULTIMODAL_SIGN_LABELS into"
echo "  src/utils/modelConfig.ts and hard-refresh the app."
echo "============================================================"
