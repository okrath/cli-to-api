# BẢN ĐỀ XUẤT KIẾN TRÚC & HỢP ĐỒNG GIAO HÀNG ĐẶC TẢ (BRAINSTORM CONTRACT)
## DỰ ÁN: CLI-TO-API — HIGH-PERFORMANCE AI GATEWAY
### Phân hệ: Thêm Màn Hình Usage (Usage & Token Consumption Analytics View)
### Định hướng Kiến trúc (Candidate 1 Angle):
> **"Pragmatic Embedded Gateway Analytics: Zero-New-Deps, Native SQLite Time-Bucketing, Pure SVG Interactive Charts, Ultra-Fast Load"**

---

**Ứng viên:** Candidate 1 — Ultra Verifier Architecture Council  
**Vai trò:** Principal Embedded Gateway & Systems Architect  
**Trạng thái:** Bounded Engineering Specification & Delivery Contract  
**Ngày lập đề xuất:** 18/09/2026  

---

## 1. BRAINSTORM CONTRACT (HỢP ĐỒNG ĐẶC TẢ GIAO HÀNG)

### 1.1. Mục tiêu và Trạng thái Vận hành Cuối (Outcome)

1. **Khởi tạo Màn hình Quản trị Tiêu thụ Token & Chi phí Tối ưu (Usage Analytics View):**
   * Bổ sung tab điều hướng mới `usage` (**"Usage & Token Analytics"**) trên Sidebar thanh điều hướng (`apps/web/src/components/layout/Sidebar.tsx`), kết nối tới View chuyên trách `UsageAnalyticsView.tsx`.
   * Khác biệt hoàn toàn với `TelemetryStationView` (vốn là trạm radar quan sát socket in-flight thời gian thực, tiến trình worker và failover live), `UsageAnalyticsView` là một **Historical Analytics & Financial Intelligence Console** trả lời dứt khoát 5 câu hỏi vận hành cốt lõi:
     1. Hệ thống đã tiêu thụ bao nhiêu Token (phân rã minh bạch 3 kênh: **Prompt / Input**, **Completion / Output**, và **Deep Reasoning / CoT**) trong khung thời gian được chọn?
     2. Chi phí ước tính tương đương theo USD ($) là bao nhiêu dựa trên bảng giá thực tế của từng Model?
     3. Tốc độ sinh token đầu tiên (**Avg TTFT**) và thời lượng thực thi trung bình (**Avg Duration**) diễn biến ra sao?
     4. Tỷ trọng tiêu thụ đang phân bổ như thế nào qua 3 chiều phân tích: **Theo Model**, **Theo CLI Adapter/Provider**, và **Theo Sandbox Account**?
     5. Xu hướng biến động theo thời gian (Time-Series Trend) diễn tiến như thế nào qua biểu đồ tương tác, giúp phát hiện ngay các đột biến bất thường (traffic spikes).

2. **Hiệu Năng Tải Cực Nhanh (Sub-25ms Load Time) & Zero Bundle Bloat:**
   * Không cài thêm bất kỳ thư viện biểu đồ bên ngoài nào (Zero external charting dependencies: loại trừ Chart.js, Recharts, Victory, D3, Visx). Giữ nguyên kích thước bundle frontend nhẹ tối đa, loại bỏ xung đột React 18 DOM tree, vẽ toàn bộ biểu đồ bằng **Pure React SVG + Tailwind CSS Obsidian Cyberdeck**.
   * Đẩy 100% tải tính toán rollup xuống tầng C-level của engine `better-sqlite3` thông qua các hàm `strftime` / date bucketing nguyên bản trên cơ sở dữ liệu SQLite WAL hiện có. Tuyệt đối không kéo hàng trăm ngàn dòng thô (raw records) lên JavaScript Event Loop để tính toán thủ công.

---

### 1.2. Ràng buộc Kỹ thuật (Constraints)

1. **Zero New External Dependencies:**
   * Không bổ sung bất kỳ package charting nào vào `apps/web/package.json`. Toàn bộ biểu đồ cột chồng (Stacked Histogram), biểu đồ xu hướng (Trendline Sparklines), thanh phân bổ tỷ lệ (Inline Proportion Gauges), và cửa sổ chú giải (Tooltips) được dựng hoàn toàn bằng các thẻ SVG chuẩn (`<svg>`, `<rect>`, `<path>`, `<line>`, `<defs>`, `<linearGradient>`) kết hợp Tailwind CSS.
2. **Native SQLite WAL Engine & C-Level Aggregation:**
   * Sử dụng duy nhất cơ sở dữ liệu SQLite hiện có (`apps/gateway/src/db/index.ts`) đang hoạt động ở chế độ `PRAGMA journal_mode = WAL`.
   * Mọi thao tác gom nhóm theo khung giờ (`hour`) hoặc theo ngày (`day`) phải được thực thi trực tiếp bằng câu lệnh SQL `GROUP BY strftime(...)`, khai thác triệt để B-Tree index trên cột `created_at`.
3. **Single Source of Truth & Zero Redundant Storage:**
   * Nguồn dữ liệu duy nhất cho mọi báo cáo là bảng `request_metrics` (đã được lưu trữ bền bỉ qua hàng đợi `telemetry-persist-queue.ts`). Không tạo thêm bảng phụ rollup trung gian gây phân mảnh dữ liệu, không duy trì background cron jobs phức tạp.
4. **Non-blocking Ingress Isolation:**
   * Các truy vấn thống kê lịch sử không được làm nghẽn hoặc khóa bảng (lock contention) đối với luồng tiếp nhận request `/v1/chat/completions` hay kênh Server-Sent Events `/api/admin/events`. Tận dụng cơ chế WAL (Writers do not block Readers) cùng thiết lập `busy_timeout = 5000`.
5. **Obsidian Cyberdeck Design System Alignment:**
   * Giao diện tuân thủ bảng màu và typography tiêu chuẩn:
     * Background Canvas: `#090B0F` (`bg-canvas`)
     * Card Surface: `#12141C` (`bg-surface`), Border: `#242B3B` (`border-borderSubtle`)
     * Prompt Tokens: Neon Cyan (`#06B6D4` / `text-cyan-400`)
     * Reasoning CoT Tokens: Neon Purple (`#A855F7` / `text-purple-400`)
     * Completion Tokens: Neon Emerald (`#10B981` / `text-emerald-400`)
     * Requests Volume: Amber (`#F59E0B` / `text-amber-400`)
     * Estimated Cost ($): Neon Rose (`#F43F5E` / `text-rose-400`)
     * Typography: Phông JetBrains Mono (`font-mono`) cho toàn bộ số liệu thống kê, timestamps, token counts, latencies.

---

### 1.3. Những Điều Không Làm (Non-Goals)

1. **Không xây dựng Cổng Thanh toán Tiền thật (Payment Gateway / Stripe Billing):**
   * Màn hình Usage đóng vai trò là bảng đồng hồ quan sát kỹ thuật và tài chính nội bộ (Technical Observability & Budget Tracking), không tích hợp cổng quẹt thẻ tín dụng, không xuất hóa đơn điện tử VAT hay trừ tiền tài khoản thực tế.
2. **Không SSE Streaming Từng Giây Cho Màn Hình Usage:**
   * Khác với Live Radar cần cập nhật mỗi 100ms, Usage Analytics là màn hình phân tích chu kỳ tổng hợp (Aggregated Historical Analytics). Dữ liệu được tải theo tương tác của người dùng (chuyển đổi Timeframe, đổi Grouping), hỗ trợ nút Refresh nhanh và soft-revalidation khi chuyển tab.
3. **Không Thay Thế Telemetry Ledger:**
   * Màn hình này tập trung vào các lát cắt tổng hợp, phân phối và xu hướng. Khi cần soi sâu payload, headers hoặc error trace của từng request riêng lẻ, người dùng sử dụng Telemetry Ledger sẵn có tại tab Fleet Radar.
4. **Không Can Thiệp Thuật Toán Định Tuyến:**
   * View hoàn toàn ở vị thế quan sát (Read-Only Observer), không làm thay đổi trọng số SWRR, không can thiệp logic failover hay cô lập sandbox.

---

### 1.4. Tiêu chí Nghiệm thu Đo lường được (Testable Acceptance Criteria)

```gherkin
Feature: Màn hình Phân tích Tiêu thụ Token và Ước lượng Chi phí (Usage Analytics View)

  Scenario: AC-1 - Bổ sung Tab Điều hướng Usage trên Sidebar và Định tuyến
    Given Gateway daemon và Web UI đang hoạt động bình thường
    When Người dùng quan sát thanh Sidebar điều hướng bên trái
    Then Xuất hiện tab mới "Usage & Analytics" với icon BarChart3 (hoặc Coins)
    And Khi click vào tab này, URL hoặc active tab chuyển thành "usage"
    And Màn hình chính render giao diện UsageAnalyticsView với tiêu đề "Token Consumption & Usage Analytics"
    And Thời gian từ lúc click đến khi render xong toàn bộ KPI cards là dưới 100ms

  Scenario: AC-2 - Lọc Dữ liệu theo Khung Thời gian và Tự động Nhóm (Time Range & Grouping)
    Given Người dùng đang ở màn hình UsageAnalyticsView
    When Người dùng chuyển đổi qua lại giữa các nút lọc: "Today", "Yesterday", "7D", "30D", "All Time"
    Then Giao diện cập nhật tham số truy vấn tương ứng tới endpoint "/api/admin/usage/analytics"
    And Khi chọn "Today" hoặc "Yesterday", chế độ nhóm mặc định tự chuyển sang "Hour" (theo giờ)
    And Khi chọn "7D", "30D", hoặc "All Time", chế độ nhóm mặc định tự chuyển sang "Day" (theo ngày)
    And Người dùng vẫn có thể bấm nút toggle Group By để chuyển đổi thủ công giữa "Hour" và "Day"

  Scenario: AC-3 - Hiển thị Bảng Tổng hợp KPI Cards Toàn diện
    Given Đã có dữ liệu các lượt gọi hoàn tất trong cơ sở dữ liệu SQLite
    When Màn hình UsageAnalyticsView tải dữ liệu xong
    Then Hiển thị cụm 4 thẻ KPI chính:
      | KPI Card           | Chỉ số chính                               | Chỉ số phụ / Chi tiết                                    |
      | Total Tokens       | Tổng số token (Prompt + Output + CoT)      | Badge Prompt (Cyan), Completion (Emerald), CoT (Purple)  |
      | Estimated Cost     | Tổng chi phí USD ($) format 4 chữ số thập phân| Chi phí trung bình trên 1K requests                      |
      | Total Requests     | Tổng số lượt gọi API                       | Tỷ lệ thành công (Success Rate %) và số lỗi Failed       |
      | Latency & Velocity | Avg TTFT (ms)                              | Avg Duration (s) và Avg Output Tokens/Request            |
    And Mỗi thẻ KPI có tích hợp một biểu đồ SVG Sparkline mini phản ánh nhịp điệu biến thiên theo thời gian

  Scenario: AC-4 - Render Biểu đồ Cột Chồng Pure React SVG Stacked Bar Chart
    Given Tập dữ liệu time-series trả về từ backend gồm nhiều time buckets
    When Khối biểu đồ chính hiển thị
    Then Biểu đồ được vẽ hoàn toàn bằng thẻ <svg> thuần túy, zero external library
    And Mỗi cột thể hiện chiều cao tích lũy với các dải màu xếp chồng chuẩn xác:
      * Dải dưới: Prompt Tokens (Cyan)
      * Dải giữa: Reasoning Tokens (Purple)
      * Dải trên: Completion Tokens (Emerald)
    And Khi hover chuột vào một cột bất kỳ:
      * Cột đó được highlight với đường quét dọc (scanline) neon
      * Tooltip tương tác hiển thị tọa độ thời gian, số token từng loại, số requests và chi phí ước lượng của khung giờ đó
    And Người dùng có thể click bộ chuyển đổi Metric (Tokens Stacked, Requests Volume, Estimated Cost) để vẽ lại biểu đồ tương ứng

  Scenario: AC-5 - Bảng Phân tích Đa chiều (Breakdown by Model, Adapter, Account)
    Given Người dùng cuộn xuống phần Breakdown Tables
    When Người dùng chuyển đổi giữa 3 tab: "By Model", "By Adapter", "By Account"
    Then Tab "By Model" hiển thị bảng gồm: Model Name, Provider Badge, Calls, Prompt Tokens, CoT Tokens, Completion Tokens, Total Tokens, Estimated Cost ($), Avg TTFT, và % Tỷ trọng tổng token
    And Mỗi dòng có một thanh mini SVG stacked progress bar trực quan thể hiện cơ cấu Token
    And Tab "By Adapter" hiển thị số liệu gom nhóm theo CLI Provider (codex-cli, claude-code, devin-cli, v.v.)
    And Tab "By Account" hiển thị mức độ ngốn tài nguyên của từng Account Sandbox

  Scenario: AC-6 - Động cơ Định giá Model (Pricing Engine) và Fallback Thông minh
    Given Một request sử dụng model "gpt-5.6-asta" hoặc "claude-3-7-sonnet"
    When Backend tính toán trường estimatedCostUsd cho bản ghi
    Then Giá trị được tính bằng công thức: (prompt_tokens * prompt_rate + (completion_tokens + reasoning_tokens) * completion_rate) / 1,000,000
    And Nếu model chưa có giá trong catalog cụ thể, hệ thống tự động fallback theo Family Wildcard hoặc Tier mặc định (low, medium, high, xhigh)
    And Không làm phát sinh lỗi NaN, null hoặc 500 khi gặp model tùy biến chưa đăng ký giá
```

---

## 2. THIẾT KẾ KIẾN TRÚC CHI TIẾT (TECHNICAL ARCHITECTURE & SPECIFICATION)

### 2.1. Sơ đồ Dòng Dữ liệu & Kiến trúc Tổng thể (Reactive Telemetry Topology)

```
 ┌─────────────────────────────────────────────────────────────────────────────────────────┐
 │                                   FASTIFY GATEWAY DAEMON                                │
 │                                                                                         │
 │  [ Ingress Traffic: Cursor / Cline / OpenAI SDK / Anthropic SDK ]                       │
 │                                  │                                                      │
 │                                  ▼                                                      │
 │                    telemetry-persist-queue.ts                                           │
 │                                  │ (Batched / Async Single Insert)                      │
 │                                  ▼                                                      │
 │        ┌───────────────────────────────────────────────────────┐                        │
 │        │ SQLite WAL Database (apps/gateway/src/db/index.ts)    │                        │
 │        │ Table: request_metrics                                │                        │
 │        │ Indexes: idx_request_metrics_created_at               │                        │
 │        │          idx_request_metrics_usage_rollup (New!)       │                        │
 │        └───────────────────────────────────────────────────────┘                        │
 │                                  │                                                      │
 │   ┌──────────────────────────────┴──────────────────────────────────────────────────┐  │
 │   │ Usage Analytics Engine (apps/gateway/src/telemetry/usage-analytics.ts)           │  │
 │   │                                                                                  │  │
 │   │  1. Compute Timestamp Windows (UTC/Local Safe Bounds in Unix Seconds)            │  │
 │   │  2. Direct C-Level Aggregation via better-sqlite3 Prepared Statements:           │  │
 │   │     ├─► Query A: KPI Metrics Summary (SUM, AVG, COUNT, Status distribution)      │  │
 │   │     ├─► Query B: Time-Series Histogram (GROUP BY strftime('%Y-%m-%d %H:00', ...))│  │
 │   │     └─► Query C: Multi-dimensional Rollups (Model, Adapter, Account)             │  │
 │   │  3. Model Pricing Lookup Engine (pricing-engine.ts):                             │  │
 │   │     └─► Maps token counts to exact USD costs with 3-tier fallback                │  │
 │   └──────────────────────────────────────────────────────────────────────────────────┘  │
 │                                  │                                                      │
 │                        GET /api/admin/usage/analytics                                   │
 └──────────────────────────────────┼──────────────────────────────────────────────────────┘
                                    │ JSON Payload (HTTP REST, < 25ms)
                                    ▼
 ┌─────────────────────────────────────────────────────────────────────────────────────────┐
 │                                REACT WEB FRONTEND (apps/web)                            │
 │                                                                                         │
 │   Sidebar.tsx (New Tab: 'usage') ──► App.tsx Router                                     │
 │                                         │                                               │
 │                                         ▼                                               │
 │                         UsageAnalyticsView.tsx (Root Controller)                        │
 │   ┌──────────────────────────────────────────────────────────────────────────────────┐  │
 │   │ TimeFilterToolbar.tsx : Today | Yesterday | 7D | 30D | All Time + Group: Hour/Day │  │
 │   └──────────────────────────────────────────────────────────────────────────────────┘  │
 │   ┌──────────────────────────────────────────────────────────────────────────────────┐  │
 │   │ UsageKpiGrid.tsx : 4 Obsidian Cyberdeck Cards + SVG Sparklines                   │  │
 │   │ [ Total Tokens (I/O/CoT) ] [ Est. Cost ($) ] [ Total Requests ] [ Avg TTFT ]     │  │
 │   └──────────────────────────────────────────────────────────────────────────────────┘  │
 │   ┌──────────────────────────────────────────────────────────────────────────────────┐  │
 │   │ SvgStackedBarChart.tsx : Zero-Deps Pure SVG Interactive Histogram                │  │
 │   │ • Metric Switcher (Tokens Stacked / Requests / Cost)                             │  │
 │   │ • Cyberdeck Neon Rects (Cyan = Prompt, Purple = Reasoning, Emerald = Output)    │  │
 │   │ • Interactive Scanline Cursor & Floating Glassmorphism Tooltip                   │  │
 │   └──────────────────────────────────────────────────────────────────────────────────┘  │
 │   ┌──────────────────────────────────────────────────────────────────────────────────┐  │
 │   │ UsageBreakdownTables.tsx : Tabbed Multi-Dimensional Exploration                  │  │
 │   │ [ Tab 1: By Model ]  [ Tab 2: By CLI Adapter ]  [ Tab 3: By Account Sandbox ]    │  │
 │   │ (Includes Inline Micro-Bar Ratios, Cost Share %, and Latency Profiling)          │  │
 │   └──────────────────────────────────────────────────────────────────────────────────┘  │
 └─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 2.2. Chi tiết Backend API Endpoints & SQLite Queries

#### 2.2.1. Tối ưu Hóa Index Cơ Sở Dữ Liệu (Covering Composite Index)
Bổ sung index composite vào bảng `request_metrics` trong `apps/gateway/src/db/schema.ts` (và thực thi tự động qua migration / idempotent index check tại khởi động):

```sql
-- DDL tạo index tăng tốc độ rollup thời gian (Index-Only / Range Scan)
CREATE INDEX IF NOT EXISTS idx_request_metrics_usage_rollup 
ON request_metrics (created_at, adapter_id, model_executed, account_id, status_code);
```

#### 2.2.2. Đặc tả Endpoint `GET /api/admin/usage/analytics`

* **Route:** `GET /api/admin/usage/analytics`
* **Query Parameters:**
  * `range` (string, optional): `"today"` | `"yesterday"` | `"7d"` | `"30d"` | `"all"` (Mặc định: `"7d"`).
  * `groupBy` (string, optional): `"hour"` | `"day"` (Nếu không truyền: tự suy luận `"today"`/`"yesterday"` -> `"hour"`; `"7d"`/`"30d"`/`"all"` -> `"day"`).
  * `adapterId` (string, optional): Lọc theo adapter nhất định (vd: `codex-cli`).
  * `model` (string, optional): Lọc theo model nhất định (vd: `gpt-5.6-asta`).
  * `accountId` (string, optional): Lọc theo account sandbox cụ thể.

* **Response Payload Contract (`UsageAnalyticsResponse`):**
```json
{
  "timeRange": {
    "range": "7d",
    "groupBy": "day",
    "startTs": 1726045200,
    "endTs": 1726650000
  },
  "summary": {
    "totalPromptTokens": 8452000,
    "totalCompletionTokens": 4120000,
    "totalReasoningTokens": 2840000,
    "totalTokens": 15412000,
    "totalRequests": 3420,
    "successfulRequests": 3392,
    "failedRequests": 28,
    "rateLimitedRequests": 4,
    "avgTtftMs": 412.5,
    "avgDurationMs": 3840.2,
    "estimatedCostUsd": 42.8542
  },
  "timeSeries": [
    {
      "bucket": "2026-09-12",
      "bucketTimestamp": 1726099200,
      "requestCount": 420,
      "promptTokens": 1100000,
      "completionTokens": 540000,
      "reasoningTokens": 320000,
      "totalTokens": 1960000,
      "estimatedCostUsd": 5.4210,
      "avgTtftMs": 398.2
    }
  ],
  "breakdownByModel": [
    {
      "model": "gpt-5.6-asta",
      "adapterId": "codex-cli",
      "callCount": 1250,
      "promptTokens": 4200000,
      "completionTokens": 2100000,
      "reasoningTokens": 1800000,
      "totalTokens": 8100000,
      "avgTtftMs": 480.1,
      "avgDurationMs": 5210.0,
      "estimatedCostUsd": 29.7000,
      "percentageOfTokens": 52.56,
      "percentageOfCost": 69.30
    }
  ],
  "breakdownByAdapter": [
    {
      "adapterId": "codex-cli",
      "callCount": 2100,
      "promptTokens": 5800000,
      "completionTokens": 2900000,
      "reasoningTokens": 2100000,
      "totalTokens": 10800000,
      "avgTtftMs": 440.5,
      "estimatedCostUsd": 35.1200,
      "percentageOfTokens": 70.08
    }
  ],
  "breakdownByAccount": [
    {
      "accountId": "acc_codex_primary",
      "adapterId": "codex-cli",
      "callCount": 1800,
      "promptTokens": 4900000,
      "completionTokens": 2400000,
      "reasoningTokens": 1700000,
      "totalTokens": 9000000,
      "avgTtftMs": 435.0,
      "estimatedCostUsd": 29.4000,
      "percentageOfTokens": 58.40
    }
  ]
}
```

#### 2.2.3. Logic Tính Toán Mốc Thời Gian (Unix Safe Bounds)
Được đặt tại `apps/gateway/src/telemetry/usage-analytics.ts`:

```typescript
export function resolveTimeBounds(range: string): { startTs: number; endTs: number; defaultGroupBy: "hour" | "day" } {
  const now = new Date();
  const currentTs = Math.floor(now.getTime() / 1000);

  // Mốc 00:00:00 của ngày hôm nay theo Local Time của Gateway Host
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayStartTs = Math.floor(todayStart.getTime() / 1000);

  switch (range) {
    case "today":
      return { startTs: todayStartTs, endTs: currentTs, defaultGroupBy: "hour" };

    case "yesterday": {
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      const yesterdayStartTs = Math.floor(yesterdayStart.getTime() / 1000);
      return { startTs: yesterdayStartTs, endTs: todayStartTs - 1, defaultGroupBy: "hour" };
    }

    case "7d": {
      const start7dTs = currentTs - 7 * 86400;
      return { startTs: start7dTs, endTs: currentTs, defaultGroupBy: "day" };
    }

    case "30d": {
      const start30dTs = currentTs - 30 * 86400;
      return { startTs: start30dTs, endTs: currentTs, defaultGroupBy: "day" };
    }

    case "all":
    default:
      return { startTs: 0, endTs: currentTs, defaultGroupBy: "day" };
  }
}
```

#### 2.2.4. Các Câu Lệnh SQL Nền tảng trên `better-sqlite3`

##### 1. Query KPI Tổng Hợp (Summary Aggregation)
```typescript
const summaryStmt = sqlite.prepare(`
  SELECT
    COUNT(*) AS total_requests,
    SUM(CASE WHEN status_code = 200 THEN 1 ELSE 0 END) AS successful_requests,
    SUM(CASE WHEN status_code = 429 THEN 1 ELSE 0 END) AS rate_limited_requests,
    SUM(CASE WHEN status_code >= 500 OR status = 'ERROR' THEN 1 ELSE 0 END) AS failed_requests,
    COALESCE(SUM(prompt_tokens), 0) AS total_prompt_tokens,
    COALESCE(SUM(reasoning_tokens), 0) AS total_reasoning_tokens,
    COALESCE(SUM(completion_tokens), 0) AS total_completion_tokens,
    COALESCE(SUM(total_tokens), 0) AS total_tokens,
    COALESCE(AVG(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0) AS avg_ttft_ms,
    COALESCE(AVG(total_duration_ms), 0) AS avg_duration_ms
  FROM request_metrics
  WHERE created_at >= ? AND created_at <= ?
    ${adapterFilter}
    ${modelFilter}
    ${accountFilter}
`);
```

##### 2. Query Biểu Đồ Thời Gian (Time-Bucketing Histogram)
Sử dụng hàm SQLite `strftime` với tham số `'unixepoch', 'localtime'` để gom nhóm cực nhanh theo giờ hoặc theo ngày:

```typescript
// Nếu groupBy === "hour": định dạng 'YYYY-MM-DD HH:00'
// Nếu groupBy === "day":  định dạng 'YYYY-MM-DD'
const timeFormat = groupBy === "hour" ? "%Y-%m-%d %H:00" : "%Y-%m-%d";

const histogramStmt = sqlite.prepare(`
  SELECT
    strftime('${timeFormat}', created_at, 'unixepoch', 'localtime') AS bucket,
    MIN(created_at) AS bucket_timestamp,
    COUNT(*) AS request_count,
    COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
    COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
    COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
    COALESCE(SUM(total_tokens), 0) AS total_tokens,
    COALESCE(AVG(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0) AS avg_ttft_ms
  FROM request_metrics
  WHERE created_at >= ? AND created_at <= ?
    ${adapterFilter}
    ${modelFilter}
    ${accountFilter}
  GROUP BY bucket
  ORDER BY bucket ASC
`);
```

##### 3. Query Phân Rã Đa Chiều (Breakdown by Model, Adapter, Account)
```typescript
// Phân rã theo Model
const modelBreakdownStmt = sqlite.prepare(`
  SELECT
    COALESCE(model_executed, model_requested) AS model,
    COALESCE(adapter_id, 'unknown') AS adapter_id,
    COUNT(*) AS call_count,
    COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
    COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
    COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
    COALESCE(SUM(total_tokens), 0) AS total_tokens,
    COALESCE(AVG(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0) AS avg_ttft_ms,
    COALESCE(AVG(total_duration_ms), 0) AS avg_duration_ms
  FROM request_metrics
  WHERE created_at >= ? AND created_at <= ?
    ${adapterFilter}
    ${modelFilter}
    ${accountFilter}
  GROUP BY model, adapter_id
  ORDER BY total_tokens DESC
`);

// Phân rã theo Adapter
const adapterBreakdownStmt = sqlite.prepare(`
  SELECT
    COALESCE(adapter_id, 'unknown') AS adapter_id,
    COUNT(*) AS call_count,
    COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
    COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
    COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
    COALESCE(SUM(total_tokens), 0) AS total_tokens,
    COALESCE(AVG(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0) AS avg_ttft_ms
  FROM request_metrics
  WHERE created_at >= ? AND created_at <= ?
  GROUP BY adapter_id
  ORDER BY total_tokens DESC
`);

// Phân rã theo Account Sandbox
const accountBreakdownStmt = sqlite.prepare(`
  SELECT
    COALESCE(account_id, 'default') AS account_id,
    COALESCE(adapter_id, 'unknown') AS adapter_id,
    COUNT(*) AS call_count,
    COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
    COALESCE(SUM(reasoning_tokens), 0) AS reasoning_tokens,
    COALESCE(SUM(completion_tokens), 0) AS completion_tokens,
    COALESCE(SUM(total_tokens), 0) AS total_tokens,
    COALESCE(AVG(CASE WHEN ttft_ms > 0 THEN ttft_ms END), 0) AS avg_ttft_ms
  FROM request_metrics
  WHERE created_at >= ? AND created_at <= ?
  GROUP BY account_id, adapter_id
  ORDER BY total_tokens DESC
`);
```

---

### 2.3. Động Cơ Định Giá & Ước Lượng Chi Phí USD (Model Pricing Engine)

File thực thi: `apps/gateway/src/telemetry/pricing-engine.ts`.
Chịu trách nhiệm quản lý biểu giá và tính toán chi phí micro-cent dựa trên 3 kênh token riêng biệt.

#### 2.3.1. Bảng Giá Model Chuẩn & Tiers
```typescript
export interface ModelPricingRate {
  promptRatePerMillion: number;    // USD trên 1,000,000 Prompt Tokens
  completionRatePerMillion: number; // USD trên 1,000,000 Completion Tokens
  reasoningRatePerMillion: number;  // USD trên 1,000,000 CoT/Reasoning Tokens
}

export const KNOWN_MODEL_PRICING: Record<string, ModelPricingRate> = {
  // --- OpenAI / Codex CLI Models ---
  "gpt-5.6-asta":      { promptRatePerMillion: 15.00, completionRatePerMillion: 60.00, reasoningRatePerMillion: 60.00 },
  "gpt-5.6-sol":       { promptRatePerMillion: 10.00, completionRatePerMillion: 40.00, reasoningRatePerMillion: 40.00 },
  "gpt-5.5":           { promptRatePerMillion: 5.00,  completionRatePerMillion: 20.00, reasoningRatePerMillion: 20.00 },
  "gpt-5.6-terra":     { promptRatePerMillion: 2.50,  completionRatePerMillion: 10.00, reasoningRatePerMillion: 10.00 },
  "gpt-5.6-luna":      { promptRatePerMillion: 0.25,  completionRatePerMillion: 1.00,  reasoningRatePerMillion: 1.00 },
  "gpt-6-astra":       { promptRatePerMillion: 20.00, completionRatePerMillion: 80.00, reasoningRatePerMillion: 80.00 },
  "gpt-4o":            { promptRatePerMillion: 2.50,  completionRatePerMillion: 10.00, reasoningRatePerMillion: 10.00 },
  "gpt-4o-mini":       { promptRatePerMillion: 0.15,  completionRatePerMillion: 0.60,  reasoningRatePerMillion: 0.60 },
  "o1":                { promptRatePerMillion: 15.00, completionRatePerMillion: 60.00, reasoningRatePerMillion: 60.00 },
  "o3-mini":           { promptRatePerMillion: 1.10,  completionRatePerMillion: 4.40,  reasoningRatePerMillion: 4.40 },

  // --- Anthropic / Claude Code Models ---
  "claude-3-7-sonnet": { promptRatePerMillion: 3.00,  completionRatePerMillion: 15.00, reasoningRatePerMillion: 15.00 },
  "sonnet":            { promptRatePerMillion: 3.00,  completionRatePerMillion: 15.00, reasoningRatePerMillion: 15.00 },
  "claude-3-5-haiku":  { promptRatePerMillion: 0.80,  completionRatePerMillion: 4.00,  reasoningRatePerMillion: 4.00 },
  "haiku":             { promptRatePerMillion: 0.80,  completionRatePerMillion: 4.00,  reasoningRatePerMillion: 4.00 },
  "claude-3-opus":     { promptRatePerMillion: 15.00, completionRatePerMillion: 75.00, reasoningRatePerMillion: 75.00 },
  "opus":              { promptRatePerMillion: 15.00, completionRatePerMillion: 75.00, reasoningRatePerMillion: 75.00 },

  // --- Open-Weights / Devin / OMP Models ---
  "deepseek-r1":       { promptRatePerMillion: 0.55,  completionRatePerMillion: 2.19,  reasoningRatePerMillion: 2.19 },
  "deepseek-v3":       { promptRatePerMillion: 0.14,  completionRatePerMillion: 0.28,  reasoningRatePerMillion: 0.28 },
  "qwen-2.5-coder":    { promptRatePerMillion: 0.20,  completionRatePerMillion: 0.60,  reasoningRatePerMillion: 0.60 },
};

// Fallback theo Tier mặc định nếu không khớp tên model
export const TIER_FALLBACK_PRICING: Record<string, ModelPricingRate> = {
  low:     { promptRatePerMillion: 0.25, completionRatePerMillion: 1.00,  reasoningRatePerMillion: 1.00 },
  medium:  { promptRatePerMillion: 3.00, completionRatePerMillion: 15.00, reasoningRatePerMillion: 15.00 },
  high:    { promptRatePerMillion: 10.00, completionRatePerMillion: 40.00, reasoningRatePerMillion: 40.00 },
  xhigh:   { promptRatePerMillion: 20.00, completionRatePerMillion: 80.00, reasoningRatePerMillion: 80.00 },
  default: { promptRatePerMillion: 2.50, completionRatePerMillion: 10.00, reasoningRatePerMillion: 10.00 },
};
```

#### 2.3.2. Thuật toán Lookup & Tính Chi phí USD
```typescript
export class ModelPricingEngine {
  public static resolvePricing(modelId: string, tier?: string): ModelPricingRate {
    const normalized = (modelId || "").toLowerCase().trim();

    // 1. Exact Match
    if (KNOWN_MODEL_PRICING[normalized]) {
      return KNOWN_MODEL_PRICING[normalized];
    }

    // 2. Prefix / Fuzzy Match
    for (const [key, rate] of Object.entries(KNOWN_MODEL_PRICING)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return rate;
      }
    }

    // 3. Fallback theo Tier đã biết
    if (tier && TIER_FALLBACK_PRICING[tier.toLowerCase()]) {
      return TIER_FALLBACK_PRICING[tier.toLowerCase()];
    }

    // 4. Default baseline rate
    return TIER_FALLBACK_PRICING.default;
  }

  public static calculateCost(
    modelId: string,
    promptTokens: number,
    completionTokens: number,
    reasoningTokens: number,
    tier?: string
  ): number {
    const rate = this.resolvePricing(modelId, tier);
    
    // Reasoning tokens được tính theo biểu giá của completion/output (chuẩn công nghiệp)
    const promptCost = (promptTokens * rate.promptRatePerMillion) / 1_000_000;
    const completionCost = (completionTokens * rate.completionRatePerMillion) / 1_000_000;
    const reasoningCost = (reasoningTokens * rate.reasoningRatePerMillion) / 1_000_000;

    const total = promptCost + completionCost + reasoningCost;
    return Math.round(total * 10000) / 10000; // Làm tròn 4 chữ số thập phân (e.g. $0.0042)
  }
}
```

---

### 2.4. Kiến trúc Giao diện Frontend (Frontend Architecture)

#### 2.4.1. Điều hướng Sidebar & Định tuyến
Chỉnh sửa `apps/web/src/components/layout/Sidebar.tsx`:
* Khai báo kiểu: `export type NavTab = "dashboard" | "models" | "accounts" | "webshell" | "radar" | "usage" | "inspector";`
* Bổ sung mục điều hướng:
  ```tsx
  { id: "usage", label: "Usage & Analytics", icon: <BarChart3 className="w-4 h-4 text-emerald-400" /> }
  ```
Chỉnh sửa `apps/web/src/App.tsx`:
* Render View: `{activeTab === "usage" && <UsageAnalyticsView />}`

#### 2.4.2. Cây Thành phần Giao diện (Component Hierarchy)

```
UsageAnalyticsView.tsx (Root Container)
 ├── TimeFilterToolbar.tsx
 │    ├── Range Buttons (Today | Yesterday | 7D | 30D | All Time)
 │    ├── Group Toggle (Hour | Day)
 │    ├── Filter Dropdowns (Filter by Adapter, Filter by Model)
 │    └── Refresh Button (Vite fast reload indicator)
 ├── UsageKpiGrid.tsx
 │    ├── KpiCard: "Total Tokens" (Prompt / CoT / Completion Sub-badges + SvgSparkline)
 │    ├── KpiCard: "Estimated Cost" ($USD total + Cost per 1K reqs + SvgSparkline)
 │    ├── KpiCard: "Total Requests" (Success Rate % + Failure count + SvgSparkline)
 │    └── KpiCard: "Latency Profile" (Avg TTFT ms + Avg Duration s + SvgSparkline)
 ├── SvgStackedBarChart.tsx (Core Interactive Pure SVG Visualizer)
 │    ├── Metric Switcher Bar ([All Tokens Stacked] [Requests Volume] [Estimated Cost])
 │    ├── SvgCanvas (<svg viewBox="0 0 1000 320">)
 │    │    ├── Linear Gradients (<defs>)
 │    │    ├── Dashed Horizontal Gridlines
 │    │    ├── Y-Axis Tick Labels (e.g. 2.5M, 1.0M, 0)
 │    │    ├── Stacked Bars (<rect> for Prompt, <rect> for CoT, <rect> for Output)
 │    │    ├── Hover Scanline Guide (<line>)
 │    │    └── X-Axis Time Labels (e.g. "09/18 14:00", "09/17")
 │    └── ChartTooltip.tsx (Floating Glassmorphism Card tracking cursor)
 └── UsageBreakdownTables.tsx
      ├── Tab Switcher ("By Model" | "By Adapter" | "By Account")
      └── Cyberdeck Table
           ├── Header with Sort Indicator
           ├── Row: Model/Adapter Name + Provider StatusBadge
           ├── Row: Token Breakdown (Prompt, Output, CoT)
           ├── Row: SvgInlineRatioBar (Mini proportion bar: Cyan / Purple / Emerald)
           ├── Row: Estimated Cost ($) & Percentage of Total (%)
           └── Row: Avg TTFT & Total Handled Calls
```

---

### 2.5. Đặc tả Kỹ thuật Biểu Đồ Pure React SVG (Zero External Dependencies)

#### 2.5.1. Toán tử Tọa độ SVG (Coordinate Mapping Math)
Biểu đồ hoạt động trên hệ tọa độ ảo `viewBox="0 0 1000 320"`:
* **Padding:** `top: 25, right: 25, bottom: 45, left: 60`
* **Plot Area:** `chartWidth = 1000 - left - right = 915`, `chartHeight = 320 - top - bottom = 250`
* **X-Scale:** Với $N$ cột thời gian, độ rộng mỗi cột là $W_{bar} = \max\left(2, \min\left(28, \frac{chartWidth}{N} \times 0.7\right)\right)$.
  Khoảng cách tâm $X_i = left + \left(i + 0.5\right) \times \frac{chartWidth}{N}$.
* **Y-Scale:** 
  $$\text{scaleY}(val) = top + chartHeight - \left(\frac{val}{maxVal}\right) \times chartHeight$$

#### 2.5.2. Công thức Vẽ Cột Chồng (Stacked Rectangles Rendering)
Tại mỗi mốc thời gian $i$ có 3 thành phần: $P$ (Prompt Tokens), $R$ (Reasoning Tokens), $C$ (Completion Tokens):
* $Y_{\text{base}} = top + chartHeight$
* Chiều cao Prompt: $H_P = \frac{P}{maxVal} \times chartHeight$; Tọa độ $Y_P = Y_{\text{base}} - H_P$
* Chiều cao Reasoning: $H_R = \frac{R}{maxVal} \times chartHeight$; Tọa độ $Y_R = Y_P - H_R$
* Chiều cao Completion: $H_C = \frac{C}{maxVal} \times chartHeight$; Tọa độ $Y_C = Y_R - H_C$

Mã JSX mẫu hiển thị từng cột:
```tsx
<g key={item.bucket} className="cursor-pointer group" onMouseEnter={() => setHoverIndex(idx)}>
  {/* Prompt Tokens - Neon Cyan Bar */}
  {hP > 0 && (
    <rect
      x={x - barWidth / 2}
      y={yP}
      width={barWidth}
      height={hP}
      fill="#06B6D4"
      opacity={isHovered ? 1 : 0.85}
      rx={hR === 0 && hC === 0 ? 3 : 0}
      className="transition-all duration-150"
    />
  )}

  {/* Reasoning Tokens - Neon Purple Bar */}
  {hR > 0 && (
    <rect
      x={x - barWidth / 2}
      y={yR}
      width={barWidth}
      height={hR}
      fill="#A855F7"
      opacity={isHovered ? 1 : 0.85}
      rx={hC === 0 ? 3 : 0}
      className="transition-all duration-150"
    />
  )}

  {/* Completion Tokens - Neon Emerald Bar */}
  {hC > 0 && (
    <rect
      x={x - barWidth / 2}
      y={yC}
      width={barWidth}
      height={hC}
      fill="#10B981"
      opacity={isHovered ? 1 : 0.85}
      rx={3}
      className="transition-all duration-150"
    />
  )}
</g>
```

#### 2.5.3. Cyberdeck Hover Scanline & Floating Glassmorphism Tooltip
* Khi hover chuột qua biểu đồ, một đường thẳng quét dọc SVG `<line>` màu brand neon (`#6366F1`) xuất hiện tại tọa độ $X_i$ kéo dài từ đỉnh xuống đáy biểu đồ.
* Một thẻ Tooltip (`absolute pointer-events-none bg-surface/95 backdrop-blur-md border border-borderSubtle p-3 rounded-xl shadow-2xl`) hiển thị nổi, dịch chuyển theo chuột:
  * Khung thời gian: `2026-09-18 14:00:00`
  * Tổng Token: `452,180` (Prompt: `210,000` | CoT: `92,180` | Completion: `150,000`)
  * Số Requests: `48 calls` (Avg TTFT: `340 ms`)
  * Chi phí ước tính: `$1.8420 USD`

#### 2.5.4. SvgSparkline Component (Micro Trendlines trong KPI Cards)
Vẽ đồ thị xu hướng mini (30 điểm dữ liệu, kích thước `120x36`) bằng thẻ `<svg>` và `<path>`:
* Định nghĩa gradient trong thẻ `<defs>`:
  `<linearGradient id="sparkline-grad" x1="0" y1="0" x2="0" y2="1">`
  `<stop offset="0%" stopColor="#10B981" stopOpacity="0.4"/>`
  `<stop offset="100%" stopColor="#10B981" stopOpacity="0.0"/>`
* Vẽ diện tích đáy (Area Fill) bằng `<path d={areaPathData} fill="url(#sparkline-grad)" />`.
* Vẽ đường viền neon (Stroke Line) bằng `<path d={linePathData} fill="none" stroke="#10B981" strokeWidth="2" />`.

---

## 3. PHÂN TÍCH ĐÁNH ĐỔI (TRADE-OFFS & RESILIENCE ANALYSIS)

### 3.1. Giả Định Then Chốt (Load-Bearing Assumptions)

1. **Dung lượng và Tốc độ Sinh Dữ liệu của Gateway Cục bộ:**
   * *Giả định:* Hệ thống `cli-to-api` đóng vai trò là High-Performance Local Developer Gateway hoặc Team Gateway với lưu lượng dao động từ vài ngàn đến dưới 500,000 requests/tháng.
   * *Ý nghĩa thiết kế:* Với dung lượng này, toàn bộ tệp SQLite `request_metrics` chỉ nặng khoảng 20MB đến 150MB. Khi có index `(created_at, adapter_id, model_executed)`, các câu lệnh `GROUP BY` và `SUM` chỉ mất **dưới 15ms** trên một luồng CPU cơ bản. Không cần thiết lập hạ tầng OLAP (như ClickHouse, TimescaleDB, DuckDB) vốn tiêu tốn thêm hàng trăm MB RAM và phức tạp hóa khâu đóng gói binary / Docker container.
2. **Tính Tĩnh của Bảng Giá Mô Hình (Historical Pricing Consistency):**
   * *Giả định:* Việc ước lượng chi phí lịch sử sử dụng bảng giá hiện hành (hoặc phiên bản giá mới nhất) là hoàn toàn chấp nhận được đối với mục tiêu kiểm soát ngân sách của Gateway cục bộ.
   * *Ý nghĩa thiết kế:* Không cần xây dựng một hệ thống theo dõi lịch sử biến động giá theo thời gian từng giây (SCD Type 2) trong DB, giúp kiến trúc cực kỳ tinh gọn (KISS).

---

### 3.2. Điều Kiện Sụp Đổ Đầu Tiên (Worst-Case Failure Modes) & Giải Pháp Phòng Vệ

| Tình huống Sụp đổ (Failure Mode) | Nguyên nhân gốc rễ (Root Cause) | Mức độ rủi ro | Cơ chế Phòng vệ Đa tầng (Defense-in-Depth) |
| :--- | :--- | :--- | :--- |
| **1. Tràn CPU / Treo Event Loop khi chọn "All Time" với DB hàng triệu dòng** | Nếu DB tích lũy 2,000,000 records sau 6 tháng chạy liên tục, query `GROUP BY strftime('%Y-%m-%d', ...)` có thể mất 300ms–800ms nếu SQLite phải full-table scan. | Trung bình | **1. Tự động chuyển Bucket Resolution:** Nếu chọn "All Time", tự động ép `groupBy = "day"` (hoặc theo tháng nếu $> 365$ ngày).<br>**2. Giới hạn Buckets:** Giới hạn tối đa 365 điểm dữ liệu trả về.<br>**3. Index Coverage:** Đảm bảo câu truy vấn sử dụng index `idx_request_metrics_usage_rollup`. |
| **2. Khóa SQLite (`SQLITE_BUSY: database is locked`) khi ghi dồn dập** | Gateway đang tiếp nhận 20 request streaming song song dồn dập kết thúc và ghi vào `request_metrics`, đồng thời Admin bấm Refresh liên tục trên màn hình Usage. | Cao | **1. SQLite WAL Concurrent Reads:** SQLite WAL cho phép nhiều readers đọc song song trong khi 1 writer ghi vào WAL file.<br>**2. Busy Timeout:** `sqlite.pragma("busy_timeout = 5000")` đã được cấu hình từ trước để tự động retry trong 5 giây thay vì fail ngay.<br>**3. In-Memory Query Cache:** Thêm bộ đệm cache nhẹ (TTL = 10 giây) trong `UsageAnalyticsEngine` với cache key là `range + groupBy + filters`. 90% các lần click refresh liên tiếp của Admin sẽ trả kết quả từ RAM trong 1ms. |
| **3. Trình duyệt màn hình hẹp (Mobile/Tablet) làm vỡ đồ họa SVG** | Số lượng cột thời gian quá nhiều (vd: 30 ngày = 30 cột hoặc 24 giờ = 24 cột) hiển thị trên màn hình nhỏ gây chồng lấn chữ hoặc vỡ tỷ lệ. | Thấp | **1. Vector ViewBox Scaling:** Biểu đồ dùng thuộc tính `viewBox="0 0 1000 320"` kết hợp `w-full h-auto`, SVG tự động thu phóng vector hoàn hảo 100% không vỡ hạt.<br>**2. Smart Label Decimation:** Tự động lọc nhãn trục X (chỉ render mỗi nhãn cách nhau 2 hoặc 4 bước nếu $N > 15$). |
| **4. Xuất hiện Model Tùy Biến Lạ (Uncataloged Custom Models) gây lỗi tính tiền** | Người dùng cấu hình adapter với mô hình nội bộ tùy biến (vd: `my-custom-lora-7b`), không khớp với bất kỳ bảng giá nào. | Thấp | **1. An toàn Null/NaN tuyệt đối:** Engine pricing áp dụng quy tắc 3 tầng fallback: Prefix -> Tier (`low/med/high`) -> Default ($2.50/$10.00).<br>**2. Safe Fallback:** Đảm bảo trường `estimatedCostUsd` luôn luôn là số thực hợp lệ (không bao giờ trả về `null`, `undefined` hay `NaN`). |

---

### 3.3. Đánh Giá Toàn Diện Triết Lý KISS & DRY

#### Triết lý KISS (Keep It Simple, Stupid)
* **Zero External Library Footprint:** Thay vì cài đặt Recharts (kéo theo ~500KB bundle, 12 dependencies gián tiếp, xung đột React DOM virtual tree), Candidate 1 chỉ sử dụng **khoảng 180 dòng Pure React JSX** để vẽ SVG. Mã nguồn rõ ràng, dễ bảo trì, biên dịch Vite tức thì, không có nguy cơ deprecation hay security vulnerabilities từ bên thứ ba.
* **Tận dụng SQLite Tối đa:** Không dựng thêm pipeline background worker phức tạp hay bảng tổng hợp trung gian (`daily_usage_rollup`). Với tốc độ của C-SQLite WAL trên ổ cứng NVMe/SSD hiện đại, truy vấn thời gian thực trực tiếp trên bảng nguồn đem lại kết quả chuẩn xác từng giây (zero data lag) với độ phức tạp vận hành bằng 0.

#### Triết lý DRY (Don't Repeat Yourself)
* **Single Source of Truth cho Pricing Catalog:** Toàn bộ bảng giá được lưu tập trung tại `apps/gateway/src/telemetry/pricing-engine.ts`. Frontend không duplicate mã tính tiền; backend tính toán và cung cấp sẵn các trường `estimatedCostUsd` cho cả Summary, Time-Series, và Breakdown Tables.
* **Tái sử dụng Toàn bộ Color Tokens & Cyberdeck Components:** Các component mới tái sử dụng triệt để `StatusBadge.tsx`, các lớp màu Tailwind CSS (`bg-canvas`, `bg-surface`, `border-borderSubtle`, `brand`), và các hàm định dạng số liệu dùng chung (`formatTokens`, `formatCurrency`, `formatDuration`).

---

## 4. KẾ HOẠCH TRIỂN KHAI THEO TỪNG GIAI ĐOẠN (IMPLEMENTATION PHASES)

Để đảm bảo tính khả thi cao nhất cho khâu thi công, phương án được phân rã thành 4 pha rõ ràng:

1. **Pha 1: Tầng Dữ liệu & Pricing Engine (Backend Data Layer)**
   * Tạo file `apps/gateway/src/telemetry/pricing-engine.ts` chứa bảng giá các model chuẩn và logic fallback.
   * Bổ sung index `idx_request_metrics_usage_rollup` vào cơ sở dữ liệu SQLite.
   * Tạo file `apps/gateway/src/telemetry/usage-analytics.ts` hiện thực các query SQL tổng hợp, time-bucketing và caching 10s.
2. **Pha 2: Backend API Routes & Fastify Wiring**
   * Đăng ký route `GET /api/admin/usage/analytics` trong `apps/gateway/src/api/routes/admin-telemetry.ts`.
   * Thêm các phương thức tương ứng vào client API frontend `apps/web/src/lib/api-client.ts` (`getUsageAnalytics()`).
3. **Pha 3: Các Thành phần Giao diện & Pure SVG Visualizer (Frontend Components)**
   * Phát triển component vẽ biểu đồ cột chồng thuần SVG `SvgStackedBarChart.tsx` hỗ trợ hover tooltips và metric switcher.
   * Phát triển component biểu đồ mini `SvgSparkline.tsx` cho các thẻ KPI.
   * Phát triển `UsageKpiGrid.tsx`, `TimeFilterToolbar.tsx`, và `UsageBreakdownTables.tsx`.
4. **Pha 4: Tích hợp Giao diện Hoàn chỉnh & Kiểm thử (Integration & Verification)**
   * Bổ sung tab `usage` vào `Sidebar.tsx` và `App.tsx`.
   * Lắp ráp toàn diện trong `UsageAnalyticsView.tsx`.
   * Viết bộ kiểm thử tự động Vitest cho `pricing-engine.test.ts` và `usage-analytics.test.ts`, xác nhận đáp ứng đầy đủ AC-1 đến AC-6.

---

### KẾT LUẬN CỦA CANDIDATE 1

Đề xuất của Candidate 1 mang đến giải pháp **thực dụng, nhẹ nhàng, tốc độ cao nhất và an toàn kiến trúc tối đa** cho tính năng "Thêm màn hình Usage". Bằng cách tận dụng triệt để sức mạnh tiềm tàng của SQLite WAL và đồ họa Pure React SVG, hệ thống đạt được trải nghiệm người dùng mượt mà ở chuẩn mực Obsidian Cyberdeck mà không tốn thêm bất kỳ dependency nào hay làm chậm cổng giao tiếp API Gateway.
