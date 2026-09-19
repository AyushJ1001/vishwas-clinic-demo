import tailwindcss from "@tailwindcss/postcss";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const shim = (file: string) =>
  fileURLToPath(new URL(`./renderer/shims/${file}`, import.meta.url));

// The Clinic PC runs Electron 22, whose renderer is Chromium 108 (ADR 0001).
const clinicPcChromium = "chrome108";

export default defineConfig({
  root: fileURLToPath(new URL("./renderer", import.meta.url)),
  publicDir: fileURLToPath(new URL("../public", import.meta.url)),
  base: "/",
  plugins: [react()],
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: {
    alias: {
      "cloudflare:workers": shim("cloudflare-workers.ts"),
      "next/server": shim("next-server.ts"),
      "next/link": shim("next-link.tsx"),
      "next/image": shim("next-image.tsx"),
    },
  },
  build: {
    outDir: fileURLToPath(new URL("./build/renderer", import.meta.url)),
    emptyOutDir: true,
    target: clinicPcChromium,
    cssTarget: clinicPcChromium,
  },
});
