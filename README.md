# Sunday Farms — Android app

Trust your food. Grow your own.

There are three ways to get the app onto an Android phone. Pick one.

---

## Option 1 — Get an APK with nothing installed (recommended)

GitHub builds the APK for you on its own servers. You only need a free GitHub account.

1. Go to **github.com → New repository**. Name it `sunday-farms`, then click **Create repository**.
2. Upload the project:
   - Click **uploading an existing file**.
   - Drag in **everything inside** the `SundayFarmsExpo` folder, including the hidden `.github` folder.
   - Click **Commit changes**.
   - On a Mac, press `Cmd + Shift + .` in Finder to show hidden folders before dragging.
3. Open the **Actions** tab. A run called **Build Android APK** starts by itself and takes about 15–25 minutes.
   - If nothing starts, click **Build Android APK → Run workflow**.
4. When it shows a green tick, open the repository's **Releases** page on your phone and tap `SundayFarms-1.apk`.
5. Open the downloaded file and allow **Install unknown apps** if Android asks. Done.

If the `.github` folder didn't upload, do this instead of step 3: **Actions → set up a workflow yourself**, paste in the contents of `.github/workflows/build-apk.yml`, and click **Commit**.

## Option 2 — One command with Expo's cloud build

You need [Node.js](https://nodejs.org) 22 and a free [Expo account](https://expo.dev/signup).

```bash
cd SundayFarmsExpo
npm install
npx eas-cli build -p android --profile preview
```

When it finishes, scan the QR code it shows with your phone to download and install the APK.

## Option 3 — Try it instantly in Expo Go (no APK)

```bash
cd SundayFarmsExpo
npm install
npx expo start
```

Install **Expo Go** on your phone and scan the QR code. Android needs the SDK 57 version of Expo Go; press `a` in the terminal and it installs the right one for you.

---

## Using the app

On the login screen, tap **🌱 Try the app as a home grower**. You're in, with no typing.

| Demo | Username | Password |
| --- | --- | --- |
| Home grower | `demo_grower` | `Grow my own food 2026` |
| Teacher (two-step login; tap **Fill in the demo code**) | `ms_rao` | `Classroom garden 26` |

Other demo details:
- **Moisture sensor** pairing code: `2468`.
- **QR scanning:** point the Scan tab's camera at `sample_qr_labels.pdf`, or tap **Sample label** / **Fake label**.
- **Language:** switch between English and हिन्दी on the login screen or in Profile.

### All screens

| Tab | Screens |
| --- | --- |
| Start | Onboarding · Login (with two-step code) · Create account · Forgot password · Fingerprint unlock |
| 🏠 Home | Weather tip · Today's watering · Fresh friends · How it works · Eco impact · Community 💬 · Profile 👤 |
| 📷 Scan | Live QR scanner · Food journey (Available / Unverified / Missing) · Fake-label warning |
| 📦 Kits | Kit list · Kit detail · Space check · Checkout (UPI, card, AutoPay, deposit, points) · Orders and tracking · Return pickup · Rewards and eco impact |
| 🪴 Garden | My plants · Add plant · Plant detail and grow journal · Photo journal · Plant health check · Moisture sensor · Guides (offline) · Weather |
| 🧒 Kids | Little Sprouts · Start Kids mode (parent PIN) · Kids mode missions, badges and certificate · School mode |
| 👤 Profile | Language · Notifications · Fingerprint unlock · Two-step login · Devices · Security alerts · Export data · Privacy · Delete account |

### Security built in

- Your own username and password, with live checks and a strength meter.
- Lock-out after 5 wrong tries; CAPTCHA after 3; one error message for a wrong username or a wrong password.
- Two-step login; one-time reset codes that expire in 10 minutes.
- Login keys kept in the Android Keystore; screenshots blocked on login and payment screens.
- Fingerprint unlock; "log out everywhere"; security alerts.
- Photos saved without location data; Kids mode needs the parent PIN to leave.

## What's real and what's a demo

The app runs fully on the phone with sample data, so it works with no server. These parts are simulated, and need real services before launch:
- the login server
- payments
- farm traceability data
- weather
- the plant health check
- the Bluetooth sensor (Expo Go can't use Bluetooth)

Demo accounts, orders and community posts reset when the app restarts. Garden data, settings and the parent PIN are saved on the phone.

## For developers

| Command | What it does |
| --- | --- |
| `npm test` | Runs the 12 logic tests (needs Node 22.18 or newer) |
| `npx expo prebuild -p android` | Creates the `android/` folder; open it in Android Studio (JDK 17, Android SDK 36) |
| `npx expo run:android` | Builds and installs on a phone connected by USB |

For the Play Store: run `npx eas-cli build -p android --profile production`. This builds a signed `.aab` with your own upload key.

**Code layout:**
- `App.tsx`: screens and tabs
- `src/screens/`: one file per area
- `src/core/`: app logic (tested)
- `src/services/`: phone features and storage
- `src/i18n/`: English and Hindi text

## If something goes wrong

| What you see | Fix |
| --- | --- |
| The GitHub run fails | Open the failed step to see the error, then click **Re-run jobs**. Paste the error to Claude if it fails again. |
| "App not installed" on the phone | Uninstall any older Sunday Farms first, then install again. |
| Android blocks the install | Settings → Apps → your browser or Files app → **Install unknown apps** → Allow. |
| `npm install` fails with network errors | That computer can't reach npmjs.org; use Option 1 instead. |
| "Project is incompatible with this version of Expo Go" | Press `a` in the `npx expo start` terminal to install the matching Expo Go. |
