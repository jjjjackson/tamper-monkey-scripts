// src/auth.js  (CLI-only: env + Basic Auth)
import { TOKEN_RENEWAL_URL } from "./jira-core.js";

export class MissingCredentialsError extends Error {
  constructor() {
    super(
      "Missing Jira credentials. Set JIRA_EMAIL and JIRA_API_TOKEN environment variables.\n" +
        `Generate a personal API token at: ${TOKEN_RENEWAL_URL}`,
    );
    this.name = "MissingCredentialsError";
  }
}

export function getCredentials(env = process.env) {
  const email = env.JIRA_EMAIL;
  const token = env.JIRA_API_TOKEN;
  if (!email || !token) throw new MissingCredentialsError();
  return { email, token };
}

export function buildAuthHeader(c) {
  return "Basic " + Buffer.from(`${c.email}:${c.token}`).toString("base64");
}
