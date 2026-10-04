# BlackPearl

`/projects/software/blackpearl/`

BlackPearl is a turnkey privacy-conscious website and publishing template for independent adult creators who want to operate on their own domain rather than depend entirely on third-party social platforms.

## Goals

- creator-owned domain and branding;
- blog-style posts with image, video, audio, and attachment workflows;
- randomized public filenames;
- EXIF / metadata stripping;
- malware-scanning workflow;
- public/private provenance separation;
- no accidental GPS/location leak from media metadata;
- 18+ / rights / consent publishing checkpoints;
- exportable post and site records;
- BTC-only custom development services.

## Browser workbench

The web demo can:

- inspect selected local files;
- compute SHA-256;
- detect common JPEG EXIF;
- generate cryptographically random public filenames;
- strip JPEG APP1–APP15/comment metadata;
- strip nonessential PNG metadata chunks;
- compose blog post records;
- record rights/release status;
- preview a post;
- configure site identity;
- export a creator package;
- export post HTML.

Video/audio/PDF and attachment sanitation belong in the native pipeline.

## Native sanitizer

`server/sanitize.py` implements the production-oriented ingest model:

1. allowlist file extensions;
2. enforce size limits;
3. require ClamAV by default;
4. compute source SHA-256;
5. create random public filename;
6. remove image metadata through Pillow;
7. strip audio/video container metadata through FFmpeg;
8. remove PDF metadata through pikepdf;
9. compute sanitized SHA-256;
10. keep the original source filename only in a private ingest log.

The public site should never expose `.private-ingest-log.json`.

## Services

BlackPearl also documents three BTC-only service categories:

- Custom Websites
- Custom Software
- Custom Android Applications

Projects use a scoped one-time fee, with continuation fees when growth, maintenance, or added scope requires them.

Clients provide their own:

- domain;
- media/content;
- written copy;
- fonts;
- color scheme;
- icons;
- logos;
- branding;
- required rights/permissions.

ZZX-Labs retains the right to refuse projects.

## Adult-content boundary

BlackPearl is infrastructure for lawful adult creators. It is not an adult-content generation engine. Operators are responsible for verifying that content is lawful, all depicted participants are adults, and necessary rights/consent/release records exist.

Jurisdiction-specific age verification, recordkeeping, privacy, tax, payment, and content rules must be reviewed by the site operator.

## Deployment

Extract the ZIP directly into:

`/projects/software/blackpearl/`

The included `logo.png` is the BlackPearl black-pearl-on-silk-pillow hexagonal emblem created for this project.
