import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// On GitHub Pages the app is served from https://<user>.github.io/SpeciesDoc/,
// so production assets must be referenced under that subpath. The dev server
// keeps serving from root.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/SpeciesDoc/" : "/",
  plugins: [react()],
}));
