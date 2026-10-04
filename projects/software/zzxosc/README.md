# ZZX-OSC

`/projects/software/zzxosc/`

ZZXOSC is a real-time oscilloscope and spectral analysis suite integrating USB audio, SDR, and VST plugin pipelines. Supports multi-channel monitoring, FFT visualization, forensic waveform capture, and signal export in standard formats. Designed for laboratory diagnostics, music visualization, and cyber forensics.

The browser implementation performs real-time Web Audio waveform and FFT visualization from an explicitly authorized microphone or user-selected audio file, reports RMS/peak/dominant-bin frequency, supports configurable FFT/smoothing, optionally monitors audio, buffers a bounded waveform capture, and exports capture CSV.

SDR and VST hosting are represented honestly as native-pipeline capabilities rather than being faked in the browser. A native `sounddevice`/NumPy capture scaffold is included.

Version: `0.2.0-beta`
License: `MIT`
