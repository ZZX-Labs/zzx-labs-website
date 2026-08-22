<div align="center">
<img src="logo.png" alt="TerVIS" width="240" height="240">

# TerVIS


**Terrestrial Video Identification System** for browser-native image, video, webcam, motion-pattern, and bioacoustic analysis of terrestrial species and biodiversity datasets.


**Version:** 0.3.0-alpha  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D  
**Language:** Python 3.11+ / TensorFlow / OpenCV · JavaScript / TensorFlow.js / Canvas / Web Audio
</div>


## What it does

- Loads and analyzes local **images** without uploading them
- Performs image metrics including **mean luminance** and **edge density**
- Supports browser-side object/species inference through **TensorFlow.js**
- Loads **MobileNet** on demand as a general demonstration classifier
- Supports compatible custom **TensorFlow.js LayersModel** and **GraphModel** files
- Loads and decodes local **video** through HTML5 media APIs
- Performs frame-by-frame Canvas extraction and configurable temporal sampling
- Computes **motion scores** and detects changing frame-pattern events
- Supports local **webcam** analysis with explicit browser permission
- Loads and decodes local **audio** through the Web Audio API
- Computes **RMS energy**, **zero-crossing rate**, **spectral centroid**, and frequency-spectrum visualization
- Logs image, video, camera, and audio observations into an in-browser research session
- Exports observation sessions as **JSON** or **CSV**


## Install

### Native Python Edition

```bash
python -m venv .venv && . .venv/bin/activate
# Windows:
# .venv\Scripts\activate

pip install tensorflow opencv-python pandas
```

FFmpeg should also be installed and available on the system path.

If the native repository provides a `requirements.txt`, prefer:

```bash
pip install -r requirements.txt
```

### Web Edition

No local package installation is required for the core HTML/JavaScript application.

Serve the directory through HTTP/HTTPS:

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
/projects/software/tervis/
```

The browser workbench provides:

```text
Image Species ID
Video Frame Analysis
Live Camera
Audio Pattern Analysis
Model Control
Dataset / Export
```


## TensorFlow.js Models

TensorFlow.js is loaded only when model inference is requested.

Default runtime:

```text
https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js
```

General-purpose demonstration classifier:

```text
https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js
```

MobileNet demonstrates the complete browser inference path but is not intended to represent a biodiversity-grade TerVIS classifier.


## Custom TerVIS Model

The web edition supports:

```javascript
tf.loadLayersModel(modelUrl)
tf.loadGraphModel(modelUrl)
```

A compatible custom model should normally expose image input shaped approximately as:

```text
[batch, height, width, channels]
```

and return a primary class-score or class-probability vector.

Labels can be supplied one per line through the Model Control interface.


## Image Analysis

The browser image pipeline uses:

```text
File API
createImageBitmap()
Canvas 2D
TensorFlow.js
```

Current local measurements include:

```text
image width
image height
mean luminance
edge density
```

Classification uses the active TensorFlow.js model.


## Video Analysis

Local video is decoded by the browser and sampled frame by frame.

The analysis path performs:

```text
video frame
→ Canvas copy
→ grayscale downsample
→ previous-frame comparison
→ mean motion score
→ active-pixel ratio
→ pattern-event detection
→ periodic model classification
→ observation logging
```

The sampling interval and motion threshold are configurable from the web interface.


## Motion Score

For each sampled frame, TerVIS computes per-pixel grayscale differences:

```text
D_i = |G_current(i) - G_previous(i)|
```

The normalized motion score is approximately:

```text
motion_score =
    Σ D_i
    ─────────────
    N × 255
```

An active-pixel ratio is also calculated using the configured difference threshold.


## Live Camera

Live camera mode uses:

```javascript
navigator.mediaDevices.getUserMedia()
```

Camera access requires explicit permission.

The supplied browser implementation requests an environment-facing camera when available and processes selected frames locally.


## Audio Analysis

Local audio is decoded using the Web Audio API.

Current features include:

```text
duration
sample rate
RMS energy
zero-crossing rate
spectral centroid
frequency-spectrum visualization
```

The demonstrator currently performs a transparent direct spectral transform over a bounded sample window.

Species-level bioacoustic identification requires a compatible trained model.


## Audio Math

RMS energy:

```text
RMS = sqrt(
    Σ x[n]^2
    ─────────
        N
)
```

Zero-crossing rate:

```text
ZCR =
number of sign changes
──────────────────────
number of samples
```

Spectral centroid:

```text
Centroid =
Σ frequency[k] × magnitude[k]
─────────────────────────────
Σ magnitude[k]
```


---

## Directory layout

```text
tervis/
├─ index.html
├─ style.css
├─ script.js
├─ tervis.js
├─ hook.css
├─ hook.js
├─ manifest.json
├─ README.md
└─ logo.png
```


---

## JavaScript API

The project-specific browser port is exposed as:

```javascript
window.TerVIS
```

Current methods include:

```javascript
TerVIS.ensureTf(...)
TerVIS.loadMobileNet()
TerVIS.loadCustomModel(type)
TerVIS.clearCustomModel()

TerVIS.classifySource(source)
TerVIS.imageFeatures(canvas)
TerVIS.motionScore(current, previous, threshold)

TerVIS.analyzeAudio()

TerVIS.startCamera()
TerVIS.stopCamera()

TerVIS.exportSession()
TerVIS.getState()
```


---

## Privacy

User-selected image, video, and audio files remain local to the browser.

The supplied code does not upload:

```text
local image files
local video files
local audio files
webcam streams
```

Network requests occur only when required for:

```text
TensorFlow.js runtime
MobileNet model assets
a custom TensorFlow.js model URL explicitly supplied by the user
```

For strict offline operation, host all model JavaScript, weights, labels, and runtime files under the TerVIS project directory.


---

## Notes

The native project uses TensorFlow, OpenCV, Pandas, and FFmpeg.

The web edition replaces native media decoding and much of the OpenCV display pipeline with:

```text
HTML5 media APIs
Canvas
Web Audio
TensorFlow.js
```

This provides substantial functional parity, but does not claim exact equivalence with every OpenCV operator, FFmpeg codec/filter path, or native TensorFlow model.

Production-grade terrestrial species identification requires a trained TerVIS biodiversity model converted or exported for TensorFlow.js.


---

## Usage quickstart

- **Image**: `Image Species ID` → select image → `CLASSIFY IMAGE`
- **Video**: `Video Frame Analysis` → select video → `START ANALYSIS`
- **Camera**: `Live Camera` → `START CAMERA` → classify current frame
- **Audio**: `Audio Pattern Analysis` → select audio → `ANALYZE AUDIO`
- **Model**: `Model Control` → load MobileNet or custom `model.json`
- **Dataset**: `Dataset / Export` → export observations as JSON or CSV
