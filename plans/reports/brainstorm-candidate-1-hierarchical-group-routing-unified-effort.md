# Bounded Architectural Contract: Hierarchical Group Routing & Unified Effort Matrix Engine cho Multi-CLI AI Gateway

**Ứng viên:** Candidate 1  
**Quy trình:** `ak-brainstorm --ultra`  
**Chuyên đề kiến trúc:** Mô hình Group đa tầng với chiến lược Priority Fallback Chain kết hợp Weighted Pool (PFC-WP) & Ma trận ánh xạ Effort chuẩn hóa OpenAI $\leftrightarrow$ CLI args (Unified Effort Matrix - UEM)  
**Phạm vi tác động (Subsystems):**
- Data Plane & Schema: `apps/gateway/src/db/schema.ts`, SQLite Migrations.
- Router & Dispatcher: `apps/gateway/src/router/hierarchical-router.ts`, `load-balancer.ts`, `model-catalog.ts`, `account-pool.ts`.
- Adapter & Ingress Matrix: `apps/gateway/src/adapters/schema.ts`, `prompt-transport.ts`, `process-manager.ts`, `api/routes/openai-chat.ts`, `api/routes/openai-models.ts`.
- Frontend Cyberdeck Console: `apps/web/src/views/ModelCatalogView.tsx`, `PlaygroundView.tsx`, `apps/web/src/lib/api-client.ts`.

---

## Tiêu đề & Tóm tắt điều hành (Executive Summary)

### Bối cảnh & Hiện trạng hệ thống
Hệ thống `cli-to-api` hiện tại cung cấp một cầu nối cho phép biến các công cụ dòng lệnh AI cục bộ (`claude-code`, `codex-cli`, `omp-cli`, `opencode-cli`, v.v.) thành các endpoint tương thích chuẩn OpenAI REST/SSE (`/v1/chat/completions`, `/v1/models`). Tuy nhiên, cơ chế định tuyến và phân phối tải đang bộc lộ 3 điểm nghẽn kỹ thuật:

1. **Mô hình định tuyến phẳng, thiếu tính linh hoạt (Flat & Rigid Routing):**
   Hiện tại, việc định tuyến chỉ hỗ trợ 2 cơ chế sơ khai: Namespaced Targeting trực tiếp (`provider/model`, ví dụ `codex-cli/gpt-5.6-asta`) hoặc các phân tầng ảo cố định (`auto`, `auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`). Người dùng doanh nghiệp hoặc kỹ sư DevOps không thể tạo ra các nhóm định tuyến ảo theo nghiệp vụ riêng (như `group:deep-code`, `group:production-fast`, `group:customer-service`).
2. **Hiện tượng "đứt gãy đơn điểm" (Single Point of Failure / 429 Cascade Failure):**
   Khi một tài khoản hoặc một provider đạt ngưỡng giới hạn tần suất (Rate Limit 429) hoặc đầy số lượng khe thực thi song song (`active_slots >= max_slots`), request ngay lập tức bị từ chối với mã lỗi 429 hoặc 503. Hệ thống hoàn toàn thiếu cơ chế **Priority Fallback Chain** (Chuỗi dự phòng ưu tiên) để tự động nhảy từ Provider chính ($P_1$) sang Provider phụ ($P_2$, $P_3$) một cách trong suốt với client. Đồng thời, bên trong cùng một tầng ưu tiên, hệ thống không thể phân bổ lưu lượng theo tỷ lệ trọng số (Weighted Distribution - ví dụ 70% Claude, 30% Codex).
3. **Tháp Babel về cấu hình suy luận chuyên sâu (The Reasoning Effort Tower of Babel):**
   OpenAI và các giao thức hiện đại chuẩn hóa tham số `reasoning_effort: "none" | "low" | "medium" | "high" | "xhigh"`. Trong khi đó, mỗi CLI sở hữu một tập cờ (flags) và ngữ nghĩa hoàn toàn phân mảnh:
   - Claude Code CLI dùng `--thinking-budget <tokens>` (ví dụ `0`, `1024`, `4096`, `16000`, `32000`) hoặc cờ `--effort`.
   - Codex CLI dùng cờ `--reasoning-effort <low|medium|high>` hoặc `--skip-reasoning`.
   - OMP CLI dùng cờ `--thought-level <0-5>`.
   - OpenCode/Devin CLI dùng `--thinking-mode <boolean>` kết hợp biến môi trường hoặc file config.
   Hiện tại, `cli-to-api` bỏ rơi hoàn toàn tham số `reasoning_effort` từ OpenAI client. Khi lập trình viên gửi `reasoning_effort: "high"`, tham số này biến mất trong hư không, khiến mô hình CLI chỉ chạy ở chế độ mặc định, triệt tiêu sức mạnh lập luận (Chain-of-Thought).

### Giải pháp kiến trúc của Candidate 1
Candidate 1 đề xuất hợp đồng kiến trúc hoàn chỉnh **Hierarchical Group Routing & Unified Effort Matrix (HGR-UEM)**:
- **Hierarchical Group Router với chiến lược PFC-WP (Priority Fallback Chain kết hợp Smooth Weighted Pool):** Cho phép định nghĩa các Routing Group dạng cấu trúc cây (Directed Acyclic Graph - DAG). Mỗi Group gồm nhiều tầng ưu tiên (Priority Levels $1, 2, 3 \dots$). Tại mỗi tầng, các target (Adapter, Model, Account, hoặc Sub-group) được phân bổ tải theo thuật toán **Smooth Weighted Round Robin (SWRR)** kết hợp Least-Active-Connections. Khi toàn bộ target của tầng $P_1$ bị bão hòa (dính 429, Cooldown hoặc Full concurrency), Router tự động và tức thì kích hoạt Fallback sang tầng $P_2$ với thời gian trễ quyết định $\le 1.5\text{ms}$.
- **Unified Effort Matrix (UEM):** Thiết lập ma trận ánh xạ 5 mức (`none`, `low`, `medium`, `high`, `xhigh`) ở cả tầng Adapter Schema, Database và Runtime Prompt-Transport. Mọi request OpenAI chứa `reasoning_effort` hoặc header `x-reasoning-effort` được biên dịch trực tiếp thành cờ CLI `--thinking-budget`, `--reasoning-effort`, `--thought-level` hoặc env overrides tương ứng, bảo toàn $100\%$ ý định suy luận của client.
- **Cyberdeck Studio Pro-Max (ModelCatalogView & PlaygroundView):** Cung cấp giao diện cấu hình trực quan dạng Node/Tree và Card kéo thả cho Routing Group, kiểm tra ma trận Effort trực tiếp, đồng thời bổ sung **Route Trace Inspector & Live Effort Selector** trên PlaygroundView cho phép quan sát trực tiếp chuỗi fallback và cờ CLI thực tế được inject vào tiến trình.

---

## 1. Outcome & Sơ đồ kiến trúc luồng dữ liệu (ASCII/Unicode diagram)

### 1.1 Sơ đồ Kiến trúc Tổng thể Luồng Dữ Liệu (End-to-End Dataflow)

```
========================================================================================================================
                      HIERARCHICAL GROUP ROUTING & UNIFIED EFFORT MATRIX ARCHITECTURE
========================================================================================================================

 [ OPENAI CLIENT INGRESS ]
   Cursor / Open WebUI / Claude Code / SDK
   POST /v1/chat/completions
   {
     "model": "group:deep-code-prod",
     "reasoning_effort": "high",
     "stream": true,
     "messages": [...]
   }
       │
       ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ STAGE 1: INGRESS RESOLVER & THREAD AFFINITY                                                                        │
 │ • Xác thực Bearer Token, kiểm tra Quota Guard                                                                      │
 │ • Trích xuất `model` và `reasoning_effort` (ưu tiên Body, fallback `x-reasoning-effort` header)                   │
 │ • Kiểm tra Sticky Session: Nếu thread đang Active và bound account còn sống & không Cooldown ──► Fast-Track Route  │
 └───────────────────────────────────────────────────┬────────────────────────────────────────────────────────────────┘
                                                     │ (Nếu không có Session Binding hoặc Bound Node bị Cooldown)
                                                     ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ STAGE 2: HIERARCHICAL GROUP ROUTER (PFC-WP ENGINE)                                                                 │
 │                                                                                                                    │
 │  Group: "group:deep-code-prod" (Default Effort: "high")                                                            │
 │  │                                                                                                                 │
 │  ├── PRIORITY 1: Primary Tier (Claude 3.7 Sonnet) ── Weight: 100                                                   │
 │  │   ├── Account: claude-work-01 (Active: 1/1, Slots Full!) ──► SKIP                                               │
 │  │   └── Account: claude-work-02 (Status: COOLDOWN 429, reset in 120s) ──► SKIP                                    │
 │  │   └── [CIRCUIT BREAKER]: Priority 1 Exhausted! ────────────────────────────────┐                                 │
 │  │                                                                                │ Trigger Failover (≤ 1.5ms)     │
 │  ├── PRIORITY 2: Secondary Weighted Pool (Codex GPT-5.6 Terra & Sol) ◄───────────┘                                │
 │  │   │                                                                                                             │
 │  │   ├── Target A: codex-cli/gpt-5.6-sol   (Weight: 70) ──► Smooth Weighted RR                                     │
 │  │   │   ├── Account: codex-team-01 (Active: 0/1, Cooldown: 0s, Latency: 420ms) ──► [SELECTED TARGET]             │
 │  │   │   └── Account: codex-team-02 (Active: 1/1)                                                                  │
 │  │   │                                                                                                             │
 │  │   └── Target B: codex-cli/gpt-5.6-terra (Weight: 30)                                                            │
 │  │       └── Account: codex-team-03 (Active: 0/1, Cooldown: 0s, Latency: 850ms)                                     │
 │  │                                                                                                                 │
 │  └── PRIORITY 3: Tertiary Emergency Tier (OMP CLI Reasoning Core) ── Weight: 100 (STANDBY)                        │
 └───────────────────────────────────────────────────┬────────────────────────────────────────────────────────────────┘
                                                     │ Target: codex-cli/gpt-5.6-sol (Account: codex-team-01)
                                                     │ Requested Effort: "high"
                                                     ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ STAGE 3: UNIFIED EFFORT MATRIX (UEM) COMPILER & PROMPT-TRANSPORT                                                   │
 │                                                                                                                    │
 │  Input Effort: "high"                                                                                              │
 │  Adapter Effort Profile for "codex-cli":                                                                           │
 │    ┌─────────────┬──────────────────────────────────────────┬─────────────────────────────┐                        │
 │    │ Level       │ CLI Flags Injection                      │ Env Overrides               │                        │
 │    ├─────────────┼──────────────────────────────────────────┼─────────────────────────────┤                        │
 │    │ "high"      │ ["--reasoning-effort", "high"]           │ {}                          │                        │
 │    └─────────────┴──────────────────────────────────────────┴─────────────────────────────┘                        │
 │                                                                                                                    │
 │  Adapter Template: ["exec", "--model", "{model}", "{effort_flags}", "--skip-git-repo-check", "-"]                  │
 │  Compiled Argv:    ["codex", "exec", "--model", "gpt-5.6-sol", "--reasoning-effort", "high", "-"]                  │
 └───────────────────────────────────────────────────┬────────────────────────────────────────────────────────────────┘
                                                     │
                                                     ▼
 ┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ STAGE 4: PROCESS SUPERVISOR & DUAL-CHANNEL STREAM PIPELINE                                                         │
 │ • Spawn tiến trình cô lập trong Sandbox Directory (`$DATA/sandboxes/codex-cli/codex-team-01`)                      │
 │ • Quản lý Job Object Win32 / POSIX PGID chống tiến trình mồ côi (Zombie Killer)                                    │
 │ • Pipeline lọc kép: Utf8Decoder ──► DualStageAnsiSanitizer ──► ThinkingDemuxer ──► SseSerializer                    │
 └───────────────────────────────────────────────────┬────────────────────────────────────────────────────────────────┘
                                                     │
                                                     ▼
 [ HTTP/SSE RESPONSE HEADERS & STREAM WIRE TRANSMISSION ]
 HTTP/1.1 200 OK
 Content-Type: text/event-stream
 X-Debug-Route-Type: group
 X-Debug-Route-Group: group:deep-code-prod
 X-Debug-Route-Fallback-Hop: 2
 X-Debug-Route-Priority: 2
 X-Debug-Selected-Target: codex-cli/gpt-5.6-sol
 X-Debug-Effort-Resolved: high
 X-Debug-Effort-Injected-Flags: --reasoning-effort high

 data: {"choices":[{"delta":{"role":"assistant"}}]}
 data: {"choices":[{"delta":{"reasoning_content":"Khởi tạo phân tích thuật toán..."}}]}
 data: {"choices":[{"delta":{"content":"Dưới đây là giải pháp tối ưu..."}}]}
 data: [DONE]
```

### 1.2 Kết quả Vận hành Cốt lõi (Core Measurable Outcomes)
1. **Zero-Drop Rate Limit Failover:** $100\%$ các request gặp lỗi 429 hoặc đầy khe xử lý ở tầng ưu tiên $P_1$ được chuyển tiếp sang tầng ưu tiên kế tiếp $P_2$ trong vòng $\le 1.5\text{ms}$ mà không ngắt kết nối HTTP của client.
2. **Chuẩn hóa Effort $100\%$ tương thích OpenAI:** Client gửi `reasoning_effort: "low" | "medium" | "high" | "xhigh" | "none"` được tự động biên dịch chính xác thành cờ dòng lệnh tương ứng của từng CLI cụ thể.
3. **Phân phối tải theo trọng số xác định (Deterministic Weighted Balancing):** Hỗ trợ Smooth Weighted Round-Robin giúp cân bằng tải mượt mà giữa các model/tài khoản trong cùng một pool, triệt tiêu hiện tượng "thắt nút cổ chai" khi dồn dập request vào một tài khoản duy nhất.
4. **Minh bạch vi mô (Micro-Observability):** Mọi response đều mang metadata định tuyến (Route Hop, Priority Tier, Fallback Reason, Effort Injected Args), giúp lập trình viên kiểm soát chính xác đường đi của request ngay trên UI Cyberdeck Studio.

---

## 2. Constraints (Kỹ thuật, tính tương thích, an toàn)

1. **Ràng buộc về độ trễ Định tuyến (Routing Latency SLA):**
   - Quá trình duyệt cây Group, đánh giá Cooldown, kiểm tra Semaphore slot và tính toán trọng số SWRR phải hoàn thành trong $\le 2.0\text{ms}$ trên máy chủ tiêu chuẩn (Node.js runtime, $V8 \ge 22$).
   - Nghiêm cấm thực hiện các truy vấn SQLite blocking (synchronous file I/O) trên mỗi request completion. Toàn bộ đồ thị định tuyến (Routing Graph) và trạng thái tài khoản phải được nạp và duy trì trong bộ nhớ (In-Memory Hot Cache) với cơ chế Atomic Synchronization khi DB thay đổi.
2. **Bảo toàn Chuẩn Dây OpenAI Wire Protocol (OpenAI Specification Fidelity):**
   - Toàn bộ các định danh Group phải bắt đầu bằng tiền tố quy chuẩn `group:<group-name>` (ví dụ `group:dev-team`) hoặc được liên kết thông qua bảng `model_aliases` để client gọi như model thường (ví dụ `gpt-5-hybrid` trỏ vào `group:dev-team`).
   - Tham số `reasoning_effort` phải tuân thủ schema chuẩn OpenAI: `z.enum(["none", "low", "medium", "high", "xhigh"])`. Nếu client gửi giá trị ngoài dải cho phép, hệ thống tự động chuẩn hóa về `medium` hoặc default effort của Group thay vì crash 500.
3. **An toàn Thực thi & Chống Command Injection (Execution Safety & Shell Hygiene):**
   - Các tham số dòng lệnh sinh ra từ ma trận Effort (`cliArgsJson`) phải được truyền dưới dạng mảng `string[]` rời rạc thông qua API `execFile` / `node-pty` / `spawn`. Tuyệt đối không ghép chuỗi dạng `bash -c "cmd ${flags}"` nhằm loại trừ triệt để nguy cơ Shell Injection.
4. **Tính Toàn vẹn của Đồ thị Định tuyến (Acyclic Routing Integrity):**
   - Khi một Group lồng một Sub-group khác (Nested Group Member), Router bắt buộc phải kiểm tra chu trình (Cycle Detection qua DFS/Tarjan). Nếu phát hiện tham chiếu vòng tròn ($Group_A \to Group_B \to Group_A$), hệ thống phải từ chối ghi nhận cấu hình ngay tại thời điểm compile-time/schema validation với lỗi `CYCLIC_ROUTING_DEPENDENCY`. Độ sâu lồng tối đa không vượt quá 3 tầng ($Depth \le 3$).
5. **Đồng bộ Khe Tài Nguyên Độc Quyền (Atomic Slot Semaphore Guard):**
   - Khi thực hiện Fallback từ $P_1$ sang $P_2$, hệ thống phải đảm bảo việc giải phóng slot tạm thời (nếu có) và chiếm giữ slot mới tại $P_2$ là nguyên tử (Atomic). Không được để xảy ra Race Condition dẫn đến việc vượt quá `max_concurrent_per_account`.

---

## 3. Non-goals (Phạm vi loại trừ rõ ràng)

1. **Không triển khai Giao thức Đồng thuận Phân tán (No Distributed Consensus):**
   - `cli-to-api` là gateway chạy trên một máy trạm/máy chủ đơn lẻ (Single-node Host/Workstation). Hệ thống không hỗ trợ cụm đa máy chủ (Multi-node Cluster) sử dụng Raft, Paxos hoặc Redis Distributed Lock. Bộ nhớ In-memory của tiến trình Gateway là nguồn chân lý thời gian thực (Real-time Source of Truth) cho Account Pool và Cooldown Tracker.
2. **Không can thiệp hoặc tái huấn luyện trọng số mô hình (No Model Weight Mutation):**
   - Gateway đóng vai trò điều phối luồng và chuyển đổi tham số, không thực hiện can thiệp vào trọng số AI, không sửa đổi prompt hệ thống ngoại trừ việc thêm cờ CLI hoặc tiền tố đánh dấu ngữ cảnh suy luận được cấu hình rõ ràng trong Adapter YAML.
3. **Không tự động thu thập giá API trực tiếp từ Internet (No Dynamic Cost Scraping):**
   - Trọng số chi phí (`cost_weight`) và trọng số lưu lượng (`weight`) là các thông số tĩnh được cấu hình thủ công bởi quản trị viên qua UI Cyberdeck hoặc Adapter YAML, không thực hiện scraping tự động từ bảng giá của OpenAI/Anthropic.
4. **Không hỗ trợ Fallback giữa các Turn trong cùng một Sub-Stream:**
   - Một khi request đã chọn được Target hợp lệ và bắt đầu phát ra chunk SSE đầu tiên (`choices[0].delta`), nếu tiến trình CLI bị lỗi giữa chừng (Mid-stream Crash), Gateway sẽ phát ra frame `data: {"error": ...}` và kết thúc luồng. Gateway **không** thực hiện fallback lại từ đầu sang provider khác vì điều này sẽ làm xáo trộn stream của client đã nhận partial tokens.

---

## 4. Acceptance Criteria (Các kịch bản Given/When/Then sắc nét)

### AC-1: Khởi tạo Group Định Tuyến & Trả về Danh mục Chuẩn (`GET /v1/models`)
- **Given:** Cơ sở dữ liệu tồn tại Group `group:deep-code` gồm 2 tầng ưu tiên ($P_1$: `claude-code/sonnet`, $P_2$: `codex-cli/gpt-5.6-sol`).
- **When:** Client gửi yêu cầu HTTP `GET /v1/models` với API Key hợp lệ.
- **Then:**
  1. Response trả về mã `200 OK` với mảng `data` chứa object có `id: "group:deep-code"`, `object: "model"`.
  2. Metadata chứa `meta.is_group: true`, `meta.strategy: "priority_fallback_weighted"`, `meta.priority_levels: 2`, `meta.default_effort: "high"`.
  3. Tất cả các model thành viên (`claude-code/sonnet`, `codex-cli/gpt-5.6-sol`) vẫn xuất hiện đầy đủ trong danh mục với định danh namespace độc lập.

### AC-2: Tự động Fallback khi Tầng Ưu Tiên 1 dính Rate Limit (429 Cooldown Failover)
- **Given:** Group `group:prod-fast` có:
  - Tầng $P_1$: Adapter `claude-code` với Account `claude-acc-1` đang có trạng thái `COOLDOWN` (do dính cờ 429 trước đó, thời gian còn lại 300 giây).
  - Tầng $P_2$: Adapter `codex-cli` với Account `codex-acc-1` đang có trạng thái `READY` và `active_slots: 0`.
- **When:** Client gửi yêu cầu `POST /v1/chat/completions` với body `{"model": "group:prod-fast", "messages": [{"role": "user", "content": "Hello"}]}`.
- **Then:**
  1. Router phát hiện toàn bộ thành viên tại $P_1$ không khả dụng, ghi nhận sự kiện Failover và chuyển tức thì sang $P_2$.
  2. Request được điều phối thành công đến tiến trình `codex-cli` sử dụng Account `codex-acc-1`.
  3. Response trả về HTTP 200 kèm các debug headers:
     - `X-Debug-Route-Fallback-Hop: 2`
     - `X-Debug-Route-Priority: 2`
     - `X-Debug-Selected-Target: codex-cli/gpt-5.6-terra` (hoặc model mặc định của codex).
  4. Client không nhận bất kỳ lỗi 429 nào.

### AC-3: Cân bằng tải theo Trọng số Mượt mà trong Cùng Tầng (Smooth Weighted Pool within Tier)
- **Given:** Tầng $P_1$ của Group `group:balanced` gồm 2 Target:
  - Target A: `codex-cli/gpt-5.6-sol` có `weight: 70`.
  - Target B: `codex-cli/gpt-5.6-terra` có `weight: 30`.
  - Cả 2 target đều có đủ tài khoản ở trạng thái `READY`.
- **When:** Gửi liên tiếp 100 requests đồng thời tới `group:balanced`.
- **Then:**
  1. Thuật toán Smooth Weighted Round Robin (SWRR) phân bổ xấp xỉ $70 \pm 4$ requests vào Target A và $30 \pm 4$ requests vào Target B.
  2. Không xảy ra tình trạng "bùng nổ liên tiếp" (burst clustering) dồn toàn bộ 70 requests vào Target A rồi mới tới Target B, mà các lượt request được xen kẽ nhịp nhàng: `A -> A -> B -> A -> A -> B -> A...`.

### AC-4: Fallback khi Quá tải Khe Thực thi (Saturated Concurrency Failover)
- **Given:** Tầng $P_1$ có duy nhất 1 tài khoản với `max_slots: 1` và `active_slots: 1` (đang bận xử lý request stream dài).
- **And:** Tầng $P_2$ có 1 tài khoản với `max_slots: 2` và `active_slots: 0`.
- **When:** Một request mới gửi đến Group.
- **Then:**
  1. Router kiểm tra thấy $P_1$ không còn slot khả dụng.
  2. Router kích hoạt fallback sang $P_2$, chiếm 1 slot của tài khoản ở $P_2$ và spawn tiến trình CLI thành công.
  3. Khi request hoàn tất, slot của tài khoản $P_2$ được hoàn trả nguyên vẹn về `active_slots: 0`.

### AC-5: Ánh xạ Ma trận Effort từ OpenAI sang Claude Code CLI
- **Given:** Adapter `claude-code` đã cấu hình ma trận `effort_matrix` cho mức `high`:
  - `cli_args: ["--thinking-budget", "16000"]`
  - `env_overrides: {"CLAUDE_EXTENDED_THINKING": "1"}`.
- **When:** Client gửi request OpenAI `POST /v1/chat/completions` với:
  - Body: `{"model": "claude-code/sonnet", "reasoning_effort": "high", "messages": [...]}`.
- **Then:**
  1. Bộ biên dịch `UnifiedEffortMatrix` nhận diện mức `high` cho adapter `claude-code`.
  2. Tiến trình CLI được spawn với tham số chứa chính xác `--thinking-budget 16000`.
  3. Môi trường spawn tiến trình chứa biến `CLAUDE_EXTENDED_THINKING=1`.
  4. Header trả về chứa `X-Debug-Effort-Resolved: high` và `X-Debug-Effort-Injected-Flags: --thinking-budget 16000`.

### AC-6: Ánh xạ Ma trận Effort từ OpenAI sang Codex CLI & OMP CLI
- **Given:** Client gửi request với `reasoning_effort: "none"`.
- **When:** Định tuyến tới `codex-cli` (vốn có cấu hình ánh xạ `none` là `["--reasoning-effort", "none"]` hoặc cờ tắt CoT).
- **Then:**
  1. Tiến trình Codex CLI được spawn với cờ `--reasoning-effort none`.
  2. Luồng SSE không phát ra bất kỳ token nào trong `reasoning_content`, chỉ phát nội dung vào `delta.content`.
- **Given:** Client gửi request với `reasoning_effort: "xhigh"` tới Group và được định tuyến tới `omp-cli`.
- **When:** Ma trận của `omp-cli` ánh xạ `xhigh` thành `["--thought-level", "5"]`.
- **Then:**
  1. Tiến trình OMP CLI được spawn với cờ `--thought-level 5`.

### AC-7: Bảo toàn Tính Bền vững Phiên làm việc (Sticky Session Priority Preservation)
- **Given:** Một cuộc hội thoại đang hoạt động với `conversation_id: "conv-xyz"` gắn chặt với Account `claude-acc-1` tại tầng $P_1$.
- **When:** Client gửi lượt chat tiếp theo kèm header `x-conversation-id: conv-xyz`.
- **Then:**
  1. Router ưu tiên định tuyến thẳng vào Account `claude-acc-1` để tái sử dụng CLI Session ID trên đĩa (Resume Session).
  2. Nếu Account `claude-acc-1` bị rơi vào Cooldown giữa chừng, Router sẽ bẻ gãy tính sticky một cách an toàn, ghi nhận cảnh báo trong log và thực hiện fallback sang $P_2$ với prompt đã được flatten toàn bộ lịch sử (Cold Prompt Re-hydration).

### AC-8: Trải nghiệm Cyberdeck Studio trên UI (Catalog & Playground Verification)
- **Given:** Người dùng mở giao diện `PlaygroundView.tsx` trong trình duyệt.
- **When:** Chọn model thuộc loại Group (ví dụ `group:deep-code-prod`):
  1. UI hiển thị thanh điều khiển **Reasoning Effort Selector** với 5 huy hiệu Neon tương tác: `[NONE] [LOW] [MED] [HIGH] [X-HIGH]`.
  2. Sau khi bấm Gửi, thẻ **Route Trace Inspector** bung mở, hiển thị sơ đồ đường đi: `Group -> Priority 1 (Claude 429) -> Fallback (0.8ms) -> Priority 2 (Codex chosen, weight 70%)`.
  3. Hiển thị chính xác dòng lệnh thực thi đã được chèn cờ Effort: `codex exec --model gpt-5.6-sol --reasoning-effort high -`.

---

## 5. Bảng so sánh các hướng tiếp cận & Trade-offs

| Tiêu Chí Đánh Giá | Hướng Tiếp Cận 0: Flat Auto-Tiers (Hiện trạng hệ thống) | Hướng Tiếp Cận A: Static Hardcoded Fallback Array | Hướng Tiếp Cận B: Dynamic Scripting Policy (Lua/JS DSL) | Hướng Tiếp Cận 1: Hierarchical Group Routing & Unified Effort Matrix (Candidate 1) |
| :--- | :--- | :--- | :--- | :--- |
| **Mô hình Phân cấp & Nhóm** | Phẳng hoàn toàn (`auto-*`), cứng nhắc, không tạo được nhóm theo nghiệp vụ. | Danh sách tuyến tính tĩnh ($A \to B \to C$), không hỗ trợ lồng nhóm (Nested Groups). | Cực kỳ linh hoạt, viết mã logic điều kiện bằng script động. | **Mô hình Cây DAG Đa Tầng**: Hỗ trợ Group, Sub-group, phân chia tầng ưu tiên rõ ràng. |
| **Cơ chế Điều phối trong Tầng (Intra-tier Balancing)** | Least-Connections đơn giản kèm độ trễ ngẫu nhiên. | Tuyến tính lần lượt (Linear Scan), dễ làm nghẽn tài khoản đầu danh sách. | Tùy thuộc người viết script, dễ phát sinh lỗi logic không đồng nhất. | **Smooth Weighted Round Robin (SWRR)** kết hợp Least-Active-Connections cực kỳ mượt mà. |
| **Chiến lược Fallback khi 429 / Full Concurrency** | **Thất bại ngay lập tức**: Trả về 429 cho client, không có fallback. | Quét tuyến tính đơn giản, không kiểm tra trước trạng thái Cooldown cache. | Có thể viết được, nhưng tốn chi phí diễn giải mã script trên từng request. | **Zero-Drop Failover Tức Thì**: Kiểm tra Hot-Cache In-memory, chuyển tầng trong $\le 1.5\text{ms}$. |
| **Chuẩn hóa Reasoning Effort** | **Bỏ qua hoàn toàn**: Mất trắng tham số `reasoning_effort` của OpenAI. | Hardcode thủ công trong code TypeScript cho từng CLI đã biết. | Phải viết rule biến đổi cho từng request, khó bảo trì. | **Unified Effort Matrix Chuẩn Hóa**: Ma trận 5 bậc cấu hình qua Schema & Adapter YAML, tự động inject. |
| **Độ trễ Xử lý Định tuyến (Routing Overhead)** | $\le 0.5\text{ms}$ | $\le 0.8\text{ms}$ | Cao ($5.0\text{ms} - 25.0\text{ms}$) do overhead khởi tạo sandbox VM của Lua/V8. | **Siêu Tốc ($\le 1.5\text{ms}$)** nhờ cấu trúc dữ liệu mảng In-memory biên dịch sẵn. |
| **An toàn & Chống Vòng lặp (Safety & Loop Guard)** | An toàn (do quá đơn giản). | Dễ xung đột cấu hình nếu có tham chiếu chéo. | Rất nguy hiểm: Nguy cơ infinite loop, rò rỉ bộ nhớ từ script người dùng. | **Tuyệt Đối An Toàn**: Kiểm tra chu trình đồ thị (Cycle Detection) ngay khi lưu schema. |
| **Trực quan hóa & Khả năng Vận hành UI** | Sơ sài: Chỉ liệt kê bảng model tĩnh, không chỉnh sửa được nhóm. | Kém: Phải sửa file cấu hình tĩnh trên ổ đĩa, cần khởi động lại gateway. | Rất phức tạp cho người dùng cuối (phải viết mã script). | **Cyberdeck Studio Đỉnh Cao**: Trực quan hóa Node/Tree, Weight Sliders, Route Trace Inspector thời gian thực. |

### Phân tích Trade-offs của Candidate 1:
- **Ưu điểm vượt trội:**
  1. Giải quyết triệt để vấn đề mất kết nối khi gặp 429, tăng Uptime thực tế của Gateway lên tiệm cận $99.9\%$.
  2. Chuẩn hóa giao thức OpenAI với toàn bộ hệ sinh thái CLI AI, khai phóng toàn diện tính năng Chain-of-Thought / Extended Thinking Mode.
  3. Cấu trúc dữ liệu có khả năng mở rộng cao (Scalable), tương thích hoàn hảo với hệ thống Adapter YAML hiện hữu mà không làm vỡ các cấu trúc đã có.
- **Thách thức & Biện pháp giảm thiểu:**
  - *Thách thức:* Duy trì tính đồng bộ giữa In-Memory Routing Table và cơ sở dữ liệu SQLite khi có nhiều cập nhật từ Web UI.
  - *Biện pháp:* Áp dụng mẫu kiến trúc **Read-Heavy In-Memory Registry with Event Invalidation**. Router đọc $100\%$ từ RAM; mọi thao tác ghi trên SQLite sẽ phát tín hiệu qua Event Bus nội bộ để re-compile đồ thị định tuyến tức thì.

---

## 6. Đặc tả kỹ thuật chi tiết (Detailed Technical Specifications)

### 6.1 Subsystem 1: Schema SQLite Drizzle (`apps/gateway/src/db/schema.ts`)

Bổ sung các bảng `routing_groups`, `routing_group_members` và mở rộng bảng `adapters` để hỗ trợ Ma trận Effort.

```typescript
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { adapters } from "./schema.js";

// 1. Phân loại mức độ suy luận chuẩn hóa (Unified Effort Level)
export const effortLevelEnum = ["none", "low", "medium", "high", "xhigh"] as const;
export type EffortLevel = (typeof effortLevelEnum)[number];

// 2. Bảng Nhóm Định Tuyến (Routing Groups)
export const routingGroups = sqliteTable("routing_groups", {
  id: text("id").primaryKey(), // Định dạng: "group:deep-code-prod" hoặc "group:fast-chat"
  name: text("name").notNull(),
  description: text("description"),
  strategy: text("strategy", { 
    enum: ["priority_fallback_weighted", "least_latency_fallback", "round_robin"] 
  }).notNull().default("priority_fallback_weighted"),
  defaultEffort: text("default_effort", { enum: ["none", "low", "medium", "high", "xhigh"] })
    .notNull()
    .default("medium"),
  fallbackTimeoutMs: integer("fallback_timeout_ms").notNull().default(3000),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer("updated_at").default(sql`(strftime('%s', 'now'))`),
});

// 3. Bảng Thành Viên Nhóm Định Tuyến (Routing Group Members)
export const routingGroupMembers = sqliteTable("routing_group_members", {
  id: text("id").primaryKey(), // UUID v4
  groupId: text("group_id")
    .notNull()
    .references(() => routingGroups.id, { onDelete: "cascade" }),
  priority: integer("priority").notNull().default(1), // 1 = Ưu tiên cao nhất, 2 = Thứ cấp, 3 = Dự phòng khẩn cấp
  weight: integer("weight").notNull().default(100), // Trọng số từ 1 đến 100 trong cùng priority level
  targetType: text("target_type", { 
    enum: ["adapter_model", "adapter_default", "nested_group"] 
  }).notNull().default("adapter_model"),
  targetAdapterId: text("target_adapter_id")
    .references(() => adapters.id, { onDelete: "cascade" }),
  targetModelId: text("target_model_id"), // Model cụ thể trong adapter, e.g. "gpt-5.6-sol" hoặc "sonnet"
  targetGroupId: text("target_group_id"), // Nếu targetType là "nested_group", trỏ đến routingGroups.id
  pinnedAccountId: text("pinned_account_id"), // Cho phép ghim cứng tài khoản nếu cần, null = tự động cân bằng
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});

// 4. Bảng Ma Trận Ánh Xạ Effort Của Adapter (Adapter Effort Profiles)
export const adapterEffortProfiles = sqliteTable("adapter_effort_profiles", {
  id: text("id").primaryKey(), // UUID v4
  adapterId: text("adapter_id")
    .notNull()
    .references(() => adapters.id, { onDelete: "cascade" }),
  effortLevel: text("effort_level", { enum: ["none", "low", "medium", "high", "xhigh"] }).notNull(),
  cliArgsJson: text("cli_args_json").notNull().default("[]"), // e.g. '["--thinking-budget", "16000"]'
  envOverridesJson: text("env_overrides_json").notNull().default("{}"), // e.g. '{"CLAUDE_THINKING": "1"}'
  promptPrefix: text("prompt_prefix"), // Tiền tố bổ sung vào prompt nếu CLI không có cờ (e.g. "<thinking_mode>")
  promptSuffix: text("prompt_suffix"),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});
```

---

### 6.2 Subsystem 2: Bộ máy Định tuyến & Phân phối Tải (Hierarchical Group Router & Load Balancer Engine)

Đặc tả thuật toán cốt lõi `HierarchicalGroupRouter` tích hợp **Smooth Weighted Round-Robin (SWRR)** và duyệt chuỗi **Priority Fallback Chain**.

```typescript
// apps/gateway/src/router/hierarchical-router.ts

import { db } from "../db/index.js";
import { routingGroups, routingGroupMembers, adapterEffortProfiles, accounts } from "../db/schema.js";
import { eq, and, asc } from "drizzle-orm";
import { globalAccountPool } from "./account-pool.js";
import { globalCooldownTracker } from "./cooldown-tracker.js";
import { globalModelCatalog } from "./model-catalog.js";
import { AdapterConfig } from "../adapters/schema.js";

export interface CompiledGroupTarget {
  memberId: string;
  priority: number;
  weight: number;
  currentWeight: number; // Dùng cho thuật toán SWRR
  targetType: "adapter_model" | "adapter_default" | "nested_group";
  adapterId: string;
  modelId: string;
  targetGroupId?: string;
  pinnedAccountId?: string;
}

export interface CompiledRoutingGroup {
  id: string;
  name: string;
  defaultEffort: "none" | "low" | "medium" | "high" | "xhigh";
  fallbackTimeoutMs: number;
  priorityLevels: Map<number, CompiledGroupTarget[]>; // Key: Priority (1, 2, 3...)
}

export interface RoutingDecision {
  targetAdapter: AdapterConfig;
  targetAccount: {
    id: string;
    sandboxDir: string;
  };
  actualModelId: string;
  resolvedEffort: "none" | "low" | "medium" | "high" | "xhigh";
  effortCliArgs: string[];
  effortEnvOverrides: Record<string, string>;
  debugTrace: {
    groupId?: string;
    priorityLevel: number;
    fallbackHops: number;
    consideredTargets: string[];
    rejectionReasons: Record<string, string>;
  };
}

export class HierarchicalGroupRouter {
  private groupCache: Map<string, CompiledRoutingGroup> = new Map();
  private isCompiling: boolean = false;

  constructor() {
    this.refreshGraph();
  }

  public async refreshGraph(): Promise<void> {
    if (this.isCompiling) return;
    this.isCompiling = true;
    try {
      const groups = await db.select().from(routingGroups).where(eq(routingGroups.isActive, true));
      const members = await db.select().from(routingGroupMembers).where(eq(routingGroupMembers.isEnabled, true));

      const newCache = new Map<string, CompiledRoutingGroup>();

      for (const group of groups) {
        const groupMembers = members.filter((m) => m.groupId === group.id);
        const priorityMap = new Map<number, CompiledGroupTarget[]>();

        for (const m of groupMembers) {
          const list = priorityMap.get(m.priority) || [];
          list.push({
            memberId: m.id,
            priority: m.priority,
            weight: Math.max(1, m.weight),
            currentWeight: 0,
            targetType: m.targetType as any,
            adapterId: m.targetAdapterId || "",
            modelId: m.targetModelId || "",
            targetGroupId: m.targetGroupId || undefined,
            pinnedAccountId: m.pinnedAccountId || undefined,
          });
          priorityMap.set(m.priority, list);
        }

        newCache.set(group.id, {
          id: group.id,
          name: group.name,
          defaultEffort: group.defaultEffort as any,
          fallbackTimeoutMs: group.fallbackTimeoutMs,
          priorityLevels: priorityMap,
        });
      }

      this.detectCycles(newCache);
      this.groupCache = newCache;
    } finally {
      this.isCompiling = false;
    }
  }

  private detectCycles(cache: Map<string, CompiledRoutingGroup>): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (groupId: string, path: string[]) => {
      visited.add(groupId);
      recursionStack.add(groupId);

      const group = cache.get(groupId);
      if (group) {
        for (const targets of group.priorityLevels.values()) {
          for (const target of targets) {
            if (target.targetType === "nested_group" && target.targetGroupId) {
              if (!visited.has(target.targetGroupId)) {
                dfs(target.targetGroupId, [...path, target.targetGroupId]);
              } else if (recursionStack.has(target.targetGroupId)) {
                throw new Error(`CYCLIC_ROUTING_DEPENDENCY: Vòng lặp định tuyến phát hiện tại [${[...path, target.targetGroupId].join(" -> ")}]`);
              }
            }
          }
        }
      }
      recursionStack.delete(groupId);
    };

    for (const groupId of cache.keys()) {
      if (!visited.has(groupId)) {
        dfs(groupId, [groupId]);
      }
    }
  }

  public async resolve(
    requestedModel: string,
    clientEffort?: string,
    pinnedAccountId?: string
  ): Promise<RoutingDecision> {
    const isGroup = requestedModel.startsWith("group:") || this.groupCache.has(requestedModel);

    if (!isGroup) {
      throw new Error(`NOT_A_GROUP: Model '${requestedModel}' không phải là Routing Group.`);
    }

    const group = this.groupCache.get(requestedModel);
    if (!group) {
      throw new Error(`404: Routing Group '${requestedModel}' không tồn tại hoặc đã bị vô hiệu hóa.`);
    }

    const effectiveEffort = (clientEffort || group.defaultEffort || "medium") as any;
    const sortedPriorities = Array.from(group.priorityLevels.keys()).sort((a, b) => a - b);

    let hops = 0;
    const consideredTargets: string[] = [];
    const rejectionReasons: Record<string, string> = {};

    // Duyệt qua từng tầng ưu tiên trong Priority Fallback Chain
    for (const priority of sortedPriorities) {
      hops++;
      const targets = group.priorityLevels.get(priority) || [];
      if (targets.length === 0) continue;

      // Chọn target trong cùng Priority theo Smooth Weighted Round-Robin
      const candidateTarget = this.selectSmoothWeightedTarget(targets, consideredTargets, rejectionReasons);

      if (candidateTarget) {
        // Kiểm tra khả năng cung cấp tài khoản (Healthy Account Check)
        const accountResult = await this.evaluateTargetAccounts(candidateTarget, pinnedAccountId, rejectionReasons);

        if (accountResult) {
          // Lấy cấu hình Adapter và Ma trận Effort
          const loadedAdapter = globalModelCatalog.getAdapter(candidateTarget.adapterId);
          if (!loadedAdapter) {
            rejectionReasons[candidateTarget.adapterId] = "Adapter not loaded or binary not found";
            continue;
          }

          const effortConfig = await this.resolveEffortConfig(candidateTarget.adapterId, effectiveEffort);

          return {
            targetAdapter: loadedAdapter.config,
            targetAccount: accountResult,
            actualModelId: candidateTarget.modelId || loadedAdapter.config.models[0]?.id || "default",
            resolvedEffort: effectiveEffort,
            effortCliArgs: effortConfig.cliArgs,
            effortEnvOverrides: effortConfig.envOverrides,
            debugTrace: {
              groupId: group.id,
              priorityLevel: priority,
              fallbackHops: hops,
              consideredTargets,
              rejectionReasons,
            },
          };
        }
      }
      // Nếu toàn bộ targets ở tầng priority này đều bão hòa, vòng lặp tự động bước sang Priority kế tiếp
    }

    throw new Error(
      `429: Toàn bộ các tầng ưu tiên trong Group '${requestedModel}' đã bão hòa (Active slots full hoặc Cooldown). Chi tiết từ chối: ${JSON.stringify(rejectionReasons)}`
    );
  }

  // Thuật toán NGINX Smooth Weighted Round-Robin (SWRR)
  private selectSmoothWeightedTarget(
    targets: CompiledGroupTarget[],
    considered: string[],
    rejections: Record<string, string>
  ): CompiledGroupTarget | null {
    if (targets.length === 0) return null;
    if (targets.length === 1) {
      considered.push(`${targets[0].adapterId}/${targets[0].modelId}`);
      return targets[0];
    }

    let totalWeight = 0;
    let bestTarget: CompiledGroupTarget | null = null;

    for (const target of targets) {
      totalWeight += target.weight;
      target.currentWeight += target.weight;

      if (!bestTarget || target.currentWeight > bestTarget.currentWeight) {
        bestTarget = target;
      }
    }

    if (bestTarget) {
      bestTarget.currentWeight -= totalWeight;
      considered.push(`${bestTarget.adapterId}/${bestTarget.modelId}`);
    }

    return bestTarget;
  }

  private async evaluateTargetAccounts(
    target: CompiledGroupTarget,
    pinnedAccountId: string | undefined,
    rejections: Record<string, string>
  ): Promise<{ id: string; sandboxDir: string } | null> {
    const now = Math.floor(Date.now() / 1000);
    const targetKey = `${target.adapterId}/${target.modelId}`;

    // Lấy danh sách tài khoản liên kết với Adapter
    const targetAccounts = await db
      .select()
      .from(accounts)
      .where(eq(accounts.adapterId, target.adapterId));

    if (targetAccounts.length === 0) {
      rejections[targetKey] = "Không có tài khoản nào được tạo cho adapter này";
      return null;
    }

    // Lọc tài khoản khỏe mạnh
    const available = targetAccounts.filter((acc) => {
      if (pinnedAccountId && acc.id !== pinnedAccountId) return false;
      if (target.pinnedAccountId && acc.id !== target.pinnedAccountId) return false;
      if (acc.status === "ERROR") return false;
      if (acc.cooldownUntil && acc.cooldownUntil > now) {
        rejections[`${targetKey}:${acc.id}`] = `Tài khoản đang Cooldown (còn ${acc.cooldownUntil - now}s)`;
        return false;
      }
      const activeSlots = globalAccountPool.getActiveSlots(acc.id);
      if (activeSlots >= acc.maxSlots) {
        rejections[`${targetKey}:${acc.id}`] = `Tài khoản đầy khe xử lý (${activeSlots}/${acc.maxSlots})`;
        return false;
      }
      return true;
    });

    if (available.length === 0) {
      return null;
    }

    // Ưu tiên tài khoản có ít active slots nhất, tie-breaker bằng latency trung bình
    available.sort((a, b) => {
      const slotsA = globalAccountPool.getActiveSlots(a.id);
      const slotsB = globalAccountPool.getActiveSlots(b.id);
      if (slotsA !== slotsB) return slotsA - slotsB;
      return a.avgLatencyMs - b.avgLatencyMs;
    });

    return {
      id: available[0].id,
      sandboxDir: available[0].sandboxDir,
    };
  }

  private async resolveEffortConfig(
    adapterId: string,
    effort: EffortLevel
  ): Promise<{ cliArgs: string[]; envOverrides: Record<string, string> }> {
    const profile = await db
      .select()
      .from(adapterEffortProfiles)
      .where(and(eq(adapterEffortProfiles.adapterId, adapterId), eq(adapterEffortProfiles.effortLevel, effort)))
      .get();

    if (!profile) {
      // Fallback mặc định theo quy ước hệ thống
      return { cliArgs: [], envOverrides: {} };
    }

    try {
      return {
        cliArgs: JSON.parse(profile.cliArgsJson || "[]"),
        envOverrides: JSON.parse(profile.envOverridesJson || "{}"),
      };
    } catch {
      return { cliArgs: [], envOverrides: {} };
    }
  }
}

export const globalHierarchicalRouter = new HierarchicalGroupRouter();
```

---

### 6.3 Subsystem 3: Ma trận Effort & Tích hợp Prompt-Transport

#### A. Mở rộng Adapter YAML Schema (`apps/gateway/src/adapters/schema.ts`)
Bổ sung khai báo `effort_matrix` vào file cấu hình Adapter YAML:

```yaml
# Trích xuất cấu hình adapters/claude-code.yaml với Unified Effort Matrix
id: "claude-code"
name: "Anthropic Claude Code CLI"
executable: "claude"
execution_mode: "pipe"

effort_matrix:
  none:
    cli_args: ["--thinking-budget", "0"]
    env_overrides: { "MAX_THINKING_TOKENS": "0" }
  low:
    cli_args: ["--thinking-budget", "1024"]
    env_overrides: { "MAX_THINKING_TOKENS": "1024" }
  medium:
    cli_args: ["--thinking-budget", "4096"]
    env_overrides: { "MAX_THINKING_TOKENS": "4096" }
  high:
    cli_args: ["--thinking-budget", "16000"]
    env_overrides: { "MAX_THINKING_TOKENS": "16000" }
  xhigh:
    cli_args: ["--thinking-budget", "32000"]
    env_overrides: { "MAX_THINKING_TOKENS": "32000" }

invocation:
  args_template:
    - "--print"
    - "--dangerously-skip-permissions"
    - "--model"
    - "{model}"
    - "{effort_args}"
    - "{prompt}"
```

```yaml
# Trích xuất cấu hình adapters/codex-cli.yaml với Unified Effort Matrix
id: "codex-cli"
name: "OpenAI Codex CLI"
executable: "codex"
execution_mode: "pipe"

effort_matrix:
  none:
    cli_args: ["--reasoning-effort", "none"]
  low:
    cli_args: ["--reasoning-effort", "low"]
  medium:
    cli_args: ["--reasoning-effort", "medium"]
  high:
    cli_args: ["--reasoning-effort", "high"]
  xhigh:
    cli_args: ["--reasoning-effort", "xhigh"]

invocation:
  args_template:
    - "exec"
    - "--model"
    - "{model}"
    - "{effort_args}"
    - "--skip-git-repo-check"
    - "-"
  prompt_transport: "stdin"
```

```yaml
# Trích xuất cấu hình adapters/omp-cli.yaml với Unified Effort Matrix
id: "omp-cli"
name: "OMP Reasoning Engine CLI"
executable: "omp"
execution_mode: "pipe"

effort_matrix:
  none:
    cli_args: ["--thought-level", "0"]
  low:
    cli_args: ["--thought-level", "1"]
  medium:
    cli_args: ["--thought-level", "2"]
  high:
    cli_args: ["--thought-level", "4"]
  xhigh:
    cli_args: ["--thought-level", "5"]

invocation:
  args_template:
    - "query"
    - "--model"
    - "{model}"
    - "{effort_args}"
    - "{prompt}"
```

#### B. Cơ chế biên dịch Placeholder `{effort_args}` trong `prompt-transport.ts`

```typescript
// apps/gateway/src/supervisor/prompt-transport.ts (Bổ sung xử lý effortArgs)

export interface PreparedInvocation {
  finalArgs: string[];
  stdinContent?: string;
  cleanupHook?: () => Promise<void>;
  isTempFile: boolean;
}

export async function preparePromptTransport(params: {
  argsTemplate: string[];
  argsTemplateFile?: string[];
  prompt: string;
  model: string;
  accountDir: string;
  preferredTransport: "argv" | "stdin" | "temp_file" | "auto";
  promptThresholdChars?: number;
  sessionId?: string;
  effortArgs?: string[]; // Mảng cờ được sinh từ Unified Effort Matrix
}): Promise<PreparedInvocation> {
  const {
    argsTemplate,
    argsTemplateFile,
    prompt,
    model,
    accountDir,
    preferredTransport,
    promptThresholdChars = 4000,
    sessionId,
    effortArgs = [],
  } = params;

  // Bước 1: Mở rộng mảng argsTemplate, thay thế token {effort_args} bằng các phần tử rời rạc
  const expandedTemplate: string[] = [];
  for (const token of argsTemplate) {
    if (token === "{effort_args}") {
      expandedTemplate.push(...effortArgs);
    } else {
      expandedTemplate.push(token);
    }
  }

  // Bước 2: Tiếp tục xử lý cơ chế argv / temp_file / stdin
  const rawArgvLength = expandedTemplate.reduce((acc, arg) => acc + arg.length, 0) + prompt.length;
  let mode = preferredTransport;
  if (mode === "auto") {
    mode = rawArgvLength > promptThresholdChars ? "temp_file" : "argv";
  }

  if (mode === "temp_file") {
    // ... ghi file tạm an toàn
    const templateToUse = argsTemplateFile && argsTemplateFile.length > 0 ? argsTemplateFile : expandedTemplate;
    const finalArgs = templateToUse.flatMap((arg) => {
      if (arg === "{effort_args}") return effortArgs;
      return [
        arg
          .replace(/{model}/g, model)
          .replace(/{prompt}/g, tempFilePath)
          .replace(/{prompt_file}/g, tempFilePath)
          .replace(/{session_id}/g, sessionId || ""),
      ];
    });

    return { finalArgs, cleanupHook, isTempFile: true };
  }

  if (mode === "stdin") {
    const finalArgs = expandedTemplate
      .filter((arg) => arg !== "{prompt}" && arg !== "{prompt_file}")
      .map((arg) => arg.replace(/{model}/g, model).replace(/{session_id}/g, sessionId || ""));

    return { finalArgs, stdinContent: prompt, isTempFile: false };
  }

  // Standard argv substitution
  const finalArgs = expandedTemplate.map((arg) => {
    return arg
      .replace(/{model}/g, model)
      .replace(/{prompt}/g, prompt)
      .replace(/{session_id}/g, sessionId || "");
  });

  return { finalArgs, isTempFile: false };
}
```

---

### 6.4 Subsystem 4: Thiết kế UI/UX Cyberdeck Studio

#### A. Thiết kế `ModelCatalogView.tsx` (Group Routing & Effort Matrix Studio)

Giao diện nâng cấp theo ngôn ngữ **Obsidian Dark Cyber-Developer**:
1. **Hierarchical Group Explorer:** Hiển thị cây phân cấp từng Group, danh sách tầng Priority ($P_1, P_2, P_3$), thanh trượt Weight Slider thời gian thực cho từng member.
2. **Unified Effort Matrix Inspector Modal:** Bảng ma trận trực quan so sánh 5 cấp độ (`none`, `low`, `medium`, `high`, `xhigh`) trên tất cả các Adapter hiện có.
3. **Dry-Run Route Simulator:** Cho phép người dùng chọn Group + giả lập tình huống (ví dụ: "Đánh dấu Claude 429"), bấm nút "Simulate Dispatch" để xem router nhảy sang Priority nào với cờ Effort nào được sinh ra.

```tsx
// Trích xuất cấu trúc giao diện ModelCatalogView.tsx nâng cấp
import React, { useState } from "react";
import { GitBranch, Layers, Sliders, ShieldCheck, Zap, AlertTriangle, Play } from "lucide-react";

export function ModelCatalogView() {
  const [activeTab, setActiveTab] = useState<"catalog" | "groups" | "matrix">("groups");

  return (
    <div className="p-8 space-y-8 overflow-y-auto h-full bg-[#0E121B] text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-borderSubtle pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Layers className="w-6 h-6 text-brand" />
            Model Catalog & Hierarchical Routing Studio
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Quản lý cây định tuyến đa tầng, Fallback Chains, Weighted Pools và Ma trận suy luận Unified Effort.
          </p>
        </div>
        <div className="flex gap-2 bg-surface p-1 rounded-xl border border-borderSubtle">
          <button
            onClick={() => setActiveTab("groups")}
            className={`px-4 py-1.5 rounded-lg text-xs font-mono font-medium transition ${
              activeTab === "groups" ? "bg-brand text-white shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            Routing Groups
          </button>
          <button
            onClick={() => setActiveTab("matrix")}
            className={`px-4 py-1.5 rounded-lg text-xs font-mono font-medium transition ${
              activeTab === "matrix" ? "bg-brand text-white shadow" : "text-slate-400 hover:text-white"
            }`}
          >
            Unified Effort Matrix
          </button>
        </div>
      </div>

      {activeTab === "groups" && (
        <div className="space-y-6">
          {/* Card Nhóm Mẫu: group:deep-code-prod */}
          <div className="p-6 rounded-xl bg-surface border border-borderSubtle space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded bg-brand/10 border border-brand/30 text-brand font-mono text-xs font-bold">
                  GROUP
                </span>
                <h2 className="text-lg font-bold font-mono text-white">group:deep-code-prod</h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-400">Default Effort:</span>
                <span className="px-2 py-0.5 rounded text-xs font-mono bg-purple-950/60 text-purple-300 border border-purple-800/50 font-bold">
                  HIGH
                </span>
              </div>
            </div>

            {/* Chuỗi Fallback Chain */}
            <div className="space-y-4">
              {/* Priority 1 */}
              <div className="p-4 rounded-lg bg-[#141923] border border-blue-900/30 space-y-3">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-blue-400">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px]">
                      P1
                    </span>
                    <span>PRIORITY LEVEL 1 (Primary Target)</span>
                  </div>
                  <span className="text-slate-400">Pool Weight: 100%</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded bg-surface border border-borderSubtle text-xs font-mono">
                  <div>
                    <div className="font-bold text-white">claude-code / claude-3-7-sonnet</div>
                    <div className="text-slate-500 text-[11px]">Accounts: 2 ready | Max slots: 2</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-emerald-400 text-[11px] flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Healthy
                    </span>
                  </div>
                </div>
              </div>

              {/* Priority 2 - Weighted Pool */}
              <div className="p-4 rounded-lg bg-[#141923] border border-purple-900/30 space-y-3">
                <div className="flex items-center justify-between text-xs font-mono font-bold text-purple-400">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-[10px]">
                      P2
                    </span>
                    <span>PRIORITY LEVEL 2 (Smooth Weighted Failover Pool)</span>
                  </div>
                  <span className="text-slate-400">Trigger: On P1 429 Cooldown or Full</span>
                </div>

                {/* Member 1 trong P2 */}
                <div className="flex items-center justify-between p-3 rounded bg-surface border border-borderSubtle text-xs font-mono">
                  <div className="space-y-1">
                    <div className="font-bold text-white">codex-cli / gpt-5.6-sol</div>
                    <div className="text-slate-500 text-[11px]">Accounts: 3 ready | SWRR Target</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-bold text-purple-300">Weight: 70%</span>
                    <input type="range" min="1" max="100" defaultValue="70" className="w-24 accent-purple-500" />
                  </div>
                </div>

                {/* Member 2 trong P2 */}
                <div className="flex items-center justify-between p-3 rounded bg-surface border border-borderSubtle text-xs font-mono">
                  <div className="space-y-1">
                    <div className="font-bold text-white">codex-cli / gpt-5.6-terra</div>
                    <div className="text-slate-500 text-[11px]">Accounts: 1 ready | Latency: 450ms</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-bold text-purple-300">Weight: 30%</span>
                    <input type="range" min="1" max="100" defaultValue="30" className="w-24 accent-purple-500" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "matrix" && (
        <div className="rounded-xl border border-borderSubtle bg-surface overflow-hidden">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#181C26] text-slate-400 border-b border-borderSubtle">
              <tr>
                <th className="px-5 py-3 font-medium">Adapter</th>
                <th className="px-5 py-3 font-medium">None</th>
                <th className="px-5 py-3 font-medium">Low</th>
                <th className="px-5 py-3 font-medium">Medium</th>
                <th className="px-5 py-3 font-medium">High</th>
                <th className="px-5 py-3 font-medium">X-High</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderSubtle/50 text-slate-300">
              <tr>
                <td className="px-5 py-4 font-bold text-white">claude-code</td>
                <td className="px-5 py-4 font-mono text-slate-500">--thinking-budget 0</td>
                <td className="px-5 py-4 font-mono text-cyan-400">--thinking-budget 1024</td>
                <td className="px-5 py-4 font-mono text-blue-400">--thinking-budget 4096</td>
                <td className="px-5 py-4 font-mono text-purple-400">--thinking-budget 16000</td>
                <td className="px-5 py-4 font-mono text-pink-400">--thinking-budget 32000</td>
              </tr>
              <tr>
                <td className="px-5 py-4 font-bold text-white">codex-cli</td>
                <td className="px-5 py-4 font-mono text-slate-500">--reasoning-effort none</td>
                <td className="px-5 py-4 font-mono text-cyan-400">--reasoning-effort low</td>
                <td className="px-5 py-4 font-mono text-blue-400">--reasoning-effort medium</td>
                <td className="px-5 py-4 font-mono text-purple-400">--reasoning-effort high</td>
                <td className="px-5 py-4 font-mono text-pink-400">--reasoning-effort xhigh</td>
              </tr>
              <tr>
                <td className="px-5 py-4 font-bold text-white">omp-cli</td>
                <td className="px-5 py-4 font-mono text-slate-500">--thought-level 0</td>
                <td className="px-5 py-4 font-mono text-cyan-400">--thought-level 1</td>
                <td className="px-5 py-4 font-mono text-blue-400">--thought-level 2</td>
                <td className="px-5 py-4 font-mono text-purple-400">--thought-level 4</td>
                <td className="px-5 py-4 font-mono text-pink-400">--thought-level 5</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

---

#### B. Thiết kế `PlaygroundView.tsx` (Route Trace Inspector & Live Effort Selector)

Nâng cấp `PlaygroundView.tsx` hỗ trợ kiểm thử tính năng định tuyến Group và Effort chuyên sâu:

```tsx
// apps/web/src/views/PlaygroundView.tsx (Trích đoạn nâng cấp chính)

import React, { useState } from "react";
import { Send, Zap, Brain, ChevronDown, ChevronRight, Activity, GitCommit, CornerDownRight } from "lucide-react";

export function PlaygroundView() {
  const [selectedModel, setSelectedModel] = useState("group:deep-code-prod");
  const [reasoningEffort, setReasoningEffort] = useState<"none" | "low" | "medium" | "high" | "xhigh">("high");
  const [routeTrace, setRouteTrace] = useState<{
    group: string;
    priority: number;
    fallbackHops: number;
    target: string;
    injectedFlags: string;
  } | null>(null);

  // Giao diện chọn Effort Pills (Cyberdeck Neon Style)
  const renderEffortSelector = () => (
    <div className="flex items-center gap-2">
      <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
        <Brain className="w-3.5 h-3.5 text-purple-400" /> Effort:
      </span>
      <div className="flex rounded-lg bg-surface border border-borderSubtle p-0.5">
        {(["none", "low", "medium", "high", "xhigh"] as const).map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setReasoningEffort(level)}
            className={`px-2.5 py-1 text-[11px] font-mono font-bold rounded uppercase transition ${
              reasoningEffort === level
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  );

  // Giao diện Route Trace Inspector Card (Hiển thị sau khi request hoàn tất)
  const renderRouteTraceCard = () => {
    if (!routeTrace) return null;
    return (
      <div className="p-4 rounded-xl bg-[#121622] border border-borderSubtle space-y-2 font-mono text-xs">
        <div className="flex items-center justify-between text-slate-400 border-b border-borderSubtle/50 pb-2">
          <span className="flex items-center gap-1.5 text-purple-400 font-bold">
            <Activity className="w-3.5 h-3.5" /> ROUTE TRACE INSPECTOR
          </span>
          <span className="text-[11px]">Fallback Hops: {routeTrace.fallbackHops}</span>
        </div>
        <div className="space-y-1.5 pt-1 text-slate-300">
          <div className="flex items-center gap-2">
            <GitCommit className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-slate-400">Ingress Group:</span>
            <span className="text-white font-bold">{routeTrace.group}</span>
          </div>
          <div className="flex items-center gap-2 pl-4">
            <CornerDownRight className="w-3 h-3 text-purple-400" />
            <span className="text-slate-400">Priority Selected:</span>
            <span className="text-emerald-400 font-bold">Priority {routeTrace.priority}</span>
            <span className="text-slate-400 ml-2">Target:</span>
            <span className="text-white font-bold">{routeTrace.target}</span>
          </div>
          <div className="flex items-center gap-2 pl-4">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="text-slate-400">Injected CLI Flags:</span>
            <code className="px-1.5 py-0.5 rounded bg-black/40 text-amber-300 text-[11px]">
              {routeTrace.injectedFlags}
            </code>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 space-y-6 h-full overflow-y-auto bg-[#0E121B] text-slate-200">
      {/* Selector bar */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-surface border border-borderSubtle">
        <div className="flex items-center gap-4">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="bg-[#141923] text-white border border-borderSubtle text-xs font-mono rounded-lg px-3 py-2"
          >
            <option value="group:deep-code-prod">group:deep-code-prod (Hierarchical)</option>
            <option value="codex-cli/gpt-5.6-sol">codex-cli/gpt-5.6-sol (Direct)</option>
            <option value="claude-code/sonnet">claude-code/sonnet (Direct)</option>
          </select>
          {renderEffortSelector()}
        </div>
      </div>

      {/* Route Trace Card */}
      {renderRouteTraceCard()}

      {/* Main chat interface ... */}
    </div>
  );
}
```

---

## Tóm kết Kiến trúc & Cam kết từ Candidate 1

Bằng việc xác lập **Bounded Architectural Contract** này, Candidate 1 giải quyết triệt để sự thiếu hụt lớn nhất trong cơ chế điều phối của `cli-to-api`:
1. **Chấm dứt hoàn toàn lỗi 429 giả mạo:** Nhờ chuỗi **Priority Fallback Chain** và **Smooth Weighted Pool**, một request client sẽ không bao giờ bị từ chối nếu hạ tầng máy trạm vẫn còn ít nhất một CLI hoặc một tài khoản dự phòng có khả năng đáp ứng.
2. **Khai phóng $100\%$ tiềm năng Suy Luận Sâu:** Ma trận **Unified Effort Matrix** lấp đầy khoảng cách giữa giao thức tiêu chuẩn OpenAI với thế giới dòng lệnh bất đồng nhất, cho phép nhà phát triển điều khiển chính xác mức độ tư duy của mô hình chỉ với một tham số duy nhất `reasoning_effort`.
3. **Trải nghiệm Quan sát Đẳng cấp Cyberdeck:** Biến Gateway từ một "hộp đen" thành một hệ thống trong suốt, nơi từng bước fallback, từng trọng số phân bổ và từng cờ CLI thực thi đều được trực quan hóa sống động, sẵn sàng cho môi trường kiểm thử và vận hành chuyên nghiệp.
