// Best-effort detection of LAN IPv4 addresses for the local machine.
// Used to surface a shareable URL during local development so the manager can
// send the link to colleagues on the same WiFi.

import os from "node:os";
import { headers } from "next/headers";

export function localLanIPs(): string[] {
  try {
    const interfaces = os.networkInterfaces();
    const ips: string[] = [];
    for (const arr of Object.values(interfaces)) {
      if (!arr) continue;
      for (const iface of arr) {
        if (iface.family === "IPv4" && !iface.internal) {
          ips.push(iface.address);
        }
      }
    }
    return Array.from(new Set(ips));
  } catch {
    return [];
  }
}

export interface SharingContext {
  // What the browser used to reach this server (e.g., "localhost:3000")
  requestHost: string;
  isLocalhost: boolean;
  protocol: "http" | "https";
  // Best-effort base URLs the manager can share
  publicBase: string | null;        // production-style (from env or non-localhost host)
  lanBases: string[];               // for same-WiFi sharing during local dev
}

export async function sharingContext(): Promise<SharingContext> {
  const h = await headers();
  const requestHost = h.get("host") ?? "localhost:3000";
  const xfwd = h.get("x-forwarded-proto");
  const protocol = (xfwd ?? (h.get("host")?.startsWith("https://") ? "https" : "http")) as
    | "http"
    | "https";
  const isLocalhost =
    requestHost.startsWith("localhost") ||
    requestHost.startsWith("127.0.0.1") ||
    requestHost.startsWith("0.0.0.0");

  // If an explicit PUBLIC_URL env is set, prefer it — production setups.
  const envPublic = process.env.PUBLIC_URL?.replace(/\/$/, "") ?? null;

  let publicBase: string | null = envPublic;
  if (!publicBase && !isLocalhost) {
    publicBase = `${protocol}://${requestHost}`;
  }

  // Compute LAN URLs only when running locally.
  const port = requestHost.split(":")[1] ?? "3000";
  const lanBases = isLocalhost
    ? localLanIPs().map((ip) => `http://${ip}:${port}`)
    : [];

  return {
    requestHost,
    isLocalhost,
    protocol,
    publicBase,
    lanBases,
  };
}
