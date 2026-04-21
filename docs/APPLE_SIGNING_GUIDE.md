# Apple Developer Program — Signing & Notarization Guide

## Overview

This document covers the steps required to sign, notarize, and distribute FaceFlow through the Mac App Store or as a direct download without Gatekeeper warnings.

---

## 0. Ad-hoc signing (beta / internal distribution)

During the beta phase, before enrolling in the $99/year Apple Developer Program, FaceFlow is distributed with **ad-hoc code signatures**. This is handled automatically by [build_dmg.sh](../build_dmg.sh):

- If `APPLE_SIGNING_IDENTITY` is unset (or set to `-`), the script runs:
  - `codesign --force --deep --sign - --timestamp=none` on the `.app` bundle inside the DMG, and
  - `codesign --force --sign - --timestamp=none` on the DMG itself.
- An ad-hoc signature does **not** satisfy Gatekeeper on its own, but it is mandatory for the "Right-click → Open" / System Settings → "Open Anyway" override to appear on macOS 14 (Sonoma) and 15 (Sequoia). An unsigned `.app` now silently refuses to launch with no override option.
- The quarantine flag added by Safari / Telegram on download can still be cleared with `xattr -dr com.apple.quarantine /Applications/FaceFlow.app`.

Once the product ships officially, swap the ad-hoc mode for a real Developer ID by exporting `APPLE_SIGNING_IDENTITY="Developer ID Application: …"` before running `build_dmg.sh`. Everything else in this guide applies as-is.

---

## 1. Enroll in Apple Developer Program

- URL: https://developer.apple.com/programs/
- Cost: $99/year (individual or organization)
- Requirements: Apple ID, government-issued ID for identity verification
- Timeline: Enrollment typically approved within 48 hours

---

## 2. Create Certificates

After enrollment, create the following certificates in **Certificates, Identifiers & Profiles** at https://developer.apple.com/account/:

### For Direct Distribution (outside App Store)

```
Certificate Type: Developer ID Application
```

This certificate signs the `.app` bundle. macOS Gatekeeper will trust apps signed with this certificate after notarization.

### For Mac App Store Distribution

```
Certificate Types:
1. Mac App Distribution (signs the app)
2. Mac Installer Distribution (signs the .pkg installer)
```

---

## 3. Create App ID

In **Certificates, Identifiers & Profiles** → **Identifiers**:

- **Bundle ID**: `com.faceflow.desktop` (already configured in `tauri.conf.json`)
- **Platform**: macOS
- **Capabilities**: None required (FaceFlow does not use iCloud, Push Notifications, etc.)

---

## 4. Configure Tauri for Signing

### tauri.conf.json

Add signing identity to the macOS bundle configuration:

```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: YOUR NAME (TEAM_ID)",
      "entitlements": "./Entitlements.plist"
    }
  }
}
```

### Entitlements.plist

Create `src-tauri/Entitlements.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <false/>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
</dict>
</plist>
```

**Notes:**
- `app-sandbox` is `false` because FaceFlow needs unrestricted filesystem access to scan photo folders
- `allow-jit` and `allow-unsigned-executable-memory` are required by ONNX Runtime
- `disable-library-validation` allows loading the ONNX Runtime dynamic library
- `files.user-selected.read-write` allows reading photos from user-selected folders
- `network.client` allows license activation and model download

---

## 5. Build and Sign

```bash
cd faceflow-client

# Set Tauri updater signing key
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/faceflow.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""

# Build (Tauri will use the signing identity from tauri.conf.json)
npm run tauri build
```

Tauri automatically calls `codesign` with the configured identity during the build process.

### Manual Signing (if needed)

```bash
codesign --deep --force --options runtime \
  --sign "Developer ID Application: YOUR NAME (TEAM_ID)" \
  --entitlements src-tauri/Entitlements.plist \
  "src-tauri/target/release/bundle/macos/FaceFlow.app"
```

---

## 6. Notarize

Notarization tells macOS Gatekeeper that Apple has scanned the app and found no malware.

### Create a ZIP for notarization

```bash
cd src-tauri/target/release/bundle/macos
ditto -c -k --keepParent FaceFlow.app FaceFlow.zip
```

### Submit to Apple

```bash
xcrun notarytool submit FaceFlow.zip \
  --apple-id "your@email.com" \
  --password "app-specific-password" \
  --team-id "TEAM_ID" \
  --wait
```

**App-specific password**: Generate at https://appleid.apple.com/account/manage → Sign-In and Security → App-Specific Passwords.

### Check notarization status

```bash
xcrun notarytool log <submission-id> \
  --apple-id "your@email.com" \
  --password "app-specific-password" \
  --team-id "TEAM_ID"
```

### Staple the notarization ticket

```bash
xcrun stapler staple "FaceFlow.app"
```

After stapling, the `.app` can be distributed and will pass Gatekeeper without any warnings — even without internet.

---

## 7. Create DMG for Distribution

```bash
# After stapling, create DMG
hdiutil create -volname "FaceFlow" \
  -srcfolder "FaceFlow.app" \
  -ov -format UDZO \
  "FaceFlow_0.1.0_aarch64.dmg"

# Sign the DMG itself
codesign --sign "Developer ID Application: YOUR NAME (TEAM_ID)" \
  "FaceFlow_0.1.0_aarch64.dmg"

# Notarize the DMG
xcrun notarytool submit "FaceFlow_0.1.0_aarch64.dmg" \
  --apple-id "your@email.com" \
  --password "app-specific-password" \
  --team-id "TEAM_ID" \
  --wait

# Staple the DMG
xcrun stapler staple "FaceFlow_0.1.0_aarch64.dmg"
```

---

## 8. Mac App Store Submission

If distributing through the Mac App Store instead of direct download:

1. Use **Mac App Distribution** certificate (not Developer ID)
2. Enable App Sandbox in entitlements (`com.apple.security.app-sandbox` = `true`)
3. Create the app record in App Store Connect (https://appstoreconnect.apple.com)
4. Upload using `xcrun altool` or Transporter app
5. Fill in App Store metadata (see `APP_STORE_DESCRIPTION.md`)
6. Submit for review

**Important**: App Sandbox restricts filesystem access. FaceFlow would need to use the open file dialog (already implemented via `tauri-plugin-dialog`) to get sandboxed access to photo folders.

---

## Checklist Before Submission

- [ ] Enrolled in Apple Developer Program
- [ ] Created Developer ID Application certificate
- [ ] Added signing identity to tauri.conf.json
- [ ] Created Entitlements.plist with required permissions
- [ ] Built release with `npm run tauri build`
- [ ] Signed .app with Developer ID certificate
- [ ] Notarized with `notarytool`
- [ ] Stapled notarization ticket
- [ ] Verified with `spctl --assess --verbose FaceFlow.app`
- [ ] Tested on a clean Mac (without Xcode/developer tools)
- [ ] Created App Store Connect record (if App Store distribution)
- [ ] Uploaded screenshots (if App Store distribution)
- [ ] Written privacy policy (required)
- [ ] Set up demo license key for App Review team
