# BlackPearl Media Safety

## Publication invariant

Original creator uploads are **not** directly published.

The intended path is:

`private source → malware scan → metadata sanitation → randomized filename → hash → public media directory`

## Why randomized filenames matter

A filename can leak a creator name, device naming convention, project title, location, date, or internal folder structure. BlackPearl generates opaque cryptographically random filenames for public media.

The public database should store the randomized name. Original names belong only in restricted internal provenance records when they need to be retained at all.

## Image metadata

JPEG EXIF can contain:

- GPS coordinates;
- capture time;
- phone/camera make and model;
- orientation;
- serial/vendor metadata;
- editing software;
- embedded thumbnails.

The native sanitizer applies orientation first and then re-encodes the image without EXIF.

PNG may contain textual and ancillary metadata. The browser sanitizer removes common metadata-bearing chunks and retains only essential/rendering chunks.

## Video and audio

Containers can contain:

- creation timestamps;
- device/application names;
- encoder strings;
- comments;
- title/artist fields;
- location metadata;
- chapters.

The native pipeline uses FFmpeg with `-map_metadata -1` and `-map_chapters -1`.

## PDF

PDF document information and XMP metadata are removed through pikepdf.

## Malware scanning

BlackPearl's native sanitizer requires `clamscan` by default.

A development-only `--allow-no-antivirus` flag exists, but production ingest should fail closed when the malware scanner is unavailable.

## Attachment policy

Only explicitly allowlisted file types should be accepted. Archives and executable formats should be rejected or processed through a separate quarantine workflow.

## Private provenance

Keep source hashes and source filenames in a restricted ingest log only if needed for rights/provenance/incident response. Never put that private ingest log under the public web root.

## Additional operational controls

Production deployments should also use:

- separate private upload storage and public sanitized storage;
- no execution permission on upload directories;
- restrictive MIME/extension allowlists;
- size and rate limits;
- content security policy;
- image/media proxying when appropriate;
- server-side authorization;
- CSRF protection;
- secure session cookies;
- logging that avoids leaking private source paths;
- encrypted backups;
- tested deletion workflows.
