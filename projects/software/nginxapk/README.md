# nginxAPK

`/projects/software/nginxapk/`

nginxAPK packages nginx into a hardened Android application that can run a local web server on-device for offline sites, lab dashboards, and portable field tooling. It supports serving static content, reverse proxying to localhost services, and running constrained, profile-based configs with explicit port binding and storage-mapped document roots for repeatable deployments.

## Browser/reference companion

This web project provides:

- profile-based nginx config generation;
- loopback/LAN bind selection;
- explicit high-port selection;
- Android storage-mapped document roots;
- static-site profiles;
- local dashboard profiles;
- constrained localhost reverse-proxy profiles;
- offline directory index profiles;
- validation and export.

It does not fabricate an APK binary or execute nginx in the browser.

The manifest defines the native Android stack: Android SDK, Gradle, Kotlin, NDK, CMake, OpenSSL, PCRE2, and zlib.

Version: `0.1.0-alpha`  
License: `MIT`
