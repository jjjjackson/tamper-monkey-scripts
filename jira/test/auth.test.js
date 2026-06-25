import { describe, expect, it } from "bun:test";
import {
  buildAuthHeader,
  getCredentials,
  MissingCredentialsError,
} from "../src/auth.js";

describe("getCredentials", () => {
  it("throws MissingCredentialsError when env is missing", () => {
    expect(() => getCredentials({})).toThrow(MissingCredentialsError);
  });

  it("returns email + token when present", () => {
    const c = getCredentials({ JIRA_EMAIL: "a@b.com", JIRA_API_TOKEN: "tok" });
    expect(c).toEqual({ email: "a@b.com", token: "tok" });
  });
});

describe("buildAuthHeader", () => {
  it("builds Basic base64(email:token)", () => {
    const h = buildAuthHeader({ email: "fred@example.com", token: "secret" });
    const expected =
      "Basic " + Buffer.from("fred@example.com:secret").toString("base64");
    expect(h).toBe(expected);
  });
});
