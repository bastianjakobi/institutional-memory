import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// One origin for everything during development:
//   /          new React UI
//   /api       FastAPI (dashboard/server.py)
//   /classic   original Streamlit UI (dashboard/app.py, served with baseUrlPath=classic)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/classic": { target: "http://127.0.0.1:8501", changeOrigin: true, ws: true },
    },
  },
});
