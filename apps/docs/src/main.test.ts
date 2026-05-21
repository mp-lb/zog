import { describe, expect, it } from "vitest";
import { source } from "./lib/source.js";

describe("docs source", () => {
  it("loads the introduction page", () => {
    expect(source.getPage([])?.data.title).toBe("Introduction");
  });
});
