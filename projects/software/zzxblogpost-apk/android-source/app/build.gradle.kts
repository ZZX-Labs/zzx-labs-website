plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "io.zzxlabs.zzxblogpost"
    compileSdk = 35
    defaultConfig {
        applicationId = "io.zzxlabs.zzxblogpost"
        minSdk = 26
        targetSdk = 35
        versionCode = 10000
        versionName = "1.0.0"
    }
}
