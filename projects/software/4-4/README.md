<div align="center">
<img src="logo.png" alt="4⁴" width="240" height="240">

# 4⁴


Guided **4-4-4-4 box-breathing clock** with synchronized visual, audio, and haptic cues for inhale, hold, exhale, and hold cycles.


**Version:** 1.0.0  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D  
**Language:** Python 3.11+ / PyQt5 · JavaScript / Web Audio / Vibration API
</div>


## What it does

- Runs the canonical **4-4-4-4 box-breathing protocol**
- Guides **inhale → hold → exhale → hold** phases
- Uses a high-resolution browser timing loop for synchronized countdowns
- Animates an expanding/contracting breathing guide
- Provides optional **audio phase cues**
- Provides optional **haptic / vibration cues** when supported
- Provides optional **spoken phase prompts**
- Supports **fullscreen** breathing sessions
- Supports **Screen Wake Lock** when available
- Allows independently configurable phase timings and cycle count
- Includes a built-in **4-4-4-4 preset**
- Includes a **4-7-8 alternate preset**
- Stores settings and session statistics locally
- Exports session statistics as JSON
- Runs fully offline after the page is loaded


## Install

### Native Python Edition

```bash
python -m venv .venv && . .venv/bin/activate
# Windows:
# .venv\Scripts\activate

pip install pyqt5 pillow numpy
```

If the native repository provides a `requirements.txt`, prefer:

```bash
pip install -r requirements.txt
```

### Web Edition

No package installation is required.

Serve the project directory:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```


## Run (Web)

Deploy or serve:

```text
/projects/software/4-4/
```

The browser workbench includes:

```text
Breathing Session
Timing & Cues
Session Statistics
Protocol
```


## Run (Native)

The native project is designed for:

```text
Python 3.11+
PyQt5
Pillow
NumPy
```

Use the repository's Python entry point for the GUI edition.


## 4-4-4-4 Protocol

One cycle consists of:

```text
INHALE   4 seconds
HOLD     4 seconds
EXHALE   4 seconds
HOLD     4 seconds
```

Therefore:

```text
cycle_duration = 4 + 4 + 4 + 4
               = 16 seconds
```

For four cycles:

```text
session_duration = 16 × 4
                 = 64 seconds
```


## Timing Model

The browser edition uses:

```javascript
performance.now()
requestAnimationFrame()
```

The displayed phase countdown is derived from elapsed monotonic time rather than decrementing a counter once per second.

For phase duration `D`:

```text
remaining = max(0, D - elapsed)
```

Session progress is:

```text
progress =
elapsed_session_time
────────────────────
total_session_time
```


## Visual Guide

The main breathing ring changes scale according to phase:

```text
INHALE  → expand
HOLD    → remain expanded
EXHALE  → contract
HOLD    → remain contracted
```

The ring animation duration is synchronized with the current phase duration.


## Audio Cues

When enabled, the browser uses the Web Audio API to generate short oscillator tones at each phase transition.

No external audio assets are required.


## Haptic Cues

When supported, the web edition uses:

```javascript
navigator.vibrate()
```

Different vibration patterns distinguish the phase transitions.

Haptic availability varies by browser, operating system, and device.


## Spoken Cues

Optional spoken phase prompts use:

```javascript
speechSynthesis
SpeechSynthesisUtterance
```

Voice availability depends on the browser and operating system.


## Wake Lock

When enabled and supported:

```javascript
navigator.wakeLock.request("screen")
```

is used during an active session to reduce the chance of the display sleeping.


---

## Directory layout

```text
4-4/
├─ index.html
├─ style.css
├─ script.js
├─ 4-4.js
├─ hook.css
├─ hook.js
├─ manifest.json
├─ README.md
└─ logo.png
```


---

## JavaScript API

The project-specific browser port is exposed as:

```javascript
window.FourFour
```

Current methods:

```javascript
FourFour.start()
FourFour.pause()
FourFour.resume()
FourFour.reset()

FourFour.applySettings(settings)
FourFour.getSettings()

FourFour.getStats()
FourFour.getState()
FourFour.exportStats()
```


---

## Keyboard Controls

```text
Space   Start / Pause / Resume
R       Reset
F       Fullscreen
M       Toggle audio
```


---

## Local Storage

Settings are stored under:

```text
zzx-4-4-settings-v1
```

Statistics are stored under:

```text
zzx-4-4-stats-v1
```

No account or server-side database is required.


---

## Notes

The web edition does not measure:

```text
respiration rate
blood oxygen
heart rate
blood pressure
other physiological signals
```

It is a timing and cueing application.

Browser support for vibration, speech synthesis, fullscreen, and wake lock varies by platform.


---

## Usage quickstart

- **Start**: open `/projects/software/4-4/` → `START`
- **Pause**: press `PAUSE` or `Space`
- **Reset**: press `RESET` or `R`
- **Fullscreen**: press `FULLSCREEN` or `F`
- **Configure**: open `Timing & Cues` → adjust timings/cycles → `APPLY SETTINGS`
- **Canonical preset**: press `4-4-4-4 PRESET`
- **Statistics**: open `Session Statistics`
- **Export**: press `EXPORT JSON`
