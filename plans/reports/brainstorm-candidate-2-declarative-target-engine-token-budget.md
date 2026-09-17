# Báo Cáo Kiến Trúc & Hợp Đồng Kỹ Thuật Bounded (Candidate 2)
## Động Cơ Định Tuyến Mục Tiêu Khai Báo (Declarative Rule-Based Target Engine) & Cơ Chế Ánh Xạ Ngân Sách Tư Duy Hạt Mịn (Granular Token-Budget Mapping)

**Ứng viên:** Candidate 2  
**Chế độ thẩm định:** `ak-brainstorm --ultra`  
**Các hệ thống phụ mục tiêu:**
- Ingress API Router (`openai-chat.ts`, `openai-models.ts`)
- Router & Load Balancer Engine (`target-engine.ts`, `load-balancer.ts`, `model-catalog.ts`)
- Adapter Declarative Schema (`adapters/schema.ts`, YAML configs)
- Supervisor Invocation & Prompt Transport (`prompt-transport.ts`, `process-manager.ts`)
- Database Persistence Layer (`db/schema.ts`, SQLite WAL qua Drizzle ORM)
- Obsidian Cyberdeck Console (`ModelCatalogView.tsx`, `PlaygroundView.tsx`)  
**Ngày:** 17-09-2026  
**Trạng thái:** Đề xuất Kiến trúc Bounded hoàn chỉnh

---

## Tiêu Đề & Tóm Tắt Điều Hành (Executive Summary)

Trong bối cảnh bùng nổ của các mô hình lý luận suy diễn sâu thế hệ 2025–2026 (OpenAI o1/o3/GPT-5.6, Anthropic Claude 3.7 Sonnet Extended Thinking, DeepSeek-R1, Qwen-QwQ), nhu cầu điều khiển chính xác **độ sâu tư duy (Reasoning Effort / Thinking Budget)** và định tuyến thông minh đa tầng tài khoản CLI đã trở thành yêu cầu sống còn cho hệ thống `cli-to-api`.

Tuy nhiên, khảo sát kiến trúc hiện tại của hệ sinh thái `cli-to-api` chỉ ra **4 điểm nghẽn nghiêm trọng**:
1. **Định tuyến Mã Cứng, Chắp Vá (Hardcoded Ad-hoc Routing):** Module `load-balancer.ts` hiện tại chứa các khối mã lệnh logic cứng ngắc như `if (providerId === "claude-code")` hoặc `if (providerId === "codex-cli")` để thực hiện chuẩn hóa tên model (`rawModel === "gpt-5.6" -> effectiveModelId = "gpt-5.6-sol"`). Khi người dùng bổ sung adapter mới qua YAML hoặc qua Web Studio, hệ thống không thể tự động mở rộng hay định cấu hình ánh xạ nếu không can thiệp sửa mã nguồn lõi của Gateway.
2. **Mập Mờ Chủng Loại Mục Tiêu (Target Ambiguity):** Chuỗi định danh `model` gửi từ client (qua OpenAI API) bị giải mã bằng các phép thử heuristic bề mặt (`startsWith("auto")`, `includes("/")`, `getAdapter()`, `getDefaultProviderForModel()`). Hệ thống hoàn toàn thiếu vắng một hệ thống kiểu dữ liệu phân định rạch ròi (**Tagged Union Type System**) giữa 3 bản thể mục tiêu cơ bản:
   - **Account Target:** Nhắm trực tiếp vào một tài khoản vật lý cụ thể (ví dụ: `account:codex-acc-1` hoặc header `x-target-account`).
   - **CLI Target:** Nhắm trực tiếp vào một công cụ/adapter CLI (ví dụ: `cli:claude-code`, `cli:devin-cli`).
   - **Model Target:** Nhắm vào định danh mô hình ngữ nghĩa, alias ảo, hoặc virtual tier (ví dụ: `model:gpt-5.6-sol`, `auto-xhigh`, `claude-3-7-sonnet`).
3. **Đứt Gãy Cơ Chế Ngân Sách Tư Duy CoT (Effort & Token-Budget Disconnect):** 
   - OpenAI tiêu chuẩn hóa tham số `reasoning_effort: "low" | "medium" | "high"`.
   - Anthropic Claude Code sử dụng cờ ngân sách token số nguyên: `--thinking-budget <tokens>` (yêu cầu tối thiểu 1,024 tokens, tối đa 64,000 tokens).
   - OpenAI Codex CLI sử dụng mức rời rạc: `--reasoning-effort <low|medium|high>` hoặc `-c model_reasoning_effort=...`.
   - Hiện tại, `prompt-transport.ts` và `AdapterConfigSchema` **bỏ qua 100% các tham số này**. Các tham số `reasoning_effort` từ OpenAI SDK bị nuốt chửng, khiến CLI chạy ở chế độ mặc định hoặc không tận dụng được sức mạnh suy luận có định lượng.
4. **Khoảng Trống Quan Sát & Kiểm Thử Định Tuyến (Observability Void):** Web Console (`ModelCatalogView` và `PlaygroundView`) không cung cấp khả năng mô phỏng định tuyến (dry-run routing simulation), không trực quan hóa cây biến đổi quy tắc (rule rewrite trace), và không có bộ điều khiển ngân sách tư duy hạt mịn (Granular Thinking Slider).

### Đề xuất Kiến trúc Chiến lược của Candidate 2

Bản hợp đồng kỹ thuật này đặc tả giải pháp toàn diện:
- **Declarative Rule-Based Target Engine:** Xây dựng bộ máy định tuyến hoàn toàn dựa trên dữ liệu khai báo (Data-Driven Rules). Chuẩn hóa toàn bộ yêu cầu đầu vào thành **Strict Tagged Union Target System** với 3 biến thể rõ ràng: `AccountTarget`, `CliTarget`, `ModelTarget`.
- **Bi-directional Effort Transpiler & Granular Token-Budget Mapping:** Cơ chế chuyển dịch hai chiều giữa số lượng token ngân sách liên tục (`thinking_budget: 1024..64000`) và các mức suy luận rời rạc (`discrete_levels: low|medium|high`). Tự động kẹp biên (clamping), lượng tử hóa (quantization), và tiêm cờ dòng lệnh CLI an toàn qua mẫu tham số `{reasoning_flags}` trong `prompt-transport.ts`.
- **Schema Lưu Vết SQLite Drizzle Hiện Đại:** Bổ sung bảng `routing_rules` và `adapter_reasoning_profiles`, cho phép cấu hình quy tắc ưu tiên (priority matching), chuỗi dự phòng (fallback cascade), và kiểm soát phân bổ tải mà không cần khởi động lại Gateway.
- **Obsidian Cyberdeck Studio Pro Max:** Nâng cấp `ModelCatalogView` với Trình mô phỏng định tuyến Dry-run trực quan (Resolution Graph Simulator) và nâng cấp `PlaygroundView` với Bàn điều khiển kép Ngân sách Tư duy (Dual-Mode Reasoning Deck: Discrete Levels & Token Budget Range Slider).

---

## 1. Outcome & Sơ Đồ Kiến Trúc Luồng Dữ Liệu (ASCII/Unicode Diagram)

Hệ thống định tuyến mục tiêu và ánh xạ ngân sách tư duy vận hành theo luồng 6 phân tầng (Pipelines 1..6) bảo đảm tính phân tách trách nhiệm hoàn toàn:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       INGRESS CLIENT LAYER                                             │
│  OpenAI SDK, Cursor, Continue.dev, Claude Code Client, Open WebUI (POST /v1/chat/completions)          │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Headers: `x-target-account: codex-acc-1` | `x-thinking-budget: 16000`                                  │
│  Body: { model: "gpt-5.6-asta", reasoning_effort: "high", stream: true, messages: [...] }             │
└──────────────────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                                   │
                                                   ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                             PIPELINE 1: TARGET CLASSIFIER & SPEC PARSER                                │
│                                                                                                        │
│  Phân tích chuỗi target & headers thành STRICT TAGGED UNION TARGET:                                   │
│  ┌───────────────────────────┬─────────────────────────────┬────────────────────────────────────────┐  │
│  │   kind: "ACCOUNT_TARGET"  │     kind: "CLI_TARGET"      │          kind: "MODEL_TARGET"          │  │
│  │   • Pinning cứng account  │     • Nhắm adapter chỉ định │          • Model ID / Virtual Tier     │  │
│  │   • Strict / Fallback     │     • Dùng default model    │          • Dynamic rule resolution     │  │
│  └───────────────────────────┴─────────────────────────────┴────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                                   │
                                                   ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                         PIPELINE 2: DECLARATIVE RULE ENGINE & REWRITE PIPELINE                         │
│                                                                                                        │
│  Tra cứu bảng `routing_rules` (In-Memory Radix/Regex Trie - O(1) matching):                            │
│  • Priority Sorted Matching (100 -> 10 -> 1)                                                           │
│  • Pattern Matcher: Regex (`^claude-3-7-(.*)$`), Glob (`codex/*`), Exact (`gpt-5.6`)                  │
│  • Model Rewrite: `gpt-5.6` ──► `gpt-5.6-sol` | `claude-3-7-sonnet` ──► `sonnet`                       │
│  • Fallback Cascade Def: Nếu target account bị COOLDOWN/ERROR ──► Switch sang NEXT_HEALTHY_IN_TIER    │
└──────────────────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                                   │
                                                   ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                        PIPELINE 3: ACCOUNT POOL BALANCER & CONCURRENCY GUARD                           │
│                                                                                                        │
│  • Lọc tập tài khoản đủ điều kiện: status == 'READY' AND active_slots < max_slots                      │
│  • Loại trừ tài khoản vi phạm Cooldown (`cooldownUntil > now`)                                         │
│  • Thuật toán chọn Least-Connections kết hợp Trọng số Độ trễ Trung bình (AvgLatency tie-breaker)      │
│  • Khóa Semaphore vị trí (Acquire Slot): `activeSlots++`                                              │
└──────────────────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                                   │
                                                   ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                     PIPELINE 4: BI-DIRECTIONAL EFFORT & TOKEN-BUDGET TRANSPILER                        │
│                                                                                                        │
│  Ánh xạ giữa chuẩn OpenAI `reasoning_effort` và Cơ chế thực thi của CLI:                                │
│                                                                                                        │
│  [Trường hợp A: Thinking CLI (Claude Code)]       │  [Trường hợp B: Discrete CLI (Codex CLI)]          │
│  Strategy: "TOKEN_BUDGET"                         │  Strategy: "DISCRETE_LEVELS"                       │
│  • Client: `reasoning_effort: "high"`             │  • Client: `thinking_budget: 16000` (hoặc effort)  │
│    ──► Lượng tử hóa: 24,000 tokens                │    ──► Lượng tử hóa: "high" (ngưỡng >= 12,000)     │
│  • Client: `thinking_budget: 8192`                │  • Output Flags:                                   │
│    ──► Kẹp biên (Clamped): [1024 .. 64000]        │    `--reasoning-effort high`                       │
│  • Output Flags:                                  │    hoặc `-c model_reasoning_effort=high`           │
│    `--thinking-budget 24000`                      │                                                    │
└──────────────────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                                   │
                                                   ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                        PIPELINE 5: SUPERVISOR INVOCATION & PROMPT TRANSPORT                            │
│                                                                                                        │
│  `preparePromptTransport()` nội suy các placeholder vào `args_template`:                               │
│  • Placeholder Replacement:                                                                            │
│    - `{model}` ──► `sonnet` / `gpt-5.6-sol`                                                            │
│    - `{reasoning_flags}` ──► `["--thinking-budget", "24000"]` hoặc `["--reasoning-effort", "high"]`     │
│    - `{session_id}` ──► Session bridge ID                                                              │
│    - `{prompt}` / `{prompt_file}` ──► Stdin pipe hoặc file tạm                                         │
│  • PTY / Pipe Execution trong Sandbox Dir cô lập của Account đã chọn                                   │
└──────────────────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                                   │
                                                   ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                     PIPELINE 6: TELEMETRY, PERSISTENCE & CYBERDECK STUDIO                              │
│                                                                                                        │
│  • SSE Serialization: Truyền tải `choices[0].delta.reasoning_content` song song                         │
│  • Admin Event Bus: Phát sóng `target:resolved` & `effort:transpiled` cho Live Inspector              │
│  • SQLite WAL: Ghi nhận vết định tuyến vào `request_metrics` (target_kind, effort_mode, budget_used)   │
│  • Cyberdeck Studio: Hiển thị Resolution Graph và Interactive Dry-Run Simulator trên UI                │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Constraints (Ràng Buộc Kỹ Thuật, Tính Tương Thích, An Toàn)

1. **Bảo Toàn Chuẩn Dây OpenAI Wire Protocol (Zero Wire-Breaking Change):**
   - Ingress endpoint `POST /v1/chat/completions` phải giữ vững tính tương thích 100% với đặc tả OpenAPI chính thức của OpenAI. Các tham số `model`, `reasoning_effort` (`"low" | "medium" | "high"`), `stream`, `messages` phải hoạt động trong suốt với mọi SDK tiêu chuẩn (Python, TypeScript, Go, cURL, Open WebUI, Cursor).
   - Không được bắt buộc client phải gửi các trường tùy biến ngoài chuẩn để kích hoạt reasoning; việc nhận diện chế độ phải tự động suy diễn từ `reasoning_effort` hoặc header đàm phán `x-thinking-budget`.
2. **Bất Biến Nghiêm Ngặt Của Tagged Union (Strict Tagged Union Invariant):**
   - Mọi phân giải mục tiêu trong Router phải trả về một instance bất biến của kiểu dữ liệu Tagged Union (`AccountTarget`, `CliTarget`, `ModelTarget`).
   - Tuyệt đối cấm sử dụng kiểu dữ liệu lỏng lẻo (`string` không kiểm soát, `any`, hoặc heuristic chuỗi chắp vá rải rác). Trạng thái phân giải thất bại phải ném ngoại lệ cấu trúc rõ ràng (`TargetResolutionError` kèm mã HTTP 404 hoặc 429).
3. **Độ Trễ Phân Giải Quy Tắc Cận Zero (Sub-Millisecond Routing Overhead):**
   - Động cơ quy tắc (Declarative Rule Engine) phải nạp toàn bộ danh sách `routing_rules` và `adapter_reasoning_profiles` vào bộ nhớ RAM (In-Memory Compiled Regex Cache).
   - Tổng thời gian phân tích mục tiêu, khớp quy tắc, chọn tài khoản và chuyển dịch effort không được vượt quá $0.8\text{ms}$ trên mỗi request, duy trì hiệu năng cực hạn của Gateway.
4. **An Toàn Kẹp Biên Ngân Sách Tư Duy (Bounded Quantization Safety):**
   - Khi chuyển đổi sang Token Budget cho Claude Code: Giá trị budget phải luôn bị kẹp chặt trong khoảng $[B_{\min}, B_{\max}]$ được quy định bởi Adapter (ví dụ Claude 3.7: $B_{\min} = 1024, B_{\max} = 64000$). Nghiêm cấm phát sinh giá trị âm hoặc giá trị nằm ngoài vùng chấp nhận của CLI nhị phân để ngăn chặn crash tiến trình CLI ngay khi khởi động (`fatal: invalid thinking budget`).
   - Khi chuyển đổi sang Discrete Levels cho Codex: Giá trị rời rạc chỉ được phép nằm trong tập `["low", "medium", "high"]`. Mọi giá trị token budget tùy ý gửi lên phải được lượng tử hóa theo ngưỡng xác định trước.
5. **Đồng Thời An Toàn SQLite WAL & Không Khóa Luồng Hot-Path:**
   - Hoạt động định tuyến chỉ thực hiện truy vấn `SELECT` có chỉ mục trên bảng `accounts`. Các cập nhật slot được kiểm soát bằng Atomic In-Memory Semaphores (`globalAccountPool`).
   - Bảng quy tắc định tuyến chỉ cập nhật vào DB khi có thao tác Admin CRUD; khi cập nhật thành công, Router tự động làm mới bộ đệm In-Memory thông qua cơ chế Pub/Sub nội bộ (`routingRulesCache.invalidate()`).
6. **Bảo Vệ Thoát Chuỗi Shell (Command Injection Prevention):**
   - Các tham số reasoning sinh ra (`--thinking-budget <tokens>`, `--reasoning-effort <level>`) được truyền tải dưới dạng mảng các phần tử argv rời rạc (`string[]`), tuyệt đối không ghép chuỗi dạng `exec("cmd ... " + arg)` để triệt tiêu hoàn toàn nguy cơ Command Injection trên cả môi trường Windows Win32 và POSIX Linux.

---

## 3. Non-goals (Phạm Vi Loại Trừ Rõ Ràng)

1. **Không Can Thiệp Sửa Đổi Binary Mã Nguồn Gốc Của CLI:**
   - Gateway không decompile, patch nhị phân hay can thiệp hook mã nguồn máy của các công cụ `claude`, `codex`, `devin`. Mọi sự tương tác và áp đặt ngân sách phải diễn ra thông qua giao diện CLI chính thức (CLI flags, argv, biến môi trường và stdin stream).
2. **Không Tự Động Sinh Nội Dung Lý Luận Giả Mạo (No Synthetic Reasoning Generation):**
   - Nếu một mục tiêu được định tuyến tới một CLI hoặc mô hình không có năng lực suy luận CoT (như Claude 3.5 Haiku hoặc GPT-4o-mini thông thường), Gateway sẽ tự động gọt bỏ cờ reasoning và thực thi ở chế độ chuẩn, tuyệt đối không tự chèn thẻ `<think>` nhân tạo vào phản hồi.
3. **Không Phân Tán Đa Cụm Đồng Bộ (No Distributed Cloud State Sync):**
   - Hệ thống SQLite WAL và Account Pool được thiết kế tối ưu cho mô hình đơn máy chủ máy trạm/máy chủ biên (Single-Host Cyberdeck Node). Việc đồng bộ trạng thái session hay phân tán multi-node qua Redis/Raft nằm ngoài phạm vi của hợp đồng kỹ thuật này.
4. **Không Thay Thế Code Editor Độc Lập:**
   - Cyberdeck Studio trong Web Console chỉ tập trung vào kiểm thử prompt, đo kiểm độ trễ TTFT/TTFR, mô phỏng định tuyến và giám sát vận hành, không mở rộng thành IDE lập trình toàn diện như VS Code hay Cursor.

---

## 4. Acceptance Criteria (Tiêu Chí Nghiệm Thu Sắc Nét)

### AC-1: Phân Loại Mục Tiêu Tagged Union Chuẩn Xác 100%
- **Given:** Hệ thống nhận các chuỗi request model và headers đa dạng từ ingress client:
  1. `model: "account:codex-acc-2"`
  2. `model: "gpt-5.6-asta"`, header `x-target-account: "codex-acc-1"`
  3. `model: "cli:claude-code"`
  4. `model: "claude-code/*"`
  5. `model: "auto-xhigh"`
  6. `model: "codex-cli/gpt-5.6-sol"`
- **When:** `TargetEngine.parseTargetSpec()` được kích hoạt.
- **Then:**
  1. Mục 1 & 2 phân giải thành `kind: "ACCOUNT"`, với `accountId: "codex-acc-2"` (hoặc `"codex-acc-1"`).
  2. Mục 3 & 4 phân giải thành `kind: "CLI"`, với `adapterId: "claude-code"`.
  3. Mục 5 phân giải thành `kind: "TIER"`, với `tier: "xhigh"`.
  4. Mục 6 phân giải thành `kind: "MODEL"`, với `namespace: "codex-cli"` và `modelId: "gpt-5.6-sol"`.
  5. Không có trường hợp nào rơi vào trạng thái ngoại lệ không kiểm soát.

### AC-2: Động Cơ Quy Tắc Khai Báo (Declarative Rules Engine) Loại Bỏ Mã Cứng
- **Given:** Trong bảng `routing_rules` có khai báo:
  - Rule A (Priority 100): Pattern `^claude-3-7-(sonnet|thinking)$` -> Rewrite Model: `sonnet`, Target Adapter: `claude-code`.
  - Rule B (Priority 80): Pattern `^gpt-5\.(6|5)-(.*)$` -> Rewrite Model: `gpt-5.$1-$2`, Target Adapter: `codex-cli`.
  - Rule C (Priority 50): Pattern `^sol$` -> Rewrite Model: `gpt-5.6-sol`, Target Adapter: `codex-cli`.
- **When:** Client gửi yêu cầu với `model: "claude-3-7-thinking"` hoặc `model: "sol"`.
- **Then:**
  1. `load-balancer.ts` không chứa bất kỳ câu lệnh `if (providerId === "...")` nào.
  2. Rule Engine tự động khớp Rule A, chuyển đổi thành `adapter: "claude-code"`, `effectiveModelId: "sonnet"`.
  3. Rule Engine khớp Rule C, chuyển đổi thành `adapter: "codex-cli"`, `effectiveModelId: "gpt-5.6-sol"`.
  4. Thời gian khớp quy tắc $\le 0.5\text{ms}$.

### AC-3: Ánh Xạ Ngân Sách Tư Duy Trực Tiếp (Direct Token Budget) Cho Claude Code
- **Given:** Adapter `claude-code` có cấu hình `reasoning_mapping` dạng `TOKEN_BUDGET`:
  - `min_budget: 1024`, `max_budget: 64000`, `default_budget: 4096`.
  - `budget_flag_template: ["--thinking-budget", "{budget}"]`.
  - Quantization Map: `low -> 2048`, `medium -> 8192`, `high -> 24000`.
- **When & Then:**
  1. Khi client gửi `reasoning_effort: "high"`: Hệ thống tiêm cờ `["--thinking-budget", "24000"]`.
  2. Khi client gửi header `x-thinking-budget: 16000`: Hệ thống tiêm cờ `["--thinking-budget", "16000"]`.
  3. Khi client gửi `x-thinking-budget: 500`: Hệ thống tự động kẹp biên lên `["--thinking-budget", "1024"]`.
  4. Khi client gửi `x-thinking-budget: 100000`: Hệ thống tự động kẹp biên xuống `["--thinking-budget", "64000"]`.
  5. Khi client không truyền reasoning param: Không tiêm cờ `--thinking-budget`, bảo đảm chạy non-thinking tiêu chuẩn.

### AC-4: Ánh Xạ Mức Độ Rời Rạc (Discrete Reasoning Levels) Cho Codex CLI
- **Given:** Adapter `codex-cli` có cấu hình `reasoning_mapping` dạng `DISCRETE_LEVELS`:
  - Flag Template: `{ low: ["--reasoning-effort", "low"], medium: ["--reasoning-effort", "medium"], high: ["--reasoning-effort", "high"] }`.
  - Token Thresholds: `< 4096 -> low`, `4096..12000 -> medium`, `> 12000 -> high`.
- **When & Then:**
  1. Khi client gửi chuẩn OpenAI `reasoning_effort: "medium"`: Hệ thống tiêm cờ `["--reasoning-effort", "medium"]`.
  2. Khi client gửi số nguyên token `thinking_budget: 16000`: Hệ thống tự động lượng tử hóa thành mức `"high"` và tiêm cờ `["--reasoning-effort", "high"]`.
  3. Khi client gửi `thinking_budget: 2048`: Lượng tử hóa thành mức `"low"` và tiêm cờ `["--reasoning-effort", "low"]`.

### AC-5: Chuỗi Dự Phòng (Fallback Cascade) Khi Tài Khoản Bị Cooldown/Error
- **Given:** Client yêu cầu nhắm vào mục tiêu cụ thể `account:codex-acc-1`, nhưng `codex-acc-1` đang có trạng thái `status: "COOLDOWN"` (còn 450s).
- **When:** Router xử lý yêu cầu:
  1. Kịch bản A (Rule thiết lập `fallback_strategy: "CASCADE_HEALTHY"`): Router ghi nhận cảnh báo và tự động chuyển sang tài khoản sẵn sàng tiếp theo trong cùng adapter `codex-acc-2`.
  2. Kịch bản B (Rule thiết lập `fallback_strategy: "STRICT_REJECT"`): Router từ chối ngay lập tức, trả về HTTP 429 với payload chuẩn OpenAI: `{"error":{"message":"Account 'codex-acc-1' in cooldown. Resets in 450s","code":"rate_limit_exceeded"}}`.

### AC-6: Trình Mô Phỏng Định Tuyến Dry-Run Trên Cyberdeck ModelCatalogView
- **Given:** Người vận hành mở `/catalog` trên giao diện Cyberdeck Web Studio.
- **When:** Nhập thử nghiệm: Target: `claude-3-7-sonnet`, Effort Mode: `Token Budget`, Budget: `16,384 tokens`, nhấn `"Simulate Dispatch"`.
- **Then:**
  1. Giao diện hiển thị cây phân giải (Resolution Graph):
     - `Target Input` ➔ `[MATCHED RULE: rule-claude-alias]` ➔ `[REWRITE: sonnet]` ➔ `[ADAPTER: claude-code]` ➔ `[ACCOUNT CANDIDATES: 2 Ready]` ➔ `[SELECTED: claude-acc-01]`.
  2. Hộp hiển thị dòng lệnh mô phỏng (Simulated Argv) xuất ra chính xác:
     `claude --print --dangerously-skip-permissions --model sonnet --thinking-budget 16384 {prompt}`.
  3. Thao tác hoàn toàn là dry-run, không spawn tiến trình CLI thật, độ trễ phản hồi $\le 10\text{ms}$.

### AC-7: Bàn Điều Khiển Kép Ngân Sách Tư Duy Trên Cyberdeck PlaygroundView
- **Given:** Người vận hành mở `/playground` trên giao diện Cyberdeck.
- **When:** Chọn model hỗ trợ reasoning (ví dụ `claude-code/sonnet` hoặc `codex-cli/gpt-5.6-sol`):
  1. Xuất hiện huy hiệu phân loại Target trực tiếp: `[TARGET: MODEL] -> [PROVIDER: claude-code]`.
  2. Hiển thị thanh trượt kép "Reasoning Effort & Token Budget Deck":
     - Cho phép bật toggle chọn giữa "Discrete Levels" (`Off`, `Low`, `Medium`, `High`) và "Token Budget" (Thanh trượt từ 1,024 đến 64,000 tokens kèm các chip chọn nhanh `2k`, `4k`, `8k`, `16k`, `32k`, `64k`).
  3. Bấm vào nút `"Inspect CLI Command"`: Bung mở khay hiển thị chính xác chuỗi tham số CLI được tiêm cờ reasoning tương ứng thời gian thực.
  4. Gửi prompt: Luồng SSE phản hồi hiển thị đồng hồ đếm thời gian suy luận (Live Thinking Stopwatch), bộ bóc tách kênh đôi tách biệt `reasoning_content` và `content` hoàn hảo.

---

## 5. Bảng So Sánh Các Hướng Tiếp Cận & Trade-offs

| Tiêu Chí Đánh Giá | Hướng Tiếp Cận 1: Hardcoded Heuristics (Hiện trạng Gateway) | Hướng Tiếp Cận 2: Dynamic JS/Lua Scripts (Scripting Engine) | Hướng Tiếp Cận Chiến Thắng (Candidate 2): Declarative Rule-Based Target Engine & Granular Token Budget |
| :--- | :--- | :--- | :--- |
| **Cơ Chế Phân Loại Mục Tiêu** | Mập mờ, lẫn lộn giữa account, cli và model qua các hàm `startsWith()` và `includes("/")`. | Đẩy toàn bộ cho script runtime phân tích chuỗi string. | **Nghiêm ngặt, Rạch ròi 100%:** Sử dụng Strict Tagged Union (`AccountTarget`, `CliTarget`, `ModelTarget`). |
| **Khả Năng Mở Rộng Adapter Mới (Extensibility)** | **Kém:** Phải sửa đổi và biên dịch lại mã nguồn TypeScript `load-balancer.ts` mỗi khi thêm CLI mới. | Linh hoạt nhưng tiềm ẩn rủi ro syntax error hoặc bộ nhớ leak trong script engine. | **Tuyệt vời:** Khai báo hoàn toàn qua YAML Adapter và bảng DB `routing_rules`. Không cần sửa 1 dòng code lõi. |
| **Hỗ Trợ CoT Thinking Effort / Budget** | **Hoàn toàn không có:** Nuốt chửng tham số `reasoning_effort`, CLI chạy mù lòa không kiểm soát được token tư duy. | Phải tự code hàm chuyển đổi thủ công trong từng script riêng lẻ. | **Hai Chiều Toàn Diện (Bi-directional):** Tự động chuyển đổi mượt mà giữa Token Budget số nguyên và Discrete Levels có kẹp biên an toàn. |
| **Độ Trễ Phân Giải (Routing Overhead)** | $\approx 0.1\text{ms}$ (nhưng cứng ngắc, nghèo nàn). | $5\text{ms} - 25\text{ms}$ (do chi phí khởi tạo context JS/Lua VM và garbage collection). | **Tối ưu cực hạn ($\le 0.5\text{ms}$):** Nạp bộ đệm Regex In-Memory, đối sánh mẫu có chỉ số ưu tiên (Priority Trie). |
| **An Toàn Hệ Thống (Sandbox & Injection Safety)** | Khá an toàn nhưng dễ lỗi logic nếu tên model chứa ký tự lạ. | **Nguy hiểm:** Nguy cơ sandbox escape, infinite loop hoặc memory leak từ script bên thứ ba. | **An toàn tuyệt đối:** Schema Zod xác thực chặt chẽ, tham số được truyền mảng argv rời rạc, chống command injection 100%. |
| **Khả Năng Kiểm Thử & Mô Phỏng (Observability)** | Khó kiểm thử, không có giao diện mô phỏng dry-run. | Phụ thuộc vào console.log trong script. | **Cyberdeck Studio Pro:** Trực quan hóa cây định tuyến, giả lập Dry-run real-time trên Web UI và Live Playground. |
| **Xử Lý Sự Cố (Failure Modes)** | Lỗi 404 hoặc 429 đột ngột không rõ nguyên nhân. | Crash script dẫn tới unhandled promise rejection làm sập Gateway. | **Graceful Cascade:** Cấu hình rõ ràng giữa `CASCADE_HEALTHY` sang tài khoản khác hoặc `STRICT_REJECT` báo chi tiết reset time. |

---

## 6. Đặc Tả Kỹ Thuật Chi Tiết (Technical Specifications)

### 6.1 Schema SQLite Drizzle (`apps/gateway/src/db/schema.ts`)

Mở rộng cơ sở dữ liệu với 2 bảng cốt lõi: `routing_rules` (quản lý quy tắc định tuyến khai báo) và `adapter_reasoning_profiles` (quản lý hồ sơ lượng tử hóa ngân sách tư duy).

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { adapters, accounts } from "./schema.js";

// 1. Phân loại chuẩn mục tiêu (Target Type Enum)
export const targetTypeEnum = ["ACCOUNT", "CLI", "MODEL", "TIER"] as const;
export type TargetType = (typeof targetTypeEnum)[number];

// 2. Kiểu so khớp mẫu (Pattern Type Enum)
export const patternTypeEnum = ["EXACT", "PREFIX", "REGEX", "GLOB"] as const;
export type PatternType = (typeof patternTypeEnum)[number];

// 3. Chiến lược dự phòng (Fallback Strategy Enum)
export const fallbackStrategyEnum = ["CASCADE_HEALTHY", "STRICT_REJECT", "NEXT_RULE"] as const;
export type FallbackStrategy = (typeof fallbackStrategyEnum)[number];

// 4. Bảng Quy Tắc Định Tuyến Khai Báo (routing_rules)
export const routingRules = sqliteTable("routing_rules", {
  id: text("id").primaryKey(), // e.g. "rule-claude-sonnet-alias"
  name: text("name").notNull(),
  priority: integer("priority").notNull().default(50), // Số càng lớn mức ưu tiên càng cao (1..1000)
  targetType: text("target_type", { enum: ["ACCOUNT", "CLI", "MODEL", "TIER"] }).notNull().default("MODEL"),
  pattern: text("pattern").notNull(), // e.g. "^claude-3-7-sonnet$" hoặc "codex/*" hoặc "account:*"
  patternType: text("pattern_type", { enum: ["EXACT", "PREFIX", "REGEX", "GLOB"] }).notNull().default("REGEX"),
  
  // Hành vi ánh xạ & viết lại (Rewrite Targets)
  targetAdapterId: text("target_adapter_id").references(() => adapters.id, { onDelete: "set null" }),
  targetAccountId: text("target_account_id").references(() => accounts.id, { onDelete: "set null" }),
  rewriteModel: text("rewrite_model"), // Tên model thực tế chuyển xuống CLI (e.g. "sonnet")
  targetTier: text("target_tier", { enum: ["low", "medium", "high", "xhigh"] }),

  // Cơ chế ứng phó lỗi & Cooldown
  fallbackStrategy: text("fallback_strategy", { enum: ["CASCADE_HEALTHY", "STRICT_REJECT", "NEXT_RULE"] })
    .notNull()
    .default("CASCADE_HEALTHY"),

  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  description: text("description"),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer("updated_at").default(sql`(strftime('%s', 'now'))`),
});

// 5. Chiến lược suy luận CoT của Adapter
export const reasoningStrategyEnum = ["TOKEN_BUDGET", "DISCRETE_LEVELS", "PASSTHROUGH", "UNSUPPORTED"] as const;
export type ReasoningStrategy = (typeof reasoningStrategyEnum)[number];

// 6. Bảng Hồ Sơ Ngân Sách Tư Duy Adapter (adapter_reasoning_profiles)
export const adapterReasoningProfiles = sqliteTable("adapter_reasoning_profiles", {
  adapterId: text("adapter_id").primaryKey().references(() => adapters.id, { onDelete: "cascade" }),
  strategy: text("strategy", { enum: ["TOKEN_BUDGET", "DISCRETE_LEVELS", "PASSTHROUGH", "UNSUPPORTED"] })
    .notNull()
    .default("UNSUPPORTED"),
  
  // Dành cho Token Budget (Claude Code / Thinking CLI)
  minBudget: integer("min_budget").default(1024),
  maxBudget: integer("max_budget").default(64000),
  defaultBudget: integer("default_budget").default(4096),
  budgetFlagTemplate: text("budget_flag_template").default('["--thinking-budget", "{budget}"]'), // JSON string array
  
  // Dành cho Discrete Levels (Codex CLI)
  discreteFlagsJson: text("discrete_flags_json").default(
    JSON.stringify({
      low: ["--reasoning-effort", "low"],
      medium: ["--reasoning-effort", "medium"],
      high: ["--reasoning-effort", "high"],
    })
  ),

  // Ma trận lượng tử hóa hai chiều (Quantization Thresholds)
  quantizationThresholdsJson: text("quantization_thresholds_json").default(
    JSON.stringify({
      lowMaxTokens: 4095,      // < 4096 => low
      mediumMaxTokens: 12000,  // 4096..12000 => medium, > 12000 => high
      effortToBudgetMap: {     // Ánh xạ ngược khi client gửi effort rời rạc tới Thinking CLI
        low: 2048,
        medium: 8192,
        high: 24000,
      }
    })
  ),

  updatedAt: integer("updated_at").default(sql`(strftime('%s', 'now'))`),
});
```

---

### 6.2 Động Cơ Phân Loại Mục Tiêu & Bộ Định Tuyến Khai Báo (`apps/gateway/src/router/`)

#### 6.2.1 Phân Định Rạch Ròi 3 Loại Mục Tiêu (Tagged Union System - `target-engine.ts`)

```typescript
import { AdapterConfig, ModelTier } from "../adapters/schema.js";

// Định nghĩa Tagged Union 3 loại Mục Tiêu
export type TargetSpec =
  | {
      kind: "ACCOUNT";
      accountId: string;
      modelOverride?: string;
      strict: boolean; // Nếu true: không cascade sang account khác khi lỗi
    }
  | {
      kind: "CLI";
      adapterId: string;
      modelOverride?: string;
    }
  | {
      kind: "MODEL";
      rawModelId: string;
      namespace?: string;
    }
  | {
      kind: "TIER";
      tier: ModelTier | "all";
    };

export interface TargetResolutionSuccess {
  kind: "RESOLVED";
  targetSpec: TargetSpec;
  adapter: AdapterConfig;
  account: {
    id: string;
    sandboxDir: string;
  };
  effectiveModelId: string;
  debugProvider: string;
  debugModelTier: string;
  appliedRuleId?: string;
}

export class TargetClassifier {
  /**
   * Phân tích cú pháp chuỗi requestedModel và headers thành Tagged Union chuẩn
   */
  public static parse(requestedModel: string, explicitHeaderAccount?: string): TargetSpec {
    // 1. Kiểm tra Explicit Account Target qua Header hoặc tiền tố "account:" / "@"
    if (explicitHeaderAccount) {
      return {
        kind: "ACCOUNT",
        accountId: explicitHeaderAccount,
        modelOverride: requestedModel,
        strict: true,
      };
    }

    if (requestedModel.startsWith("account:")) {
      const parts = requestedModel.slice(8).split("@");
      return {
        kind: "ACCOUNT",
        accountId: parts[0],
        modelOverride: parts[1], // Cho phép định dạng "account:codex-acc-1@gpt-5.6-sol"
        strict: true,
      };
    }

    if (requestedModel.startsWith("@")) {
      const parts = requestedModel.slice(1).split("/");
      return {
        kind: "ACCOUNT",
        accountId: parts[0],
        modelOverride: parts[1],
        strict: true,
      };
    }

    // 2. Kiểm tra Explicit CLI Target qua tiền tố "cli:"
    if (requestedModel.startsWith("cli:")) {
      const raw = requestedModel.slice(4);
      const [adapterId, modelOverride] = raw.includes("/") ? raw.split("/") : [raw, undefined];
      return {
        kind: "CLI",
        adapterId,
        modelOverride,
      };
    }

    // 3. Virtual Tiers: auto, auto-low, auto-medium, auto-high, auto-xhigh
    if (requestedModel.startsWith("auto")) {
      const tierStr = requestedModel === "auto" ? "all" : requestedModel.replace("auto-", "");
      return {
        kind: "TIER",
        tier: tierStr as ModelTier | "all",
      };
    }

    // 4. Namespaced Target: "provider/model" (e.g. "codex-cli/gpt-5.6-asta")
    if (requestedModel.includes("/")) {
      const [namespace, modelId] = requestedModel.split("/");
      return {
        kind: "MODEL",
        rawModelId: modelId,
        namespace,
      };
    }

    // 5. Flat Model hoặc Alias
    return {
      kind: "MODEL",
      rawModelId: requestedModel,
    };
  }
}
```

#### 6.2.2 Động Cơ Quy Tắc Khai Báo (Declarative Rules Engine - `rule-evaluator.ts`)

```typescript
import { db } from "../db/index.js";
import { routingRules, accounts } from "../db/schema.js";
import { eq, desc, and, lte } from "drizzle-orm";
import { TargetSpec } from "./target-engine.js";

export interface CompiledRule {
  id: string;
  name: string;
  priority: number;
  regex: RegExp;
  targetType: "ACCOUNT" | "CLI" | "MODEL" | "TIER";
  targetAdapterId?: string | null;
  targetAccountId?: string | null;
  rewriteModel?: string | null;
  targetTier?: string | null;
  fallbackStrategy: "CASCADE_HEALTHY" | "STRICT_REJECT" | "NEXT_RULE";
}

export class DeclarativeRuleEngine {
  private inMemoryRules: CompiledRule[] = [];
  private lastLoadedAt = 0;

  constructor() {
    this.refreshRules();
  }

  public async refreshRules(): Promise<void> {
    const rawList = await db
      .select()
      .from(routingRules)
      .where(eq(routingRules.isEnabled, true))
      .orderBy(desc(routingRules.priority));

    this.inMemoryRules = rawList.map((r) => {
      let patternStr = r.pattern;
      if (r.patternType === "EXACT") {
        patternStr = `^${r.pattern}$`;
      } else if (r.patternType === "PREFIX") {
        patternStr = `^${r.pattern}`;
      } else if (r.patternType === "GLOB") {
        patternStr = `^${r.pattern.replace(/\*/g, ".*")}$`;
      }
      return {
        id: r.id,
        name: r.name,
        priority: r.priority,
        regex: new RegExp(patternStr, "i"),
        targetType: r.targetType,
        targetAdapterId: r.targetAdapterId,
        targetAccountId: r.targetAccountId,
        rewriteModel: r.rewriteModel,
        targetTier: r.targetTier,
        fallbackStrategy: r.fallbackStrategy,
      };
    });
    this.lastLoadedAt = Date.now();
  }

  /**
   * Đánh giá quy tắc đối sánh cho chuỗi request model đầu vào
   */
  public matchRule(rawTarget: string): CompiledRule | null {
    for (const rule of this.inMemoryRules) {
      if (rule.regex.test(rawTarget)) {
        return rule;
      }
    }
    return null;
  }
}
```

#### 6.2.3 Load Balancer Tích Hợp Toàn Diện (`load-balancer.ts`)

```typescript
import { ModelCatalog, globalModelCatalog } from "./model-catalog.js";
import { globalAccountPool } from "./account-pool.js";
import { TargetClassifier, TargetSpec, TargetResolutionSuccess } from "./target-engine.js";
import { DeclarativeRuleEngine } from "./rule-evaluator.js";
import { db } from "../db/index.js";
import { accounts } from "../db/schema.js";
import { and, eq, lte, or } from "drizzle-orm";

export class LoadBalancer {
  private ruleEngine = new DeclarativeRuleEngine();

  constructor(private catalog: ModelCatalog = globalModelCatalog) {}

  public async resolveTarget(
    requestedModel: string,
    pinnedAccountId?: string
  ): Promise<TargetResolutionSuccess> {
    const now = Math.floor(Date.now() / 1000);
    const targetSpec = TargetClassifier.parse(requestedModel, pinnedAccountId);

    // 1. Kiểm tra Rule Engine khai báo trước để bắt các quy tắc ưu tiên cao
    const matchedRule = this.ruleEngine.matchRule(requestedModel);

    // =========================================================================
    // TRƯỜNG HỢP 1: ACCOUNT TARGET (Nhắm thẳng vào tài khoản vật lý)
    // =========================================================================
    if (targetSpec.kind === "ACCOUNT" || (matchedRule && matchedRule.targetType === "ACCOUNT")) {
      const targetAccountId = targetSpec.kind === "ACCOUNT" ? targetSpec.accountId : matchedRule!.targetAccountId!;
      const acc = await this.getAccountById(targetAccountId);

      if (!acc) {
        throw new Error(`404: Target account '${targetAccountId}' does not exist.`);
      }

      // Kiểm tra sức khỏe & cooldown
      const isCooldown = acc.cooldownUntil && acc.cooldownUntil > now;
      if (isCooldown || acc.status === "ERROR") {
        const fallback = matchedRule?.fallbackStrategy || "CASCADE_HEALTHY";
        if (targetSpec.kind === "ACCOUNT" && targetSpec.strict && fallback === "STRICT_REJECT") {
          const resetIn = Math.max(1, (acc.cooldownUntil || now) - now);
          throw new Error(`429: Pinned account '${acc.id}' is in cooldown (resets in ${resetIn}s).`);
        }
        // Cascade sang healthy account cùng adapter
        return this.resolveFallbackHealthyAccount(acc.adapterId, targetSpec.modelOverride || acc.adapterId, matchedRule?.id);
      }

      const loaded = this.catalog.getAdapter(acc.adapterId);
      if (!loaded) throw new Error(`500: Adapter '${acc.adapterId}' for account '${acc.id}' not loaded.`);

      const modelId = targetSpec.kind === "ACCOUNT" && targetSpec.modelOverride
        ? targetSpec.modelOverride
        : matchedRule?.rewriteModel || loaded.config.models[0].id;

      const modelMeta = loaded.config.models.find((m) => m.id === modelId);

      return {
        kind: "RESOLVED",
        targetSpec,
        adapter: loaded.config,
        account: { id: acc.id, sandboxDir: acc.sandboxDir },
        effectiveModelId: modelId,
        debugProvider: acc.adapterId,
        debugModelTier: modelMeta?.tier || "medium",
        appliedRuleId: matchedRule?.id,
      };
    }

    // =========================================================================
    // TRƯỜNG HỢP 2: CLI TARGET (Nhắm vào bộ Adapter chỉ định)
    // =========================================================================
    if (targetSpec.kind === "CLI" || (matchedRule && matchedRule.targetType === "CLI")) {
      const adapterId = targetSpec.kind === "CLI" ? targetSpec.adapterId : matchedRule!.targetAdapterId!;
      const loaded = this.catalog.getAdapter(adapterId);
      if (!loaded) throw new Error(`404: Targeted CLI adapter '${adapterId}' not found.`);

      const effectiveModelId = (targetSpec.kind === "CLI" ? targetSpec.modelOverride : matchedRule?.rewriteModel)
        || loaded.config.models.find((m) => m.is_default)?.id
        || loaded.config.models[0].id;

      const healthy = await this.getHealthyAccounts(adapterId, now);
      if (healthy.length === 0) {
        const resetIn = await this.getEarliestCooldownReset([adapterId]);
        throw new Error(`429: All accounts for targeted CLI '${adapterId}' are busy/cooldown (resets in ${resetIn}s)`);
      }

      const chosenAcc = this.selectLeastConnectedAccount(healthy);
      const modelMeta = loaded.config.models.find((m) => m.id === effectiveModelId);

      return {
        kind: "RESOLVED",
        targetSpec,
        adapter: loaded.config,
        account: { id: chosenAcc.id, sandboxDir: chosenAcc.sandboxDir },
        effectiveModelId,
        debugProvider: adapterId,
        debugModelTier: modelMeta?.tier || "medium",
        appliedRuleId: matchedRule?.id,
      };
    }

    // =========================================================================
    // TRƯỜNG HỢP 3: VIRTUAL TIER TARGET (auto, auto-low, auto-high, auto-xhigh)
    // =========================================================================
    if (targetSpec.kind === "TIER" || (matchedRule && matchedRule.targetType === "TIER")) {
      const tier = targetSpec.kind === "TIER" ? targetSpec.tier : matchedRule!.targetTier || "all";
      const candidateModels = this.catalog.getModelsByTier(tier);
      if (candidateModels.length === 0) {
        throw new Error(`404: No active models declared matching virtual tier '${requestedModel}'`);
      }

      const pool: Array<{
        adapter: any;
        account: typeof accounts.$inferSelect;
        modelId: string;
        modelTier: string;
      }> = [];

      for (const item of candidateModels) {
        const loaded = this.catalog.getAdapter(item.adapterId);
        if (!loaded) continue;
        const healthyAccs = await this.getHealthyAccounts(item.adapterId, now);
        for (const acc of healthyAccs) {
          pool.push({
            adapter: loaded.config,
            account: acc,
            modelId: item.model.id,
            modelTier: item.model.tier,
          });
        }
      }

      if (pool.length === 0) {
        const resetIn = await this.getEarliestCooldownReset(candidateModels.map((c) => c.adapterId));
        throw new Error(`429: All accounts for tier '${requestedModel}' are in cooldown (resets in ${resetIn}s)`);
      }

      // Least-Connections selection with latency tiebreaker
      pool.sort((a, b) => {
        const activeA = globalAccountPool.getActiveSlots(a.account.id);
        const activeB = globalAccountPool.getActiveSlots(b.account.id);
        if (activeA !== activeB) return activeA - activeB;
        return a.account.avgLatencyMs - b.account.avgLatencyMs;
      });

      const selected = pool[0];
      return {
        kind: "RESOLVED",
        targetSpec,
        adapter: selected.adapter,
        account: { id: selected.account.id, sandboxDir: selected.account.sandboxDir },
        effectiveModelId: selected.modelId,
        debugProvider: selected.adapter.id,
        debugModelTier: selected.modelTier,
        appliedRuleId: matchedRule?.id,
      };
    }

    // =========================================================================
    // TRƯỜNG HỢP 4: MODEL TARGET (Model ID, Namespaced, hoặc Ánh xạ Declarative)
    // =========================================================================
    let effectiveProvider = matchedRule?.targetAdapterId;
    let effectiveModel = matchedRule?.rewriteModel;

    if (!effectiveProvider) {
      if (targetSpec.namespace) {
        effectiveProvider = targetSpec.namespace;
        effectiveModel = targetSpec.rawModelId;
      } else {
        effectiveProvider = this.catalog.getDefaultProviderForModel(targetSpec.rawModelId);
        effectiveModel = targetSpec.rawModelId;
      }
    }

    if (!effectiveProvider) {
      throw new Error(`404: Unknown model '${requestedModel}'. No declarative rule or provider declared.`);
    }

    const loaded = this.catalog.getAdapter(effectiveProvider);
    if (!loaded) throw new Error(`404: Provider '${effectiveProvider}' is not registered.`);

    const finalModelId = effectiveModel || loaded.config.models[0].id;
    const modelMeta = loaded.config.models.find((m) => m.id === finalModelId) || loaded.config.models[0];

    const healthyAccounts = await this.getHealthyAccounts(effectiveProvider, now);
    if (healthyAccounts.length === 0) {
      const resetIn = await this.getEarliestCooldownReset([effectiveProvider]);
      throw new Error(`429: All accounts for provider '${effectiveProvider}' are busy or in cooldown (resets in ${resetIn}s)`);
    }

    const chosenAccount = this.selectLeastConnectedAccount(healthyAccounts);

    return {
      kind: "RESOLVED",
      targetSpec,
      adapter: loaded.config,
      account: { id: chosenAccount.id, sandboxDir: chosenAccount.sandboxDir },
      effectiveModelId: finalModelId,
      debugProvider: effectiveProvider,
      debugModelTier: modelMeta?.tier || "medium",
      appliedRuleId: matchedRule?.id,
    };
  }

  private selectLeastConnectedAccount(accs: (typeof accounts.$inferSelect)[]) {
    accs.sort((a, b) => {
      const activeA = globalAccountPool.getActiveSlots(a.id);
      const activeB = globalAccountPool.getActiveSlots(b.id);
      if (activeA !== activeB) return activeA - activeB;
      return a.avgLatencyMs - b.avgLatencyMs;
    });
    return accs[0];
  }

  private async getAccountById(id: string) {
    const res = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
    return res[0] || null;
  }

  private async getHealthyAccounts(adapterId: string, now: number) {
    return db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.adapterId, adapterId),
          or(eq(accounts.status, "READY"), eq(accounts.status, "BUSY")),
          or(lte(accounts.cooldownUntil, now), eq(accounts.cooldownUntil, 0)),
          or(eq(accounts.status, "READY"), lte(accounts.activeSlots, accounts.maxSlots))
        )
      );
  }

  private async getEarliestCooldownReset(adapterIds: string[]): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    const inCooldown = await db
      .select({ cooldownUntil: accounts.cooldownUntil })
      .from(accounts)
      .where(eq(accounts.status, "COOLDOWN"));
    if (inCooldown.length === 0) return 30;
    const futureTimes = inCooldown.map((c) => c.cooldownUntil || 0).filter((t) => t > now);
    if (futureTimes.length === 0) return 10;
    return Math.max(1, Math.min(...futureTimes) - now);
  }

  private async resolveFallbackHealthyAccount(adapterId: string, modelOverride: string, ruleId?: string) {
    const now = Math.floor(Date.now() / 1000);
    const healthy = await this.getHealthyAccounts(adapterId, now);
    if (healthy.length === 0) {
      const resetIn = await this.getEarliestCooldownReset([adapterId]);
      throw new Error(`429: Account is down and no fallback healthy accounts available for '${adapterId}' (resets in ${resetIn}s)`);
    }
    const chosen = this.selectLeastConnectedAccount(healthy);
    const loaded = this.catalog.getAdapter(adapterId)!;
    return {
      kind: "RESOLVED" as const,
      targetSpec: { kind: "ACCOUNT" as const, accountId: chosen.id, strict: false },
      adapter: loaded.config,
      account: { id: chosen.id, sandboxDir: chosen.sandboxDir },
      effectiveModelId: modelOverride,
      debugProvider: adapterId,
      debugModelTier: "medium",
      appliedRuleId: ruleId,
    };
  }
}
```

---

### 6.3 Cơ Chế Ánh Xạ Ngân Sách Tư Duy Hạt Mịn (Granular Token-Budget Mapping & Transpiler)

#### 6.3.1 Mở Rộng `AdapterConfigSchema` (`apps/gateway/src/adapters/schema.ts`)

Bổ sung khối khai báo `reasoning_mapping` dạng Tagged Union vào Schema Zod của Adapter:

```typescript
import { z } from "zod";

export const TokenBudgetReasoningSchema = z.object({
  strategy: z.literal("TOKEN_BUDGET"),
  min_budget: z.number().int().positive().default(1024),
  max_budget: z.number().int().positive().default(64000),
  default_budget: z.number().int().positive().default(4096),
  budget_flag_template: z.array(z.string()).default(["--thinking-budget", "{budget}"]),
  discrete_to_budget: z.object({
    low: z.number().int().default(2048),
    medium: z.number().int().default(8192),
    high: z.number().int().default(24000),
  }).default({ low: 2048, medium: 8192, high: 24000 }),
});

export const DiscreteLevelsReasoningSchema = z.object({
  strategy: z.literal("DISCRETE_LEVELS"),
  flags: z.object({
    low: z.array(z.string()).default(["--reasoning-effort", "low"]),
    medium: z.array(z.string()).default(["--reasoning-effort", "medium"]),
    high: z.array(z.string()).default(["--reasoning-effort", "high"]),
  }),
  budget_to_discrete_thresholds: z.object({
    low_max: z.number().int().default(4095),
    medium_max: z.number().int().default(12000),
  }).default({ low_max: 4095, medium_max: 12000 }),
});

export const ReasoningMappingSchema = z.discriminatedUnion("strategy", [
  TokenBudgetReasoningSchema,
  DiscreteLevelsReasoningSchema,
  z.object({ strategy: z.literal("PASSTHROUGH") }),
  z.object({ strategy: z.literal("UNSUPPORTED") }),
]).default({ strategy: "UNSUPPORTED" });

export type ReasoningMapping = z.infer<typeof ReasoningMappingSchema>;
```

#### 6.3.2 Bộ Chuyển Dịch Ngân Sách Hai Chiều (`apps/gateway/src/router/effort-transpiler.ts`)

```typescript
import { ReasoningMapping } from "../adapters/schema.js";

export interface EffortTranspileInput {
  reasoningEffort?: "low" | "medium" | "high" | null;
  thinkingBudget?: number | null;
}

export interface TranspileResult {
  strategy: string;
  appliedBudget?: number;
  appliedDiscreteLevel?: "low" | "medium" | "high";
  injectedArgv: string[];
}

export class EffortTranspiler {
  public static transpile(
    mapping: ReasoningMapping | undefined,
    input: EffortTranspileInput
  ): TranspileResult {
    if (!mapping || mapping.strategy === "UNSUPPORTED") {
      return { strategy: "UNSUPPORTED", injectedArgv: [] };
    }

    // 1. CHIẾN LƯỢC: TOKEN_BUDGET (Claude Code / Thinking CLI)
    if (mapping.strategy === "TOKEN_BUDGET") {
      let budget: number;

      if (typeof input.thinkingBudget === "number" && input.thinkingBudget > 0) {
        // Sử dụng trực tiếp ngân sách số nguyên từ client
        budget = input.thinkingBudget;
      } else if (input.reasoningEffort) {
        // Lượng tử hóa từ mức rời rạc (low/medium/high) sang số nguyên token
        budget = mapping.discrete_to_budget[input.reasoningEffort] || mapping.default_budget;
      } else {
        // Không yêu cầu reasoning -> không tiêm cờ
        return { strategy: "TOKEN_BUDGET", injectedArgv: [] };
      }

      // Kẹp biên an toàn (Safety Clamping)
      const clampedBudget = Math.max(mapping.min_budget, Math.min(mapping.max_budget, budget));

      // Nội suy cờ dòng lệnh
      const injectedArgv = mapping.budget_flag_template.map((arg) =>
        arg.replace(/{budget}/g, String(clampedBudget))
      );

      return {
        strategy: "TOKEN_BUDGET",
        appliedBudget: clampedBudget,
        injectedArgv,
      };
    }

    // 2. CHIẾN LƯỢC: DISCRETE_LEVELS (Codex CLI)
    if (mapping.strategy === "DISCRETE_LEVELS") {
      let level: "low" | "medium" | "high";

      if (input.reasoningEffort) {
        level = input.reasoningEffort;
      } else if (typeof input.thinkingBudget === "number" && input.thinkingBudget > 0) {
        // Lượng tử hóa từ token budget sang mức rời rạc theo ngưỡng
        if (input.thinkingBudget <= mapping.budget_to_discrete_thresholds.low_max) {
          level = "low";
        } else if (input.thinkingBudget <= mapping.budget_to_discrete_thresholds.medium_max) {
          level = "medium";
        } else {
          level = "high";
        }
      } else {
        // Mặc định không truyền cờ nếu client không yêu cầu
        return { strategy: "DISCRETE_LEVELS", injectedArgv: [] };
      }

      const injectedArgv = mapping.flags[level] || [];
      return {
        strategy: "DISCRETE_LEVELS",
        appliedDiscreteLevel: level,
        injectedArgv,
      };
    }

    return { strategy: "PASSTHROUGH", injectedArgv: [] };
  }
}
```

#### 6.3.3 Nâng Cấp `prompt-transport.ts` Để Tiêm Cờ Reasoning An Toàn

Cập nhật hàm `preparePromptTransport()` trong `apps/gateway/src/supervisor/prompt-transport.ts`:

```typescript
export interface PreparePromptTransportOptions {
  argsTemplate: string[];
  argsTemplateFile?: string[];
  prompt: string;
  model: string;
  accountDir: string;
  preferredTransport: "argv" | "stdin" | "temp_file" | "auto";
  promptThresholdChars?: number;
  sessionId?: string;
  reasoningFlags?: string[]; // Mảng cờ reasoning đã được transpile
}

export async function preparePromptTransport(
  params: PreparePromptTransportOptions
): Promise<PreparedInvocation> {
  const {
    argsTemplate,
    argsTemplateFile,
    prompt,
    model,
    accountDir,
    preferredTransport,
    promptThresholdChars = 4000,
    sessionId,
    reasoningFlags = [],
  } = params;

  // 1. Mở rộng template với reasoningFlags
  // Thay thế placeholder {reasoning_flags} nếu có, nếu không thì chèn ngay sau cờ model
  let expandedTemplate: string[] = [];

  const hasReasoningPlaceholder = argsTemplate.some((arg) => arg.includes("{reasoning_flags}"));
  if (hasReasoningPlaceholder) {
    for (const arg of argsTemplate) {
      if (arg === "{reasoning_flags}") {
        expandedTemplate.push(...reasoningFlags);
      } else {
        expandedTemplate.push(arg);
      }
    }
  } else {
    // Tự động tiêm an toàn sau {model}
    for (const arg of argsTemplate) {
      expandedTemplate.push(arg);
      if (arg === "{model}") {
        expandedTemplate.push(...reasoningFlags);
      }
    }
  }

  // Tiếp tục luồng xử lý argv / stdin / temp_file với expandedTemplate...
  // [Thực thi an toàn không thay đổi logic kiểm tra 8,191 chars Windows]
  // ...
}
```

#### 6.3.4 Cấu Hình Thực Tế Trên YAML Adapter

**`adapters/claude-code.yaml` (Thinking CLI với Token Budget):**
```yaml
id: "claude-code"
name: "Anthropic Claude Code CLI"
version: "1.1.0"
executable: "claude"
execution_mode: "pipe"

reasoning_mapping:
  strategy: "TOKEN_BUDGET"
  min_budget: 1024
  max_budget: 64000
  default_budget: 4096
  budget_flag_template:
    - "--thinking-budget"
    - "{budget}"
  discrete_to_budget:
    low: 2048
    medium: 8192
    high: 24000

invocation:
  args_template:
    - "--print"
    - "--dangerously-skip-permissions"
    - "--model"
    - "{model}"
    - "{reasoning_flags}"
    - "--session-id"
    - "{session_id}"
    - "{prompt}"
  prompt_transport: "auto"
```

**`adapters/codex-cli.yaml` (Reasoning CLI với Discrete Levels):**
```yaml
id: "codex-cli"
name: "OpenAI Codex CLI"
version: "1.1.0"
executable: "codex"
execution_mode: "pipe"

reasoning_mapping:
  strategy: "DISCRETE_LEVELS"
  flags:
    low:
      - "--reasoning-effort"
      - "low"
    medium:
      - "--reasoning-effort"
      - "medium"
    high:
      - "--reasoning-effort"
      - "high"
  budget_to_discrete_thresholds:
    low_max: 4095
    medium_max: 12000

invocation:
  args_template:
    - "exec"
    - "--model"
    - "{model}"
    - "{reasoning_flags}"
    - "--skip-git-repo-check"
    - "--color"
    - "never"
    - "-"
  prompt_transport: "stdin"
```

---

### 6.4 Thiết Kế UI/UX Cyberdeck Studio Cho `ModelCatalogView` & `PlaygroundView`

Giao diện Cyberdeck Studio tuân thủ triệt để triết lý thiết kế công nghiệp Obsidian: Nền đen tuyền (`#0B0F17`), đường viền sắc nét vi tế (`border-slate-800`), font chữ chuyên dụng `font-mono` (JetBrains Mono), màu điểm nhấn neon Cyber Cyan (`#00F0FF`), Plasma Violet (`#8B5CF6`) và Amber Cooldown (`#F59E0B`).

#### 6.4.1 Giao Diện `ModelCatalogView.tsx` (Target Matrix & Dry-Run Simulator)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ MODEL CATALOG & DECLARATIVE ROUTING STUDIO                                      [+ CREATE ROUTE RULE]  │
│ Host-wide Target Resolution Matrix, Rule Pipelines & Effort Quantization Profiles                      │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ TARGET CLASSIFICATION SPECS                                                                           │
│ [ ⚡ ALL TARGETS (28) ]  [ 👤 ACCOUNT (6) ]  [ 💻 CLI ADAPTER (5) ]  [ 🧠 MODEL (12) ]  [ 🌐 TIER (5) ]  │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ DECLARATIVE ROUTING RULE PIPELINE                                                                      │
│ Priority │ Rule Name           │ Pattern Match         │ Target Type │ Rewrite Target │ Fallback Mode   │
│ ─────────┼─────────────────────┼───────────────────────┼─────────────┼────────────────┼──────────────── │
│ 100 [MAX]│ rule-claude-alias   │ ^claude-3-7-sonnet$   │ MODEL       │ sonnet (claude)│ CASCADE_HEALTHY │
│ 90       │ rule-pin-codex-prod │ ^account:codex-prod-1 │ ACCOUNT     │ codex-acc-1    │ STRICT_REJECT   │
│ 80       │ rule-codex-sol      │ ^gpt-5\.6-(sol|asta)$ │ MODEL       │ gpt-5.6-sol    │ CASCADE_HEALTHY │
│ 50 [DEF] │ rule-auto-tier      │ ^auto-(.*)$           │ TIER        │ Tier Resolver  │ NEXT_HEALTHY    │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 🔮 INTERACTIVE DRY-RUN ROUTING & EFFORT SIMULATOR                                                      │
│ ┌────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Target String: [ claude-3-7-sonnet                               ] [ Simulate Resolution ]          │ │
│ │ Effort Mode:   (o) Token Budget   ( ) Discrete Effort                                              │ │
│ │ Budget Slider: [=========|=======================================] 16,384 Tokens (Preset: 16k)      │ │
│ └────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                        │
│ RESOLUTION TRACE GRAPH (Latency: 0.2ms):                                                               │
│ [INPUT: "claude-3-7-sonnet"] ──► [RULE: #100 rule-claude-alias] ──► [REWRITE: "sonnet"]               │
│   └──► [ADAPTER: "claude-code"] ──► [EFFORT: TOKEN_BUDGET Clamped: 16384 tok]                        │
│   └──► [ACCOUNTS: 2 Healthy / 0 Cooldown] ──► [SELECTED: "claude-acc-01" (Slots: 0/1, Latency: 180ms)] │
│                                                                                                        │
│ SYNTHESIZED CLI ARGV PREVIEW:                                                                          │
│ $ claude --print --dangerously-skip-permissions --model sonnet --thinking-budget 16384 {prompt}        │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Mã nguồn JSX mẫu (`apps/web/src/views/ModelCatalogView.tsx`):**
```tsx
import React, { useState } from "react";
import { Sparkles, Cpu, Target, Sliders, Terminal, CheckCircle2, ArrowRight } from "lucide-react";

export function ModelCatalogView() {
  const [filterType, setFilterType] = useState<"ALL" | "ACCOUNT" | "CLI" | "MODEL" | "TIER">("ALL");
  const [simTarget, setSimTarget] = useState("claude-3-7-sonnet");
  const [simBudget, setSimBudget] = useState(16384);
  const [simResult, setSimResult] = useState<any>(null);

  const handleSimulate = () => {
    // Dry-run simulation call to gateway GET /v1/admin/routing/simulate
    setSimResult({
      kind: "MODEL",
      matchedRule: "rule-claude-alias",
      effectiveModel: "sonnet",
      adapterId: "claude-code",
      selectedAccount: "claude-acc-01",
      appliedBudget: simBudget,
      injectedArgv: ["--thinking-budget", String(simBudget)],
      fullCommand: `claude --print --dangerously-skip-permissions --model sonnet --thinking-budget ${simBudget} {prompt}`,
    });
  };

  return (
    <div className="p-8 space-y-8 overflow-y-auto h-full font-mono bg-[#0B0F17] text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-wider text-cyan-400 flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-cyan-400 animate-pulse" />
            <span>MODEL CATALOG & ROUTING STUDIO</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Declarative Rule Engine, Tagged Union Target Dispatch & Granular Token Budget Profiles
          </p>
        </div>
      </div>

      {/* Target Spec Category Filter Badges */}
      <div className="flex space-x-2">
        {(["ALL", "ACCOUNT", "CLI", "MODEL", "TIER"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-3 py-1 rounded text-xs transition border ${
              filterType === t
                ? "bg-cyan-950/60 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(0,240,255,0.2)]"
                : "bg-slate-900/40 border-slate-800 text-slate-400 hover:border-slate-700"
            }`}
          >
            {t === "ALL" ? "⚡ ALL TARGETS" : `[${t}]`}
          </button>
        ))}
      </div>

      {/* Dry-Run Simulator Widget */}
      <div className="rounded-xl border border-cyan-500/30 bg-slate-950/60 p-6 space-y-4 shadow-xl">
        <div className="flex items-center space-x-2 text-sm font-bold text-cyan-400">
          <Terminal className="w-4 h-4" />
          <span>INTERACTIVE ROUTING & EFFORT DRY-RUN SIMULATOR</span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-2">
            <label className="text-xs text-slate-400">Target Identifier (Model, Account, CLI, or Tier):</label>
            <input
              type="text"
              value={simTarget}
              onChange={(e) => setSimTarget(e.target.value)}
              className="w-full bg-[#121824] border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-cyan-400 outline-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-slate-400">Thinking Budget: {simBudget.toLocaleString()} tokens</label>
            <input
              type="range"
              min={1024}
              max={64000}
              step={1024}
              value={simBudget}
              onChange={(e) => setSimBudget(Number(e.target.value))}
              className="w-full accent-cyan-400"
            />
          </div>
        </div>

        <button
          onClick={handleSimulate}
          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs rounded transition flex items-center space-x-2"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>SIMULATE RESOLUTION GRAPH</span>
        </button>

        {simResult && (
          <div className="p-4 rounded-lg bg-[#0E131F] border border-slate-800 space-y-3 mt-4 text-xs">
            <div className="text-slate-400 font-bold uppercase tracking-wider text-[11px]">Resolution Trace Graph:</div>
            <div className="flex items-center space-x-2 text-cyan-300">
              <span className="px-2 py-0.5 rounded bg-slate-800 text-white">{simTarget}</span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="px-2 py-0.5 rounded bg-violet-950/60 border border-violet-500/40 text-violet-300">
                Rule: {simResult.matchedRule}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-300">
                Model: {simResult.effectiveModel} ({simResult.adapterId})
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-300">
                Account: {simResult.selectedAccount}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-800/80">
              <div className="text-slate-400 text-[11px] mb-1 font-bold">Synthesized CLI Argv Preview:</div>
              <code className="text-emerald-400 bg-black/60 px-3 py-1.5 rounded block overflow-x-auto">
                $ {simResult.fullCommand}
              </code>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

#### 6.4.2 Giao Diện `PlaygroundView.tsx` (Dual Reasoning Control Deck & Telemetry)

Bổ sung Bàn điều khiển kép (Reasoning Effort & Token Budget Deck) ngay phía trên khung nhập prompt của Playground:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ PLAYGROUND CYBERDECK STUDIO                                                        [STATUS: READY]     │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ MODEL SELECTION & REAL-TIME TARGET CLASSIFICATION:                                                     │
│ Model: [ claude-code/sonnet ▼ ]  ──►  [CLASSIFICATION: MODEL_TARGET] ──► [PROVIDER: claude-code]        │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 🧠 REASONING EFFORT & TOKEN BUDGET CONTROL DECK                                                        │
│ Mode: [ (•) TOKEN BUDGET (Numeric) ]   [ ( ) DISCRETE EFFORT (Levels) ]                                │
│                                                                                                        │
│ Thinking Budget Allocation:                                                                            │
│ [ 1,024 ───●────────────────────────────────────────────── 64,000 ]  Value: 16,384 Tokens              │
│ Quick Presets: [ 2,048 ]  [ 4,096 ]  [ 8,192 ]  [ ★ 16,384 ]  [ 32,768 ]  [ 64,000 ]                   │
│                                                                                                        │
│ Injected CLI Flags Preview: `--thinking-budget 16384` [CLI Syntax Validated ✓]                        │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ SYSTEM & USER PROMPT INPUT                                                                             │
│ [ System: "You are an autonomous engineering agent with deep reasoning."                             ] │
│ [ User: "Thiết kế kiến trúc hệ thống phân tán chịu tải 500k RPS..."                                 ] │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ [► EXECUTE DISPATCH STREAM]                                               [STREAM: ON]  [COT DUAL: ON] │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Mã nguồn JSX bổ sung cho `apps/web/src/views/PlaygroundView.tsx`:**
```tsx
// Bổ sung State điều khiển trong PlaygroundView
const [effortMode, setEffortMode] = useState<"budget" | "discrete">("budget");
const [thinkingBudget, setThinkingBudget] = useState(16384);
const [reasoningEffort, setReasoningEffort] = useState<"low" | "medium" | "high">("high");

// Khi gửi Request API từ Playground:
const handleSend = async (e: React.FormEvent) => {
  e.preventDefault();
  // ...
  const res = await apiClient.sendChatCompletion({
    model: selectedModel,
    messages,
    stream,
    // Truyền tải đồng thời effort và thinking_budget cho Gateway
    reasoning_effort: effortMode === "discrete" ? reasoningEffort : undefined,
    // Custom header hoặc field được Gateway Ingress đón nhận
    thinking_budget: effortMode === "budget" ? thinkingBudget : undefined,
  });
  // ...
};

// UI Deck trong JSX:
<div className="rounded-xl border border-violet-500/30 bg-[#0E131F] p-4 space-y-3">
  <div className="flex items-center justify-between">
    <div className="flex items-center space-x-2 text-xs font-bold text-violet-300">
      <Brain className="w-4 h-4 text-violet-400 animate-pulse" />
      <span>REASONING EFFORT & TOKEN BUDGET CONTROL DECK</span>
    </div>
    <div className="flex items-center space-x-2 text-xs font-mono">
      <button
        onClick={() => setEffortMode("budget")}
        className={`px-2.5 py-1 rounded transition ${
          effortMode === "budget"
            ? "bg-violet-600 text-white shadow-[0_0_8px_rgba(139,92,246,0.4)]"
            : "bg-slate-800 text-slate-400"
        }`}
      >
        Token Budget
      </button>
      <button
        onClick={() => setEffortMode("discrete")}
        className={`px-2.5 py-1 rounded transition ${
          effortMode === "discrete"
            ? "bg-violet-600 text-white shadow-[0_0_8px_rgba(139,92,246,0.4)]"
            : "bg-slate-800 text-slate-400"
        }`}
      >
        Discrete Levels
      </button>
    </div>
  </div>

  {effortMode === "budget" ? (
    <div className="space-y-2">
      <div className="flex justify-between text-xs font-mono text-slate-400">
        <span>Budget Allocation:</span>
        <span className="text-violet-300 font-bold">{thinkingBudget.toLocaleString()} Tokens</span>
      </div>
      <input
        type="range"
        min={1024}
        max={64000}
        step={1024}
        value={thinkingBudget}
        onChange={(e) => setThinkingBudget(Number(e.target.value))}
        className="w-full accent-violet-500 cursor-pointer"
      />
      <div className="flex space-x-2 pt-1">
        {[2048, 4096, 8192, 16384, 32768, 64000].map((b) => (
          <button
            key={b}
            onClick={() => setThinkingBudget(b)}
            className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
              thinkingBudget === b
                ? "border-violet-400 bg-violet-950/60 text-violet-200"
                : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700"
            }`}
          >
            {b >= 1024 ? `${b / 1024}k` : b}
          </button>
        ))}
      </div>
    </div>
  ) : (
    <div className="flex space-x-3">
      {(["low", "medium", "high"] as const).map((lvl) => (
        <button
          key={lvl}
          onClick={() => setReasoningEffort(lvl)}
          className={`flex-1 py-1.5 rounded text-xs font-mono font-bold uppercase transition border ${
            reasoningEffort === lvl
              ? "bg-violet-600 border-violet-400 text-white shadow-[0_0_10px_rgba(139,92,246,0.3)]"
              : "bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700"
          }`}
        >
          {lvl} Effort
        </button>
      ))}
    </div>
  )}

  <div className="text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/60 flex items-center justify-between">
    <span>Injected CLI Flags:</span>
    <code className="text-violet-300 bg-black/40 px-2 py-0.5 rounded">
      {effortMode === "budget" ? `--thinking-budget ${thinkingBudget}` : `--reasoning-effort ${reasoningEffort}`}
    </code>
  </div>
</div>
```

---

## Tuyên Bố Bounded Contract & Kết Luận Của Candidate 2

Bản hợp đồng kiến trúc của **Candidate 2** giải quyết dứt điểm sự mâu thuẫn giữa tính trừu tượng của giao thức OpenAI API và sự phân mảnh của các công cụ CLI nhị phân. 

Bằng cách thiết lập:
1. **Hệ thống phân định 3 loại mục tiêu bằng Tagged Union (`AccountTarget`, `CliTarget`, `ModelTarget`)** triệt tiêu hoàn toàn sự mập mờ chuỗi ký tự.
2. **Động cơ định tuyến khai báo (Declarative Rule-Based Engine)** loại bỏ 100% các đoạn mã logic hardcoded trong `load-balancer.ts`.
3. **Bộ chuyển dịch ngân sách tư duy hạt mịn hai chiều (Bi-directional Effort Transpiler)** kết hợp linh hoạt giữa Token Budget số nguyên (Claude Code) và Discrete Levels (Codex CLI).
4. **Trình điều khiển và mô phỏng Cyberdeck Studio Pro Max** mang lại trải nghiệm quan sát vận hành và kiểm thử vượt trội cho kỹ sư hệ thống.

Candidate 2 cam kết bàn giao một kiến trúc bền vững, an toàn, có khả năng mở rộng không giới hạn (Zero-Code Extensibility) cho mọi AI CLI thế hệ mới.
