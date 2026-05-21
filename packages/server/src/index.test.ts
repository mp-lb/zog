import { describe, expect, it } from "vitest";
import { healthJson, parsePort } from "./index.js";

describe("server helpers", () => {
  it("serializes health json", () => {
    expect(healthJson("docs")).toBe('{"ok":true,"service":"docs"}\n');
  });

  it("parses valid ports", () => {
    expect(parsePort("3101", 3000)).toBe(3101);
  });
});
