// Builds the Windows app icon from the clinic's logo. The full logo is too
// detailed to read at icon size, so two crops of it are kept in public/icons:
// app-icon.png (the hands, family and VC heart) for 48px and up, and
// app-icon-small.png (the VC heart alone) for the 16-32px taskbar sizes.
// The letterhead uses public/icons/clinic-logo.png, the whole logo with its
// background removed. Run after replacing any of them:
//   node desktop/scripts/make-icon.mjs
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
  const source = size <= 32 ? "app-icon-small.png" : "app-icon.png";
  const file = path.join(resources, `icon-${size}.png`);
  execFileSync("magick", [path.join(icons, source), "-resize", `${size}x${size}`, file]);
  return file;
});
execFileSync("magick", [...pngs, path.join(resources, "icon.ico")]);
execFileSync("rm", ["-f", ...pngs]);
console.log("Wrote desktop/resources/icon.ico");
