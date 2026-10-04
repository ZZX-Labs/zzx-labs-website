# FieldRecorder

Functional browser adaptation of the secure offline-first field recorder.

Uses `MediaRecorder` for microphone capture, supports input-device selection, waveform monitoring, in-memory session cataloging, SHA-256 recording fingerprints, raw recording download, PBKDF2-HMAC-SHA256 + AES-256-GCM encrypted export, and explicit backup manifests.

Nothing is uploaded automatically. Available recording codecs depend on the browser/OS.

Deploy directly into `/projects/software/fieldrecorder/`.

`logo.png` is intentionally omitted.
