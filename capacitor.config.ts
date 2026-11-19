import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.itayk.karkascut",
  appName: "KarkasCut",
  webDir: "dist/client",
  server: {
    // The processing backend runs on port 3050 and is a different origin from the
    // app's WebView. Allow it (and localhost during dev).
    cleartext: true,
    allowNavigation: ["localhost", "127.0.0.1", "192.168.*", "10.*"]
  },
  ios: {
    contentInset: "always"
  }
};

export default config;
