import { createHealthStatus } from "@mp-lb/zog-core";

export const healthJson = (service: string): string =>
  `${JSON.stringify(createHealthStatus(service))}\n`;

export const parsePort = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback;

  const port = Number.parseInt(raw, 10);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid port: ${raw}`);
  }

  return port;
};
