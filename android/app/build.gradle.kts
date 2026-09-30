import java.net.URI

plugins {
    id("com.android.application")
}

// ---------------------------------------------------------------------------------------------
// Study OS for Android: a Trusted Web Activity that opens the Study OS website full-screen in
// Chrome. Everything configurable is passed as a Gradle property (the GitHub workflow does this):
//   -PsiteUrl=https://your-site.netlify.app   the deployed website (required for a real build)
//   -PappId=app.studyos.android               Play Store package name (can't change after publishing)
//   -PversionCode=1 -PversionName=1.0.0
// Release signing uses these environment variables when present, otherwise the debug key:
//   ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
// ---------------------------------------------------------------------------------------------
fun prop(name: String): String? = (findProperty(name) as String?)?.trim()?.takeIf { it.isNotEmpty() }

val siteUrl = (prop("siteUrl") ?: "https://study-os.netlify.app").trimEnd('/')
val siteUri = URI(siteUrl)
require(siteUri.scheme == "https" && !siteUri.host.isNullOrBlank()) { "siteUrl must be an https:// URL, got '$siteUrl'" }
val siteHost: String = siteUri.host
val appId = prop("appId") ?: "app.studyos.android"

val keystorePath: String? = System.getenv("ANDROID_KEYSTORE_PATH")?.takeIf { it.isNotBlank() && file(it).exists() }

android {
    namespace = "app.studyos.twa"
    compileSdk = 36

    defaultConfig {
        applicationId = appId
        minSdk = 24
        targetSdk = 36
        versionCode = prop("versionCode")?.toInt() ?: 1
        versionName = prop("versionName") ?: "1.0.0"

        manifestPlaceholders["hostName"] = siteHost
        resValue("string", "launchUrl", "$siteUrl/dashboard")
        resValue("string", "providerAuthority", "$appId.fileprovider")
        // Tells Android which website this app may open without a browser address bar.
        resValue(
            "string",
            "assetStatements",
            """[{ \"relation\": [\"delegate_permission/common.handle_all_urls\"], \"target\": { \"namespace\": \"web\", \"site\": \"https://$siteHost\" } }]""",
        )
    }

    buildFeatures {
        resValues = true
        buildConfig = false
    }

    signingConfigs {
        if (keystorePath != null) {
            create("upload") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD") ?: System.getenv("ANDROID_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("upload") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
}
