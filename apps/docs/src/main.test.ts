import { describe, expect, it } from "vitest";
import { getPage, pages } from "./lib/docs.js";

describe("docs source", () => {
  it("loads the introduction page", () => {
    expect(getPage("/docs")?.title).toBe("Introduction");
    expect(pages).toHaveLength(3);
  });
});
