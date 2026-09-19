import "@fontsource-variable/outfit";
import "../../app/globals.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import ClinicApp, { type RouteName } from "../../app/ClinicApp";
import { serveApiLocally } from "./local-api";

const pageRoutes: Record<string, RouteName> = {
  "/": "prescription",
  "/patients": "patients",
  "/receipts": "receipts",
  "/medical-certificate": "certificate",
  "/summaries": "summaries",
  "/backups": "backups",
};

serveApiLocally();
document.documentElement.style.setProperty("--font-outfit", '"Outfit Variable"');

const route = pageRoutes[window.location.pathname.replace(/\/+$/, "") || "/"];

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClinicApp route={route ?? "prescription"} />
  </StrictMode>,
);
