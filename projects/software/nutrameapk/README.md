# NutraMeAPK

`/projects/software/nutrameapk/`

NutraMeAPK is the mobile nutrition companion for quick meal logging, label-photo capture, and offline secure sync with the desktop basestation.

## Browser/reference companion

This web build provides:

- quick nutrition logging;
- local label-photo capture/preview;
- local session history;
- PBKDF2 + AES-GCM encrypted sync-package export/import.

It does not fabricate an APK.

The native project manifest specifies Android, Gradle, Kotlin, and libsodium. Production mobile storage should use native secure storage/keystore primitives and the project's libsodium-based sync protocol.

Version: `0.1.0-alpha`  
License: `MIT`
