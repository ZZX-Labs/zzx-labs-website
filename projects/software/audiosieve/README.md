<div align="center">
<img src="logo.png" alt="AudioSieve" width="240" height="240">

# AudioSieve

Cross-platform **music-library workstation** combining VLC-style playback, waveform and signal analysis, output-device routing, playlist management, metadata editing, and FFmpeg-style audio processing.

**Version:** 0.1.0-alpha  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D  
**Language:** Python 3.11+ / PyQt5 / VLC / FFmpeg / Mutagen · JavaScript / Web Audio / IndexedDB

## What it does

- Imports local audio libraries and computes SHA-256 fingerprints.
- Provides VLC-style previous/play-pause/stop/next transport, seeking, volume, rate, repeat, and shuffle.
- Renders a seekable waveform with Web Audio + Canvas.
- Calculates peak amplitude, RMS, crest factor, zero-crossing rate, and a local frequency-spectrum view.
- Enumerates and routes browser-visible output devices with `setSinkId()` where supported.
- Parses common MP3 ID3v2 text frames and ID3v1 fallbacks.
- Parses FLAC STREAMINFO and Vorbis-comment metadata.
- Stores non-destructive catalog tag edits and exports tag sidecars.
- Persists metadata records in IndexedDB without storing raw source audio bytes.
- Trims decoded audio, applies peak normalization and fades, and exports 16-bit PCM WAV.
- Exports/imports AudioSieve library and playlist JSON.

## Install

### Native Python Edition

```bash
python -m venv .venv && . .venv/bin/activate
# Windows: .venv\Scripts\activate
pip install pyqt5 python-vlc ffmpeg-python mutagen pillow requests
```

Install VLC and FFmpeg separately for the native application.

### Web Edition

```bash
python -m http.server 8000
```

Open `http://localhost:8000/`.

## Run (Web)

Deploy under:

```text
/projects/software/audiosieve/
```

Workbench:

```text
Player
Library
Metadata
Waveform & Analysis
Processing
Audio Output
Export / Import
```

## Playback

The browser edition replaces VLC playback with `HTMLAudioElement`. Local files are exposed only through browser object URLs for the active session.

## Waveform and analysis

The selected file is decoded with `AudioContext.decodeAudioData()`. For decoded samples `x[n]`:

```text
peak = max(|x[n]|)
RMS = sqrt(sum(x[n]^2) / N)
crest factor = peak / RMS
```

Zero-crossing rate counts sign transitions. The spectrum view performs a lightweight DFT over a windowed PCM section.

## Output routing

Where supported:

```javascript
HTMLMediaElement.setSinkId(deviceId)
navigator.mediaDevices.enumerateDevices()
```

Support and device labels depend on browser, OS, and permissions.

## Metadata

Common MP3 frames parsed include:

```text
TIT2 title
TPE1 artist
TALB album
TPE2 album artist
TCON genre
TRCK track
TDRC/TYER date/year
TCOM composer
COMM comment
```

FLAC parsing covers STREAMINFO plus common Vorbis comments such as `TITLE`, `ARTIST`, `ALBUM`, `GENRE`, `TRACKNUMBER`, and `DATE`.

Browser tag editing is intentionally non-destructive:

```text
embeddedTags + catalogTags override = effective tags
```

Edits can be exported as `*.audiosieve-tags.json`.

## Processing

Browser processing supports:

```text
trim
peak normalization
fade in
fade out
16-bit PCM WAV export
```

For target level `L dBFS`:

```text
target amplitude = 10^(L / 20)
gain = target amplitude / current peak
```

The source file is never rewritten.

## IndexedDB

Persistent database:

```text
zzx-audiosieve
```

It stores metadata/fingerprints/catalog edits, not raw audio. After reload, local files must be reselected to restore playback handles.

## Library JSON

```text
zzx.audiosieve.library.v1
```

Playlist JSON:

```text
zzx.audiosieve.playlist.v1
```

---

## Directory layout

```text
audiosieve/
├─ index.html
├─ style.css
├─ script.js
├─ audiosieve.js
├─ library-store.js
├─ metadata.js
├─ waveform.js
├─ audio-processing.js
├─ hook.css
├─ hook.js
├─ manifest.json
├─ README.md
└─ logo.png
```

---

## JavaScript API

```javascript
window.AudioSieve
```

Core methods:

```javascript
AudioSieve.addFiles(files)
AudioSieve.getTracks()
AudioSieve.getSelected()
AudioSieve.play()
AudioSieve.pause()
AudioSieve.stop()
AudioSieve.seek(seconds)
AudioSieve.setVolume(value)
AudioSieve.setOutput(deviceId)
AudioSieve.analyzeSelected()
AudioSieve.exportLibraryObject()
AudioSieve.getState()
```

Supporting modules:

```javascript
window.AudioSieveMetadata
window.AudioSieveWaveform
window.AudioSieveProcessing
window.AudioSieveLibraryStore
```

---

## Privacy

The supplied browser implementation does not upload imported audio. Core functionality requires no network access.

---

## Usage quickstart

- **Import:** `Library` → `SELECT AUDIO`
- **Play:** double-click a library row or choose a playlist track
- **Seek:** waveform or seek slider
- **Edit tags:** `Metadata`
- **Analyze:** `Waveform & Analysis` → `ANALYZE SELECTED`
- **Process:** `Processing` → configure → `RENDER WAV`
- **Output:** `Audio Output` → choose device → `APPLY OUTPUT`
- **Save library:** `Export / Import` → `EXPORT LIBRARY JSON`
