// src/cli.js
import { buildAuthHeader, getCredentials } from "./auth.js";
import { buildTaskPayload, createTask } from "./jira-core.js";

const USAGE = `Create a BDM Task in Jira.

Usage:
  bun run src/cli.js --summary "<title>" [options]

Options:
  --summary, -s      (required) Task summary/title
  --description, -d  (optional) Plain-text description -> customfield_11004
  --points, -p       (optional) Story Points (number)
  --dry-run          Print the payload without calling the API
  --json '<json>'    Raw fields override (escape hatch)
  --help, -h         Show this help

Env (required for real calls):
  JIRA_EMAIL       Atlassian account email
  JIRA_API_TOKEN   Personal API token (Basic Auth)
                   Generate: https://id.atlassian.com/manage-profile/security/api-tokens`;

export function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--summary":
      case "-s":
        out.summary = argv[++i];
        break;
      case "--description":
      case "-d":
        out.description = argv[++i];
        break;
      case "--points":
      case "-p":
        out.points = Number(argv[++i]);
        break;
      case "--dry-run":
        out.dryRun = true;
        break;
      case "--json":
        out.jsonOverride = JSON.parse(argv[++i]);
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!out.help && (!out.summary || out.summary.trim() === "")) {
    throw new Error("--summary is required");
  }
  return out;
}

export async function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(e.message + "\n\n" + USAGE);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  const payload = buildTaskPayload(args);

  if (args.dryRun) {
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }

  try {
    const creds = getCredentials();
    const header = buildAuthHeader(creds);
    const result = await createTask(payload, {
      request: fetch,
      headers: { Authorization: header },
    });
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (e) {
    console.error(e.message);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await main(Bun.argv.slice(2)));
}
