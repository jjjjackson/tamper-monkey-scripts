import { describe, expect, it } from "bun:test";
import { buildTaskPayload } from "../src/jira-core.js";

describe("buildTaskPayload", () => {
  it("builds minimal payload with only summary", () => {
    const p = buildTaskPayload({ summary: "My task" });
    expect(p).toEqual({
      fields: {
        project: { id: "10396" },
        issuetype: { id: "10001" },
        summary: "My task",
      },
    });
  });

  it("adds description to customfield_11004 as plain string", () => {
    const p = buildTaskPayload({ summary: "S", description: "hello" });
    expect(p.fields.customfield_11004).toBe("hello");
  });

  it("adds story points to customfield_10023 as number", () => {
    const p = buildTaskPayload({ summary: "S", points: 3 });
    expect(p.fields.customfield_10023).toBe(3);
  });

  it("merges json override last", () => {
    const p = buildTaskPayload({ summary: "S", jsonOverride: { labels: ["x"] } });
    expect(p.fields.labels).toEqual(["x"]);
    expect(p.fields.summary).toBe("S");
  });

  it("throws when summary is empty", () => {
    expect(() => buildTaskPayload({ summary: "" })).toThrow();
  });
});
