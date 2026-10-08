import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The Android app is a thin native shell around the live site. It loads https://dhakerni.vercel.app, so every
 * deploy reaches every phone the next time the app opens: no new APK, no reinstall. A new APK is needed only
 * when something native changes (this file, android/, or a plugin).
 *
 * What the shell adds over the browser: reminders are scheduled on the phone itself with Android's alarm
 * clock, so they ring with the phone asleep and with no server involved. See docs/decisions.md D19.
 */

// For testing on an emulator only: CAP_SERVER_URL=http://localhost:3000 npx cap sync android
// (with `adb reverse tcp:3000 tcp:3000`). Never ship an APK built that way.
const url = process.env.CAP_SERVER_URL ?? "https://dhakerni.vercel.app";

const config: CapacitorConfig = {
  appId: "app.vercel.dhakerni",
  appName: "Dhakerni",
  webDir: "android-shell",
  server: {
    url,
    cleartext: url.startsWith("http://"),
    // Shown when the site cannot be loaded and nothing is cached yet.
    errorPath: "index.html",
  },
  android: {
    // The launch colour, same blue as the intro.
    backgroundColor: "#2152d1",
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_bell",
      iconColor: "#2152d1",
    },
  },
};

export default config;
