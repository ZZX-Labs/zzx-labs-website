<div align="center">
<img src="logo.png" alt="4⁴ Breath (APK)" width="240" height="240">

# 4⁴ Breath (APK)


Native Android **4-4-4-4 box-breathing application** with visual timing cues, haptic feedback, offline-first operation, and a browser-native parity layer.


**Version:** 1.0.0  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D  
**Language:** Kotlin / Android SDK · JavaScript / Web Audio / Vibration API

</div>


## What it does

- Implements the canonical **4-4-4-4 box-breathing protocol**
- Guides **inhale → hold → exhale → hold**
- Provides synchronized visual breathing cues
- Provides native Android haptic feedback
- Operates offline on Android
- Provides a browser-native version of the same breathing workflow
- Loads the hosted `4-4-apk.apk` safely as inert package data
- Loads local APK files through the browser File API
- Computes **SHA-256** for loaded APK files
- Parses the APK ZIP central directory without extraction
- Detects `AndroidManifest.xml`
- Detects `classes.dex`, `classes2.dex`, and additional DEX files
- Detects `resources.arsc`
- Enumerates native `.so` libraries when present
- Detects legacy `META-INF` signature material
- Detects the modern `APK Sig Block 42` marker when present
- Never executes Android DEX bytecode in the browser
- Exports local breathing-session statistics as JSON


## Install

### Android APK

Place the existing package at:

```text
/projects/software/4-4-apk/4-4-apk.apk
```

On Android, use the normal trusted Android package-installation workflow for the APK.

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
/projects/software/4-4-apk/
```

The browser workbench contains:

```text
Breathing Session
APK Loader
Timing & Cues
Session Statistics
Protocol
```


## Browser / APK Architecture

An Android APK is a ZIP-based Android application package containing resources and compiled Android bytecode such as:

```text
AndroidManifest.xml
classes.dex
resources.arsc
res/
assets/
lib/
META-INF/
```

Ordinary web browsers do not expose an Android runtime capable of directly executing DEX bytecode.

Therefore the web project intentionally separates two jobs:

```text
4-4-apk.apk
    ↓
read-only browser inspection

4-4-apk.js
    ↓
browser-native functional parity
```

This keeps the APK intact and safely inspectable while allowing the breathing application to run smoothly in a normal web environment.


## APK Loader

The browser can inspect the existing hosted APK:

```text
./4-4-apk.apk
```

or a local APK selected by the user.

The loader:

```text
reads bytes into browser memory
verifies ZIP structure
reads the central directory
lists package entries
computes SHA-256
detects Android package components
```

It does **not**:

```text
install the APK
execute classes.dex
invoke Android intents
extract package files onto the host filesystem
launch subprocesses
modify the APK
```


## APK SHA-256

The package digest is calculated with the Web Crypto API:

```javascript
crypto.subtle.digest("SHA-256", apkBytes)
```

The result can be used to compare the browser-loaded package with a separately published checksum.


## APK Structure Validation

A likely Android APK is expected to contain at least:

```text
AndroidManifest.xml
classes.dex
```

Common optional entries include:

```text
resources.arsc
classes2.dex
classes3.dex
lib/<abi>/*.so
META-INF/*
```


## APK Signatures

The lightweight inspector checks for:

```text
META-INF/*.RSA
META-INF/*.DSA
META-INF/*.EC
META-INF/MANIFEST.MF
```

and scans the package region before the ZIP central directory for:

```text
APK Sig Block 42
```

This is structural signature-material detection, not full Android APK certificate-chain verification.


## 4-4-4-4 Protocol

One breathing cycle is:

```text
INHALE   4 seconds
HOLD     4 seconds
EXHALE   4 seconds
HOLD     4 seconds
```

Cycle duration:

```text
4 + 4 + 4 + 4 = 16 seconds
```

Four cycles:

```text
16 × 4 = 64 seconds
```


## Browser Timing

The web parity layer uses:

```javascript
performance.now()
requestAnimationFrame()
```

rather than depending on once-per-second counter decrements.

For phase duration `D`:

```text
remaining = max(0, D - elapsed)
```


## Haptics

The Android edition uses the native Android haptic stack.

The browser parity layer uses:

```javascript
navigator.vibrate()
```

when supported.

Browser haptic support varies by device and browser.


---

## Directory layout

```text
4-4-apk/
├─ index.html
├─ style.css
├─ script.js
├─ 4-4-apk.js
├─ apk-inspector.js
├─ hook.css
├─ hook.js
├─ manifest.json
├─ README.md
├─ logo.png
└─ 4-4-apk.apk
```


---

## JavaScript API

The browser breathing engine is exposed as:

```javascript
window.FourFourAPK
```

Core methods:

```javascript
FourFourAPK.start()
FourFourAPK.pause()
FourFourAPK.resume()
FourFourAPK.reset()

FourFourAPK.applySettings(settings)
FourFourAPK.getSettings()

FourFourAPK.getStats()
FourFourAPK.getState()
FourFourAPK.exportStats()
```

The APK inspector is exposed as:

```javascript
window.APKInspector
```

Core methods:

```javascript
APKInspector.inspectFile(file)
APKInspector.inspectUrl(url)
APKInspector.inspectBuffer(buffer)
APKInspector.parseCentralDirectory(buffer)
APKInspector.formatBytes(bytes)
```

Project-level APK helpers are exposed as:

```javascript
window.FourFourAPKPackage
```

with:

```javascript
FourFourAPKPackage.inspectFile(file)
FourFourAPKPackage.inspectHosted()
```


---

## Local Storage

Browser settings:

```text
zzx-4-4-apk-settings-v1
```

Browser statistics:

```text
zzx-4-4-apk-stats-v1
```


---

## Security

The APK loader is deliberately read-only.

The supplied JavaScript does not:

```text
execute APK code
execute DEX bytecode
install Android packages
run native .so libraries
write extracted APK contents to disk
invoke external processes
```

The maximum APK size accepted by the lightweight browser inspector is:

```text
512 MiB
```


---

## Notes

The browser breathing application is a functional parity implementation, not an Android emulator.

This is intentional: it preserves smooth browser performance and avoids requiring a complete Android runtime inside the page.

The APK itself remains available for Android users at:

```text
./4-4-apk.apk
```


---

## Usage quickstart

- **Web breathing app**: open `/projects/software/4-4-apk/` → `START`
- **Hosted APK**: `APK Loader` → `LOAD HOSTED APK`
- **Local APK**: `APK Loader` → `SELECT LOCAL APK`
- **Verify package**: compare the displayed SHA-256 against a trusted checksum
- **Inspect entries**: review manifest, DEX, resources, libraries, and signature indicators
- **Configure breathing**: `Timing & Cues` → adjust durations/cycles
- **Statistics**: `Session Statistics` → `EXPORT JSON`
