/**
 * The Capacitor app (`cap sync ios` reads this). The window and host-web are
 * built into dist/web (scripts/build.mjs). With LUMIERE_SERVER set, the app
 * instead opens that Lumière server's window (scripts/dev.mjs): the iPad as
 * a window onto the Mac, for working on the window and the native plugins
 * before host-web runs everything in the app.
 */
import type { CapacitorConfig } from "@capacitor/cli";

const server = process.env.LUMIERE_SERVER;

const config: CapacitorConfig = {
  appId: "io.github.t04dj14n9.lumiere",
  appName: "Lumière",
  webDir: "dist/web",
  ios: {
    // The window pads itself with env(safe-area-inset-*), the on-screen
    // keyboard's height included (LumiereViewController.swift).
    contentInset: "never",
    // The window scrolls its own panels; the page itself never moves.
    scrollEnabled: false,
  },
  ...(server ? { server: { url: server, cleartext: true } } : {}),
};

export default config;
