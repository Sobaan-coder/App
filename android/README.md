# Study OS for Android

The Android app is a **Trusted Web Activity (TWA)**: a small native app that opens your Study OS website full-screen in Chrome. This is Google's recommended way to publish a web app on the Play Store.

**Why a TWA:**
- **Instant updates.** Every change to the website shows up in the app with no new Play Store release.
- **Everything works as in Chrome.** Logins (including Google sign-in, which Google blocks inside plain in-app browsers), file uploads, taking photos of pages, and offline pages.
- **Tiny app.** About 1 MB, with no code to maintain.

GitHub builds the app for you with the **"Android app"** workflow in `.github/workflows/android.yml`. You don't need Android Studio.

---

## 1. Build an app you can install on your phone (free)

**Prerequisite:** your website must be online first; see [docs/DEPLOY.md](../docs/DEPLOY.md).

1. On GitHub, open the repository, then **Settings → Secrets and variables → Actions → Variables → New repository variable**:
   - Name: `ANDROID_SITE_URL`
   - Value: your site, e.g. `https://study-os-pk.netlify.app` (no trailing slash)
2. Start a build:
   - **If the workflow is on your default branch (`main`):** go to **Actions → Android app → Run workflow**.
   - **Otherwise:** go to **Actions → Android app**, open the latest run, and click **Re-run all jobs**. Re-runs pick up the variable you just set.
3. Wait about 5 minutes, open the finished run, and download **StudyOS-android** under *Artifacts*. Unzip it.
4. Install the app:
   - Copy `StudyOS-….apk` to your phone (for example by email, Google Drive or USB) and open it.
   - Android will ask to allow installing from that source; allow it.
   - Study OS appears in your app drawer.

**Test builds show a small address bar at the top.** Each test build is signed with a new temporary key, so the website can't vouch for it. Everything still works; step 2 removes the bar.

## 2. Remove the address bar (needs a permanent signing key)

Android hides the bar when the website publishes the app's signing-key fingerprint at `/.well-known/assetlinks.json`. The site already serves this file; you only fill in two environment variables. You need a key that stays the same across builds, and that same key is needed for the Play Store anyway.

**Create the key once.** You need Java installed (Android Studio includes it), or use a GitHub Codespace:

```bash
keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 upload.jks > upload.jks.txt      # on macOS: base64 -i upload.jks -o upload.jks.txt
```

⚠️ Keep `upload.jks` and its password safe, and back them up. Never commit them to the repository; `*.jks` is already in `.gitignore`.

**Add four repository secrets** (Settings → Secrets and variables → Actions → **Secrets**):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the contents of `upload.jks.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password you chose |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | the key password (often the same) |

**Then:**
1. Rebuild. The run summary shows **Signing SHA-256**, e.g. `14:6D:E9:…`.
2. On your website host (Netlify → Site configuration → Environment variables), add:
   - `ANDROID_CERT_SHA256` = that fingerprint
   - `ANDROID_PACKAGE_NAME` = `app.studyos.android` (or your own; see below)
3. Redeploy the site, and check that `https://your-site/.well-known/assetlinks.json` shows the fingerprint.
4. Reinstall the app. It now opens without an address bar. Android may take a minute to verify.

## 3. Publish on Google Play

1. **Create a developer account** at https://play.google.com/console ($25, one time).
   - New *personal* accounts must run a **closed test with at least 12 testers for 14 days** before they can publish to everyone. Invite classmates as testers.
2. **Choose the package name before your first upload;** it can never change afterwards. The default is `app.studyos.android`.
   - To use your own, e.g. `com.yourname.studyos`, set a repository variable `ANDROID_PACKAGE_NAME` and the matching website variable, then rebuild.
3. **Create the app** in Play Console, then upload `StudyOS-….aab` from a build signed with your upload key (step 2).
   - Accept **Play App Signing**: Google re-signs the app with its own key.
   - Copy the **App signing key certificate SHA-256** from *Test and release → App integrity* and add it to `ANDROID_CERT_SHA256`, comma-separated after your upload key's fingerprint. Then redeploy the site. Without this, Play-installed copies show the address bar.
4. **Fill in the store listing.** You'll need:
   - app name and descriptions
   - the icon (`public/icons/icon-512.png`)
   - a feature graphic (1024×500)
   - at least 2 phone screenshots (you can take them from the app)
   - the **privacy policy URL:** `https://your-site/privacy`
   - the *Data safety* form (the privacy page lists what is collected)
   - content rating and target audience
5. **Later updates:**
   - **Website changes** appear in the app immediately; you don't need a new release.
   - **App changes** (new icon or name, or a new Android version requirement) need a rebuild. The version code increases automatically with each build; upload the new `.aab`.

## Build locally (optional)

With Android Studio or the Android SDK installed:

```bash
cd android
./gradlew assembleRelease -PsiteUrl=https://your-site.netlify.app
# → app/build/outputs/apk/release/app-release.apk
```

Icons are generated from the logo with `npm run icons` (at the repo root).

## Troubleshooting

| Problem | Fix |
| --- | --- |
| App opens the wrong site or a "site can't be reached" page | Set `ANDROID_SITE_URL` and rebuild. |
| Address bar still visible | Check `/.well-known/assetlinks.json`: the package name and every fingerprint must match (upload key and Play app-signing key). Then reinstall. |
| "App not installed" | Uninstall the previous copy first. Test builds use different keys, so they can't update each other. |
| No Chrome on the phone | The app falls back to another browser that supports Custom Tabs, with an address bar. |
