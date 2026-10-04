# BlockClock (APK)

Android mobile edition of BlockClock.

**Version:** 0.1.0-alpha  
**License:** MIT  
**Platform:** Android  
**Frameworks:** Android SDK, Kotlin

The browser companion implements the mobile monitoring/alert experience for the project page: block height, epoch context, mempool count, fee rate, manual fallback, live provider polling, compact visualization and local notifications.

The manifest declares `/projects/software/blockclock-apk/blockclock.apk`. This deployment archive intentionally does **not** contain an APK because no compiled APK binary was supplied. Build and sign the real Kotlin application separately, then place that actual artifact at the declared path.

Deploy the web files directly into `/projects/software/blockclock-apk/`.

`logo.png` is intentionally omitted until final artwork is supplied.
