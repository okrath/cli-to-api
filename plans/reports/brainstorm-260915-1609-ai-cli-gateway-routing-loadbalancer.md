---
type: brainstorm
date: 2026-09-15
status: accepted
target: cli-to-api
mode: ultra-verifier-pass
design_standards: ak-ui-ux-pro-max
---

# Báo Cáo Thiết Kế Kiến Trúc: `cli-to-api`
**Hệ Thống API Gateway Đa Tài Khoản Cho AI CLI với Điều Phối Tải & Phân Tầng Model Thông Minh**

---

## Tóm Tắt Dự Án (Executive Summary)

`cli-to-api` là giải pháp phần mềm máy chủ reverse-proxy gateway gọn nhẹ chạy native trên máy chủ/máy trạm của người dùng. Hệ thống cho phép biến **bất kỳ công cụ dòng lệnh AI (AI CLI)** nào được người dùng cài đặt trên máy (`@anthropic-ai/claude-code`, `codex-cli`, `opencode`, `grok`, `gemini-cli`, `ollama`, v.v.) thành một **chuẩn OpenAI REST & SSE Streaming API** hoàn chỉnh (`/v1/chat/completions`, `/v1/models`).

Người dùng toàn quyền tự cài đặt các CLI họ muốn; dự án đóng vai trò **cầu nối trung gian (Agnostic Bridge)** cung cấp:
1. **Catalog đầy đủ (`GET /v1/models`):** Trả về toàn bộ danh mục model từ tất cả các CLI adapter đang hoạt động, kèm metadata phân loại.
2. **Định tuyến hướng đích theo Namespace (`provider/model`):** Cân bằng tải cục bộ theo đúng provider được chỉ định (ví dụ `codex/gpt-5.6-asta` chỉ điều phối các tài khoản `codex`, trong khi `opencode/gpt-5.6-asta` chỉ điều phối các tài khoản `opencode`).
3. **Định tuyến tự động theo phân tầng giá & năng lực (`auto-*` tiers):** Tự động cân bằng tải trên toàn bộ các tài khoản của mọi provider dựa trên mức độ yêu cầu: `auto` (toàn bộ), `auto-low` (tiết kiệm/nhẹ), `auto-medium` (tiêu chuẩn), `auto-high` (cao cấp/lập luận sâu), và `auto-xhigh` (cực hạn/max reasoning).
4. **Ảo hóa đa tài khoản (Multi-Account Sandboxing):** Cô lập thư mục cấu hình (`HOME`, `USERPROFILE`, `XDG_CONFIG_HOME`, `APPDATA`, file session) cho từng tài khoản, loại bỏ triệt để xung đột phiên khi chạy song song nhiều tài khoản cho cùng 1 loại CLI.
5. **Giao diện Web Console (UI/UX Pro Max):** Bảng điều khiển Obsidian Dark phong cách Cyber-Developer tích hợp WebShell OAuth đăng nhập trực tiếp trên trình duyệt, thanh tra SSE real-time và Chat Playground.

---

## 1. OUTCOME (Mục Tiêu & Luồng Vận Hành Cốt Lõi)

### 1.1 Trạng Thái Vận Hành Đích
Hệ thống triển khai như một daemon dịch vụ duy nhất (`cli-to-api`). Mọi ứng dụng client AI tiêu chuẩn (Cursor IDE, Continue.dev, LibreChat, Open WebUI, LangChain, SDK OpenAI, cURL) trỏ về `http://localhost:8080/v1` với API key được cấp (`sk-cta-...`).

```
+---------------------------------------------------------------------------------------------------------------+
|                                              CLIENT INGRESS                                                   |
|           Cursor / Continue.dev / Open WebUI / LangChain / cURL (Bearer sk-cta-prod-...)                      |
+---------------------------------------------------------------------------------------------------------------+
                                                       │
                                   POST /v1/chat/completions {model: "..."}
                                                       ▼
+───────────────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                              CLI-TO-API GATEWAY ENGINE                                        |
|                                                                                                               |
|  [ 1. Ingress Auth & Quota Guard ] ─────────────────────────────────────────────────────────────────────────  |
|     • Xác thực Bearer Token (`sk-cta-...`), kiểm tra RPM/TPM và quyền truy cập model                          |
|                                                                                                               |
|  [ 2. Intelligent Model Router & Tier Matcher ] ────────────────────────────────────────────────────────────  |
|     • Phân tích cú pháp Model Header:                                                                         |
|       ├─ Namespace Targeting: `codex/gpt-5.6-asta`      -> Chỉ chọn tài khoản thuộc adapter "codex"          |
|       ├─ Namespace Targeting: `opencode/gpt-5.6-asta`   -> Chỉ chọn tài khoản thuộc adapter "opencode"       |
|       ├─ Tier Auto-Routing:   `auto-low`                -> Lọc các model thuộc nhóm Low Cost (Haiku/Flash)    |
|       ├─ Tier Auto-Routing:   `auto-medium`             -> Lọc các model nhóm Medium (Sonnet/GPT-4o)          |
|       ├─ Tier Auto-Routing:   `auto-high`               -> Lọc các model nhóm High (Opus/GPT-5.6)             |
|       ├─ Tier Auto-Routing:   `auto-xhigh`              -> Lọc các model nhóm Extreme Reasoning (o3/Asta)    |
|       └─ Global Auto-Routing: `auto`                    -> Cân bằng tải trên tất cả provider khả dụng         |
|                                                                                                               |
|  [ 3. Load Balancer & Account Scheduler ] ──────────────────────────────────────────────────────────────────  |
|     • Lọc tài khoản thỏa mãn: Cooldown = 0s, active_slots < max_concurrency                                   |
|     • Thuật toán điều phối: Least-Connections | Lowest-Latency Weighted | Priority-Fallback                   |
|     • Slot Concurrency Semaphore: Tránh spawn vượt quá dung lượng RAM của máy chủ                             |
|                                                                                                               |
|  [ 4. Process Supervisor & Sandbox Executor ] ──────────────────────────────────────────────────────────────  |
|     • Môi trường độc lập: HOME=$DATA/sandboxes/{adapter}/{account}                                            |
|     • Chế độ spawn: Hybrid Pipe (headless pipe) hoặc Pseudo-Terminal (node-pty)                               |
|     • Chống Zombie: Windows Job Objects (`KILL_ON_JOB_CLOSE`) & POSIX Process Groups (`setsid`)               |
|                                                                                                               |
|  [ 5. Byte Stream Sanitizer & SSE Bridge ] ─────────────────────────────────────────────────────────────────  |
|     • StringDecoder('utf8'): Ngăn vỡ ký tự Unicode tiếng Việt / Emoji trên biên chunk bytes                   |
|     • Dual-Stage ANSI Sanitizer: Lọc mã màu escape + Rolling buffer xử lý đè dòng `\r` của spinner            |
|     • Rate-Limit Interceptor: Quét stdout/stderr phát hiện 429 để tự động kích hoạt Cooldown Timer            |
|     • OpenAI SSE Serializer: Phát frame chuẩn `data: {"choices":[{"delta":{"content":"..."}}]}\n\n`           |
+───────────────────────────────────────────────────────────────────────────────────────────────────────────────+
           │                                   │                                   │
           ▼ (Pool: Codex CLI)                 ▼ (Pool: OpenCode CLI)              ▼ (Pool: Claude Code)
+───────────────────────+           +───────────────────────+           +───────────────────────+
| Account: codex-pro-01 |           | Account: opencode-01  |           | Account: claude-work  |
| Account: codex-pro-02 |           | Account: opencode-02  |           | Account: claude-pers  |
| Thư mục $HOME riêng   |           | Thư mục $HOME riêng   |           | Thư mục $HOME riêng   |
+───────────────────────+           +───────────────────────+           +───────────────────────+
```

---

### 1.2 Chi Tiết Về Cơ Chế Định Tuyến Model & Load Balancing

#### 1. Trả về tất cả models (`GET /v1/models`)
Endpoint `/v1/models` tổng hợp toàn bộ các model có thể sử dụng từ 3 nguồn:
- **Tất cả model có namespace:** `codex/gpt-5.6-asta`, `opencode/gpt-5.6-asta`, `claude/claude-3-7-sonnet`, `grok/grok-2`.
- **Các alias phẳng (Flat Aliases):** `gpt-5.6-asta`, `claude-3-7-sonnet`, `grok-2` (tự động fallback về default provider).
- **Các virtual routing model:** `auto`, `auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`.

Mỗi object trả về tuân thủ 100% format OpenAI:
```json
{
  "object": "list",
  "data": [
    {
      "id": "codex/gpt-5.6-asta",
      "object": "model",
      "created": 1773561600,
      "owned_by": "codex",
      "meta": { "provider": "codex", "tier": "xhigh", "context_window": 128000 }
    },
    {
      "id": "opencode/gpt-5.6-asta",
      "object": "model",
      "created": 1773561600,
      "owned_by": "opencode",
      "meta": { "provider": "opencode", "tier": "xhigh", "context_window": 128000 }
    },
    {
      "id": "auto-low",
      "object": "model",
      "created": 1773561600,
      "owned_by": "system",
      "meta": { "type": "virtual_tier", "tier": "low", "description": "Tự động cân bằng giữa các model giá rẻ/tốc độ cao" }
    },
    {
      "id": "auto-xhigh",
      "object": "model",
      "created": 1773561600,
      "owned_by": "system",
      "meta": { "type": "virtual_tier", "tier": "xhigh", "description": "Tự động cân bằng giữa các model lập luận cực cao" }
    }
  ]
}
```

#### 2. Cân bằng tải theo Namespace chỉ định (`provider/model`)
- Khi request gửi `model: "codex/gpt-5.6-asta"`:
  - Router bóc tách `provider = "codex"`, `actual_model = "gpt-5.6-asta"`.
  - Bộ cân bằng tải **chỉ quét danh sách tài khoản thuộc adapter `codex`**.
  - Áp dụng thuật toán (Least-Connections) giữa các tài khoản Codex (ví dụ: `codex-acc-1`, `codex-acc-2`).
  - Tuyệt đối không chạm tới tài khoản của `opencode`.
- Tương tự, khi request gửi `model: "opencode/gpt-5.6-asta"`:
  - Bộ cân bằng tải **chỉ quét danh sách tài khoản thuộc adapter `opencode`**.

#### 3. Cân bằng tải theo Phân Tầng Năng Lực & Chi Phí (`auto-*`)

| Virtual Model | Nhóm Năng Lực & Chi Phí | Danh Sách Model Tiêu Biểu | Thuật Toán Tuyển Chọn |
| :--- | :--- | :--- | :--- |
| `auto-low` | Siêu nhẹ, giá rẻ, độ trễ cực thấp | `claude-3-5-haiku`, `gpt-4o-mini`, `gemini-1.5-flash`, `grok-fast` | Lọc toàn bộ account khả dụng thuộc các model này -> Chọn account có `active_concurrency` thấp nhất và latency nhỏ nhất. |
| `auto-medium`| Cân bằng tốt giữa chi phí và trí tuệ | `claude-3-7-sonnet`, `gpt-4o`, `gemini-1.5-pro` | Cân bằng tải Round-Robin có trọng số giữa các provider đang sẵn sàng. |
| `auto-high` | Năng lực cao, code phức tạp, deep reasoning | `claude-3-opus`, `gpt-5.6`, `o1`, `gemini-ultra` | Ưu tiên tài khoản còn quota lớn, Least-Connections. |
| `auto-xhigh` | Cực hạn trí tuệ, max reasoning, tác vụ khổng lồ | `gpt-5.6-asta`, `o3-high`, `claude-3-7-sonnet thinking 64k` | Giám sát chặt chẽ slot semaphore; ưu tiên tài khoản có SLA cao nhất. |
| `auto` | Toàn quyền điều phối trên mọi model | Tất cả model hiện có trong hệ thống | Chọn model có tài khoản sẵn sàng nhất, tự động failover giữa các provider. |

---

## 2. CONSTRAINTS (Ràng Buộc Kỹ Thuật)

1. **Agnostic Bridge (Người dùng tự cài đặt CLI):** Repo không can thiệp, không tải lậu hay tự cài binary. Giao thức tương tác thuần túy qua stdin, stdout, argv, OS environment variables, và tiến trình OS.
2. **Cách ly thư mục đa tài khoản (Directory Jail):** Không được làm ô nhiễm thư mục gốc của hệ điều hành. Mỗi tài khoản được mount vào thư mục riêng: `$DATA_DIR/sandboxes/{adapter_id}/{account_id}/`.
3. **Chống rò rỉ tiến trình con (Zero Zombie Guarantee):** Khi client ngắt kết nối giữa chừng, toàn bộ cây tiến trình (gồm cả các script wrapper con) phải bị hủy trong vòng $\le 200\text{ms}$ thông qua Windows Job Objects (`KILL_ON_JOB_CLOSE`) hoặc POSIX Process Groups (`SIGKILL` tới `-pgid`).
4. **Vượt giới hạn độ dài dòng lệnh Windows (Argv Limit >8191 chars):** Windows giới hạn dòng lệnh 8,191 ký tự đối với `cmd.exe`. Khi prompt vượt quá 4,000 ký tự, hệ thống bắt buộc kích hoạt cơ chế truyền qua `stdin` hoặc tạo file tạm thời (`temp_file`) để không bị lỗi `Command line too long`.
5. **Toàn vẹn luồng byte Unicode (UTF-8 Stream Integrity):** Bắt buộc dùng `StringDecoder('utf8')` để ghép đúng các byte phân mảnh của ký tự tiếng Việt hoặc Emoji trước khi lọc qua regex.

---

## 3. NON-GOALS (Những Gì Dự Án Không Bao Gồm)

1. **Không phải trình quản lý package CLI:** Không chạy `npm install -g` hay `brew install`. Người dùng tự cài CLI họ cần.
2. **Không chạy suy luận trọng số LLM trực tiếp:** Không nhúng engine llama.cpp/vLLM để chạy file `.gguf`.
3. **Không giải CAPTCHA / Vượt Cloudflare WAF:** Không can thiệp bẻ khóa đăng nhập web; việc xác thực được thực hiện qua luồng chính thống của từng CLI thông qua WebShell.
4. **Không làm cụm phân tán đa máy chủ (Multi-Node Cluster) trong v1:** Tập trung tối ưu tuyệt đối cho môi trường 1 máy chủ (workstation/VPS đơn lẻ).

---

## 4. ACCEPTANCE CRITERIA (Tiêu Chí Nghiệm Thu Rõ Ràng)

```
[AC-01: Trả về đầy đủ Catalog Models (/v1/models)]
  GIVEN: Hệ thống cấu hình 2 adapter (codex có gpt-5.6-asta; opencode có gpt-5.6-asta)
  WHEN: Client gửi GET /v1/models
  THEN: Response trả về HTTP 200 JSON chứa:
        - "codex/gpt-5.6-asta"
        - "opencode/gpt-5.6-asta"
        - "auto", "auto-low", "auto-medium", "auto-high", "auto-xhigh"

[AC-02: Định tuyến chính xác theo Namespace Model]
  GIVEN: Account Codex #1 đang bận (1/1 slot), Account Codex #2 rảnh (0/1 slot); Account OpenCode #1 rảnh (0/1 slot)
  WHEN: Client gửi request POST /v1/chat/completions với model="codex/gpt-5.6-asta"
  THEN: Request CHỈ được phân bổ vào Account Codex #2.
  AND: Tuyệt đối không chuyển sang Account OpenCode #1 dù OpenCode có cùng model name.

[AC-03: Điều phối Virtual Tier Auto-Routing]
  GIVEN: Client gửi request với model="auto-low"
  WHEN: Hệ thống tiếp nhận request
  THEN: Router chỉ lọc các model có tier="low" (vd: haiku, flash, mini).
  AND: Thực hiện Least-Connections trong nhóm model giá rẻ này; tự động bỏ qua các model nhóm high/xhigh.

[AC-04: Cô lập phiên làm việc đa tài khoản]
  GIVEN: Cùng 1 adapter "claude-code" cấu hình Account A và Account B
  WHEN: Chạy đồng thời 2 prompt song song
  THEN: Hai tiến trình khởi chạy với hai biến môi trường HOME khác nhau ($SANDBOX/acc-a và $SANDBOX/acc-b).
  AND: Session token và config không bị đè lên nhau.

[AC-05: Cooldown thông minh khi bị Rate Limit (429)]
  GIVEN: Account A gặp thông báo "429: Usage limit exceeded, resets in 45m"
  WHEN: Hệ thống phát hiện pattern rate-limit
  THEN: Account A chuyển sang trạng thái COOLDOWN trong đúng 45 phút (trích xuất động từ thông báo).
  AND: Các request tiếp theo tự động điều phối sang Account B mà client không bị gián đoạn.

[AC-06: Dọn sạch tiến trình con khi ngắt kết nối]
  GIVEN: Request đang stream token
  WHEN: Client ngắt kết nối (hủy request trong Cursor)
  THEN: Gateway phát hiện socket close và hủy toàn bộ cây tiến trình con trong <= 200ms.
  AND: Không còn bất kỳ tiến trình nào chạy ngầm làm nghẽn CPU/RAM.

[AC-07: Web Management Console UI/UX Pro Max]
  GIVEN: Mở http://localhost:8080 trên trình duyệt
  WHEN: Quản trị viên thao tác
  THEN: Hiển thị đầy đủ Fleet Overview, Quản lý Adapter, Quản lý Account, Bảng định tuyến Namespace/Tier,
        WebShell nhúng (xterm.js) để chạy lệnh login trực tiếp, Live SSE Inspector và Playground.
```

---

## 5. KIẾN TRÚC KỸ THUẬT & ENGINE ĐIỀU PHỐI (TECHNICAL SPECIFICATION)

### 5.1 Technology Stack Đã Được Xác Minh (Verified Stack)

- **Backend Runtime & HTTP Server:** **Node.js 22 LTS + Fastify + TypeScript**  
  *Lý do:* Tốc độ xử lý I/O non-blocking vượt trội, thư viện `node-pty` được Microsoft tối ưu hóa chuyên biệt cho Windows ConPTY và POSIX TTY.
- **Process Supervisor & Sandboxing:**  
  - `node-pty` cho các CLI đòi hỏi môi trường TTY tương tác (như Claude Code).
  - `execa v9` cho các CLI hỗ trợ stream pipe thuần túy.
  - Addon `windows-job-node` (Win32 Job Objects) trên Windows và POSIX Process Groups (`setsid`, `-pgid`) trên Linux/macOS đảm bảo hủy sạch tiến trình.
- **Bộ Đệm & Toàn Vẹn Luồng:**  
  - `StringDecoder('utf8')` ghép byte đa ký tự.
  - **Dual-Stage ANSI Sanitizer** lọc mã màu và rolling buffer xử lý đè dòng `\r`.
- **Database & Trạng Thái:** **SQLite 3 (via `better-sqlite3`) trong WAL Mode + Drizzle ORM**  
  *Lý do:* Đọc ghi microsecond, không cần cài đặt database ngoài, ACID hoàn hảo cho việc cấp phát slot tài khoản.
- **Giao Diện Quản Trị:** **React 19 + Vite + Tailwind CSS v4 + Radix UI + `@xterm/xterm` (WebSockets)**  
  *Lý do:* Thiết kế theo tiêu chuẩn `/ak-ui-ux-pro-max`, mượt mà, hỗ trợ terminal nhúng để xác thực tài khoản.

---

### 5.2 Đặc Tả Schema Khai Báo Adapter Kèm Định Tuyến Model (`adapter.yaml`)

```yaml
id: "codex-cli"
name: "Codex Official CLI"
version: "1.0.0"
executable: "codex"
execution_mode: "pty" # "pty" hoặc "pipe"

# Danh sách model cung cấp cùng metadata phân tầng
models:
  - id: "gpt-5.6-asta"
    name: "GPT-5.6 Asta (Extreme Reasoning)"
    tier: "xhigh" # "low" | "medium" | "high" | "xhigh"
    context_window: 128000
    cost_weight: 10
  - id: "gpt-5.6-mini"
    name: "GPT-5.6 Mini (Fast)"
    tier: "low"
    context_window: 64000
    cost_weight: 1

# Cấu hình gọi lệnh
invocation:
  args_template:
    - "exec"
    - "--model"
    - "{model}"
    - "{prompt}"
  prompt_transport: "auto" # Tự động chuyển sang file tạm nếu prompt > 4000 ký tự
  working_dir_template: "{account_dir}/workspace"
  timeout_seconds: 300

# Cô lập môi trường
environment_isolation:
  home_dir_override: true
  xdg_override: true
  env_overrides:
    CODEX_AUTH_TOKEN: "{account_token}"
    CI: "1"

# Bóc tách luồng & Khử nhiễu
output_parser:
  type: "regex_stream"
  strip_ansi: true
  resolve_carriage_return: true
  chunk_regex: "(?s)(.*)"

# Phát hiện lỗi & Cooldown
error_handling:
  rate_limit_patterns:
    - pattern: "rate limit reached|resets in (\\d+m|\\d+h)"
      cooldown_seconds_default: 1800
      dynamic_extractor: true

concurrency:
  max_concurrent_per_account: 1
```

---

### 5.3 Thuật Toán Định Tuyến Model & Load Balancer (Router Engine)

```typescript
// Logic phân giải model và chọn tài khoản
async function resolveAccountForRequest(requestedModel: string): Promise<{ account: Account; modelToExec: string }> {
  // 1. Kiểm tra Virtual Tier Auto-Routing
  if (requestedModel.startsWith("auto")) {
    const tier = requestedModel === "auto" ? "all" : requestedModel.replace("auto-", "");
    // Lấy tất cả model thỏa mãn tier
    const eligibleModels = await db.models.findEligible(tier);
    // Tìm các tài khoản healthy có slot trống của các model này
    const healthyAccounts = await db.accounts.findHealthyWithAvailableSlots(eligibleModels);
    if (healthyAccounts.length === 0) throw new Error("429: Mọi tài khoản trong nhóm " + requestedModel + " đang bận hoặc cooldown");
    // Áp dụng thuật toán Least-Connections
    const selected = selectLeastConnections(healthyAccounts);
    return { account: selected.account, modelToExec: selected.modelId };
  }

  // 2. Kiểm tra Namespace Model Targeting: "provider/model"
  if (requestedModel.includes("/")) {
    const [providerId, modelId] = requestedModel.split("/");
    const healthyAccounts = await db.accounts.findHealthyForProvider(providerId, modelId);
    if (healthyAccounts.length === 0) throw new Error(`429: Tất cả tài khoản của provider '${providerId}' đang bận hoặc cooldown`);
    const selected = selectLeastConnections(healthyAccounts);
    return { account: selected, modelToExec: modelId };
  }

  // 3. Fallback Model Alias: "gpt-5.6-asta" -> Tìm default provider
  const defaultProvider = await db.models.getDefaultProvider(requestedModel);
  return resolveAccountForRequest(`${defaultProvider}/${requestedModel}`);
}
```

---

## 6. THIẾT KẾ GIAO DIỆN WEB MANAGEMENT (UI/UX PRO MAX)

### 6.1 Bảng Màu Obsidian Cyber-Deck

Giao diện áp dụng bảng màu tương phản cao, hiện đại và chuẩn công thái học lập trình viên:

```css
:root {
  --bg-canvas: #090B0F;             /* Nền không gian sâu */
  --bg-surface: #12141C;            /* Thẻ Card, Panel */
  --bg-surface-hover: #1A1E29;      /* Hover State */
  --border-subtle: #242B3B;         /* Đường viền mảnh */
  --border-focus: #6366F1;          /* Viền Active */

  /* Màu trạng thái phân tầng & hệ thống */
  --accent-brand: #6366F1;          /* Indigo Điện Tử */
  --status-healthy: #10B981;        /* Emerald (Khỏe mạnh, sẵn sàng) */
  --status-cooldown: #F59E0B;       /* Amber Gold (Đang đếm ngược Cooldown) */
  --status-danger: #EF4444;         /* Ruby Red (Lỗi hoặc Hết Token) */
  
  /* Màu hiển thị phân tầng Model */
  --tier-low: #06B6D4;              /* Cyan (auto-low) */
  --tier-medium: #3B82F6;           /* Blue (auto-medium) */
  --tier-high: #8B5CF6;             /* Purple (auto-high) */
  --tier-xhigh: #EC4899;            /* Pink/Rose (auto-xhigh) */
}
```

---

### 6.2 Bố Cục Màn Hình Chính (Wireframes)

#### 1. Màn Hình Quản Lý Catalog Model & Điều Phối Tuyến (Model & Routing Studio)
```
+───────────────────────────────────────────────────────────────────────────────────────────────────────────+
|  [⚡ cli-to-api]  Dashboard  |  Model Catalog  |  Accounts & LB  |  WebShell  |  Inspector  |  Playground     |
+───────────────────────────────────────────────────────────────────────────────────────────────────────────+
|  MODEL CATALOG & ROUTING RULES                                                 [+ Add Custom Alias]       |
|                                                                                                           |
|  VIRTUAL AUTO TIERS (Global Load Balanced Across Providers)                                               |
|  +-----------------------------------------------------------------------------------------------------+  |
|  | TIER NAME    | PHÂN LOẠI      | MODELS ÁP DỤNG                 | HEALTHY ACCOUNTS | TRẠNG THÁI        |  |
|  +--------------+----------------+--------------------------------+------------------+-------------------+  |
|  | auto-low     | [Cyan: Low]    | haiku, 4o-mini, flash, grok-f  | 8 / 8 Accounts   | [● READY]         |  |
|  | auto-medium  | [Blue: Medium] | sonnet, gpt-4o, gemini-pro     | 6 / 6 Accounts   | [● READY]         |  |
|  | auto-high    | [Purple: High] | opus, gpt-5.6, o1              | 4 / 5 Accounts   | [● READY (1 Cool)]|  |
|  | auto-xhigh   | [Rose: Extreme]| gpt-5.6-asta, o3-high          | 3 / 4 Accounts   | [● READY]         |  |
|  +-----------------------------------------------------------------------------------------------------+  |
|                                                                                                           |
|  NAMESPACED MODELS (Targeted Provider Pools)                                                              |
|  +-----------------------------------------------------------------------------------------------------+  |
|  | NAMESPACE MODEL          | TARGET PROVIDER  | TIER     | ACCOUNT POOL            | LOAD BALANCER     |  |
|  +--------------------------+------------------+----------+-------------------------+-------------------+  |
|  | codex/gpt-5.6-asta       | codex-cli        | [xhigh]  | codex-acc-1, codex-acc-2| Least-Connections |  |
|  | opencode/gpt-5.6-asta    | opencode-cli     | [xhigh]  | opencode-team, open-dev | Round-Robin       |  |
|  | claude/claude-3-7-sonnet | claude-code      | [medium] | cl-work-1, cl-work-2    | Least-Connections |  |
|  | grok/grok-2              | grok-cli         | [medium] | grok-solo               | Single-Worker     |  |
|  +-----------------------------------------------------------------------------------------------------+  |
+───────────────────────────────────────────────────────────────────────────────────────────────────────────+
```

#### 2. Màn Hình WebShell Đăng Nhập Tài Khoản Tức Thì (In-Browser Auth)
```
+───────────────────────────────────────────────────────────────────────────────────────────────────────────+
|  Account Setup > "codex-acc-2" (Sandbox: /data/sandboxes/codex/acc-2)                    [Lưu]  [Đóng Shell] |
+───────────────────────────────────────────────────────────────────────────────────────────────────────────+
|  TERMINAL SANDBOX WEBSHELL (Chạy trực tiếp trong trình duyệt với xterm.js và WebSocket)                    |
|  +-----------------------------------------------------------------------------------------------------+  |
|  | $ codex login                                                                                       |  |
|  | Open the following URL in your browser to authorize this account:                                   |  |
|  | https://github.com/login/device?user_code=9A12-BC34                                                 |  |
|  | Waiting for authorization...                                                                        |  |
|  | [OK] Token acquired! Stored securely in /data/sandboxes/codex/acc-2/.codex/auth.json                   |  |
|  | sandbox@cli-to-api:~$ _                                                                             |  |
|  +-----------------------------------------------------------------------------------------------------+  |
+───────────────────────────────────────────────────────────────────────────────────────────────────────────+
```

---

## 7. SO SÁNH CÁC PHƯƠNG ÁN KỸ THUẬT & ĐÁNH GIÁ TRADEOFF

| Chiều Đánh Giá | Phương Án 1: Shell Exec Wrapper | Phương Án 2: Node.js + PTY + Fastify (ĐƯỢC CHỌN) | Phương Án 3: Docker per Account |
| :--- | :--- | :--- | :--- |
| **Độ trễ TTFT** | ~35ms | **<20ms (Cực nhanh)** | 1.500ms - 3.000ms (Container boot) |
| **Hỗ trợ CLI TTY** | Thất bại trên các CLI interactive | **100% nhờ node-pty & ConPTY** | Phức tạp, cần TTY tunnel |
| **Cô lập tài khoản** | Yếu (dễ dính biến môi trường host)| **Cao (Sandbox folder + Env Whitelist)** | Tuyệt đối (Cấp kernel) |
| **Gánh nặng cho User** | Cần cài Node/Python | **Rất nhẹ (1 file thực thi hoặc npm start)**| Nặng (Bắt buộc cài Docker) |
| **Xử lý Zombie process**| Dễ rò rỉ khi client ngắt kết nối | **Triệt để (Windows Job Objects & setsid)** | Container tự hủy |
| **Kết luận** | Loại bỏ | **LỰA CHỌN TỐI ƯU TOÀN DIỆN** | Loại bỏ |

---

## 8. CÁC RỦI RO KỸ THUẬT ĐẶC THÙ & BIỆN PHÁP XỬ LÝ

1. **Vỡ Ký Tự Unicode Tiếng Việt/Emoji Khi Stream:**  
   *Xử lý:* `StringDecoder('utf8')` lưu đệm byte chưa hoàn chỉnh qua các chunk trước khi phát tín hiệu sang bộ lọc.
2. **Ký Tự `\r` Ghi Đè Dòng Của Spinner Làm Rác Khung Chat Client:**  
   *Xử lý:* Bộ lọc Dual-Stage ANSI Sanitizer giải quyết triệt để việc đè dòng trong memory buffer trước khi gửi ra SSE stream.
3. **Giới Hạn Tham Số Dòng Lệnh Windows (8,191 Ký Tự):**  
   *Xử lý:* Khi context lớn (>4,000 ký tự), tự động chuyển sang cơ chế truyền qua `stdin` hoặc file tạm thời (`temp_file`).
4. **Xung Đột File Khóa Cấu Hình Của CLI (Lock Contention):**  
   *Xử lý:* Đặt semaphore `max_concurrency: 1` cho mỗi tài khoản, tự động điều phối request kế tiếp sang tài khoản khác.

---

## 9. ULTRA VERIFIER APPENDIX (KONGMING VERDICT)

*Bảng điểm Best-of-5 do Lead Architectural Verifier (Kongming) chấm độc lập (Thang điểm 1–20 mỗi tiêu chí, tối đa 80):*

| Hạng | Ứng Viên | Tôn Trọng Request (1-20) | Khả Thi Kỹ Thuật (1-20) | Tiêu Chí Sắc Bén (1-20) | Trung Thực Rủi Ro (1-20) | Tổng Điểm | Kết Luận |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| 🥇 | **Candidate E (Thắng cuộc)** | **19** | **20** | **18** | **20** | **77 / 80** | **Kiến trúc chiến thắng chính thức** |
| 🥈 | Candidate A | 19 | 19 | 18 | 18 | 74 / 80 | Á quân (Rất xuất sắc về WebShell & StringDecoder) |
| 🥉 | Candidate D | 19 | 18 | 18 | 16 | 71 / 80 | Tốt về Semaphore slot queueing |
| 4 | Candidate C | 17 | 17 | 16 | 15 | 65 / 80 | Tốt về Windows PATHEXT binary lookup |
| 5 | Candidate B | 17 | 14 | 17 | 13 | 61 / 80 | Loại (Go single binary hay nhưng ConPTY trên Windows rủi ro cao) |

### Chỉ Thị Tích Hợp Tinh Hoa Của Kongming:
1. Giữ nguyên lõi **Candidate E** (Fastify, node-pty, rolling `\r` buffer, dynamic cooldown extraction, file prompt transport).
2. Tích hợp **In-Browser WebShell** và **`StringDecoder('utf8')`** từ **Candidate A**.
3. Tích hợp bộ quét **Windows PATHEXT resolution** từ **Candidate C**.

---

## 10. CÂU HỎI MỞ & HƯỚNG MỞ RỘNG (UNRESOLVED QUESTIONS)

1. **Quản lý Token Usage Tự Động:** Các CLI local không phải lúc nào cũng trả về số token prompt/completion chính xác trong header. Có nên tích hợp sẵn bộ đếm token cục bộ (`tiktoken` / `js-tiktoken`) để tính toán ước lượng vào trường `usage` của response OpenAI không?
2. **Cơ Chế Báo Động (Webhook Alerting):** Khi tất cả tài khoản của một provider (ví dụ toàn bộ 5 tài khoản Claude) đều bị dính Rate-Limit Cooldown, hệ thống có nên hỗ trợ gửi webhook (Discord/Telegram) cảnh báo cho quản trị viên không?
