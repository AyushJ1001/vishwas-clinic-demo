import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import { launchClinicPc, openPage } from "./clinic-pc";

let dataDirectory: string;

test.beforeEach(() => {
  dataDirectory = mkdtempSync(path.join(tmpdir(), "clinic-updates-"));
});

test.afterEach(() => {
  rmSync(dataDirectory, { recursive: true, force: true });
});

function listen(server: Server) {
  return new Promise<string>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("The update server did not open a TCP port."));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function updateFeed() {
  const installer = Buffer.from("Vishwas Clinic update test file");
  const sha512 = createHash("sha512").update(installer).digest("base64");
  const metadata = [
    "version: 0.2.0",
    "files:",
    "  - url: clinic-update.exe",
    `    sha512: ${sha512}`,
    `    size: ${installer.length}`,
    "path: clinic-update.exe",
    `sha512: ${sha512}`,
    "releaseDate: '2026-09-20T00:00:00.000Z'",
    "",
  ].join("\n");
  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const body = pathname === "/latest.yml" ? Buffer.from(metadata) : installer;
    response.writeHead(pathname === "/latest.yml" || pathname === "/clinic-update.exe" ? 200 : 404, {
      "Content-Length": body.length,
      "Content-Type": pathname.endsWith(".yml")
        ? "text/yaml"
        : "application/octet-stream",
    });
    response.end(body);
  });
  return { server, url: await listen(server) };
}

test("stays usable when the update feed cannot be reached", async () => {
  const unused = createServer();
  const feedUrl = await listen(unused);
  await close(unused);

  const app = await launchClinicPc(dataDirectory, {
    CLINIC_UPDATE_FEED: feedUrl,
  });
  const window = await openPage(app, "/settings");
  await window.getByRole("button", { name: "Check for updates" }).click();
  await expect(
    window.getByText("Version 0.1.0 · no internet, so it has not checked"),
  ).toBeVisible({ timeout: 15_000 });

  await openPage(app, "/patients");
  await expect(
    window.getByRole("searchbox", { name: "Search saved patient records" }),
  ).toBeVisible();
  await app.close();
});

test("downloads a newer version quietly", async () => {
  const feed = await updateFeed();
  try {
    const app = await launchClinicPc(dataDirectory, {
      CLINIC_UPDATE_FEED: feed.url,
    });
    const window = await openPage(app, "/settings");
    await window.getByRole("button", { name: "Check for updates" }).click();
    await expect(
      window.getByRole("status").filter({
        hasText:
          /downloading version 0\.2\.0|version 0\.2\.0 installs when you close the app/,
      }),
    ).toBeVisible({ timeout: 15_000 });
    await app.close();
  } finally {
    await close(feed.server);
  }
});

test("takes a Local backup before an update is applied", async () => {
  const feed = await updateFeed();
  try {
    const app = await launchClinicPc(dataDirectory, {
      CLINIC_UPDATE_FEED: feed.url,
    });
    const window = await openPage(app, "/settings");
    await window.getByRole("button", { name: "Check for updates" }).click();
    await expect(
      window.getByText(
        "Version 0.1.0 · version 0.2.0 installs when you close the app",
      ),
    ).toBeVisible({ timeout: 15_000 });

    const backedUp = await app.evaluate(async () => {
      const hook = (
        globalThis as typeof globalThis & {
          __clinicTestBackUpBeforeUpdate?: () => Promise<boolean>;
        }
      ).__clinicTestBackUpBeforeUpdate;
      if (!hook) throw new Error("The update backup test hook was not installed.");
      return hook();
    });
    expect(backedUp).toBe(true);

    await openPage(app, "/backups");
    await expect(
      window.getByRole("list", { name: "Backups on this computer" }),
    ).toContainText("Before update");
    await app.close();
  } finally {
    await close(feed.server);
  }
});
