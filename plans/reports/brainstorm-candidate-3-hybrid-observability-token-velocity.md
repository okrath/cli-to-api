# BẢN ĐỀ XUẤT KIẾN TRÚC & ĐẶC TẢ KỸ THUẬT (CANDIDATE 3)
## DỰ ÁN: CLI-TO-API — HIGH-PERFORMANCE HYBRID OBSERVABILITY ENGINE
### Đề bài: Thay thế Chat Playground bằng Trạm Giám sát Đa tầng
### Định hướng (Angle): In-Memory Execution Tracker với Token Velocity, Sliding-Window Stats, Dual-Plane UI (Live Execution Radar + Token Accounting Matrix)
**Tác giả:** Candidate 3 — Ultra Verifier Architecture Council  
**Ngày lập đề xuất:** 17/09/2026  

---

## 1. BRAINSTORM CONTRACT

### 1.1. Mục tiêu cuối cùng (User-Visible & Operational End-State)
1. **Loại bỏ hoàn toàn Chat Playground:** Thay thế tab "Chat Playground" (`PlaygroundView.tsx`) trên Sidebar và Router bằng phân hệ chuyên dụng: **"Execution Radar & Token Matrix"** (`TelemetryStationView.tsx`). Hệ thống chuyển từ vai trò "nơi chat thử nghiệm" sang vai trò **"Control Plane & Trạm giám sát vi mô (Telemetry Station) chuẩn Obsidian Cyberdeck"**.
2. **Dual-Plane UI (Giao diện 2 tầng thời gian thực):**
   - **Plane 1 - Live Execution Radar:** Hiển thị tức thời mọi CLI process/request đang thực thi (`IN_FLIGHT`), định danh rõ: Provider (`codex-cli`, `claude-cli`, `gemini-cli`), Model thực tế (`model_executed`), Account Sandbox (`sandboxDir`), thời gian chạy (`elapsed_ms`), TTFT (Time-To-First-Token), tốc độ phát token thời gian thực (**Token Velocity - tok/s**), và nút hủy khẩn cấp (`Abort`).
   - **Plane 2 - Token Accounting Matrix:** Bảng kế toán token đa chiều phân tích Input Tokens (Prompt), Output Tokens (Completion), Reasoning/Thinking Tokens theo từng Provider, Model và Account dưới các khung trượt thời gian (*Sliding Windows: 5m, 1h, 24h, All-Time*), kèm chỉ số tiêu hao (`cost_weight`).
3. **Zero-Overhead Hybrid Data Engine:** Telemetry engine đạt độ trễ sub-millisecond, vận hành hoàn toàn in-memory cho các tác vụ đo đạc streaming và token velocity, bất đồng bộ hóa việc ghi bền vững (batch persistence) xuống SQLite WAL mà không gây nghẽn tiến trình CLI hay I/O block.

```
+------------------------------------------------------------------------------------------------+
|                                    OBSIDIAN CYBERDECK HUD                                      |
+------------------------------------------------------------------------------------------------+
| [PLANE 1: LIVE EXECUTION RADAR]                                                                |
| ACTIVE STREAMS: 3 | FLEET VELOCITY: 142.4 tok/s | P95 TTFT: 480ms | RUNAWAY WATCHDOG: ACTIVE   |
| ---------------------------------------------------------------------------------------------- |
|  REQ-ID      PROVIDER      MODEL           ACCOUNT      TOKENS (IN/OUT/THK)   VELOCITY   ABORT |
|  chat-8f2a   codex-cli     gpt-4o-mini     acc-dev-01   840 / 128 / 0 tok     42.1 tok/s [X]   |
|  chat-99c1   claude-cli    sonnet-3-5      acc-pro-02   1,420 / 312 / 85 tok  68.4 tok/s [X]   |
|  chat-10ba   gemini-cli    flash-thinking  acc-free-01  620 / 94 / 412 tok    31.9 tok/s [X]   |
+------------------------------------------------------------------------------------------------+
| [PLANE 2: TOKEN ACCOUNTING MATRIX]                                                             |
| SLIDING WINDOW: [ 5 Min ] [ 1 Hour ] [ 24 Hours ] [ Cumulative ]                               |
| ---------------------------------------------------------------------------------------------- |
|  PROVIDER     MODEL            PROMPT TOK   COMPL TOK    THOUGHT TOK   TOTAL TOK   AVG SPEED   |
|  claude-cli   claude-3-5-sonnet  428,910      182,450       45,120       656,480   58.2 tok/s  |
|  codex-cli    o1-mini            310,120       94,200      120,400       524,720   44.1 tok/s  |
|  gemini-cli   gemini-1.5-pro     154,200       88,110       12,000       254,310   72.0 tok/s  |
+------------------------------------------------------------------------------------------------+
```

### 1.2. Ràng buộc kỹ thuật (Constraints)
- **Kiến trúc khép kín (Self-Contained):** Tuyệt đối **không** tích hợp hạ tầng giám sát ngoài (không Prometheus, Grafana, VictoriaMetrics, Redis, InfluxDB). Toàn bộ telemetry do chính tiến trình Fastify và SQLite đảm nhiệm.
- **Tương thích tuyệt đối (Zero Breaking Changes for API):** Endpoint OpenAI chuẩn `/v1/chat/completions` không bị thay đổi payload đầu ra công khai; các trường telemetry mở rộng chỉ được cung cấp qua Server-Sent Events (SSE), response headers hoặc admin endpoints.
- **Concurrency & WAL Safety:** Mọi thao tác ghi telemetry xuống SQLite (`better-sqlite3`) tuân thủ chế độ `WAL (Write-Ahead Logging)` với `busy_timeout = 5000` và cơ chế gom mẻ (batch flush), tránh lỗi `SQLITE_BUSY`.
- **Hiệu năng Streaming:** Thao tác đếm token và tính vận tốc (token velocity) trên streaming response dùng giải thuật heuristic siêu tốc O(1) in-memory buffer, không dùng tokenizer WASM nặng block Event Loop.

### 1.3. Non-goals
- Không biến trạm giám sát thành công cụ can thiệp hoặc sửa đổi prompt/completion on-the-fly.
- Không lưu toàn bộ nội dung văn bản (payload prompt/response raw string) vào cơ sở dữ liệu.
- Không giữ lại giao diện chat bong bóng (bubble chat).

### 1.4. Tiêu chí nghiệm thu (Acceptance Criteria)
1. **Loại bỏ Playground:** Tab "Chat Playground" biến mất, thay bằng "Execution Radar & Tokens" (`TelemetryStationView`).
2. **Live Execution Radar:** Hiển thị tức thời (dưới 100ms) các CLI process đang chạy với provider, model, account, elapsed time, live token velocity (tok/s).
3. **Token Accounting Matrix:** Phân tách chính xác `prompt_tokens`, `completion_tokens`, `reasoning_tokens` theo Provider × Model × Account trong các sliding window (5m, 1h, 24h, all).
4. **Emergency Execution Abort:** Nút Abort hủy tiến trình tức thì qua `AbortController` và thu hồi worker slot trong vòng 200ms.
5. **Khả năng chịu tải:** 50 req/s không gây lag Event Loop (>20ms) nhờ In-Memory Buffer + debounced batch writer (2.000ms).

---

## 2. DETAILED ARCHITECTURE & TECHNICAL SPECIFICATION

```
+===================================================================================================+
|                                     GATEWAY SERVER ARCHITECTURE                                   |
+===================================================================================================+
|                                                                                                   |
|  [OpenAI Client / IDE]               [Admin Web UI Dashboard]                                     |
|        │                                        ▲                                                 |
|        │ POST /v1/chat/completions              │ SSE: /api/admin/telemetry/stream                |
|        ▼                                        │ GET: /api/admin/telemetry/snapshot              |
|  ┌──────────────┐                       ┌───────┴────────┐                                        |
|  │ openai-chat  │                       │ admin-events   │                                        |
|  └──────┬───────┘                       └───────▲────────┘                                        |
|         │                                       │ (SSE Multiplexing)                              |
|         ▼                                       │                                                 |
|  ┌──────────────────────────────────────────────┴──────────────────────────┐                      |
|  │                  IN-MEMORY EXECUTION REGISTRY & VELOCITY ENGINE         │                      |
|  │  - Active Map: Map<RequestId, ActiveExecutionRecord>                    │                      |
|  │  - Circular Timestamp Buffer per Stream (Sliding 3-sec Token Velocity)  │                      |
|  │  - Aggregated Metrics Matrix: Provider x Model x Account Counters       │                      |
|  └──────────────────────┬──────────────────────────────────────────────────┘                      |
|                         │                                                                         |
|                         │ (Ring Buffer / Async Batch Queue)                                       |
|                         ▼                                                                         |
|  ┌─────────────────────────────────────────────────────────────────────────┐                      |
|  │             PERSISTENCE WORKER (Debounced Batch Writer)                 │                      |
|  │  - Flush every 2000ms or 50 items                                       │                      |
|  │  - SQLite WAL Transaction: INSERT request_metrics & UPSERT token_matrix │                      |
|  └──────────────────────┬──────────────────────────────────────────────────┘                      |
|                         ▼                                                                         |
|  ┌─────────────────────────────────────────────────────────────────────────┐                      |
|  │                   SQLITE EMBEDDED DB (better-sqlite3)                   │                      |
|  │  - request_metrics (historical requests)                                │                      |
|  │  - token_accounting_snapshots (sliding-window rollups)                   │                      |
|  └─────────────────────────────────────────────────────────────────────────┘                      |
+===================================================================================================+
```

### 2.1. Triển khai Backend: In-Memory ExecutionRegistry & Velocity Engine
- `apps/gateway/src/telemetry/execution-registry.ts`:
  - `ActiveExecutionRecord`: `requestId`, `provider`, `modelRequested`, `modelExecuted`, `accountId`, `promptTokens`, `completionTokens`, `reasoningTokens`, `currentVelocity` (tính trượt trên 3 giây).
  - Hỗ trợ `register()`, `recordChunk()`, `complete()`, `abort(requestId)`, `getSnapshot()`.
- Debounced Batch Writer ghi xuống SQLite mỗi 2.000ms hoặc 50 items.

### 2.2. Triển khai Frontend: `TelemetryStationView.tsx`
- **HUD Header:** Total Velocity, Active Subprocesses, Fleet Token Volume.
- **Plane 1 (Live Execution Radar):** Thẻ luồng đang chạy với token count (Input / Output / Reasoning), velocity gauge, elapsed time, TTFT và nút Emergency Abort.
- **Plane 2 (Token Accounting Matrix):** Bảng kế toán phân tích đa chiều kèm thanh tìm kiếm và bộ lọc thời gian (5m, 1h, 24h, all).

### 2.3. Trade-offs & Resilience
- **Giả định cốt lõi:** Quản lý token velocity qua circular timestamp buffer trên mỗi stream tốn O(1) CPU/RAM.
- **First Failure Condition:** Runaway stream bị lặp vô tận. Khắc phục: Watchdog tự động kích hoạt timeout và nút Abort trên HUD cho phép quản trị viên kill tiến trình ngay tức khắc.
