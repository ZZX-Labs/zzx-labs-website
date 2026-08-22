# BerossusVoiceAI

Modular TTS/STT, alignment, diarization-workspace, and voice-dataset orchestration tools for Berossus.

**Version:** 0.1.0-alpha  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D

## Browser edition

Available directly in the page:

```text
system-voice TTS through speechSynthesis
browser SpeechRecognition STT where supported
local audio decode through Web Audio
duration / sample-rate / channel / peak / RMS analysis
RMS-threshold VAD-style segmentation
transcript-line alignment
speaker-label workspace
JSON workspace export/import
JSONL utterance export
```

## TTS

The static page uses installed browser/system voices.

It does not perform hidden voice cloning.

## STT

Where supported:

```javascript
window.SpeechRecognition
window.webkitSpeechRecognition
```

Browser speech-recognition implementations may use a remote service even though the rest of the page is local.

## Diarization boundary

The web page provides transparent segment creation and speaker labeling.

It does **not** claim biometric speaker identification.

The native stack remains the path for model-based diarization:

```text
PyTorch
Torchaudio
Whisper
WebRTC VAD
Coqui / MozillaTTS-compatible providers
```

## Deployment

Extract directly into:

```text
/projects/software/berossusvoiceai/
```

## JavaScript API

```javascript
window.BerossusVoiceAI
BerossusVoiceAI.speak(text, options)
BerossusVoiceAI.stop()
BerossusVoiceAI.addFiles(files)
BerossusVoiceAI.getWorkspace()
BerossusVoiceAI.getState()
```
