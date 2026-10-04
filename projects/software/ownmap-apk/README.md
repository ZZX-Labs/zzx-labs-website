# OwnMap (APK)

`/projects/software/ownmap-apk/`

Android field agent application for OwnMap with GPS tracking, offline map caching, media capture, and secure synchronization.

## Browser/reference companion

The web build demonstrates:

- opt-in GPS point capture and tracking;
- local track visualization;
- field media capture/selection;
- SHA-256 media fingerprints;
- in-memory offline GeoJSON loading;
- track GeoJSON export;
- field-package JSON export.

No APK binary is fabricated.

The manifest defines Android SDK and Kotlin for the native field application. Persistent offline maps, secure Android storage, and encrypted synchronization belong in that native implementation.

Version: `0.1.0-alpha`  
License: `MIT`
