import { describe, expect, it } from "bun:test";
import { parseArgs } from "../src/cli.js";

describe("parseArgs", () => {
  it("parses summary + description + points", () => {
    const a = parseArgs(["-s", "Title", "-d", "Desc", "-p", "5"]);
    expect(a).toEqual({ summary: "Title", description: "Desc", points: 5, dryRun: false });
  });

  it("parses --dry-run", () => {
    const a = parseArgs(["--summary", "T", "--dry-run"]);
    expect(a.dryRun).toBe(true);
  });

  it("parses --json override", () => {
    const a = parseArgs(["-s", "T", "--json", '{"labels":["x"]}']);
    expect(a.jsonOverride).toEqual({ labels: ["x"] });
  });

  it("throws when summary missing", () => {
    expect(() => parseArgs(["-d", "only desc"])).toThrow();
  });

  it("allows --help without summary", () => {
    const a = parseArgs(["--help"]);
    expect(a.help).toBe(true);
  });

  it("throws when --points value is not a number", () => {
    expect(() => parseArgs(["-s", "T", "-p", "abc"])).toThrow("--points must be a number");
  });

  it("throws when --points has no value (eats next flag)", () => {
    expect(() => parseArgs(["--summary", "x", "--points", "--dry-run"])).toThrow(
      "--points requires a value",
    );
  });

  it("throws when -s has no value (eats next flag)", () => {
    expect(() => parseArgs(["-s", "--dry-run"])).toThrow("-s requires a value");
  });
});
