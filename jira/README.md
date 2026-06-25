# Jira Create-Task Tool

> **這份 README 主要寫給「未來的 AI」**：讓你能正確、可重複地使用本工具在 Jira 建立 **BDM Task** ticket，不要填錯欄位。

## 用途

用**個人 API Token**透過 **Jira REST API v3** 建立 BDM 專案的 **Task** ticket。

- 認證方式：個人 API token + Basic Auth（`Authorization: Basic base64(email:token)`）
- 不依賴 `acli`、不使用 OAuth / scoped token
- 純 JavaScript（ESM）+ Bun 執行，零執行期相依套件

---

## 需要的環境變數

實際呼叫 API（非 `--dry-run`）時必須設定：

| 變數 | 說明 |
| --- | --- |
| `JIRA_EMAIL` | Atlassian 帳號 email |
| `JIRA_API_TOKEN` | 個人 API token（Basic Auth 用） |

- **產生 token 的位置**：<https://id.atlassian.com/manage-profile/security/api-tokens>
- ⚠️ **Atlassian API token 最長一年會過期**（預設一年內到期）。過期後呼叫會回 401，需重新產生並更新環境變數。

設定範例：

```bash
export JIRA_EMAIL="you@paidy.com"
export JIRA_API_TOKEN="your-personal-api-token"
```

---

## 指令範例

> 以下指令請**從 `jira/` 目錄執行**（即本 README 所在目錄）。

```bash
# 基本：只給標題（summary 是唯一真正必填欄位）
bun run src/cli.js --summary "標題"

# 帶純文字描述（會填到 customfield_11004，純字串）
bun run src/cli.js --summary "標題" --description "純文字描述"

# 帶 Story Points（number → customfield_10023）
bun run src/cli.js --summary "標題" --points 3

# dry-run：只印出將送出的 payload，不呼叫 API（不需要環境變數）
bun run src/cli.js --summary "標題" --dry-run

# json 逃生口：覆寫/附加任意 fields（最後合併）
bun run src/cli.js --summary "標題" --json '{"labels":["x"]}'

# 顯示說明
bun run src/cli.js --help
```

也可以用 `package.json` 定義的 script（等同 `bun run src/cli.js`）：

```bash
bun run create-task --summary "標題" --description "純文字描述" --points 3
```

### 參數一覽（與 `src/cli.js` 完全一致）

| 參數 | 縮寫 | 必填 | 說明 |
| --- | --- | --- | --- |
| `--summary` | `-s` | ✅ | Task 標題 / summary |
| `--description` | `-d` | | 純文字描述 → `customfield_11004` |
| `--points` | `-p` | | Story Points（number） → `customfield_10023` |
| `--dry-run` | | | 印出 payload 但不呼叫 API |
| `--json` | | | 原始 fields 覆寫（escape hatch，JSON 字串） |
| `--help` | `-h` | | 顯示說明 |

---

## 輸出格式

成功時會印出 JSON：

```json
{
  "key": "BDM-####",
  "url": "https://paidy-portal.atlassian.net/browse/BDM-####"
}
```

---

## 重要欄位事實（給 AI 的關鍵知識，避免填錯）

這些是對著 live Jira 驗證過的事實（2026-06-25）：

- ✅ **BDM Task 唯一真正必填欄位是 `summary`**（字串）。`project` + `issuetype` 由 payload 帶入；`reporter` 有預設值。
- ✅ **Task 的描述要填到 `customfield_11004`（"Description (BDM-Task)"）**，而且是 **純字串（plain string），不是 ADF**。直接送 raw string，**不要**包成 ADF 文件結構。
- ❌ **不要送標準 `description` 欄位**。
- ❌ **不要送 `customfield_10681`（Request From）**。
- ❌ **不要送 `customfield_10810`（Requested Date）**。
  > 上述三個欄位**不在 Task 的 create screen** 上，送了會被 Jira 拒絕。
- ✅ 可選：`customfield_10023` = Story Points（number），在 create screen 上。

### 常數（定義於 `src/jira-core.js`）

| 名稱 | 值 |
| --- | --- |
| Project id (`BDM_PROJECT_ID`) | `10396` |
| Task issuetype id (`TASK_ISSUETYPE_ID`) | `10001` |
| Base URL (`SITE_BASE`) | `https://paidy-portal.atlassian.net/rest/api/3` |
| Browse base (`BROWSE_BASE`) | `https://paidy-portal.atlassian.net/browse` |

> 注意 base URL 是站台網域 `paidy-portal.atlassian.net`，**不是** `api.atlassian.com`（那是 OAuth / scoped token 用的）。

建立出的最小 payload 範例（`--dry-run` 可確認）：

```json
{
  "fields": {
    "project": { "id": "10396" },
    "issuetype": { "id": "10001" },
    "summary": "標題"
  }
}
```

---

## 錯誤行為

| 情境 | 錯誤 | 引導 |
| --- | --- | --- |
| 缺 `JIRA_EMAIL` 或 `JIRA_API_TOKEN` | `MissingCredentialsError`（exit 1） | 提示設定環境變數，並引導到 <https://id.atlassian.com/manage-profile/security/api-tokens> 產生 token |
| HTTP 401（token 過期 / 被撤銷） | `AuthExpiredError`（exit 1） | 提示 token 最長一年到期，引導到 <https://id.atlassian.com/manage-profile/security/api-tokens> 重新產生並更新 `JIRA_EMAIL` + `JIRA_API_TOKEN` |
| 其他 HTTP 錯誤（例如 400） | `Error`（含 status + body，exit 1） | 顯示 Jira 回傳的錯誤內容供除錯 |
| 參數解析失敗（如缺 `--summary`） | exit 2 | 印出錯誤訊息 + USAGE |

---

## 執行測試

```bash
bun test
```

目前共 **17 個測試全通過**，涵蓋：

- `test/jira-core.test.js`：payload builder + `createTask`（注入式 transport、401、其他錯誤）
- `test/auth.test.js`：env 認證 + Basic Auth header
- `test/cli.test.js`：arg parser

---

## 未來擴充（Tampermonkey）

`src/jira-core.js` 是 **auth-agnostic 核心**：

- **不** import 任何 auth / env / Basic Auth
- **不** 直接寫死 transport（不直接呼叫 `fetch`）
- 只負責：
  - 建立 Task payload（純函式 `buildTaskPayload`）
  - 匯出常數（site / browse base、ids、欄位對應）
  - `createTask(payload, { request, headers })`，其中 `request` 是**注入的 transport 函式** `(url, init) => Promise<Response>`

目前 CLI（`src/cli.js`）注入的是 Basic-Auth 的 `fetch`。

未來若要做 **Tampermonkey userscript** 版本，可**重用 `jira-core.js` 的欄位邏輯與 payload builder**，只需注入一個用瀏覽器 cookie / `GM_xmlhttpRequest` 的 transport 即可，**不需要 API token**。欄位邏輯保持單一來源、不重複。

---

## 專案結構

```
jira/
├── package.json
├── README.md          # 本檔
├── src/
│   ├── jira-core.js   # AUTH-AGNOSTIC：payload builder + createTask(payload,{request}) + 常數
│   ├── auth.js        # env 讀取 + Basic Auth header + 401 引導（CLI-only）
│   └── cli.js         # arg 解析、dry-run、把 auth 接到 core、輸出、錯誤處理
├── test/
│   ├── jira-core.test.js
│   ├── auth.test.js
│   └── cli.test.js
└── docs/plans/2026-06-25-jira-create-task-tool.md
```
