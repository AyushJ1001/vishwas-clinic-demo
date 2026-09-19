"use client";

import { BackupsPanel } from "../backups-panel";

import { PageHeader, Shell } from "./shell";

export function BackupsPage() {
  return (
    <Shell active="backups">
      <div className="page">
        <PageHeader title="Backups" />
        <BackupsPanel />
      </div>
    </Shell>
  );
}
