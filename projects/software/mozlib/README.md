# MozLib (Mozart Library)

`/projects/software/mozlib/`

Mozart-inspired audio library for local playback, playlist management, tagging, and visualized waveforms. Designed for focused listening sessions, archival organization, and analytic views of audio collections.

## Browser implementation

The local web companion provides:

- local audio-file loading;
- browser playback;
- filename-based artist/title parsing;
- in-memory title/artist/album/tag editing;
- Web Audio waveform visualization;
- playlist construction;
- M3U export;
- JSON library export.

The static page never uploads local tracks.

## Native stack

The manifest specifies PyQt5, Pillow, FFmpeg, and Mutagen. The native edition is the correct place for persistent catalogs, file-tag reading/writing, robust waveform generation, and codec-independent media probing.

Version: `0.1.0-alpha`  
License: `MIT`
