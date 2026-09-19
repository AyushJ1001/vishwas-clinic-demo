"use client";

import { BackupsPanel } from "../backups-panel";

import { RouteHeader, Shell } from "./shell";

export function BackupsPage() {
  return (
    <Shell active="backups">
      <RouteHeader
        eyebrow="Backups"
        title="Every record, kept twice."
        copy="This computer keeps its own copies automatically. Plug in a USB drive to keep a locked copy somewhere else."
      />
      <BackupsPanel />
    </Shell>
  );
}

