# BẢN ĐỀ XUẤT KIẾN TRÚC & ĐẶC TẢ KỸ THUẬT (CANDIDATE 1)
## Đề tài: Chuyển đổi Chat Playground thành Live Token Radar & In-Flight Execution Matrix
**Dự án:** `cli-to-api`  
**Góc tiếp cận (Angle):** Reactive Live-Stream & Active Fleet Radar (SSE Event-Driven, In-Flight Execution Matrix, Ephemeral State, Ultra-Low Latency)  
**Tác giả:** Candidate 1 — Ultra Verifier Architecture Council  
**Ngày lập đề xuất:** 17/09/2026  

---

## 1. BRAINSTORM CONTRACT (HỢP ĐỒNG ĐẶC TẢ KIẾN TRÚC)

### 1.1. Mục tiêu và Trạng thái Vận hành Cuối (Outcome)
* **Loại bỏ hoàn toàn Chat Playground:** Thay thế tab tương tác chat đơn lẻ (`PlaygroundView.tsx` / "Chat Playground") — vốn là thành phần mang tính demo/thử nghiệm — bằng một trung tâm điều hành thời gian thực chuyên dụng: **Active Fleet Radar & Live Token Matrix** (`LiveRadarView.tsx`).
* **Hệ thống Giám sát Thông lượng & Token Thời gian thực:**
  * Quan sát trực tiếp dòng lưu lượng token: **Input/Prompt Tokens**, **Output/Completion Tokens**, **Reasoning/CoT Tokens**, cùng tốc độ sinh token tức thời (**Tokens/second**).
  * Hiển thị trạng thái các **Active Providers/Adapters** (`gemini-cli`, `codex-cli`, `claude-cli`, v.v.) và các **Active Models** đang thực thi in-flight.
  * Bảng điều khiển ma trận thực thi (**In-Flight Execution Matrix**) phản ánh từng tiến trình CLI đang chiếm dụng worker slot, đo lường độ trễ từ lúc nhận socket đến token đầu tiên (**TTFT - Time To First Token**) và tổng thời gian chu kỳ sống (**Total Duration**).
* **Độ trễ cực thấp (Ultra-Low Latency) dựa trên SSE Event-Driven:**
  * Loại bỏ cơ chế polling chu kỳ gây giật lag và Disk I/O spike lên SQLite.
  * Giao diện cập nhật phản ứng (< 50ms) thông qua kênh Server-Sent Events (`/api/admin/events`) sẵn có, kết hợp cơ chế snapshot tức thời (initial state hydration) khi client mở/F5 trang.

### 1.2. Ràng buộc Kiến trúc (Constraints)
1. **Process Containment & An toàn Hệ thống:** Không được làm suy giảm cơ chế cô lập tiến trình nền tảng (Win32 Job Objects, PTY/Pipe execution limits, sandbox directories, và AbortSignal cancellation) được quy định tại `apps/gateway/src/supervisor/`.
2. **Chuẩn tương thích OpenAI API (`/v1/chat/completions`):** Giữ nguyên vẹn 100% định dạng SSE chunk và JSON response cho các client bên ngoài (Cursor, Cline, Roo Code, Continue, Aider, curl). Mọi instrumentation thu thập telemetry phải là non-blocking và zero-overhead đối với luồng stream chính.
3. **Giữ vững Tech Stack hiện hữu (Fastify + React + TailwindCSS):** Không bổ sung các thư viện trạng thái cồng kềnh (Redux, MobX) hay đổi sang framework khác. Tận dụng React Hooks tối ưu với requestAnimationFrame throttling, Lucide-react icons, và Fastify v4/v5 architecture.
4. **Không phụ thuộc Hạ tầng Telemetry Ngoài (Zero External Telemetry Infra):**
   * Tuyệt đối **không** dùng Prometheus, Grafana, OpenTelemetry Collector, Redis, Kafka hay Datadog.
   * Toàn bộ trạng thái in-flight được quản lý **in-memory** (RAM O(1)) bên trong tiến trình Gateway daemon.
   * Lịch sử tổng hợp chỉ lưu vào SQLite cục bộ (`apps/gateway/src/db/schema.ts` bảng `request_metrics`) với tần suất ghi tối thiểu (1 lần tại thời điểm kết thúc request, zero-write trong quá trình stream chunk).

### 1.3. Những Điều Không Làm (Non-Goals)
* **Không lưu trữ Time-Series Database dài hạn:** Radar này không phục vụ mục đích phân tích dữ liệu 30–90 ngày hay vẽ biểu đồ rollup phức tạp; đây là radar giám sát trạng thái sống (ephemeral operational telemetry).
* **Không giữ lại Chat Input / Chat History:** Mọi giao diện nhập prompt, chọn effort thủ công để chat thử nghiệm sẽ bị xóa bỏ hoàn toàn khỏi view này. cli-to-api được định vị là một High-Performance Local AI Gateway chứ không phải một Web Chatbot.
* **Không can thiệp Thuật toán Định tuyến:** Radar chỉ là bộ thu thập và quan sát dữ liệu (read-only observer), không làm thay đổi logic của `swrr-balancer.ts`, `pipeline-executor.ts` hay `account-pool.ts`.
* **Không làm Billing Ledger:** Không tích hợp hệ thống thanh toán hay tính tiền theo token; chỉ đo đếm kỹ thuật (token count / throughput).

### 1.4. Tiêu chí Nghiệm thu Đo lường được (Testable Acceptance Criteria)

```gherkin
Feature: Chuyển đổi Chat Playground thành Live Token Radar & In-Flight Fleet Matrix

  Scenario: AC-1 - Thay thế hoàn toàn Chat Playground trên thanh điều hướng
    Given Gateway và Web UI đang hoạt động
    When Người dùng quan sát Sidebar điều hướng
    Then Tab "Chat Playground" (icon PlaySquare) không còn xuất hiện
    And Xuất hiện tab mới "Active Fleet Radar" (icon Radar)
    And Khi click vào tab này, màn hình hiển thị view LiveRadarView thay vì PlaygroundView

  Scenario: AC-2 - Khởi tạo In-Flight Request và ước lượng Input Token ngay lập tức
    Given Một IDE (Cursor/Cline) gửi POST tới "/v1/chat/completions" với payload 500 ký tự prompt
    When Gateway cấp phát thành công 1 worker slot và bắt đầu spawn tiến trình CLI
    Then Event "request:start" được broadcast qua kênh SSE "/api/admin/events" trong vòng < 20ms
    And Event chứa chính xác "promptTokens" ước lượng, "modelRequested", "provider", và "accountId"
    And Trên UI LiveRadarView, một dòng mới hiển thị trong bảng "In-Flight Request Matrix" ở trạng thái RUNNING mà không cần reload trang

  Scenario: AC-3 - Giám sát Output Token và Tốc độ Sinh Token (tok/s) theo thời gian thực
    Given Một request streaming đang nhận dữ liệu stdout từ adapter CLI
    When Các chunk văn bản hoặc reasoning CoT được stream về Gateway
    Then Gateway ghi nhận Time-To-First-Token (TTFT) tại chunk đầu tiên
    And Gateway tích lũy completionTokens và phát xung telemetry "request:progress" (throttled ~100ms)
    And UI hiển thị số Output Token nhảy tăng dần kèm chỉ số tok/s thời gian thực trên thanh gauge của request đó

  Scenario: AC-4 - Kết thúc Request, chốt Token Metrics và dọn dẹp In-Flight
    Given Request streaming hoặc non-streaming hoàn thành hoặc gặp lỗi
    When Socket kết thúc hoặc client abort kết nối
    Then Gateway phát event "request:complete" chứa tổng promptTokens, completionTokens, reasoningTokens, ttftMs và totalDurationMs
    And Gateway ghi 1 bản ghi duy nhất vào bảng SQLite "request_metrics"
    And UI cập nhật KPI Cards (Cumulative Input/Output Tokens)
    And Dòng request trong bảng In-Flight chuyển sang trạng thái "COMPLETED" / "FAILED", giữ lại 5 giây trước khi tự động archive

  Scenario: AC-5 - Đồng bộ trạng thái In-Flight ban đầu khi F5 hoặc mở tab mới (Snapshot Hydration)
    Given Có 2 requests đang chạy dở trong Gateway
    When Người dùng mở tab "Active Fleet Radar" trên trình duyệt mới hoặc bấm F5
    Then Gateway gửi ngay lập tức event "radar:snapshot" chứa danh sách đầy đủ các in-flight requests hiện hành
    And UI lập tức render 2 tiến trình đang chạy và số lượng provider/model active mà không bị màn hình trống
```

---

## 2. DETAILED ARCHITECTURE & TECHNICAL SPECIFICATION

### 2.1. Kiến trúc Tổng thể Dòng Dữ liệu (Reactive Telemetry Topology)

```
       [ Client Application: Cursor / Cline / Roo Code / cURL ]
                                  │
                       POST /v1/chat/completions
                                  ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ FASTIFY GATEWAY DAEMON (apps/gateway)                                   │
 │                                                                         │
 │  1. Load Balancer & Semaphore (AccountPool)                             │
 │     └─► Estimate Prompt Tokens: estimateTokenUsage(messages, "")        │
 │                                                                         │
 │  2. InFlightExecutionTracker (In-Memory Singleton)                      │
 │     ├─► registerRequest(id, metadata, promptTokens)                     │
 │     └─► Broadcast "request:start" ────────────────────────┐             │
 │                                                           │             │
 │  3. ProcessManager / PipelineExecutor                     │             │
 │     │ (Spawn CLI inside Win32 Job Object sandbox)         │             │
 │     ├─ First stdout chunk: record TTFT                    │             │
 │     ├─ Stream deltas: accumulate tokens, throttle pulse   │             │
 │     └─ Broadcast "request:progress" / "chunk:delta" ──────┼──┐          │
 │                                                           │  │          │
 │  4. Finalizer (Streaming End / Unary Complete / Abort)    │  │          │
 │     ├─ Calculate exact tokens (Prompt + Completion + CoT) │  │          │
 │     ├─ unregisterRequest(id)                              │  │          │
 │     ├─ Broadcast "request:complete" ──────────────────────┼──┼──┐       │
 │     └─ Asynchronous Single Write to SQLite (request_metrics) │  │       │
 └───────────────────────────────────────────────────────────┼──┼──┼───────┘
                                                             │  │  │
                                      SSE: /api/admin/events │  │  │
                                                             ▼  ▼  ▼
 ┌─────────────────────────────────────────────────────────────────────────┐
 │ REACT WEB FRONTEND (apps/web) ─── LiveRadarView                         │
 │                                                                         │
 │  ┌───────────────────────────────────────────────────────────────────┐  │
 │  │ KPI Stats Bar: Input Toks | Output Toks | Active Providers | Models│  │
 │  └───────────────────────────────────────────────────────────────────┘  │
 │  ┌───────────────────────────────────────────────────────────────────┐  │
 │  │ Live In-Flight Request Matrix (Live Gauges, TTFT, Tok/s, Abort)   │  │
 │  └───────────────────────────────────────────────────────────────────┘  │
 │  ┌─────────────────────────────────┬─────────────────────────────────┐  │
 │  │ Provider Fleet Health Radar     │ Recent Completed Executions Log │  │
 │  └─────────────────────────────────┴─────────────────────────────────┘  │
 └─────────────────────────────────────────────────────────────────────────┘
```

### 2.2. Dỡ bỏ Chat Playground
1. Sửa `apps/web/src/components/layout/Sidebar.tsx`: Đổi `NavTab` từ `playground` sang `radar`, icon `Radar`.
2. Sửa `apps/web/src/App.tsx`: Xóa bỏ import `PlaygroundView`, thay thế bằng `LiveRadarView`.

### 2.3. Nâng cấp Telemetry Backend
- `apps/gateway/src/router/in-flight-tracker.ts`:
  - Singleton `globalInFlightTracker` quản lý `Map<string, InFlightExecution>`.
  - Hỗ trợ `register()`, `recordFirstToken()`, `recordTokenProgress()`, `complete()`, `getSnapshot()`.
- Tích hợp `apps/gateway/src/api/routes/openai-chat.ts`:
  - Broadcast `request:start` với promptTokens, provider, model, account.
  - Broadcast throttled (100ms) `request:progress` với completionTokens, tokensPerSecond, ttftMs.
  - Broadcast `request:complete` với đầy đủ metrics.
  - Ghi 1 bản ghi vào bảng SQLite `request_metrics`.

### 2.4. Thiết kế Frontend UI: `LiveRadarView.tsx`
- **KPI Cards 4 cột:** Cumulative Input Tokens, Cumulative Output Tokens, Active Providers, Active In-Flight Load.
- **Active In-Flight Request Matrix:** Status, Request ID, Provider/Acc, Model & Tier, Live Tokens (I/O), TTFT/Runtime, Abort button.
- **Split View phía dưới:** Provider Fleet Capacity Radar (40%) & Recent Completed Executions (60%).

### 2.5. Trade-offs & Resilience
- **Giả định cốt lõi:** Quản lý state in-memory trong Node.js process với broadcast SSE 100ms throttle không gây quá tải Event Loop.
- **First Failure Condition:** Mất kết nối mạng / client abort stream. Khắc phục: Bắt `req.raw.on("close")` để cleanup state in-flight, hủy tiến trình con và broadcast `request:abort`.
