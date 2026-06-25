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
