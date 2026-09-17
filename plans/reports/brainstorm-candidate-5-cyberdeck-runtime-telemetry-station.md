# BẢN ĐỀ XUẤT KIẾN TRÚC & ĐẶC TẢ KỸ THUẬT (CANDIDATE 5)
## DỰ ÁN: CLI-TO-API — OBSIDIAN CYBERDECK RUNTIME TELEMETRY STATION
### Đề bài: Thay thế Chat Playground bằng màn hình xem Token Input/Output, Active Providers & Models
### Định hướng (Angle): Obsidian Cyberdeck Runtime Telemetry Station (Rich diagnostic HUD, active PID / account slot binding, failover trail visualization, comprehensive token ingress/egress accounting)
**Tác giả:** Candidate 5 — Ultra Verifier Architecture Council  
**Ngày lập đề xuất:** 17/09/2026  

---

## 1. BRAINSTORM CONTRACT

### 1.1. Outcome (Mục tiêu hoạt động & Trạng thái đích)
- **Khai tử triệt để Chat Playground:** Loại bỏ giao diện chat thừa thãi trong control plane của gateway.
- **Thiết lập Obsidian Cyberdeck Runtime Telemetry Station (`TelemetryStationView`):**
  - **Diagnostic HUD mật độ cao:** Giao diện phong cách Obsidian Cyberdeck (nền `#090B0F`, điểm nhấn cyan `#06B6D4`, emerald `#10B981`, amber `#F59E0B`).
  - **Active OS PID & Slot Binding:** Nhận diện và hiển thị trực tiếp PID tiến trình con (`execa` / `node-pty`), ánh xạ 1-1 tới tài khoản CLI, thư mục sandbox, và worker slot.
  - **Live Token Ingress (Prompt) & Egress (Completion) Accounting:** Theo dõi thời gian thực tốc độ và lượng token vào/ra (kể cả Reasoning/Thinking tokens), phân bổ theo Provider và Model.
  - **Failover Trail Breadcrumbs:** Vẽ trực quan chuỗi phản ứng fallback trong routing pipeline (ví dụ: `P0: codex-account-1 [429 (+120ms)] ➔ P1: gemini-account-2 [200 Streaming]`).
  - **Emergency Process Terminator (Kill Switch):** Nút hủy khẩn cấp gửi `SIGTERM`/`SIGKILL` thẳng vào Process Tree / Win32 Job Object của PID đang bị treo.

### 1.2. Constraints
1. Zero External Telemetry Infra: Tự chủ 100% trong Fastify, In-Memory RAM và SQLite cục bộ (Drizzle ORM).
2. Zero Hot-Path Overhead: Luồng `/v1/chat/completions` không bị chặn; tính toán token $O(1)$; ghi SQLite bất đồng bộ.
3. An toàn tiến trình đa nền tảng (Windows Job Objects & POSIX Process Groups).
4. Bảo toàn 100% chuẩn tương thích OpenAI API.

### 1.3. Non-goals
- Không xây dựng model arena hay chat hội thoại.
- Không nhúng tokenizer BPE/WASM cồng kềnh; dùng bộ đếm heuristic tối ưu $O(1)$ kết hợp kích thước byte chunk.
- Không lưu logs vĩnh viễn không giới hạn; SQLite duy trì rolling buffer tối đa 5.000 bản ghi.

### 1.4. Acceptance Criteria
1. Tab `Chat Playground` biến mất, thay bằng `Cyberdeck Telemetry` (`Cpu` icon).
2. Hàng "Active Execution Matrix" hiển thị ngay lập tức PID thực tế của OS, Account, Sandbox, Provider, Model, Ingress tokens.
3. Cột Token Egress tăng dần theo thời gian thực theo từng chunk demux.
4. Failover Trail xuất hiện breadcrumb trực quan khi candidate P0 bị 429 và trôi sang P1.
5. Kill Switch lập tức kết liễu PID qua `killProcessTree(pid)` và giải phóng worker slot.

---

## 2. DETAILED ARCHITECTURE & TECHNICAL SPECIFICATION

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [● HUD ONLINE]  CYBERDECK RUNTIME TELEMETRY HUD                 [AUTO-REFRESH: 1s] [STREAM: SSE] │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ZONE 1: TOP CYBERDECK STATUS BAR (KEY TELEMETRY GAUGES)                                          │
│ ┌───────────────┐ ┌───────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────────┐ │
│ │ ACTIVE PIDs   │ │ PROVIDERS RUN │ │ MODELS RUNNING │ │ INGRESS (PROMPT)│ │ EGRESS (COMPLETION)│ │
│ │  03 RUNNING   │ │ codex, gemini │ │ gpt-4o, flash  │ │  142,508 tok   │ │   894,112 tok    │ │
│ └───────────────┘ └───────────────┘ └────────────────┘ └────────────────┘ └────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ZONE 2: LIVE EXECUTION GRID (ACTIVE PID / ACCOUNT / MODEL / TOKEN MATRIX)                        │
│ [PID]   [STATUS]     [PROVIDER / MODEL]       [BOUND ACCOUNT / SANDBOX] [ING/EGRESS]   [ACTIONS] │
│ 18492   STREAMING    codex-cli ➔ gpt-4o       acc-dev-1 (~/sandboxes/1)  1.4k / 412 tok [KILL ✕] │
│ 19104   THINKING     gemini-cli ➔ 2.5-pro     acc-prod-2 (~/sandboxes/2) 8.9k / 1.1k tok[KILL ✕] │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ZONE 3: FAILOVER TRAIL & ROUTING BREADCRUMB STREAM                                               │
│ ⚡ [14:21:05] Pipeline 'deep-code' failover triggered:                                           │
│    [P0: codex-acc-1 (RateLimit 429) +142ms] ──➔ [P1: gemini-acc-3 (Healthy 200 OK) +810ms]     │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ZONE 4: TOKEN INGRESS/EGRESS ACCOUNTING MATRIX (PROVIDER & MODEL BREAKDOWN)                      │
│ ┌──────────────────────────────────────────────┐ ┌─────────────────────────────────────────────┐ │
│ │ TOKEN CONSUMPTION BY PROVIDER                │ │ TOKEN CONSUMPTION BY MODEL                  │ │
│ │ • codex-cli   : 412k In / 1.2M Out (62%) ████│ │ • gpt-4o          : 310k In / 920k Out      │ │
│ │ • gemini-cli  : 180k In / 540k Out (28%) ██░░│ │ • gemini-2.5-pro  : 110k In / 420k Out      │ │
│ │ • claude-cli  :  45k In / 120k Out (10%) █░░░│ │ • claude-3-7-son  :  45k In / 120k Out      │ │
│ └──────────────────────────────────────────────┘ └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1. Backend Enhancements
- `apps/gateway/src/supervisor/active-registry.ts`: Singleton `ActiveRequestRegistry` liên kết `requestId`, `pid`, `accountId`, `adapterId`, `modelRequested`, `modelExecuted`, `promptTokens`, `completionTokens`, `thoughtTokens`, `ttftMs`, `failoverTrail`.
- `pipe-executor.ts` & `pty-executor.ts`: Bổ sung callback `onSpawn: (pid) => void` để bắt ngay PID khi process spawn.
- `openai-chat.ts`: Tích hợp tính prompt tokens, stream delta token tally, async non-blocking persist vào SQLite `request_metrics`.
- REST Endpoints: `GET /api/admin/telemetry/active`, `GET /api/admin/telemetry/summary`, `POST /api/admin/telemetry/abort/:requestId`.

### 2.2. Frontend UI: `TelemetryStationView.tsx`
- **Zone 1: Status Bar** (Gauges, Ingress/Egress Ticker).
- **Zone 2: Live Execution Grid** (Active PID, Account, Model, In/Out Token Counter, Kill Button).
- **Zone 3: Failover Trail Visualizer** (Breadcrumbs phát sáng khi có retry/fallback).
- **Zone 4: Token Breakdown Matrix** (Provider & Model distribution).

### 2.3. Trade-offs & Resilience
- **Giả định cốt lõi:** Quản lý state in-memory O(1) và tính token heuristics theo delta chunk tốn < 1% CPU Node.js.
- **First Failure Condition:** Nhiều stream xả token liên tục làm ngập UI. Khắc phục: Throttling 150ms gom cụm SSE event, Zombie sweeper kiểm tra process exit, và microtask async SQLite insert.
