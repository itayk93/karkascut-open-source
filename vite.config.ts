import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Capacitor serves the bundle from capacitor://localhost (opaque origin), where
// `<script type="module" crossorigin>` fails CORS. Strip crossorigin and use
// relative asset paths so the same build works on web and in the native shell.
function capacitorCompat(): Plugin {
  return {
    name: "capacitor-compat",
    transformIndexHtml(html) {
      return html.replace(/\s+crossorigin/g, "");
    }
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), capacitorCompat()],
  root: "src/client",
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:3050",
        changeOrigin: true
      },
      "/media": {
        target: "http://localhost:3050",
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true
  }
});
