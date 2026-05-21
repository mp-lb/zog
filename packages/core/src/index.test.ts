import { describe, expect, it } from "vitest";
import { createHealthStatus, projectSlug } from "./index.js";

describe("core", () => {
  it("creates health status", () => {
    expect(createHealthStatus("docs")).toEqual({
      ok: true,
      service: "docs",
    });
  });

  it("exports the project slug", () => {
    expect(projectSlug).toBe("zog");
  });
});
