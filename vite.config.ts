import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/renderer",
  base: process.env.DEPLOY_TARGET === "github-pages" ? "/controle-diario-v1/" : "/",
  plugins: [react()],
  build: {
    outDir: "../../dist",
    emptyOutDir: true
  }
});
