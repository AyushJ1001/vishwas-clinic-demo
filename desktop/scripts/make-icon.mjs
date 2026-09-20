// Builds the Windows app icon from public/icons/app-icon.svg, and the
// letterhead mark that the PDF embeds from public/icons/clinic-logo.svg.
// Run after replacing either drawing: node desktop/scripts/make-icon.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const icons = path.join(repo, "public/icons");
const resources = path.join(repo, "desktop/resources");
mkdirSync(resources, { recursive: true });

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = sizes.map((size) => {
  const file = path.join(resources, `icon-${size}.png`);
  execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), path.join(icons, "app-icon.svg"), "-o", file]);
  return file;
});
execFileSync("magick", [...pngs, path.join(resources, "icon.ico")]);
execFileSync("rm", ["-f", ...pngs]);

// The PDF has no SVG support, so the mark is embedded as a PNG.
execFileSync("rsvg-convert", ["-w", "256", "-h", "256", path.join(icons, "clinic-logo.svg"), "-o", path.join(icons, "clinic-logo.png")]);
console.log("Wrote desktop/resources/icon.ico and public/icons/clinic-logo.png");
