<div align="center">
<img src="logo.png" alt="4DV" width="240" height="240">

# 4DV


**Four-Dimensional Video System** for adding synchronized text, audio, video, and metadata layers to existing video without altering the original source.


**Version:** 0.1.0-alpha  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D  
**Language:** Python 3.11+ / PyQt5 / OpenCV / FFmpeg · JavaScript / HTML5 Media


## What it does

- Loads an existing **source video**
- Keeps the original source media unchanged
- Adds synchronized **text annotation layers**
- Adds synchronized **audio commentary layers**
- Adds synchronized **secondary-video commentary layers**
- Defines precise start/end timestamps for each layer
- Enables or disables individual contextual layers
- Synchronizes commentary media to source playback
- Synchronizes commentary playback rate to the source video
- Pauses commentary media when source playback pauses
- Re-synchronizes commentary media after seeking
- Displays text, audio, and video tracks on a temporal timeline
- Provides previous/next layer navigation
- Exports the 4DV augmentation model as portable JSON
- Imports previously exported 4DV project JSON
- Runs entirely in the browser without modifying local source media


## Install

### Native Python Edition

```bash
python -m venv .venv && . .venv/bin/activate
# Windows:
# .venv\Scripts\activate

pip install pyqt5 opencv-python numpy matplotlib pillow
```

Install FFmpeg separately and make it available on the system path.

If the native repository provides a `requirements.txt`, prefer:

```bash
pip install -r requirements.txt
```

### Web Edition

No JavaScript package installation is required.

Serve the project directory:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```


## Run (Web)

Deploy or serve:

```text
/projects/software/4dv/
```

The browser workbench contains:

```text
4DV Player
Layer Editor
Timeline
Project Import / Export
Architecture
```


## Run (Native)

The native project is designed around:

```text
Python 3.11+
PyQt5
OpenCV
FFmpeg
NumPy
Matplotlib
SQLite
Pillow
```

Use the repository's Python entry point for the native GUI/CLI implementation.


## Core Model

4DV treats a conventional source video as the immutable base layer:

```text
SOURCE VIDEO
    │
    ├── TEXT LAYER
    ├── AUDIO COMMENTARY
    ├── VIDEO COMMENTARY
    └── METADATA / NOTES
```

Each contextual layer is associated with a temporal window:

```text
layer.start
layer.end
```

A layer is active when:

```text
enabled
AND
source_time >= start
AND
source_time < end
```


## Text Layers

A text annotation contains:

```text
id
type = "text"
title
text
start
end
enabled
```

When the source playback time enters the layer's interval, the annotation is displayed over the source video.

When playback leaves the interval, the annotation disappears.


## Audio Commentary

Audio commentary uses a local audio file selected by the user.

While the layer is active:

```text
commentary_time = source_time - layer_start
```

The web engine periodically re-synchronizes the commentary element if it drifts from the source.

Audio commentary also follows:

```text
source pause
source resume
source playbackRate
source seek
```


## Video Commentary

Video commentary uses the same temporal synchronization model as audio commentary.

The current web presentation displays secondary video as a picture-in-picture-style overlay above the source video.


## Timeline

The browser timeline contains three track classes:

```text
TEXT
AUDIO
VIDEO
```

Each layer is mapped proportionally against the source-video duration:

```text
left =
layer_start
─────────── × 100%
duration

width =
layer_end - layer_start
─────────────────────── × 100%
duration
```

The playhead follows the source video's current playback time.


## Project JSON

4DV project exports use:

```text
zzx.4dv.project.v1
```

A project contains:

```json
{
  "schema": "zzx.4dv.project.v1",
  "title": "Project title",
  "notes": "Project notes",
  "source": {
    "name": "source.mp4",
    "size": 123456789,
    "type": "video/mp4",
    "duration": 600.0
  },
  "layers": []
}
```

The source video itself is not embedded into the JSON project file.


## Local Media Attachments

Browser object URLs are session-local.

Therefore imported/exported JSON records attachment metadata such as:

```text
file name
file size
media type
```

but intentionally does not embed local audio/video bytes.

After importing a project, local commentary media can be reselected as needed.


---

## Directory layout

```text
4dv/
├─ index.html
├─ style.css
├─ script.js
├─ 4dv.js
├─ timeline.js
├─ media-layer.js
├─ hook.css
├─ hook.js
├─ manifest.json
├─ README.md
└─ logo.png
```


---

## JavaScript API

The primary browser project is exposed as:

```javascript
window.FourDV
```

Core methods:

```javascript
FourDV.getProject()
FourDV.getLayers()

FourDV.addLayer(layer)
FourDV.removeLayer(id)
FourDV.clearLayers()

FourDV.seek(seconds)

FourDV.exportProject()
FourDV.importProject(project)

FourDV.getState()
```

The timeline component is exposed as:

```javascript
window.FourDVTimeline
```

The synchronized media-layer manager is exposed as:

```javascript
window.FourDVMediaLayerManager
```


---

## Non-Destructive Design

The browser implementation never rewrites the source video.

The project model is stored separately:

```text
source.mp4
project.4dv.json
commentary-audio.*
commentary-video.*
```

This allows multiple independent 4DV projects to reference the same underlying media without creating modified master copies.


---

## Native / Web Differences

The native design can use:

```text
OpenCV
FFmpeg
SQLite
native filesystem access
```

The browser version uses:

```text
HTMLVideoElement
HTMLAudioElement
DOM overlays
File API
Blob/Object URLs
JSON import/export
```

The static browser edition does not currently perform a final FFmpeg mux/render into a new flattened video file.

The core synchronized multi-layer playback model is functional without that render step.


---

## Notes

Local source video and commentary files remain in browser memory through object URLs.

The supplied page does not upload those media files.

Removing a layer revokes its object URL where applicable.

Closing or reloading the page invalidates browser object URLs automatically.


---

## Usage quickstart

- **Source**: `4DV Player` → `SELECT SOURCE VIDEO`
- **Text layer**: `Layer Editor` → choose `Text annotation` → set start/end → `ADD LAYER`
- **Audio layer**: choose `Audio commentary` → attach local audio → set interval → `ADD LAYER`
- **Video layer**: choose `Video commentary` → attach local video → set interval → `ADD LAYER`
- **Current timestamp**: use `SET START = CURRENT` / `SET END = CURRENT`
- **Timeline**: open `Timeline` to inspect all temporal tracks
- **Save**: `Project Import / Export` → `EXPORT JSON`
- **Restore**: import the saved JSON and reselect local media attachments where required
