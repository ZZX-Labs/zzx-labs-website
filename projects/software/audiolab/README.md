<div align="center">
<img src="logo.png" alt="AudioLab" width="240" height="240">

# AudioLab

Experimental **sound-design, synthesis, recording, signal-processing, spectral-analysis, and multi-track audio environment**.

**Version:** 0.1.0-alpha  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D  
**Language:** Python / PyQt5 / NumPy / SciPy / FFmpeg / Librosa · JavaScript / Web Audio / MediaRecorder / Canvas

## What it does

- Generates sine, square, sawtooth, triangle, and white-noise signals.
- Plays live synthesizer tones through Web Audio.
- Renders generated signals directly to PCM WAV.
- Imports multiple local audio tracks.
- Decodes tracks into Web Audio buffers.
- Provides per-track gain and stereo pan.
- Provides mute, solo, loop, play-mix, and stop-mix controls.
- Routes the synthesizer and mixer through one modular effects bus.
- Provides low-pass, high-pass, band-pass, notch, and all-pass filtering.
- Provides waveshaper distortion.
- Provides delay, feedback, and wet/dry control.
- Provides master output gain.
- Renders a real-time oscilloscope.
- Renders a real-time FFT spectrum.
- Displays live peak and RMS output meters.
- Records a user-authorized microphone through MediaRecorder.
- Auditions and downloads browser-recorded audio.
- Decodes one source for offline trimming.
- Applies peak normalization.
- Applies fade-in and fade-out.
- Exports offline results as 16-bit PCM WAV.
- Keeps all supplied browser processing local.

## Install

### Native Python Edition

```bash
python -m venv .venv && . .venv/bin/activate
# Windows:
# .venv\Scripts\activate

pip install pyqt5 numpy scipy matplotlib sounddevice pyaudio ffmpeg-python librosa pillow
```

Install FFmpeg separately for native FFmpeg workflows.

### Web Edition

No package installation is required.

```bash
python -m http.server 8000
```

Open the served project directory.

## Run (Web)

Deploy under:

```text
/projects/software/audiolab/
```

Workbench:

```text
Synthesizer
Multi-Track
Filters & FX
Spectrum & Scope
Recorder
Offline Render
```

## Synthesizer

The browser synthesizer uses:

```text
OscillatorNode
AudioBufferSourceNode
GainNode
StereoPannerNode
```

Supported live/generated signal types:

```text
sine
square
sawtooth
triangle
white noise
```

The generated WAV function uses 48 kHz by default.

## Effects chain

AudioLab's browser graph is:

```text
source
  ↓
track/synth gain
  ↓
stereo pan
  ↓
shared input
  ↓
BiquadFilter
  ↓
WaveShaper distortion
  ├──────────────→ dry ─────────┐
  └→ Delay → Feedback → wet ────┤
                                 ↓
                              Master
                                 ↓
                              Analyser
                                 ↓
                           Audio Output
```

## Filter

Browser filter types:

```text
lowpass
highpass
bandpass
notch
allpass
```

Parameters:

```text
frequency
Q
```

## Distortion

The browser waveshaper uses a generated nonlinear transfer curve.

Drive `0` approximates a transparent transfer curve.

## Delay

Controls:

```text
delay time
feedback
wet level
```

The feedback gain is limited in the interface to reduce runaway feedback.

## Multi-track mixer

Each imported track has:

```text
gain
pan
mute
solo
loop
```

Double scheduling is avoided by stopping active sources before a new mix starts.

## Real-time analysis

The shared output bus uses:

```javascript
AnalyserNode
```

with:

```text
FFT size = 2048
```

The Analysis panel renders:

```text
time-domain oscilloscope
frequency-domain spectrum
peak meter
RMS meter
sample rate
```

## Recording

Microphone capture is requested only after:

```text
START RECORDING
```

The browser uses:

```javascript
navigator.mediaDevices.getUserMedia({audio:true})
MediaRecorder
```

Preferred recording container:

```text
audio/webm;codecs=opus
```

with OGG/Opus or generic WebM fallback depending on browser support.

## Offline processing

The Offline Render panel performs non-destructive PCM processing.

Supported operations:

```text
trim start/end
peak normalization
fade in
fade out
WAV export
```

For target peak `L dBFS`:

```text
target = 10^(L / 20)
gain = target / current_peak
```

## WAV export

Rendered WAV format:

```text
PCM
16-bit signed little-endian
source or generated sample rate
source channel count
RIFF/WAVE container
```

## Native/browser boundary

The native project includes dependencies for:

```text
NumPy
SciPy
Matplotlib
sounddevice
PyAudio
FFmpeg
Librosa
```

The browser edition replaces these with native web capabilities where practical:

```text
Web Audio API
MediaRecorder
Canvas
File API
Blob downloads
```

The full native FFmpeg/Librosa toolchain remains appropriate for broader codec support and more advanced analysis.

---

## Directory layout

```text
audiolab/
├─ index.html
├─ style.css
├─ script.js
├─ audiolab.js
├─ audio-engine.js
├─ dsp.js
├─ waveform.js
├─ recorder.js
├─ hook.css
├─ hook.js
├─ manifest.json
├─ README.md
└─ logo.png
```

---

## JavaScript API

Primary browser API:

```javascript
window.AudioLab
```

Methods:

```javascript
AudioLab.playTone(options)
AudioLab.stop()

AudioLab.addFiles(files)
AudioLab.getTracks()

AudioLab.getFx()
AudioLab.setFx(settings)

AudioLab.generateWav(options)
AudioLab.getState()
```

Supporting modules:

```javascript
window.AudioLabEngine
window.AudioLabDSP
window.AudioLabVisuals
window.AudioLabRecorder
```

---

## Privacy

The supplied browser edition does not upload audio.

Microphone access is permission-gated and requested only when recording starts.

---

## Usage quickstart

- **Generate tone:** `Synthesizer` → choose waveform/frequency → `PLAY TONE`.
- **Export synthesized WAV:** set duration → `RENDER WAV`.
- **Mix files:** `Multi-Track` → import files → adjust gain/pan → `PLAY MIX`.
- **Shape sound:** `Filters & FX`.
- **Analyze output:** `Spectrum & Scope`.
- **Record microphone:** `Recorder` → `START RECORDING`.
- **Process a file:** `Offline Render` → select file → trim/normalize/fade → `EXPORT WAV`.
