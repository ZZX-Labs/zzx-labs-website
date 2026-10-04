# ZZX-STT

`/projects/software/zzxstt/`

Centralized Speech-to-Text system for ZZX-Labs’ adaptive AI framework. Integrates Whisper, DeepSpeech, and Vosk engines for multi-language transcription, diarization, and segmentation. Features live microphone capture, media file transcription, batch processing, timestamped JSON export, and cross-integration with ZZXTTS for full duplex voice systems.

The browser workbench uses the browser SpeechRecognition API where available, records microphone audio explicitly through MediaRecorder, imports transcript JSON/text, manages timestamp-ready segment records, and exports transcript JSON. It does not fabricate transcription when the browser engine is unavailable.

A native Whisper-backed CLI is included.

Version: `0.1.0-alpha`  
License: `MIT`
