# BẢN ĐỀ XUẤT KIẾN TRÚC & ĐẶC TẢ KỸ THUẬT (CANDIDATE 4)
## DỰ ÁN: CLI-TO-API — STREAMING TOKEN PROFILER & MULTI-CLI TELEMETRY STUDIO
### Đề bài: Khai tử Chat Playground, Chuyển đổi thành Trung tâm Giám sát Token Thời gian thực & Đo lường Tải Multi-CLI
### Định hướng (Angle): Streaming Token Profiler & Multi-CLI Telemetry Studio (Real-time chunk-by-chunk token estimation, reasoning vs content token breakdown, provider slot saturation vs token throughput)
**Tác giả:** Candidate 4 — Ultra Verifier Architecture Council  
**Ngày lập đề xuất:** 17/09/2026  

---

## 1. BRAINSTORM CONTRACT

### 1.1. Outcome (Kết quả đầu ra mục tiêu)
* **Trải nghiệm người dùng:**
  * Khai tử `Chat Playground` (`PlaygroundView.tsx`) khỏi `Sidebar` và `App.tsx`.
  * Thay thế bằng **"Telemetry & Token Profiler Studio"** (`TelemetryProfilerView.tsx`):
    * **Active Provider & Model Badges:** Trạng thái các CLI Adapter (`codex-cli`, `gemini-cli`, `claude-cli`), account gánh tải, chế độ (`pipe` vs `pty`), và mức độ bão hòa slot (`activeSlots / maxSlots`).
    * **Streaming Token Profiler:** Danh sách tiến trình đang chạy live với đồng hồ đo token nhảy theo từng chunk: bóc tách rõ **Input Tokens (Prompt)**, **Reasoning Tokens (Thinking CoT)**, và **Output Tokens (Content)**.
    * **Live Token Velocity & Latency:** Tốc độ sinh token (tokens/sec), thời gian TTFT (Time to First Token), TTFR (Time to First Reasoning chunk), tổng thời lượng.
    * **Fleet Historical Ledger:** Bảng lịch sử request lưu vào SQLite (`request_metrics`).
    * **One-Click Diagnostic Probe:** Bộ phát lệnh kiểm thử siêu nhẹ bắn nhanh các prompt mẫu (Code, CoT Math, Ping) để benchmark trực tiếp token stream mà không cần giao diện chat rườm rà.

### 1.2. Constraints
1. Zero External Telemetry Infrastructure (không Prometheus, Grafana, Redis).
2. Tương thích công nghệ hiện tại (Fastify, React 18, Tailwind CSS, Lucide icons, SQLite WAL).
3. Low-Overhead SSE Pipeline: Thao tác ước tính token không làm nghẽn Event Loop hoặc giảm throughput client.
4. Resilient Demuxing: Tách thẻ `<think>`, `<thought>` qua `ThinkingDemuxer` hoạt động bền bỉ kể cả khi chunk bị phân mảnh.

### 1.3. Non-goals
- Không duy trì giao diện chat hội thoại đa lượt (multi-turn conversational bubble chat).
- Không nhúng tokenizer BPE/WASM cồng kềnh; sử dụng thuật toán heuristic ký tự thích ứng đa ngữ (Adaptive Char Heuristic) sai số dưới 5% nhưng tốc độ O(1).
- Không làm distributed tracing ngoài phạm vi máy chủ cục bộ.

### 1.4. Acceptance Criteria
1. Tab "Chat Playground" bị loại bỏ hoàn toàn, thay bằng "Token Profiler Studio".
2. Bóc tách chính xác thời gian thực giữa Reasoning Tokens và Content Tokens khi mô hình CoT suy nghĩ và xuất kết quả.
3. Hiển thị trực quan mức độ bão hòa slot của từng Provider (100% Saturation cảnh báo màu đỏ/amber) và đồng hồ đếm ngược Cooldown nếu dính 429.
4. Reload trang (F5) không mất dữ liệu: SSE kết nối lại nhận snapshot trạng thái của các request đang chạy ngầm.

---

## 2. DETAILED ARCHITECTURE & TECHNICAL SPECIFICATION

```
+----------------------------------------------------------------------------------------------------+
|  [ICON] TOKEN PROFILER STUDIO & TELEMETRY                               [LIVE SSE CONNECTED] [PROBE]|
|  Real-time chunk-by-chunk token estimation, reasoning/content demuxing, and CLI slot saturation.   |
+----------------------------------------------------------------------------------------------------+
|  HUD METRICS (4 CARDS)                                                                             |
|  [ Total Tokens Handled ]  [ Active Fleet TPS ]  [ Slot Saturation ]  [ Avg TTFT & Latency ]       |
|    1,429,820 tokens          142.6 tok/s           5 / 8 slots (62%)    310 ms / 2.4s              |
|    Input: 65% | CoT: 35%     Pulsing green ring    Codex: 2/2 | Gem: 1/2   Moving average EMA          |
+----------------------------------------------------------------------------------------------------+
|  PROVIDER SLOT SATURATION & CONCURRENCY MATRIX (Visual Bar per CLI Adapter)                         |
|  - codex-cli:  [████████████████████] 2/2 (100% - SATURATED)  [acc-1: BUSY, acc-2: BUSY]           |
|  - gemini-cli: [██████████..........] 1/2 (50% - HEALTHY)     [gem-1: BUSY, gem-2: READY]          |
|  - claude-cli: [....................] 0/2 (0% - IDLE)         [cl-1: READY, cl-2: READY]           |
+----------------------------------------------------------------------------------------------------+
|  ACTIVE STREAMING EXECUTIONS (REAL-TIME TOKEN SPEEDOMETER & REASONING BREAKDOWN)                  |
|  REQ-ID      MODEL           PROVIDER   PHASE        INPUT   THINKING   CONTENT   TPS     LIVE BAR |
|  #chat-a1    gpt-5.6-asta    codex-cli  [REASONING]  1,240   342 tok    0 tok     48.2/s  [===...] |
|  #chat-b2    deepseek-r1     gemini-cli [CONTENT]    820     512 tok    180 tok   35.4/s  [======] |
+----------------------------------------------------------------------------------------------------+
|  HISTORICAL THROUGHPUT & REQUEST LEDGER (SQLite Persistence)             [Search / Filter by Model]|
|  Time      Request ID    Target Model     Prompt Tok  Reasoning Tok  Output Tok  TTFT    Status     |
|  14:20:05  chatcmpl-91a  codex/gpt-5      1,120       420            890         280ms   200 OK     |
|  14:19:42  chatcmpl-88c  gemini-2.5-pro   450         0              620         410ms   200 OK     |
+----------------------------------------------------------------------------------------------------+
```

### 2.1. Backend Enhancements
1. **Nâng cấp `token-estimator.ts`:**
   - Hỗ trợ `estimateTextTokens(text)` phân biệt ASCII (~3.7 char/token) và Unicode/CJK/Vietnamese (~2.2 char/token).
   - Hỗ trợ `estimatePromptTokens(messages)`.
2. **`ActiveRequestTracker` Singleton:**
   - Quản lý các in-flight request: `phase` ("PRE_FLIGHT" | "REASONING" | "CONTENT"), `promptTokens`, `reasoningTokens`, `contentTokens`, `ttftMs`, `ttfrMs`, `currentTps`.
3. **Hooking vào `openai-chat.ts`:**
   - Tích hợp với `ThinkingDemuxer` callbacks `onThoughtDelta` và `onContentDelta`.
   - Micro-throttle 80ms trước khi phát broadcast `telemetry:request:tick` để chống ngập Event Loop.
   - Ghi bản ghi chi tiết vào SQLite `request_metrics` khi kết thúc.

### 2.2. Frontend UI: `TelemetryProfilerView.tsx`
- 4 phân khu: HUD Fleet Metrics, Provider Slot Saturation Matrix, Active Streaming Executions (với Phase badge và CoT tokens), Historical Request Ledger.
- Kèm Diagnostic Probe Harness để thử nghiệm benchmark stream tức thì.

### 2.3. Trade-offs & Resilience
- **Giả định cốt lõi:** Libuv async stream I/O kết hợp micro-throttled SSE 80ms không gây backpressure cho Fastify.
- **First Failure Condition:** Stream vô tận sinh rác ANSI tần suất cực lớn làm ngập buffer. Khắc phục: Backpressure check trên SSE socket, Max Token Cap circuit breaker, và ANSI sanitizer cắt bỏ escape code ngay tại tầng byte Buffer.
