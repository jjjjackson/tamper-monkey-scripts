# Jira Create-Task Tool Implementation Plan (Plain JS + Bun)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:test-driven-development for each unit.

**Goal:** Build a plain-JavaScript (no TypeScript) tool, run by Bun, that lets an AI reliably create a BDM **Task** ticket in Jira, filling the correct fields, using a personal API token via Basic Auth (no acli dependency).

**Architecture:** ESM JavaScript files run directly by Bun (no compile step, no types). The Jira **field logic is isolated in an auth-agnostic core module** (`jira-core.js`) so a future Tampermonkey userscript can reuse it with a different transport (browser cookies instead of Basic Auth). The CLI shell (`cli.js`) handles arg parsing, env-based Basic Auth, dry-run, and clear errors (incl. 401 → token-renewal guidance).

**Tech Stack:** Bun 1.3.x, plain ESM JavaScript, Bun native `fetch`, Bun test runner (`bun:test`). Zero runtime dependencies.

---

## Key Domain Facts (verified against live Jira, 2026-06-25)

- **Site (Basic Auth base URL):** `https://paidy-portal.atlassian.net/rest/api/3`
  (NOT `api.atlassian.com` — that host is for OAuth/scoped tokens.)
- **Project:** `BDM`, project id `10396`.
- **Issue type:** `Task`, id `10001`.
- **Only truly required field for Task:** `summary` (string). `project`+`issuetype` come from payload; `reporter` has a default.
- **Task description field is `customfield_11004` ("Description (BDM-Task)")**, type **plain `string`, NOT ADF**. Send a raw string.
- **Do NOT send** standard `description`, `customfield_10681` (Request From), or `customfield_10810` (Requested Date) — not on the Task create screen, will be rejected.
- `customfield_10023` (Story Points, number) optional but on screen.
- **Auth model:** personal API token + Basic Auth → `Authorization: Basic base64(email:token)`.
- **Token renewal URL (for error messages):** `https://id.atlassian.com/manage-profile/security/api-tokens`
- Atlassian API tokens expire within 1 year (max), so 401 → guide user to renew.

## Future-proofing note (Tampermonkey)

`jira-core.js` MUST NOT import auth/env/Basic-Auth or call `fetch` directly with a hardcoded transport. It only:
- builds the Task payload (pure function)
- exposes the constants (site/browse base, ids, field map)
- exposes `createTask(payload, { request })` where `request` is an injected transport function `(url, init) => Promise<Response>`

The CLI injects a Basic-Auth-fetch. A future Tampermonkey shell can inject `GM_xmlhttpRequest`/cookie-fetch instead. This keeps field logic shared.

## CLI Contract

```
bun run src/cli.js --summary "<title>" [options]

Options:
  --summary, -s      (required) Task summary/title
  --description, -d  (optional) Plain-text description -> customfield_11004
  --points, -p       (optional) Story Points (number)  -> customfield_10023
  --dry-run          Print the payload that WOULD be sent; do not call the API
  --json '<json>'    Raw fields override as JSON (escape hatch)
  --help, -h         Print usage

Env (required for real calls):
  JIRA_EMAIL         Atlassian account email
  JIRA_API_TOKEN     Personal API token (Basic Auth)
```

On success print JSON: `{ "key": "BDM-####", "url": "https://paidy-portal.atlassian.net/browse/BDM-####" }`

---

## Project Layout

```
/Users/jackson/coding/tamper-monkey-scripts/jira/
├── package.json
├── .gitignore
├── README.md
├── src/
│   ├── jira-core.js   # AUTH-AGNOSTIC: payload builder + createTask(payload,{request}) + constants
│   ├── auth.js        # env reading + Basic Auth header + 401 guidance (CLI-only)
│   └── cli.js         # arg parsing, dry-run, wires auth -> jira-core, output, errors
├── test/
│   ├── jira-core.test.js
│   ├── auth.test.js
│   └── cli.test.js
└── docs/plans/2026-06-25-jira-create-task-tool.md
```

---

### Task 0: Scaffold project

**Files:**
- Create: `jira/package.json`
- Create: `jira/.gitignore`

**Step 1: Write `package.json`**

```json
{
  "name": "jira-create-task",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "create-task": "bun run src/cli.js",
    "test": "bun test"
  }
}
```

**Step 2: Write `.gitignore`**

```
node_modules/
*.log
```

**Step 3: Verify bun runs**

Run: `cd jira && bun --version`
Expected: prints `1.3.x`.

**Step 4: Commit**

```bash
cd /Users/jackson/coding/tamper-monkey-scripts
git add jira/package.json jira/.gitignore jira/docs
git commit -m "chore(jira): scaffold bun js project for create-task tool"
```

---

### Task 1: Auth-agnostic core — payload builder

**Files:**
- Create: `jira/src/jira-core.js`
- Test: `jira/test/jira-core.test.js`

**Step 1: Write failing test**

```js
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
```

**Step 2: Run test to verify it fails**

Run: `cd jira && bun test test/jira-core.test.js`
Expected: FAIL (buildTaskPayload undefined / module not found)

**Step 3: Write minimal implementation**

```js
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
```

**Step 4: Run test to verify it passes**

Run: `cd jira && bun test test/jira-core.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add jira/src/jira-core.js jira/test/jira-core.test.js
git commit -m "feat(jira): add auth-agnostic core payload builder for BDM Task"
```

---

### Task 2: Core — createTask with injected transport + 401 handling

**Files:**
- Modify: `jira/src/jira-core.js` (add `createTask` + `AuthExpiredError` + renewal URL const)
- Test: `jira/test/jira-core.test.js` (add transport tests)

**Step 1: Write failing test**

```js
import { AuthExpiredError, createTask, TOKEN_RENEWAL_URL } from "../src/jira-core.js";

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
```

**Step 2: Run test to verify it fails**

Run: `cd jira && bun test test/jira-core.test.js`
Expected: FAIL (createTask/AuthExpiredError undefined)

**Step 3: Write minimal implementation (append to src/jira-core.js)**

```js
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
```

**Step 4: Run test to verify it passes**

Run: `cd jira && bun test`
Expected: PASS (all)

**Step 5: Commit**

```bash
git add jira/src/jira-core.js jira/test/jira-core.test.js
git commit -m "feat(jira): add createTask with injected transport + 401 guidance"
```

---

### Task 3: Auth layer (CLI-only Basic Auth)

**Files:**
- Create: `jira/src/auth.js`
- Test: `jira/test/auth.test.js`

**Step 1: Write failing test**

```js
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
```

**Step 2: Run test to verify it fails**

Run: `cd jira && bun test test/auth.test.js`
Expected: FAIL

**Step 3: Write minimal implementation**

```js
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
```

**Step 4: Run test to verify it passes**

Run: `cd jira && bun test`
Expected: PASS (all)

**Step 5: Commit**

```bash
git add jira/src/auth.js jira/test/auth.test.js
git commit -m "feat(jira): add CLI Basic Auth layer with credential validation"
```

---

### Task 4: CLI entrypoint

**Files:**
- Create: `jira/src/cli.js`
- Test: `jira/test/cli.test.js`

**Step 1: Write failing test (arg parser)**

```js
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
});
```

**Step 2: Run test to verify it fails**

Run: `cd jira && bun test test/cli.test.js`
Expected: FAIL (parseArgs undefined)

**Step 3: Write implementation**

```js
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
```

**Step 4: Run test to verify it passes**

Run: `cd jira && bun test`
Expected: PASS (all)

**Step 5: Manual verification (no creds needed)**

Run: `cd jira && bun run src/cli.js --summary "Test task" --description "hello" --dry-run`
Expected: prints payload JSON; `customfield_11004` equals `"hello"` (a plain string); exit 0.

Run: `cd jira && bun run src/cli.js --help`
Expected: prints usage.

**Step 6: Commit**

```bash
git add jira/src/cli.js jira/test/cli.test.js
git commit -m "feat(jira): add CLI entrypoint wiring Basic Auth to core"
```

---

### Task 5: README for AI reuse

**Files:**
- Create: `jira/README.md`

**Step 1: Write README** documenting for a future AI:
- Purpose (create BDM Task)
- Required env vars + token renewal URL
- Exact command examples (basic, with description, with points, dry-run, json override, help)
- Field facts: Task description → `customfield_11004` plain string; do NOT send standard `description`/Request From/Requested Date
- Output format `{ key, url }`
- Error behavior: missing creds + 401 guidance
- Note that `src/jira-core.js` is auth-agnostic and reusable by a future Tampermonkey userscript (inject a different `request` transport)

**Step 2: Final verification**

Run: `cd jira && bun test`
Expected: all PASS.

**Step 3: Commit**

```bash
git add jira/README.md
git commit -m "docs(jira): add README documenting create-task tool for AI reuse"
```

---

## Final Verification Checklist

REQUIRED SUB-SKILL: superpowers:verification-before-completion before claiming done.

- [ ] `cd jira && bun test` → all pass
- [ ] `bun run src/cli.js --help` → prints usage
- [ ] `bun run src/cli.js --summary "x" --description "y" --dry-run` → correct payload; `customfield_11004` is a plain string
- [ ] Payload never contains standard `description` / `customfield_10681` / `customfield_10810`
- [ ] Missing env (unset JIRA_EMAIL/TOKEN) on a real (non-dry-run) call → exit 1 with renewal URL in message
- [ ] `src/jira-core.js` imports NO auth/env and uses an injected `request` transport (Tampermonkey-ready)
- [ ] (Optional, requires valid token) real create against BDM returns BDM-#### key

## Out of Scope (YAGNI)

- TypeScript / type checking (plain JS by choice)
- ADF rich text (Task field is plain string)
- Story / Epic / other issue types
- Issue links / blockers
- acli / OAuth token path (explicitly chosen: personal API token only)
- The actual Tampermonkey userscript (core is made reusable, but the userscript shell is a future task)
