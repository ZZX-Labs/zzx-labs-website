# memeantix

`/projects/software/memeantix/`

memeantix is a campaign-capable meme engine supporting template packs, A/B variants, scheduling, telemetry, and multi-platform asset deployment for coordinated meme operations.

**INTERNAL – Not for public distribution.**

## Browser workbench

The static page provides:

- local image templates;
- meme text rendering to Canvas;
- A/B headline variants;
- preview switching;
- schedule-package construction;
- user-supplied aggregate telemetry analysis;
- PNG export;
- campaign JSON export.

The browser intentionally does not store platform credentials or auto-post to external services. Distribution integrations belong in separately authorized native adapters.

The manifest defines PyQt5, Pillow, Flask, SQLAlchemy and requests for the full native/internal system.

Version: `0.3.0-alpha`  
License: `MIT`
