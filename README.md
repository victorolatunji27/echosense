# EchoSense

**Real-time ASL interpreter. No hardware. No install. Just a camera and a browser.**

EchoSense is a real-time American Sign Language interpreter that runs entirely in the browser using Google MediaPipe computer vision. Point any webcam at a signing hand and EchoSense tracks 21 hand landmarks at 30fps, recognizes ASL gestures, translates them to text, and speaks them aloud using ElevenLabs — with no server round-trip, no special hardware, and no cost to the user.

Built at **BitCamp 2026** — University of Maryland's annual hackathon.

---

## Live Demo

**[echosense-lyart.vercel.app](https://echosense-lyart.vercel.app)**

---

## The Problem

A professional ASL interpreter costs $100–$200 per hour and requires 48 hours advance notice. For the 500,000+ ASL users in the United States, this means that spontaneous, everyday communication — a quick question after class, a conversation at a pharmacy counter, talking to a hearing friend's family — often simply doesn't happen.

Every existing real-time ASL tool either requires expensive specialized hardware, runs through a slow server connection that adds too much latency for real conversation, or sits behind a subscription that recreates the exact cost barrier it claims to solve.

EchoSense is built for the moments that are too small for a scheduled interpreter and too important to abandon.

---

## Features

### Three translation modes

**Phrase mode** — recognizes whole ASL gestures and common signs instantly. Ignores letter signals entirely and always prioritizes word-level interpretation. Includes auto-speak via ElevenLabs.

**Spell mode** — full ASL alphabet (A–Z) with a 2-second hold timer per letter. Letters accumulate into a word in the building box, then the word is auto-corrected to the closest English word using the Anthropic API. Includes start/end flow control and auto-speak on finalization.

**Sentence mode** — signs accumulate into a buffer, then the full sequence is parsed as ASL grammar and evaluated by an LLM into a grammatically correct English sentence. Powered by a three-layer pipeline: Lexer → ASL Parser → English Evaluator. Includes a TerpAI conversation monitor that generates 3 alternative sentence suggestions based on the full conversation history.

### Recognition pipeline

- **MediaPipe GestureRecognizer** — Google's production-grade hand landmark model running via WebAssembly entirely client-side. Extracts 21 3D landmarks per frame at 30fps.
- **Geometric classifier** — rule-based finger position logic for the full ASL alphabet (A–Z) and numbers (0–9). No training required.
- **CNN scaffold** — TensorFlow.js infrastructure ready to load a trained MobileNetV2 model from `/public/models/cnn/`. Activates automatically when model files are present.
- **LSTM scaffold** — TensorFlow.js infrastructure for dynamic motion-based signs (hello, thank you, please, etc.) from `/public/models/lstm/`. Activates automatically when model files are present.
- **Priority waterfall** — LSTM → CNN → MediaPipe built-in → Geometric classifier. The best available model is always used.

### Voice output

- **ElevenLabs Turbo v2** — natural human-sounding voice generation via streaming API
- **Web Speech API fallback** — silent fallback if ElevenLabs is unavailable, so the app always speaks
- **Voice selection** — choose from multiple ElevenLabs voices per session
- **Auto-speak toggles** — per-panel TTS on/off control

### ASL Reference Sheet

Full in-app reference guide covering:
- 7 quick response gestures with hand shape descriptions and memory tips
- Full alphabet A–Z with fingerspelling guidance
- Numbers 0–9
- 15+ common phrases (please, thank you, water, help, bathroom, etc.)
- Live "Detected!" highlight on whichever sign is currently being shown to the camera
- Search and section filtering
- Hand diagram illustrations for every sign

### Practice mode

- Random gesture prompts with large visual hand diagram
- Correct answer detected automatically at 80%+ confidence
- Auto-advances to next question after 1.2 seconds
- Score tracking with streak counter
- Skip button for harder letters
- Animated transition between questions

### TerpAI integration

TerpAI is UMD's generative AI gateway built on Cloudforce's nebulaONE platform on Microsoft Azure. EchoSense integrates TerpAI as a campus-deployed ASL Communication Assistant:

- Monitors the full conversation history across all sentences in a session
- After each sentence is finalized, generates 3 contextually-aware alternative sentence suggestions
- Each alternative is shown with a reasoning label (e.g. "question form", "more detail", "softer tone")
- Both the original and all 3 suggestions use the same box format with individual speak buttons
- Suggestions incorporate prior conversation context — later suggestions are influenced by earlier sentences

### Sentence builder pipeline

```
Camera frame
    ↓
MediaPipe landmarks (21 points × 3 coords)
    ↓
Gesture classifier (LSTM → CNN → MediaPipe → Geometric)
    ↓
Sign commit (2-second hold timer + cooldown lock)
    ↓
Sign buffer (accumulates until hand drops or 3s pause)
    ↓
Lexer (groups letters into words, maps gesture keys to tokens)
    ↓
ASL Parser (detects topic-comment, negation, question patterns)
    ↓
LLM Evaluator (Anthropic claude-sonnet — produces English sentence)
    ↓
TerpAI (generates 3 alternative suggestions from conversation history)
    ↓
ElevenLabs TTS (speaks the finalized sentence)
```

### Session features

- **Session stopwatch** — tracks how long the current sentence took to sign
- **Transcript** — full session history in message bubble format
- **Download transcript** — exports session as `.txt` file with timestamp header
- **Copy transcript** — one-click clipboard copy
- **Share transcript** — generates a shareable URL with base64-encoded transcript
- **Auth0 authentication** — Google login, transcript persistence across sessions via localStorage
- **Keyboard shortcuts** — `Esc` to clear, `M` to mute, `?` to open reference guide

### Design

- Warm off-white background (`#F7F5F2`) with ASL hand illustration watermarks around the perimeter
- DM Serif Display for detected sign output, Inter for all UI text
- Deep forest green (`#1A4D3A`) primary accent, warm amber (`#C8A96E`) secondary accent
- Glassmorphism header with backdrop blur
- 2-second hold arc with amber progress ring and letter display in center
- Gesture flash banner on sign commit
- Custom dual-layer cursor (dot + lagging ring)
- Branded loader screen with ILoveYou hand diagram and progress bar
- Full WCAG AA contrast compliance
- Responsive layout — works on screens down to 768px

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + TypeScript + Vite |
| Styling | TailwindCSS + custom CSS design tokens |
| Computer vision | MediaPipe Tasks Vision (WebAssembly, client-side) |
| ML inference | TensorFlow.js (browser-native, no server) |
| Voice output | ElevenLabs Turbo v2 API + Web Speech API fallback |
| Sentence evaluation | Anthropic claude-sonnet-4-6 |
| TerpAI suggestions | Anthropic claude-sonnet-4-6 (campus AI gateway) |
| Authentication | Auth0 (Google login, passwordless) |
| Deployment | Vercel (frontend) |
| Icons | Lucide React |
| Fonts | Google Fonts — DM Serif Display + Inter |

---

## Getting started

### Prerequisites

- Node.js 18+
- An Anthropic API key — [console.anthropic.com](https://console.anthropic.com)
- An ElevenLabs API key — [elevenlabs.io](https://elevenlabs.io) (free tier)
- An Auth0 account — [auth0.com](https://auth0.com) (free tier)

### Installation

```bash
git clone https://github.com/your-username/echosense.git
cd echosense
npm install
```

### Environment setup

Create a `.env.local` file in the project root:

```env
# Server-side keys — used only by the /api serverless functions.
# No VITE_ prefix: they are never shipped to the browser.
ANTHROPIC_KEY=your_anthropic_api_key_here
ELEVENLABS_KEY=your_elevenlabs_api_key_here

# Auth0 SPA config — public by design, safe to expose to the browser.
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_AUTH0_CLIENT_ID=your_auth0_client_id_here
```

All Anthropic and ElevenLabs calls go through Vercel serverless functions
(`/api/anthropic` and `/api/tts`) that hold the keys server-side, enforce a
request size cap, a per-IP rate limit, and a model allowlist. The browser
never sees either key.

> **Never commit `.env.local` to version control.** It is already excluded by `.gitignore`.

### Auth0 setup

1. Create a Single Page Application in your Auth0 dashboard
2. Under Allowed Callback URLs, Allowed Logout URLs, and Allowed Web Origins add:
   `http://localhost:5173, https://your-vercel-url.vercel.app`
3. Copy the Domain and Client ID into your `.env.local`

### Development server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Click Allow when the browser requests camera permission.

> `npm run dev` (plain Vite) does not run the `/api` serverless functions —
> AI autocorrect/sentence evaluation fall back to their offline rules and TTS
> falls back to Web Speech. To exercise the full proxy path locally, run
> `npx vercel dev` instead.

### Production build

```bash
npm run build
```

### Deploy to Vercel

```bash
npx vercel --prod
```

Add all four environment variables in the Vercel dashboard under Project
Settings → Environment Variables before deploying: `ANTHROPIC_KEY` and
`ELEVENLABS_KEY` (server-side, consumed by the `/api` functions) plus
`VITE_AUTH0_DOMAIN` and `VITE_AUTH0_CLIENT_ID` (public SPA config).

---

## Project structure

```
echosense/
├── api/
│   ├── anthropic.ts      # Serverless proxy → Anthropic Messages API
│   └── tts.ts            # Serverless proxy → ElevenLabs TTS (streams audio)
├── public/
│   └── models/
│       ├── cnn/          # Drop trained CNN model files here
│       │   └── README.md
│       └── lstm/         # Drop trained LSTM model files here
│           └── README.md
├── scripts/
│   ├── train_cnn.py      # CNN training script (coming soon)
│   └── train_lstm.py     # LSTM training script (coming soon)
└── src/
    ├── components/
    │   ├── ASLBackground.tsx      # Canvas hand illustration background
    │   ├── AboutModal.tsx         # About / mission modal
    │   ├── AuthButton.tsx         # Auth0 login/logout button
    │   ├── CameraView.tsx         # Webcam feed + landmark overlay
    │   ├── CustomCursor.tsx       # Dual-layer cursor (dot + ring)
    │   ├── GestureFlash.tsx       # Full-width gesture commit banner
    │   ├── HandDiagram.tsx        # SVG hand illustrations (all signs)
    │   ├── LoaderScreen.tsx       # Branded loading screen
    │   ├── OutputPanel.tsx        # Phrase + Spell panel UI
    │   ├── PracticeMode.tsx       # Practice mode overlay
    │   ├── ReferenceSheet.tsx     # Full ASL reference guide overlay
    │   ├── SentencePanel.tsx      # Sentence mode + TerpAI suggestions
    │   └── TTSToggle.tsx          # Reusable TTS on/off toggle
    ├── data/
    │   └── aslReference.ts        # All reference sheet content
    ├── hooks/
    │   ├── useCamera.ts           # Webcam stream management
    │   ├── useCNNClassifier.ts    # TF.js CNN model loader + inference
    │   ├── useGestureRecognizer.ts # MediaPipe + classifier orchestration
    │   ├── useLandmarkBuffer.ts   # 30-frame rolling buffer for LSTM
    │   ├── useLSTMClassifier.ts   # TF.js LSTM model loader + inference
    │   ├── useSentenceBuilder.ts  # Sentence pipeline + TerpAI + stopwatch
    │   ├── useTranscript.ts       # Session transcript state
    │   └── useTTS.ts              # ElevenLabs + Web Speech TTS
    ├── utils/
    │   ├── aslClassifier.ts       # Geometric finger-position classifier
    │   ├── gestureMap.ts          # Gesture key → display text mapping
    │   ├── modelConfig.ts         # Model paths + label arrays
    │   ├── ripple.ts              # Button ripple click effect
    │   ├── scrollReveal.ts        # IntersectionObserver reveal animation
    │   ├── sentenceEvaluator.ts   # ASL → English LLM evaluator + TerpAI
    │   ├── signLexer.ts           # Token stream lexer
    │   ├── signParser.ts          # ASL grammar pattern parser
    │   └── spellCorrector.ts      # Spell mode autocorrect
    ├── App.tsx                    # Root component + all mode logic
    └── index.css                  # Design token system + all CSS
```

---

## Expanding the vocabulary

The current build uses MediaPipe's built-in gesture recognizer plus a geometric classifier. To add full ASL vocabulary recognition, drop trained TensorFlow.js model files into the `/public/models/` directories and the app activates them automatically.

### CNN model (static signs — full alphabet)

```
public/models/cnn/model.json
public/models/cnn/group1-shard1of1.bin
```

Train using the [ASL Alphabet dataset on Kaggle](https://www.kaggle.com/datasets/grassknoted/asl-alphabet) (87,000 images, 29 classes). Target architecture: MobileNetV2 fine-tuned, exported via `tensorflowjs_converter`.

### LSTM model (dynamic signs — motion-based)

```
public/models/lstm/model.json
public/models/lstm/group1-shard1of1.bin
```

Collect 30 sequences × 30 frames per gesture using MediaPipe landmarks. Input shape: `[1, 30, 63]`. Labels must match `LSTM_LABELS` in `src/utils/modelConfig.ts`.

Both models load silently. If files are not present, the app falls back to the geometric classifier. The header status indicator shows which classifier tier is active.

---

## ASL gesture reference

### Quick responses (MediaPipe built-in)

| Gesture | Sign |
|---|---|
| Thumbs up | Yes |
| Thumbs down | No |
| Open palm | Stop |
| Closed fist | Wait |
| Peace / V | Hello |
| ILoveYou hand | I love you |
| Index finger up | One moment |

### Alphabet (geometric classifier)

Full A–Z fingerspelling. Each letter requires a 2-second hold. Use Spell mode to build words letter by letter.

### Common words (LSTM when model is available)

hello, thank you, please, sorry, help, more, finished, want, understand, where, name, pain, water, eat, friend

---

## How the sentence builder works

1. The user signs gestures. Each gesture requires a 2-second hold to commit.
2. Committed gestures accumulate in a sign buffer shown as token pills.
3. When the user pauses for 3 seconds or drops their hand for 4 seconds, the buffer is sent through the pipeline.
4. The **Lexer** normalizes tokens — consecutive letters are grouped into words if they form valid English, otherwise kept as individual letters.
5. The **Parser** detects ASL grammar patterns: topic-comment structure, negation, question form, greeting, spelling.
6. The **LLM Evaluator** sends the parsed ASL structure to `claude-sonnet-4-6` with expansion maps and grammar rules, receiving back a single grammatically correct English sentence.
7. The sentence is displayed and spoken aloud.
8. **TerpAI** then analyzes the sentence alongside the full conversation history and generates 3 alternative phrasings shown as suggestions below the original.

---

## Accessibility

- All camera permissions requested with plain-language explanations
- Full keyboard navigation with visible focus rings
- ARIA labels on all icon-only buttons
- `aria-live="polite"` on transcript output for screen reader announcements
- WCAG AA contrast ratios throughout (4.5:1 for body text, 3:1 for large text)
- Minimum 44×44px touch targets on all interactive elements
- No auto-playing audio without user consent

---

## Roadmap

- [ ] Train and ship CNN model for full A–Z accuracy improvement (especially A/S/M/N/E disambiguation)
- [ ] Train and ship LSTM model for 15 dynamic gesture signs
- [ ] Mobile PWA support — use phone camera as the interpreter
- [ ] BSL (British Sign Language) and LSF (French Sign Language) support
- [ ] Community data collection layer — Deaf users contribute labeled signs to expand training set
- [ ] Hospital and school white-label deployment
- [ ] Offline mode — full functionality without internet connection

---

## Team

Built at BitCamp 2026 — University of Maryland

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [Google MediaPipe](https://developers.google.com/mediapipe) — hand landmark detection
- [ElevenLabs](https://elevenlabs.io) — natural voice synthesis
- [Anthropic](https://anthropic.com) — sentence evaluation and TerpAI suggestions
- [Cloudforce](https://gocloudforce.com) and [Microsoft](https://microsoft.com) — TerpAI platform on Azure
- [Auth0](https://auth0.com) — authentication infrastructure
- [University of Maryland Accessibility and Disability Service](https://ads.umd.edu) — for the community this serves

---

*"Bridging silence and sound."*
