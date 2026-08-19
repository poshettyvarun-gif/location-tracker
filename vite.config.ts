import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:4001",
      "/uploads": "http://localhost:4001",
    },
    // The backend rewrites these on every check-in/location ping; without this,
    // each write looks like a source change and triggers a full page reload.
    watch: {
      ignored: ["**/server/data/**", "**/server/uploads/**"],
    },
  },
});
