import type { HealthStatus } from "@mp-lb/zog-core";

export type ExampleApi = {
  health: () => HealthStatus;
};

export const apiPackageName = "@mp-lb/zog-trpc";
