import { describe, expect, it } from "vitest";
import { projectName } from "./index.js";

describe("zog", () => {
  it("exports the project name", () => {
    expect(projectName).toBe("Zog");
  });
});
