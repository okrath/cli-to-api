# BẢN ĐỀ XUẤT KIẾN TRÚC CHI TIẾT (CANDIDATE 2)
## DỰ ÁN: CLI-TO-API — TELEMETRY & OBSERVABILITY ENGINE
### Đề bài: Thay thế Chat Playground bằng màn hình giám sát Token Input/Output, Active Providers & Models
### Định hướng (Angle): Persistent Token & Execution Ledger (SQLite-backed `request_metrics`, historical analytics, provider/model aggregations, REST + SSE hybrid)
**Tác giả:** Candidate 2 — Ultra Verifier Architecture Council  
**Ngày lập đề xuất:** 17/09/2026  

---

## 1. BRAINSTORM CONTRACT (HỢP ĐỒNG THIẾT KẾ KIẾN TRÚC)

### 1.1. Outcome (Trạng thái vận hành & Giao diện đích)
- **Loại bỏ hoàn toàn Chat Playground**: Không còn giữ vai trò như một giao diện chat thử nghiệm đồ chơi (`PlaygroundView.tsx`). Toàn bộ luồng người dùng trên Web Admin Console được chuyển trọng tâm sang **Vận hành & Quan sát Hệ thống (Observability & Production Ops)**.
- **Trang bị "Token & Execution Ledger Deck"**: Một trung tâm chỉ huy thời gian thực và sổ cái lịch sử (Persistent Ledger), cho phép quản trị viên:
  1. Giám sát chính xác tức thời: Có bao nhiêu request đang chạy, **những Provider nào đang hoạt động** (`codex-cli`, `gemini-cli`, `claude-code`), **những Model nào đang được thực thi** (`gpt-5.6-asta`, `gemini-2.5-pro`, `claude-3-7-sonnet`), thời gian chạy lũy kế và slot concurrency tương ứng.
  2. Bóc tách số lượng **Token Input (Prompt)**, **Token Output (Completion)** và **Reasoning/Thinking Tokens (CoT)** trên từng request, từng provider, từng model và từng tài khoản sandbox.
  3. Truy vấn sổ cái lịch sử (`request_metrics`) được lưu trữ vĩnh viễn trong SQLite nội bộ: Hỗ trợ lọc theo khoảng thời gian (15m, 1h, 24h, 7d, all-time), phân trang, tìm kiếm mã request, kiểm tra mã lỗi (HTTP 200, 429 Rate Limit, 500 Subprocess Crash, Client Aborted), độ trễ TTFT (Time-To-First-Token) và tổng thời lượng xử lý.
  4. Cơ chế đồng bộ kép (Hybrid Sync): Khởi tạo trạng thái và truy vấn lịch sử qua REST API; nhận cập nhật trạng thái runtime siêu nhạy qua Server-Sent Events (SSE) mà không cần polling liên tục.

### 1.2. Constraints (Ràng buộc kỹ thuật nghiêm ngặt)
- **Zero External Telemetry Infrastructure**: Không phụ thuộc vào bất kỳ hạ tầng giám sát bên ngoài nào (không cài Prometheus, Grafana, OpenTelemetry Collector, ClickHouse, Redis hay dịch vụ SaaS đám mây). Mọi dữ liệu phải tự vận hành nội bộ (self-contained) bên trong gateway `cli-to-api`.
- **Cơ sở dữ liệu SQLite cục bộ (High-concurrency WAL mode)**: Khai thác bảng `request_metrics` đã được khai báo trong Drizzle ORM (`better-sqlite3`). Phải đảm bảo ghi số liệu với độ trễ < 1ms, không gây hiện tượng khóa database (`SQLITE_BUSY`) ảnh hưởng đến luồng chính gọi CLI.
- **Khả năng tương thích tuyệt đối chuẩn OpenAI**: Quá trình đo đếm token, ghi sổ nhật ký không được làm thay đổi cấu trúc payload trả về hoặc làm đứt gãy kết nối SSE `text/event-stream` của các client IDE như Cursor, Claude Code, Cline, Continue.dev hay Aider.
- **Hiệu năng Streaming (Zero Degradation)**: Việc tích lũy token và đo TTFT trong khi parse ANSI stream không được gây lag bộ đệm, không làm tăng jitter giữa các chunk phát ra cho client.
- **Stack công nghệ đồng nhất**: Backend viết bằng Fastify (TypeScript ESM); Frontend viết bằng React 18, Vite, Tailwind CSS, Lucide Icons.

### 1.3. Non-goals (Các mục tiêu ngoài phạm vi)
- **Không lưu trữ nội dung chat đầy đủ (Full Prompt/Response Payload Logging)**: Vì lý do an toàn dữ liệu và bảo mật thông tin nhạy cảm của lập trình viên trong mã nguồn, `request_metrics` chỉ lưu metadata, số token, model, latency, status code và error message tóm tắt; không lưu toàn bộ hàng chục ngàn ký tự prompt/completion vào SQLite.
- **Không xây dựng hệ thống thanh toán hay tính tiền tài chính (Billing/Stripe integration)**: Màn hình này đóng vai trò sổ cái kỹ thuật (Execution Ledger) theo dõi mức tiêu hao token và tải hạ tầng, không phải cổng thanh toán thương mại điện tử.
- **Không thay thế Live SSE Inspector**: Màn hình `Live SSE Inspector` (`LiveInspectorView.tsx`) giữ nguyên chức năng chẩn đoán byte-level thô và diff ANSI code.

### 1.4. Acceptance Criteria (Tiêu chí nghiệm thu GIVEN-WHEN-THEN)

```gherkin
Feature: Chuyển đổi Chat Playground sang Token & Execution Ledger

  Scenario: Truy cập giao diện quản trị sau khi nâng cấp
    Given Người dùng mở Web Admin Console tại địa chỉ localhost:PORT
    Then Menu Sidebar không còn xuất hiện mục "Chat Playground"
    And Menu Sidebar hiển thị tab mới "Token & Execution Ledger" với icon trực quan
    And Đường dẫn mặc định hoặc chuyển hướng tab không gặp lỗi trắng trang

  Scenario: Request hoàn tất qua Gateway và ghi nhận vào Persistent Ledger
    Given Một client bên ngoài (Cursor / cURL) gửi POST /v1/chat/completions (cả stream và non-stream)
    When CLI process xử lý xong và Gateway đóng phản hồi HTTP/SSE thành công
    Then Một bản ghi mới được lưu vào bảng SQLite request_metrics với đầy đủ:
      requestId, adapterId (provider), modelExecuted, promptTokens, completionTokens,
      ttftMs, totalDurationMs, statusCode=200, status="SUCCESS"
    And SSE Admin EventBus phát tín hiệu ledger:entry tới Web Console

  Scenario: Giám sát Provider và Model đang chạy trong thời gian thực
    Given Có 2 request đồng thời đang gọi qua codex-cli (model: gpt-5.6-asta) và 1 request qua gemini-cli (model: gemini-2.5-flash)
    When Quản trị viên nhìn vào khối "Active Executions Monitor"
    Then Thẻ KPI "Active Providers" hiển thị 2 (codex-cli, gemini-cli)
    And Thẻ KPI "Active Models" hiển thị 2 (gpt-5.6-asta [2 slots], gemini-2.5-flash [1 slot])
    And Bảng tiến trình đang chạy hiển thị thời gian elapsed time tăng theo từng giây kèm ID tiến trình

  Scenario: Thống kê tổng hợp số lượng Token theo thời gian
    Given Quản trị viên chọn bộ lọc thời gian "Last 24 Hours" trên màn hình Ledger
    When Giao diện gửi yêu cầu lấy dữ liệu tổng hợp từ Backend
    Then Các thẻ KPI hiển thị tổng Input Tokens, tổng Output Tokens và tổng Reasoning Tokens chính xác
    And Biểu đồ/Thanh phân bổ hiển thị tỷ trọng Token tiêu thụ giữa các Provider và Model tương ứng

  Scenario: Xử lý sự cố Client ngắt kết nối (Abort) hoặc CLI gặp lỗi
    Given Request đang streaming thì client ngắt kết nối giữa chừng (AbortController triggered)
    When Tiến trình CLI bị terminate và slot tài khoản được giải phóng
    Then Bản ghi trong SQLite được cập nhật trạng thái "ABORTED" hoặc "ERROR"
    And Số token đã phát sinh đến thời điểm ngắt vẫn được hạch toán đầy đủ vào tổng Input/Output
```

---

## 2. CHI TIẾT KIẾN TRÚC & ĐẶC TẢ KỸ THUẬT

```
+----------------------------------------------------------------------------------------------------+
|                                    CLIENTS & CONSUMERS                                             |
|                     (Cursor IDE, Claude Code CLI, Continue.dev, cURL, Python SDK)                  |
+----------------------------------------------------------------------------------------------------+
                                                  │ POST /v1/chat/completions (Stream / Non-stream)
                                                  ▼
+────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                    GATEWAY FASTIFY ENGINE                                          |
|                                                                                                    |
|  [SessionThreadManager] ──► [LoadBalancer & SWRR] ──► [AccountPool (Slot Semaphores)]              |
|                                                               │                                    |
|                                                               ▼                                    |
|  [ActiveExecutionTracker] ◄── [Supervisor: ProcessManager (pty / pipe executor)]                   |
|       │                                                       │                                    |
|       │ (Real-time Start/Progress/Complete)                   │ (stdout / ANSI Sanitizer / Demux)  |
|       ▼                                                       ▼                                    |
|  [AdminEventBus]                                     [TokenEstimator & CoT Extractor]              |
|       │                                                       │                                    |
|       │ SSE: ledger:entry, request:start/complete             │ Token counts, TTFT, Duration       |
|       ▼                                                       ▼                                    |
|  [GET /api/admin/events]                              [SQLite WAL: request_metrics]                |
|       │                                                       │                                    |
+───────┼───────────────────────────────────────────────────────┼────────────────────────────────────+
        │ (SSE Live Push)                                       │ (REST Queries: Aggregations & Log)
        ▼                                                       ▼
+────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                  WEB CONSOLE FRONTEND (REACT 18)                                   |
|                                                                                                    |
|  [NavTab: "ledger"] ──► <TokenLedgerView />                                                        |
|                           ├── <KpiHeaderCards /> (Input Tokens, Output Tokens, Active Providers)   |
|                           ├── <LiveExecutionDeck /> (Currently running requests & live slots)      |
|                           ├── <ProviderModelBreakdown /> (Token distribution bars & share)         |
|                           └── <HistoricalLedgerTable /> (Paginated SQLite-backed audit log)        |
+────────────────────────────────────────────────────────────────────────────────────────────────────+
```

### 2.1. Dỡ bỏ Chat Playground
- Cập nhật `apps/web/src/components/layout/Sidebar.tsx`: Thay tab `playground` thành `ledger` với icon `Cpu`.
- Cập nhật `apps/web/src/App.tsx`: Import và render `TokenLedgerView`.

### 2.2. Nâng cấp Database & Backend
- Mở rộng bảng `request_metrics` trong `apps/gateway/src/db/schema.ts`:
  - `adapterId` (text), `reasoningTokens` (integer), `totalTokens` (integer), index trên `createdAt`, `adapterId`, `modelExecuted`.
- Thêm `TelemetryPersistQueue` gom mẻ ghi SQLite (20 items hoặc 200ms) để loại bỏ 95% lock overhead.
- Viết các endpoint REST trong `apps/gateway/src/api/routes/admin-telemetry.ts`:
  - `GET /api/telemetry/summary`
  - `GET /api/telemetry/breakdown`
  - `GET /api/telemetry/ledger`

### 2.3. Thiết kế Frontend UI: `TokenLedgerView.tsx`
- **4 Thẻ KPI:** Input Tokens, Output & CoT Tokens, Active Providers Running (pulsing badge), Active Models Running.
- **Live Execution Deck:** Dòng tiến trình đang chạy theo thời gian thực kèm live elapsed timer.
- **Provider & Model Breakdown:** Stacked bar CSS Tailwind phân bổ tỷ trọng token và ma trận model.
- **Historical Ledger Table:** Bảng kiểm toán phân trang, lọc theo thời gian, provider, status code, TTFT.

### 2.4. Trade-offs & Resilience
- **Giả định cốt lõi:** SQLite WAL mode với `busy_timeout = 5000` kết hợp In-Memory Micro-Batch Queue đảm bảo zero-lag cho luồng stream chính.
- **First Failure Condition:** Tải nặng ghi dồn dập vào SQLite gây lock. Khắc phục: `TelemetryPersistQueue` đệm trong RAM, ghi gom mẻ asynchronously.
