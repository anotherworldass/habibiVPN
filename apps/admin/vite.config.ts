import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { formatAppVersion } from "../../packages/shared/build-stamp.mjs";

export default defineConfig(({ command }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(formatAppVersion(new Date(), command !== "build")),
  },
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 8000,
    strictPort: true,
    proxy: {
      "/admin": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
}));
