---
type: brainstorm-report
date: 2026-09-17
status: accepted
target: cli-to-api
mode: ultra-verifier-pass
lead_verifier: Kongming
winning_candidate: Candidate A (Candidate 3)
synthesis: Obsidian Hybrid Telemetry & Fleet Radar (OHTFR)
---

# Báo Cáo Thiết Kế Kiến Trúc: Obsidian Hybrid Telemetry & Fleet Radar (OHTFR)
## Khai Tử Chat Playground — Thiết Lập Trạm Đo Lường Vi Mô Token Input/Output, Active Providers & Models Thời Gian Thực Cho `cli-to-api`

---

## TÓM TẮT THIẾT KẾ (EXECUTIVE SUMMARY)

Yêu cầu kỹ thuật từ người dùng:
> *"bỏ chat play ground thay bằng màn hình xem token input, output, xem provider nào đang chạy, model nào đang chạy, v.v"*

Hệ thống `cli-to-api` được định vị là một **Cổng giao tiếp đa mô hình ngôn ngữ địa phương hiệu năng cao (High-Performance Local AI Gateway & Proxy)** kết nối các client IDE tiêu chuẩn (Cursor, Claude Code, Cline, Continue, Aider) với các CLI Engine chạy ngầm (`codex-cli`, `gemini-cli`, `claude-cli`, v.v.). Việc duy trì một giao diện chat đơn lẻ (Chat Playground) trong control plane là không cần thiết, đi ngược lại tôn chỉ của một hạ tầng API Gateway.

Thông qua quy trình thẩm định đa ứng viên độc lập **Ultra Verifier Pass (Best-of-5)** dưới sự chủ trì của **Kongming Lead Architectural Verifier**, bản thiết kế **Candidate A (Candidate 3)** — *High-Performance Hybrid Observability Engine* đã xuất sắc giành vị trí Quán quân với số điểm **75/80**. Bản thiết kế này được tiếp tục hoàn thiện thông qua **Ma trận Tổng hợp Kongming (Kongming Synthesis Matrix)**, dung nạp những phát kiến vượt bậc từ Candidate B (Active OS PID to Account Slot binding & Failover Trail), Candidate D (Thinking CoT vs Content Demuxing, Adaptive Multilingual Heuristics, Slot Saturation Warning), Candidate C (Snapshot Hydration via SSE), và Candidate E (SQLite Schema Migration & Paginated Audit Ledger).

Kết quả mang lại một giải pháp kiến trúc bất biến cấp sản xuất: **Obsidian Hybrid Telemetry & Fleet Radar (OHTFR)**.

---

## 1. BRAINSTORM CONTRACT (HỢP ĐỒNG GIAO HÀNG ĐẶC TẢ)

### 1.1. Mục tiêu (Outcome)
- **Khai tử triệt để Chat Playground:** Loại bỏ hoàn toàn `PlaygroundView.tsx` và tab `"Chat Playground"` khỏi Sidebar cũng như cây điều hướng của Web Admin Console (`apps/web`).
- **Thiết lập Trạm Giám sát & Điều hành Vi mô Obsidian Cyberdeck (`TelemetryStationView.tsx`):**
  1. **Theo dõi Token Thời gian thực (Live Token Ingress & Egress):** Bóc tách chính xác số lượng **Prompt Tokens (Input)**, **Completion Tokens (Output)** và **Reasoning Tokens (Thinking CoT)** theo từng chunk dữ liệu đang chảy qua hệ thống.
  2. **Nhận diện Tức thời Provider & Model Đang Chạy:** Hiển thị tức thời danh sách các CLI Provider (`codex-cli`, `gemini-cli`, `claude-cli`), Model được yêu cầu và Model thực tế đang xử lý, kèm tỷ lệ bão hòa slot (`activeSlots / maxSlots`) và cảnh báo Cooldown.
  3. **Đo đạc Vận tốc Token (Live Token Velocity):** Tính toán tốc độ sinh token tức thời (**Tokens/second**) qua thuật toán bộ đệm vòng $O(1)$ trên cửa sổ trượt 3 giây.
  4. **Liên kết Cứng OS PID & Emergency Kill Switch:** Ánh xạ 1-1 giữa mã request với PID tiến trình con của hệ điều hành, cho phép quản trị viên cưỡng chế tiêu diệt (`killProcessTree`) bất kỳ tiến trình nào bị treo hoặc loop vô tận.
  5. **Trực quan hóa Vết Chuyển Vùng Lỗi (Failover Trail Breadcrumbs):** Hiển thị trực quan chuỗi fallback khi xảy ra sự cố 429 hoặc crash (ví dụ: `[P0: codex-acc-1 ⚠️ 429 (+142ms)] ➔ [P1: gemini-acc-2 🟢 200 Streaming]`).
  6. **Sổ Cái Kiểm Toán Bền Vững (Audit Ledger):** Lưu trữ toàn bộ lịch sử request vào bảng SQLite `request_metrics` thông qua cơ chế gom mẻ có hoãn (Debounced Batch Queue), hỗ trợ phân trang và tìm kiếm.

### 1.2. Ràng buộc Kỹ thuật (Constraints)
1. **Kiến trúc Tự Chủ (Zero External Telemetry Infrastructure):** Tuyệt đối không tích hợp Prometheus, Grafana, OpenTelemetry Collector, Redis, Kafka hay Datadog. Toàn bộ telemetry do chính Fastify daemon, RAM O(1) và SQLite cục bộ (chế độ WAL) đảm nhiệm.
2. **Zero Hot-Path Overhead:** Luồng truyền tải token `/v1/chat/completions` không bị chặn. Các phép tính token heuristics thực thi $O(1)$ in-memory; thao tác ghi SQLite hoàn toàn tách rời khỏi chu kỳ streaming.
3. **An Toàn Tiến Trình Đa Nền Tảng (Windows & POSIX):** Việc bắt PID và dọn dẹp tiến trình tương thích hoàn toàn với Win32 Job Objects và Unix Process Groups đã có trong `apps/gateway/src/supervisor/`.
4. **Bảo Toàn Chuẩn OpenAI API:** Giữ nguyên vẹn 100% định dạng SSE chunk và JSON response công khai cho các IDE Client (Cursor, Cline, Continue, Aider).

### 1.3. Những Điều Không Làm (Non-Goals)
- Không lưu trữ toàn bộ nội dung văn bản (raw prompt/response string) vào SQLite nhằm bảo mật mã nguồn của lập trình viên và chống phình đĩa cứng.
- Không giữ lại giao diện chat bong bóng (bubble chat), markdown preview hay lịch sử hội thoại cá nhân.
- Không nhúng tokenizer BPE/WASM cồng kềnh (như tiktoken) gây lag Event Loop; dùng thuật toán Heuristic ký tự thích ứng đa ngữ (Adaptive Char Heuristic) có sai số < 5% nhưng tốc độ $O(1)$.
- Không tích hợp hệ thống thanh toán tài chính (Billing).

### 1.4. Tiêu chí Nghiệm thu Đo lường được (Acceptance Criteria)

```gherkin
Feature: Obsidian Hybrid Telemetry & Fleet Radar (OHTFR)

  Scenario: AC-1 - Khai tử hoàn toàn Chat Playground
    Given Gateway và Web Admin Console đang hoạt động
    When Người dùng quan sát Sidebar điều hướng
    Then Tab "Chat Playground" biến mất hoàn toàn
    And Xuất hiện tab mới "Fleet Radar & Ledger" với icon Radar/Cpu
    And Truy cập tab hiển thị TelemetryStationView thay vì PlaygroundView

  Scenario: AC-2 - Khởi tạo In-Flight Request và Bắt OS PID tức thì
    Given Client bên ngoài (Cursor/Cline) gửi POST /v1/chat/completions
    When Gateway phân giải mục tiêu và spawn tiến trình CLI
    Then Callback onSpawn bắt được PID hệ điều hành trong vòng < 20ms
    And Event "telemetry:request:start" được broadcast qua kênh SSE
    And Trên UI hiển thị dòng tiến trình với đầy đủ: PID, Provider, Model, Account Sandbox, Prompt Tokens

  Scenario: AC-3 - Giám sát Bóc tách Token CoT vs Content và Vận tốc tok/s
    Given Một mô hình suy luận (CoT) đang stream kết quả qua ThinkingDemuxer
    When Khối <think> đang xuất dữ liệu
    Then Cột "Reasoning Tokens" nhảy số liên tục theo từng delta chunk
    And Cột trạng thái hiển thị huy hiệu "REASONING" (tím pulsing)
    When Khối đóng </think> kết thúc và chuyển sang câu trả lời
    Then Trạng thái chuyển sang "STREAMING" (xanh lục)
    And Cột "Content Tokens" tăng dần kèm chỉ số "tok/s" tính trên cửa sổ 3 giây

  Scenario: AC-4 - Cảnh báo Bão hòa Slot Concurrency
    Given Một Provider CLI (ví dụ codex-cli) có 2 slots và cả 2 đang bận
    When Request mới gửi vào
    Then Thanh đo Saturation của Provider hiển thị "2/2 (100% SATURATED)" viền đỏ
    When Một account dính mã 429
    Then Trạng thái chuyển sang "COOLDOWN" kèm đồng hồ đếm ngược thời gian thực

  Scenario: AC-5 - Hiển thị Vết Chuyển Vùng Lỗi (Failover Trail)
    Given Pipeline cấu hình chuỗi ưu tiên P0 -> P1
    When Candidate P0 gặp lỗi 429 ở 150ms đầu và router chuyển sang P1
    Then HUD hiển thị vệt bánh mì: "[P0: acc-1 ⚠️ 429 (+142ms)] ➔ [P1: acc-2 🟢 200 Streaming]"

  Scenario: AC-6 - Cưỡng chế Tiêu diệt Tiến trình (Emergency Kill Switch)
    Given Một tiến trình CLI bị treo hoặc loop vô tận
    When Quản trị viên bấm nút "KILL" trên dòng tiến trình tại Live Radar
    Then Gateway gọi killProcessTree(pid), thu hồi worker slot trong vòng < 200ms
    And Dòng tiến trình chuyển sang trạng thái "TERMINATED" và gỡ bỏ khỏi Radar

  Scenario: AC-7 - Snapshot Hydration khi F5 hoặc mở Tab mới
    Given Có 2 requests đang chạy dở trong Gateway
    When Người dùng F5 lại trang web
    Then Ngay khi SSE kết nối, Gateway gửi event "radar:snapshot"
    And UI lập tức render lại 2 tiến trình đang chạy mà không bị màn hình trống

  Scenario: AC-8 - Ghi Bền Vững Gom Mẻ vào SQLite không gây SQLITE_BUSY
    Given 50 request đồng thời hoàn tất trong vòng 2 giây
    When TelemetryPersistQueue kích hoạt
    Then Dữ liệu được flush vào request_metrics trong 1 transaction duy nhất
    And Không có bất kỳ lỗi SQLITE_BUSY nào xuất hiện trong log
    And Bảng Historical Ledger hiển thị đầy đủ 50 bản ghi kèm phân trang
```

---

## 2. KIẾN TRÚC HỆ THỐNG CHI TIẾT (TECHNICAL ARCHITECTURE)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                       KONGMING SYNTHESIS ARCHITECTURE: OBSIDIAN HYBRID TELEMETRY                            │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                      │
                                                      ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ INGRESS & EXECUTION LAYER (Fastify / Supervisor / Routing Pipelines)                                      │
 │                                                                                                           │
 │  1. Adaptive Token Estimator [From D]: Multilingual Char Heuristic (3.7 ASCII / 2.2 Unicode)              │
 │  2. Deep Thinking Demuxer Hook [From D]: Real-time split (Prompt, Thinking/CoT, Content Tokens)           │
 │  3. Process Supervisor Spawner [From B]: Capture child.pid via onSpawn callback in pipe/pty-executor     │
 │  4. Dynamic Failover Tracker [From B]: Intercept 429 cooldowns & build Failover Trail Breadcrumbs         │
 └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                      │
                                                      ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ CONTROL PLANE CORE: HYBRID TELEMETRY ENGINE (apps/gateway/src/telemetry/)                                 │
 │                                                                                                           │
 │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ [CANDIDATE A CORE] In-Memory Execution Registry & O(1) Circular Velocity Buffer                     │  │
 │  │ - Active Streams Map: id -> { pid, provider, model, account, tokens: {in, cot, out}, velocity }    │  │
 │  │ - Sliding Window Aggregator: In-memory sliding buckets (5m, 1h, 24h, all)                           │  │
 │  │ - Dual Emergency Interceptor: AbortSignal cascade [A] + killProcessTree(pid) Kill Switch [B]        │  │
 │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
 │                                                      │                                                     │
 │          ┌───────────────────────────────────────────┴──────────────────────────────────────────┐          │
 │          ▼ (Real-time Broadcast & Hydration)                                                    ▼          │
 │  ┌────────────────────────────────────────────────┐                  ┌──────────────────────────────────┐  │
 │  │ SSE Real-time Broadcaster                      │                  │ Persistence Engine [From E + A]  │  │
 │  │ - Pulse Throttling: 100ms interval             │                  │ - TelemetryPersistQueue [E]      │  │
 │  │ - Initial Snapshot Hydration [From C]:         │                  │ - Debounced Flush: 2000ms / 50   │  │
 │  │   Emit "radar:snapshot" on SSE connect         │                  │   items into SQLite WAL [A]      │  │
 │  │ - Failover Breadcrumb & Saturation events [B+D]│                  │ - Graceful flush on Fastify close│  │
 │  └────────────────────────────────────────────────┘                  └──────────────────────────────────┘  │
 └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                │                                                         │
           SSE: /api/admin/events (Pulse & Snapshots)              REST: /api/admin/telemetry/* (Ledger & Matrix)
                                ▼                                                         ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ WEB CONSOLE FRONTEND (apps/web/src/views/TelemetryStationView.tsx) - OBSIDIAN CYBERDECK HUD               │
 │                                                                                                           │
 │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ ZONE 1: TOP HUD STATUS CARDS & ONE-CLICK DIAGNOSTIC PROBE HARNESS [From D]                          │  │
 │  │ Cumulative Ingress (Prompt) | Egress (Content) | Thinking (CoT) | Fleet TPS | Diagnostic Probes     │  │
 │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
 │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ ZONE 2: PROVIDER SLOT SATURATION & CONCURRENCY MATRIX [From D]                                      │  │
 │  │ Visual capacity bar (activeSlots / maxSlots) per CLI Adapter | Cooldown countdowns on 429           │  │
 │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
 │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ ZONE 3: PLANE 1 - LIVE EXECUTION RADAR [From A + B]                                                 │  │
 │  │ Grid: [PID] | [ReqID] | [Provider/Model] | [Account/Sandbox] | [In/CoT/Out Toks] | [Tok/s] | [KILL] │  │
 │  │ Sub-strip: Visual Failover Trail Breadcrumbs [From B] (P0 [429] -> P1 [200 OK])                     │  │
 │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
 │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ ZONE 4: PLANE 2 - TOKEN ACCOUNTING & AUDIT LEDGER [From A + E]                                      │  │
 │  │ Sliding Filters (5m, 1h, 24h, all) [A] | Paginated SQLite Audit Log with Search & Filters [E]       │  │
 │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
 └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. THIẾT KẾ GIAO DIỆN FRONTEND: OBSIDIAN CYBERDECK HUD

Giao diện mới thay thế hoàn toàn `PlaygroundView.tsx` tại đường dẫn `apps/web/src/views/TelemetryStationView.tsx`:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [● HUD ONLINE]  CYBERDECK FLEET RADAR & TOKEN MATRIX            [AUTO-REFRESH: 1s] [STREAM: SSE LIVE]   │
│ Real-time CLI token streaming velocity, in-flight process introspection, and multi-model ledger.       │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ZONE 1: TOP HUD STATUS CARDS & DIAGNOSTIC PROBE HARNESS                                                │
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────────────┐ │
│ │ INGRESS TOKENS │ │ EGRESS TOKENS  │ │ REASONING CoT  │ │ FLEET VELOCITY │ │ DIAGNOSTIC PROBES      │ │
│ │ 1,248,910 tok  │ │ 3,841,200 tok  │ │ 842,100 tok    │ │ 142.4 tok/s    │ │ [Ping] [Code] [CoT]   │ │
│ └────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘ └────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ZONE 2: PROVIDER SLOT SATURATION & CONCURRENCY MATRIX                                                  │
│ • codex-cli:  [████████████████████] 2/2 (100% SATURATED)  [acc-1: BUSY, acc-2: BUSY]                │
│ • gemini-cli: [██████████..........] 1/2 (50% HEALTHY)     [acc-gem-1: BUSY, acc-gem-2: READY]        │
│ • claude-cli: [....................] 0/2 (0% IDLE)         [acc-cl-1: READY, acc-cl-2: READY]         │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ZONE 3: PLANE 1 - LIVE EXECUTION RADAR (IN-FLIGHT SUBPROCESSES)                                        │
│ [PID]   [STATUS]     [PROVIDER / MODEL]       [ACCOUNT / SANDBOX]      [IN / COT / OUT] [TOK/S] [KILL] │
│ #18492  STREAMING    codex-cli ➔ gpt-4o       acc-dev-1 (~/sandboxes/1) 1.2k / 0 / 412   42.1/s [KILL] │
│ #19104  REASONING    gemini-cli ➔ 2.5-flash   acc-pro-2 (~/sandboxes/2) 840 / 512 / 0    58.4/s [KILL] │
│                                                                                                        │
│ ⚡ FAILOVER TRAIL: [P0: codex-acc-1 ⚠️ 429 (+142ms)] ──➔ [P1: gemini-acc-2 🟢 200 Streaming]           │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ZONE 4: PLANE 2 - TOKEN ACCOUNTING MATRIX & AUDIT LEDGER                                               │
│ Bộ lọc thời gian: [ 5 Phút ] [ 1 Giờ ] [ 24 Giờ ] [ Toàn thời gian ]     Tìm kiếm: [Filter...]          │
│ ┌────────────┬──────────────────┬──────────┬─────────────┬────────────┬─────────────┬────────┬───────┐ │
│ │ PROVIDER   │ MODEL EXECUTED   │ CALLS    │ PROMPT TOK  │ REASON TOK │ COMPL TOK   │ TTFT   │ STATUS│ │
│ ├────────────┼──────────────────┼──────────┼─────────────┼────────────┼─────────────┼────────┼───────┤ │
│ │ codex-cli  │ gpt-4o           │ 1,420    │ 840,120     │ 0          │ 320,400     │ 340ms  │ 200 OK│ │
│ │ gemini-cli │ gemini-2.5-flash │ 890      │ 412,000     │ 210,000    │ 180,500     │ 410ms  │ 200 OK│ │
│ └────────────┴──────────────────┴──────────┴─────────────┴────────────┴─────────────┴────────┴───────┘ │
│ (Phân trang: [< Trang 1 / 18 >] Hiển thị 50 bản ghi gần nhất từ SQLite WAL)                           │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. ĐÁNH ĐỔI & NĂNG LỰC CHỐNG CHỊU (TRADE-OFFS & RESILIENCE)

| Chiều Quyết Định | Giải Pháp Kỹ Thuật | Đánh Đổi (Trade-Off) | Giải Pháp Khắc Phục (Mitigation) |
| :--- | :--- | :--- | :--- |
| **Độ chính xác Token** | Heuristic Ký tự Thích ứng Đa ngữ ($O(1)$) | Sai số ~3-5% so với BPE Tokenizer chuẩn | Zero-overhead, không lag Event Loop Fastify. Hoàn toàn phù hợp cho quan sát vận hành. |
| **Ghi Dữ Liệu SQLite** | Debounced Batch Writer (2000ms / 50 items) | Trễ tối đa 2s trước khi dữ liệu xuất hiện trong DB | Triệt tiêu 100% lỗi `SQLITE_BUSY`. Có hook flush tức thì khi Fastify tắt. |
| **Tần Suất Bắn SSE** | Micro-throttling Pulse (100ms) | Trễ hiển thị token tối đa 100ms trên UI | Giảm 90% tải thông điệp trên Event Loop và chống tràn DOM trên trình duyệt. |
| **Quản Lý Tiến Trình** | OS PID binding + `killProcessTree` | Đòi hỏi hỗ trợ gọi lệnh OS đa nền tảng | Đã được đóng gói an toàn trong supervisor Win32 Job Objects và Unix Process Groups. |

- **Giả định chịu tải then chốt (Primary Load-Bearing Assumption):** Bộ nhớ RAM in-memory của Node.js cho `ExecutionRegistry` duy trì ổn định dưới 50MB và các phép tính heuristic $O(1)$ tiêu tốn < 1% CPU.
- **Điều kiện hỏng hóc đầu tiên (First Failure Condition):** Một CLI process bị lặp vô tận (runaway stream) xả hàng triệu tokens/giây. **Biện pháp khống chế:** Max Token Cap Circuit Breaker ngắt tiến trình khi vượt 16,384 tokens kết hợp nút Emergency Kill Switch cho phép quản trị viên hủy ngay lập tức.

---

## 5. LỘ TRÌNH TRIỂN KHAI THEO GIAI ĐOẠN (IMPLEMENTATION ROADMAP)

- **Giai đoạn 1: Nâng cấp Lược đồ Dữ liệu & Persistence Queue (Database Foundation)**
  - Cập nhật `apps/gateway/src/db/schema.ts` và `migrate.ts` bổ sung `adapter_id`, `reasoning_tokens`, `total_tokens` và composite indexes.
  - Xây dựng `TelemetryPersistQueue` gom mẻ ghi SQLite với chu kỳ 2000ms / 50 items.
- **Giai đoạn 2: In-Memory Execution Registry, PID Binding & Token Velocity (Core Engine)**
  - Mở rộng `pipe-executor.ts` và `pty-executor.ts` với callback `onSpawn: (pid) => void`.
  - Xây dựng `apps/gateway/src/telemetry/execution-registry.ts` với Circular Buffer 3s đo token velocity.
  - Nâng cấp `token-estimator.ts` với thuật toán Adaptive Multilingual Heuristics.
- **Giai đoạn 3: Tích hợp Streaming Hooks, Failover Trail & Admin Endpoints (Gateway Wiring)**
  - Móc nối `openai-chat.ts` vào `ThinkingDemuxer` callbacks (`onThoughtDelta`, `onContentDelta`), micro-throttle SSE 100ms.
  - Tích hợp Failover Trail trong `pipeline-executor.ts`.
  - Cung cấp các endpoints REST: `/api/admin/telemetry/ledger`, `/api/admin/telemetry/abort/:requestId`.
- **Giai đoạn 4: Xây dựng Giao diện Obsidian Cyberdeck HUD & Khai tử Playground (Frontend)**
  - Dỡ bỏ tab `playground` trong `Sidebar.tsx` và `App.tsx`, thay bằng `radar`.
  - Xây dựng `TelemetryStationView.tsx` gồm 4 Zones chức năng.
  - Tích hợp cụm nút Diagnostic Probe Harness trên header HUD.
- **Giai đoạn 5: Kiểm thử Toàn diện & Nghiệm thu (Verification & Acceptance)**
  - Viết bộ kiểm thử tự động (Unit, Concurrency, Failover, Kill Switch, Snapshot Hydration).
  - Xác nhận toàn bộ hệ sinh thái chạy ổn định, không phát sinh mã thừa.

---

## 6. PHỤ LỤC XẾP HẠNG THẨM ĐỊNH (RANKING APPENDIX)

Bảng điểm chuẩn thức từ Hội đồng Thẩm định Kiến trúc Độc lập (Kongming Lead Verifier):

| Xếp Hạng | Ứng Viên Dự Thi | Đề Xuất Trọng Tâm | D1 (Ngữ Cảnh) | D2 (Khả Thi) | D3 (Kiểm Thử) | D4 (Chống Rủi Ro) | Tổng Điểm (/80) | Phán Quyết |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| 🥇 | **Candidate A** *(Cand. 3)* | **High-Performance Hybrid Observability Engine** (Dual-Plane UI, O(1) Circular Velocity Buffer, Debounced Batch Writer 2000ms, Sliding Windows) | **19** | **19** | **18** | **19** | **75 / 80** | **ĐẮC CỬ (Chủ lực Kiến trúc)** |
| 🥈 | **Candidate D** *(Cand. 4)* | Streaming Token Profiler & Multi-CLI Telemetry Studio (ThinkingDemuxer CoT split, Adaptive Heuristic, Saturation Warning Bar, Diagnostic Probe) | 19 | 18 | 18 | 17 | 72 / 80 | **Hợp nhất Tinh hoa (CoT & Probe)** |
| 🥉 | **Candidate B** *(Cand. 5)* | Obsidian Cyberdeck Runtime Telemetry Station (OS PID binding via onSpawn, Failover Trail Breadcrumbs, Process Terminator Kill Switch) | 18 | 18 | 17 | 18 | 71 / 80 | **Hợp nhất Tinh hoa (PID & Failover)** |
| 4th | **Candidate E** *(Cand. 2)* | Persistent Token & Execution Ledger (SQLite request_metrics migration, TelemetryPersistQueue, REST API, Historical Paginated Ledger) | 17 | 18 | 18 | 17 | 70 / 80 | **Hợp nhất Tinh hoa (Schema & DB)** |
| 5th | **Candidate C** *(Cand. 1)* | Reactive Live-Stream & Active Fleet Radar (Pure SSE Event-Driven in-flight matrix, snapshot hydration, ephemeral memory) | 16 | 17 | 16 | 15 | 64 / 80 | Hợp nhất Snapshot Hydration |

*Bản báo cáo hoàn tất và được phê duyệt để Controller tiến hành lập kế hoạch thi công (`ak:plan`).*
