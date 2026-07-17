import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8000,
    proxy: {
      "/admin": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
});
