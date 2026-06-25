// src/jira-core.js
// AUTH-AGNOSTIC core. No env, no Basic Auth, no hardcoded transport.
// A CLI or a Tampermonkey userscript can both reuse this.

export const SITE_BASE = "https://paidy-portal.atlassian.net/rest/api/3";
export const BROWSE_BASE = "https://paidy-portal.atlassian.net/browse";
export const BDM_PROJECT_ID = "10396";
export const TASK_ISSUETYPE_ID = "10001";

/**
 * Build the REST v3 create payload for a BDM Task.
 * @param {{summary:string, description?:string, points?:number, jsonOverride?:object}} input
 */
export function buildTaskPayload(input) {
  if (!input.summary || input.summary.trim() === "") {
    throw new Error("summary is required and cannot be empty");
  }
  const fields = {
    project: { id: BDM_PROJECT_ID },
    issuetype: { id: TASK_ISSUETYPE_ID },
    summary: input.summary,
  };
  if (input.description !== undefined) {
    fields.customfield_11004 = input.description; // plain string, NOT ADF
  }
  if (input.points !== undefined) {
    fields.customfield_10023 = input.points;
  }
  if (input.jsonOverride) {
    Object.assign(fields, input.jsonOverride);
  }
  return { fields };
}

export const TOKEN_RENEWAL_URL =
  "https://id.atlassian.com/manage-profile/security/api-tokens";

export class AuthExpiredError extends Error {
  constructor() {
    super(
      "Authentication failed (401). Your Atlassian API token may have expired or been revoked.\n" +
        "Atlassian API tokens expire within 1 year by default.\n" +
        `Generate a new token at: ${TOKEN_RENEWAL_URL}\n` +
        "Then update JIRA_EMAIL + JIRA_API_TOKEN environment variables.",
    );
    this.name = "AuthExpiredError";
  }
}

/**
 * POST the payload using an INJECTED transport so this stays auth-agnostic.
 * @param {object} payload
 * @param {{ request: (url:string, init:object)=>Promise<Response>, headers?:object }} opts
 */
export async function createTask(payload, opts = {}) {
  const { request, headers = {} } = opts;
  if (typeof request !== "function") {
    throw new Error("createTask requires opts.request transport function");
  }
  const res = await request(`${SITE_BASE}/issue`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });

  if (res.status === 401) throw new AuthExpiredError();
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira API error (${res.status}): ${body}`);
  }
  const data = await res.json();
  return { key: data.key, url: `${BROWSE_BASE}/${data.key}` };
}
