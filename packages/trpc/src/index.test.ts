import { describe, expect, it } from "vitest";
import { apiPackageName } from "./index.js";

describe("trpc placeholder", () => {
  it("exports a stable package name", () => {
    expect(apiPackageName).toBe("@mp-lb/zog-trpc");
  });
});
