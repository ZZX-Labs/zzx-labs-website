# mu3u

`/projects/software/mu3u/`

mu3u is an M3U playlist builder, editor, and viewer library with tag validation, stream testing, and embedded metadata inspection for audio and video playlists.

## Browser implementation

- import/paste M3U and M3U8;
- parse `#EXTM3U` and `#EXTINF`;
- preserve common attributes such as `group-title` and `tvg-id`;
- edit/add entries;
- URL/tag validation;
- duplicate detection and removal;
- user-triggered stream URL test;
- M3U and JSON export.

Browser stream tests are CORS-limited. The manifest-native stack uses Python, requests, FFmpeg, and pandas for robust stream probing and batch analysis.

Version: `0.1.0`  
License: `MIT`
