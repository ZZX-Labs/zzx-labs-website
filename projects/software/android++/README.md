<div align="center">
<img src="logo.png" alt="Android++" width="240" height="240">

# Android++


Offline-first **Android code and text editor** inspired by Notepad++ with local search/replace, data transformations, encrypted-note workflows, and an isolated APK container.


**Version:** 0.6.0-alpha  
**License:** MIT  
**Author:** [0xdeadbeef] of ZZX-Labs R&D  
**Language:** Kotlin / Android SDK · JavaScript / Web Crypto / File API

</div>


## What it does

- Provides a fast multi-document editor with Notepad++-style tabs
- Opens multiple local text/code files
- Creates new editable buffers
- Renames, duplicates, closes, and downloads documents
- Maintains synchronized line numbers
- Displays current line, column, line count, and character count
- Supports word wrapping
- Supports language labels for common code/text formats
- Handles `Tab` indentation inside the editor
- Keeps browser-local draft recovery in LocalStorage
- Provides literal and regular-expression **Find / Replace**
- Provides selection-aware CyberChef-style data transformations
- Encodes and decodes Base64
- Encodes and decodes hexadecimal
- URL-encodes and URL-decodes text
- Applies ROT13
- Pretty-prints and minifies JSON
- Calculates SHA-256
- Encrypts notes locally using **PBKDF2-HMAC-SHA256 + AES-256-GCM**
- Decrypts Android++ browser vaults
- Exposes an OpenPGP/GPG provider hook for real PGP workflows
- Loads the raw Android++ APK without blocking editor startup
- Computes APK SHA-256
- Parses APK/ZIP entries
- Detects `AndroidManifest.xml`
- Detects DEX files and native libraries
- Detects legacy and modern APK signature indicators
- Detects HTML/JS/CSS WebView assets inside an APK
- Can launch packaged WebView assets inside an isolated sandboxed iframe
- Exposes an Android-runtime provider hook for future WASM/emulator integration


## Install

### Android

Place the native package at:

```text
/projects/software/androidpp/androidpp.apk
```

Install it on Android using the normal trusted package-installation workflow.

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
/projects/software/androidpp/
```

The browser workbench contains:

```text
Editor
Files & Tabs
Find / Replace
Transforms
Crypto
APK Container
```


## Browser-Native Editor

The editor starts independently from the APK subsystem.

The startup sequence is:

```text
HTML / CSS
    ↓
editor-core.js
    ↓
transforms.js
    ↓
crypto-vault.js
    ↓
apk-container.js
    ↓
androidpp.js
```

A missing `androidpp.apk` does **not** prevent the editor from starting.


## Editor

The browser-native editor supports:

```text
multi-document tabs
line-number gutter
UTF-8 text
local file open
Blob download
rename
duplicate
close
word wrap
Tab indentation
draft recovery
```


## Keyboard

Inside the editor:

```text
Ctrl/Cmd + N    New document
Ctrl/Cmd + S    Download active document
Ctrl/Cmd + F    Open Find / Replace
Tab             Insert four spaces
```


## Find / Replace

Search supports:

```text
literal text
regular expressions
case-sensitive mode
case-insensitive mode
find next
replace one
replace all
```


## Transforms

The browser transform module currently provides:

```text
Base64 Encode
Base64 Decode
Hex Encode
Hex Decode
URL Encode
URL Decode
ROT13
JSON Pretty
JSON Minify
Uppercase
Lowercase
SHA-256
```

If editor text is selected, a transform targets the selection.

If no text is selected, the transform targets the entire active document.


## Browser Vault Encryption

The browser-native encrypted-note format is:

```text
androidpp-vault
```

It uses:

```text
KDF:     PBKDF2-HMAC-SHA256
Cipher:  AES-256-GCM
Salt:    128-bit random
IV:       96-bit random
Tag:     128-bit
Default PBKDF2 iterations: 310000
```

The passphrase itself is not stored in the vault file.


## GPG / OpenPGP

The browser vault format is **not** an OpenPGP packet format.

Real GPG/OpenPGP support is exposed through a provider API:

```javascript
AndroidPP.registerOpenPGPProvider(provider)
```

A provider may wrap:

```text
OpenPGP.js
a local native bridge
an approved same-origin service
another OpenPGP implementation
```

This prevents the static page from pretending AES-GCM JSON containers are GPG files.


## APK Layer

The APK subsystem is isolated from editor startup.

The page can load:

```text
./androidpp.apk
```

or a user-selected local `.apk` file.


## APK Inspection

APK inspection performs:

```text
SHA-256
ZIP central-directory parsing
AndroidManifest.xml detection
classes.dex detection
native .so detection
resources.arsc detection
META-INF signature-material detection
APK Sig Block 42 detection
WebView asset detection
```


## WebView Asset Container

If an APK contains web assets under paths such as:

```text
assets/index.html
assets/www/index.html
assets/.../*.js
assets/.../*.css
res/raw/.../*.html
```

Android++ can extract supported files into browser memory.

The selected HTML entrypoint is run using:

```html
<iframe sandbox="allow-scripts">
```

The generated sandbox document receives a restrictive Content Security Policy.

Network access is blocked:

```text
connect-src 'none'
default-src 'none'
form-action 'none'
frame-src 'none'
object-src 'none'
worker-src 'none'
```

Local extracted scripts/styles can run inside the isolated frame.


## Native Android Execution

Ordinary browsers do not execute:

```text
classes.dex
Kotlin bytecode
Android framework code
native Android .so libraries
```

Android++ therefore does **not** misrepresent ZIP inspection as Android execution.

A future WebAssembly Android runtime/emulator can be connected through:

```javascript
AndroidPP.registerAndroidRuntimeProvider(provider)
```

and invoked through:

```javascript
AndroidPP.runApkRuntime(options)
```


---

## Directory layout

```text
androidpp/
├─ index.html
├─ style.css
├─ script.js
├─ androidpp.js
├─ editor-core.js
├─ transforms.js
├─ crypto-vault.js
├─ apk-container.js
├─ hook.css
├─ hook.js
├─ manifest.json
├─ README.md
├─ logo.png
└─ androidpp.apk
```


---

## JavaScript API

The primary browser module is:

```javascript
window.AndroidPP
```

Core methods:

```javascript
AndroidPP.newDocument(name, text)
AndroidPP.getDocuments()
AndroidPP.getActiveDocument()
AndroidPP.setActiveText(text)

AndroidPP.transform(name, text)

AndroidPP.encrypt(text, passphrase, iterations)
AndroidPP.decrypt(container, passphrase)

AndroidPP.registerOpenPGPProvider(provider)

AndroidPP.registerAndroidRuntimeProvider(provider)
AndroidPP.inspectApkFile(file)
AndroidPP.inspectApkUrl(url)
AndroidPP.runApkRuntime(options)

AndroidPP.getState()
```

Editor internals:

```javascript
window.AndroidPPEditorCore
```

Transforms:

```javascript
window.AndroidPPTransforms
```

Encryption:

```javascript
window.AndroidPPCryptoVault
```

APK handling:

```javascript
window.AndroidPPAPKContainer
```


---

## Local Storage

Browser editor recovery uses:

```text
zzx-androidpp-editor-v1
```

Editor contents remain on the local browser profile unless explicitly downloaded.


---

## Security

The APK subsystem does not:

```text
install APKs
execute DEX by itself
write extracted APK contents to host storage
invoke Android intents
launch native libraries
grant same-origin privileges to APK web content
```

WebView assets run only in a sandboxed iframe.

The injected Content Security Policy blocks external network connections.


---

## Notes

The native Android application remains the authoritative Kotlin/Android build.

The web page has two intentionally separate execution paths:

```text
Browser-native Android++ editor
        +
Optional APK container/inspection layer
```

This prevents APK parsing, missing package files, unsupported ZIP compression, or unavailable Android runtime support from locking up the usable web editor.


---

## Usage quickstart

- **Edit now**: open `/projects/software/androidpp/` → `Editor`
- **Open files**: `OPEN`
- **New buffer**: `NEW`
- **Download**: `DOWNLOAD`
- **Search**: `Find / Replace`
- **Transform**: select text → `Transforms`
- **Encrypt**: `Crypto` → enter passphrase → `ENCRYPT ACTIVE TEXT`
- **Load hosted APK**: `APK Container` → `LOAD HOSTED APK`
- **Load local APK**: `APK Container` → `SELECT LOCAL APK`
- **Run packaged WebView**: load APK → `RUN WEB ASSET CONTAINER`
