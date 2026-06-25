import { describe, expect, it } from "bun:test";
import {
  AuthExpiredError,
  buildTaskPayload,
  createTask,
  TOKEN_RENEWAL_URL,
} from "../src/jira-core.js";

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

describe("createTask", () => {
  const payload = buildTaskPayload({ summary: "S" });

  it("returns key + url on 201 and posts to /issue", async () => {
    let calledUrl;
    const request = async (url, _init) => {
      calledUrl = url;
      return new Response(JSON.stringify({ key: "BDM-1234" }), { status: 201 });
    };
    const r = await createTask(payload, { request });
    expect(calledUrl).toBe("https://paidy-portal.atlassian.net/rest/api/3/issue");
    expect(r).toEqual({
      key: "BDM-1234",
      url: "https://paidy-portal.atlassian.net/browse/BDM-1234",
    });
  });

  it("throws AuthExpiredError with renewal URL on 401", async () => {
    const request = async () => new Response("nope", { status: 401 });
    const p = createTask(payload, { request });
    await expect(p).rejects.toThrow(AuthExpiredError);
    await expect(p).rejects.toThrow(TOKEN_RENEWAL_URL);
  });

  it("throws with status + body on other errors (400)", async () => {
    const request = async () =>
      new Response(JSON.stringify({ errors: { summary: "bad" } }), { status: 400 });
    await expect(createTask(payload, { request })).rejects.toThrow(/400/);
  });

  it("throws if no request transport injected", async () => {
    await expect(createTask(payload, {})).rejects.toThrow();
  });
});
