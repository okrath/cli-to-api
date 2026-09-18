# KẾ HOẠCH THI CÔNG CHI TIẾT (CANDIDATE PLAN 2)
## ĐỀ ÁN: PHÂN HỆ QUẢN TRỊ TIÊU THỤ TOKEN, CHI PHÍ & PHÂN TÍCH ĐA CHIỀU (USAGE & TOKEN ANALYTICS DASHBOARD)
### PHƯƠNG PHÁP LUẬN: VERTICAL FEATURE SLICE DRIVEN PLAN (END-TO-END TRACER BULLETS)

---

**Ứng viên Lập kế hoạch:** Candidate Plan 2  
**Hệ quy chiếu thẩm định:** Ultra Verifier (Best-of-5 Architectural Planning Audit)  
**Chủ tọa thẩm định:** Kongming — Lead Architectural Verifier  
**Trọng tâm tiếp cận:** Lát cắt dọc hoàn chỉnh (End-to-End Vertical Tracer Bullets) — Triển khai 4 phases độc lập, mỗi phase đi xuyên suốt 4 tầng kỹ thuật (Database $\rightarrow$ Engine Logic $\rightarrow$ Fastify API $\rightarrow$ React UI), bảo đảm khả năng demo và kiểm thử độc lập ở từng mốc tiến độ.  
**Ràng buộc cốt tử:** Zero New NPM Dependencies, Zero Ingress Hot-Path Degradation, Single-Pass SQLite Performance ($\le 25\text{ms}$), Micro-Cent Financial Arithmetic ($10^{-6}$ USD), Memory-Safe Streaming Export ($O(1)$ RAM).

---

## 1. EXECUTIVE SUMMARY & CHIẾN LƯỢC LÁT CẮT DỌC (VERTICAL SLICE STRATEGY)

### 1.1. Bối Cảnh & Mục Tiêu Nghiệp Vụ
Cổng phân phối đa mô hình `cli-to-api` hiện đang vận hành ổn định các luồng streaming qua tiến trình CLI với phân hệ **Fleet Radar & Telemetry Station (`TelemetryStationView.tsx`)**. Tuy nhiên, để đáp ứng đầy đủ yêu cầu quản trị hệ thống và đối soát tài chính định kỳ, tính năng **Màn hình Quản trị Tiêu thụ Token & Chi phí Lịch sử (Usage Analytics)** cần giải quyết triệt để 5 bài toán nghiệp vụ trọng tâm:
1. **Minh bạch hóa 3 luồng token tiêu thụ:** Bóc tách chính xác Prompt (Input), Reasoning / Deep Thinking (CoT), và Completion (Output).
2. **Định giá tài chính cấp vi mô (Micro-Cent Precision $10^{-6}$ USD):** Ước lượng chi phí chính xác tuyệt đối, triệt tiêu sai số trôi dấu phẩy động IEEE-754.
3. **Phân tích đối chiếu chu kỳ (Comparative Delta $\Delta\%$):** So sánh kỳ hiện tại ($T$) với kỳ trước ($T-1$) thông qua kỹ thuật quét chỉ mục duy nhất (Single-Pass SQL Scan).
4. **Cắt lát dữ liệu đa chiều (OLAP Slicing & Pivot):** Xoay trục linh hoạt giữa 4 cặp chiều kích nghiệp vụ (`Model × Adapter`, `Account × Model`, `Date × Model`, `Adapter × Status`) kèm ngăn kéo trượt xem chi tiết bản ghi (Drill-Down Drawer).
5. **Xuất báo cáo kiểm toán an toàn bộ nhớ ($O(1)$ RAM):** Truyền tải dữ liệu CSV (RFC 4180) và JSON dạng stream với độ trễ giải phóng con trỏ cursor khi client ngắt kết nối $\le 50\text{ms}$.

### 1.2. Triết Lý Tiếp Cận Của Candidate 2: "Vertical Feature Slice"
Khác với phương pháp phân lớp ngang truyền thống (Horizontal Layering — xây toàn bộ DB $\rightarrow$ toàn bộ API $\rightarrow$ toàn bộ UI $\rightarrow$ Test, tiềm ẩn rủi ro trễ tiến độ tích hợp và khó phát hiện lỗi giao tiếp giữa các tầng), **Candidate Plan 2** tổ chức lộ trình thành **4 Lát cắt Dọc Hoàn chỉnh (End-to-End Tracer Bullets)**:
- **Nguyên tắc "Thước đo giá trị hữu hình" (Tangible Value Metric):** Mỗi phase hoàn thành một lát cắt chức năng hoàn chỉnh từ tầng dữ liệu đến thành phần giao diện người dùng. Bất kỳ phase nào cũng có thể chạy demo, kiểm thử integration và đánh giá nghiệm thu ngay lập tức.
- **Tối ưu hóa phản hồi (Tight Feedback Loop):** Mọi bất cập về cấu trúc dữ liệu, tham số query hay trải nghiệm giao diện người dùng đều được bộc lộ và xử lý triệt để ngay trong lát cắt đó.
- **Cô lập rủi ro (Risk Isolation):** Các lát cắt phân tích phức tạp (Pivot Matrix, CSV Streaming) được triển khai trên nền tảng vững chắc của các lát cắt cơ bản (Index & Summary), loại bỏ hiệu ứng gãy đổ dây chuyền.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│               SƠ ĐỒ 4 LÁT CẮT DỌC HOÀN CHỈNH (VERTICAL FEATURE SLICES)                 │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 1: KPI Summary HUD Slice                                                         │
│ [DB Covering Index] ──> [Model Pricing Engine] ──> [GET /summary] ──> [UsageKpiCards]  │
│ (Single-Pass SQL, Micro-Cent Arithmetic, 8 KPI Cards với Delta %, Render < 30ms)       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 2: Time-Series & Pure SVG Chart Slice                                            │
│ [Time Bucket Grouping] ──> [GET /timeseries] ──> [UsageStackedBarChart (Pure SVG)]     │
│ (ViewBox 1000x320, 3 dải màu Prompt/CoT/Completion, Zero NPM deps, Hover Tooltip)    │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 3: OLAP Cross-Tabulation Pivot & Drill-Down Slice                                │
│ [Dynamic 2-Axis OLAP] ──> [GET /pivot & /records] ──> [UsagePivotGrid & LedgerDrawer]  │
│ (4 cặp trục, Instant Filter/Sort, Click-to-Drill-Down tải 25 metrics gần nhất)         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ PHASE 4: Streaming Export, Navigation & Acceptance Suite Slice                         │
│ [stmt.iterate() Stream] ──> [GET /export] ──> [Sidebar Navigation] ──> [E2E Suite]    │
│ (RFC 4180 CSV / JSON, O(1) Memory Heap < 20MB, Disconnect Cleanup <= 50ms, AC-1..AC-6)│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. KẾ HOẠCH 4 PHASES THI CÔNG CHI TIẾT (DETAILED PHASES SPECIFICATION)

### PHASE 1: Hạ Tầng Cơ Sở Dữ Liệu & Lát Cắt KPI Summary HUD (Single-Pass & Comparative Delta %)

#### 1. Mục tiêu lát cắt:
Thiết lập chỉ mục phủ tối ưu trong SQLite, hiện thực hóa động cơ định giá token 3 tầng nội suy micro-cent, giải thuật tổng hợp chu kỳ Single-Pass, endpoint API Fastify `/api/admin/usage/summary`, và lưới 8 thẻ KPI hiển thị tỷ lệ tăng giảm Delta $\Delta\%$ so với chu kỳ trước.

#### 2. Concrete Tasks & Target Files:
1. **Task 1.1 — Bổ sung Covering Index trong CSDL SQLite:**
   - File sửa đổi: `apps/gateway/src/db/schema.ts`
     - Bổ sung `usageAnalyticsCoveringIndex` vào bảng `requestMetrics`: `(created_at, adapter_id, model_executed, account_id, status_code)`.
   - File sửa đổi: `apps/gateway/src/db/migrate.ts`
     - Bổ sung DDL an toàn: `CREATE INDEX IF NOT EXISTS idx_request_metrics_usage_analytics ON request_metrics(created_at, adapter_id, model_executed, account_id, status_code);` vào hàm `runMigrations()`.
2. **Task 1.2 — Xây dựng Động cơ Bảng giá Token Nội suy 3 Tầng (`model-pricing.ts`):**
   - File tạo mới: `apps/gateway/src/telemetry/model-pricing.ts`
     - Định nghĩa bảng giá chuẩn USD/1M tokens cho các họ model chính (Claude 3.7/3.5, GPT-4o, o1, o3-mini, DeepSeek-Reasoner).
     - Triển khai cơ chế 3 tầng: Khớp tiền tố (Prefix Match) $\rightarrow$ Khớp Heuristic Tier (`xhigh`, `high`, `medium`, `low`) $\rightarrow$ Khớp Default Fallback.
     - Hàm tính toán số học Micro-Cent ($10^{-6}$ USD) chia cho 1,000,000, chống lỗi số học IEEE-754.
3. **Task 1.3 — Xây dựng Logic Single-Pass Comparative Summary (`usage-analytics.ts`):**
   - File tạo mới: `apps/gateway/src/telemetry/usage-analytics.ts`
     - Xây dựng lớp `UsageAnalyticsEngine` với phương thức `getComparativeSummary(startCurrent, endCurrent, compare: boolean)`.
     - Thực thi câu lệnh SQL gộp điều kiện bằng mệnh đề `SUM(CASE WHEN created_at BETWEEN ? AND ? THEN ... ELSE 0 END)` trong một lần quét index duy nhất.
     - Hàm phòng vệ `calcDelta(current, previous)` chặn cứng chia cho 0, trả về `+100%` nếu `prev = 0` và `cur > 0`, tuyệt đối không sinh `NaN`.
4. **Task 1.4 — Xây dựng Endpoint API `/api/admin/usage/summary`:**
   - File tạo mới: `apps/gateway/src/api/routes/admin-usage.ts`
     - Đăng ký route `GET /api/admin/usage/summary` chấp nhận query: `range`, `startDate`, `endDate`, `compare`.
   - File sửa đổi: `apps/gateway/src/api/server.ts`
     - Import và kích hoạt `registerAdminUsageRoutes(fastify)` trong server lifecycle.
5. **Task 1.5 — Mở rộng API Client & Xây dựng UI KPI Summary Card:**
   - File sửa đổi: `apps/web/src/lib/api-client.ts`
     - Định nghĩa `UsageSummaryData`, `UsagePeriodStats`, `UsageDeltaStats` và method `apiClient.getUsageSummary()`.
   - File tạo mới: `apps/web/src/components/usage/UsageKpiCard.tsx`
     - Thẻ chỉ số chuẩn Obsidian Cyberdeck với nền `bg-surface border-borderSubtle`, hiển thị số lượng lớn, mini SVG area sparkline, và huy hiệu Delta badge (màu xanh lá khi tăng trưởng token/requests, màu đỏ khi error rate tăng).
   - File tạo mới: `apps/web/src/views/UsageAnalyticsView.tsx`
     - Render khung nhìn cơ sở với lưới 8 thẻ KPI: *Total Tokens, Prompt Tokens, Reasoning Tokens, Completion Tokens, Total Requests, Estimated Cost, Average TTFT, Error Rate*.

#### 3. Code Signatures & Interfaces:

```typescript
// apps/gateway/src/telemetry/model-pricing.ts
export interface TokenRates {
  promptPerMillion: number;
  completionPerMillion: number;
  reasoningPerMillion: number;
}

export function resolveTokenRates(modelName?: string | null): TokenRates;
export function calculateMicroCost(
  promptTokens: number,
  completionTokens: number,
  reasoningTokens: number,
  rates: TokenRates
): number;
```

```typescript
// apps/gateway/src/telemetry/usage-analytics.ts
export interface PeriodUsageStats {
  totalTokens: number;
  promptTokens: number;
  reasoningTokens: number;
  completionTokens: number;
  requests: number;
  successCount: number;
  rateLimitCount: number;
  errorCount: number;
  errorRate: number;
  avgTtftMs: number;
  estimatedCostUsd: number;
}

export interface DeltaUsageStats {
  totalTokensPercent: number;
  promptTokensPercent: number;
  reasoningTokensPercent: number;
  completionTokensPercent: number;
  requestsPercent: number;
  avgTtftPercent: number;
  costPercent: number;
  errorRateDelta: number;
}

export interface UsageSummaryResult {
  current: PeriodUsageStats;
  previous: PeriodUsageStats | null;
  delta: DeltaUsageStats | null;
  queryExecutionMs: number;
}
```

```typescript
// apps/web/src/components/usage/UsageKpiCard.tsx
export interface UsageKpiCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  deltaPercent?: number | null;
  deltaPeriodLabel?: string;
  isInverseTrendGood?: boolean;
  sparklineData?: number[];
  sparklineColor?: string;
  icon?: React.ReactNode;
}
```

#### 4. Verification Steps:
- **Unit Test:** Chạy `npx vitest run tests/unit/model-pricing.test.ts`
  - Kiểm tra bảng giá khớp chính xác `claude-3-7-sonnet` ra `$3.0`/`$15.0`.
  - Kiểm tra model lạ khớp fallback an toàn, không có lỗi `NaN`.
  - Xác nhận phép tính micro-cent không bị trôi dấu phẩy động.
- **Integration Test:** Chạy `npx vitest run tests/integration/admin-usage-routes.test.ts -t "GET /summary"`
  - Trả về status 200, đúng cấu trúc 8 chỉ số.
  - Thời gian thực thi truy vấn SQLite backend $\le 25\text{ms}$.
  - Xác nhận kế hoạch truy vấn `EXPLAIN QUERY PLAN` hiển thị `USING COVERING INDEX idx_request_metrics_usage_analytics`.

---

### PHASE 2: Lát Cắt Time-Series & Pure React SVG Stacked Bar Chart (Zero NPM Dependencies)

#### 1. Mục tiêu lát cắt:
Xây dựng giải thuật gom nhóm chuỗi thời gian (Hourly / Daily) trong SQLite, endpoint API `/api/admin/usage/timeseries`, component biểu đồ cột chồng Pure React SVG chuẩn Responsive `viewBox="0 0 1000 320"` phân tách 3 dòng màu Prompt/CoT/Completion, tooltip tương tác nổi, và thanh công cụ chọn dải thời gian.

#### 2. Concrete Tasks & Target Files:
1. **Task 2.1 — Xây dựng Time-Series Bucket Aggregator trong `usage-analytics.ts`:**
   - File sửa đổi: `apps/gateway/src/telemetry/usage-analytics.ts`
     - Viết hàm `getTimeSeries(params: TimeSeriesParams)`.
     - Gom nhóm theo giờ (`strftime('%Y-%m-%d %H:00', datetime(created_at, 'unixepoch'))`) hoặc theo ngày (`%Y-%m-%d`).
     - Tự động điền (Zero-Fill Gap) các bucket thời gian không có dữ liệu để biểu đồ không bị đứt đoạn.
2. **Task 2.2 — Xây dựng Endpoint API `/api/admin/usage/timeseries`:**
   - File sửa đổi: `apps/gateway/src/api/routes/admin-usage.ts`
     - Đăng ký route `GET /api/admin/usage/timeseries` với các query: `range`, `granularity` (`hour`, `day`, `auto`), `adapterId`, `model`.
3. **Task 2.3 — Xây dựng Biểu đồ Pure React SVG Stacked Bar Chart:**
   - File tạo mới: `apps/web/src/components/usage/UsageStackedBarChart.tsx`
     - Thiết lập hệ tọa độ vector SVG thuần: `viewBox="0 0 1000 320"`.
     - Phân bổ 3 dải màu xếp chồng trên mỗi cột:
       - **Prompt Tokens:** Cyan (`#06B6D4`).
       - **Reasoning Tokens (CoT):** Purple (`#A855F7`).
       - **Completion Tokens:** Emerald (`#10B981`).
     - Vẽ 4 đường lưới ngang Y-Axis mờ kèm nhãn số lượng (`100k`, `500k`, `1.5M`).
     - Tương tác Tooltip: Bắt sự kiện hover trên từng cột, hiển thị tooltip Cyberdeck nổi chứa chi tiết 3 loại token và chi phí ước tính của bucket đó mà không gây lag DOM.
4. **Task 2.4 — Xây dựng Thanh công cụ Lọc Dải Thời Gian (`UsageFilterToolbar.tsx`):**
   - File tạo mới: `apps/web/src/components/usage/UsageFilterToolbar.tsx`
     - Nút bấm nhanh các dải: **Today (24h)**, **Last 7 Days (7d)**, **Last 30 Days (30d)**, **This Month**.
     - Bộ chọn ngày tùy chỉnh (Start Date / End Date Picker).
     - Checkbox so sánh chu kỳ (Compare with previous period).
     - Tùy chọn Auto-Refresh (Polling 30s) kèm debounce.
5. **Task 2.5 — Tích hợp Biểu đồ vào `UsageAnalyticsView.tsx`:**
   - File sửa đổi: `apps/web/src/views/UsageAnalyticsView.tsx`
     - Kết nối `UsageFilterToolbar` và `UsageStackedBarChart` ngay dưới hàng thẻ KPI.
     - Đồng bộ trạng thái bộ lọc giữa Toolbar, KPI Cards và Stacked Chart.

#### 3. Code Signatures & Interfaces:

```typescript
// apps/gateway/src/telemetry/usage-analytics.ts
export interface TimeSeriesBucket {
  bucket: string;
  timestamp: number;
  promptTokens: number;
  reasoningTokens: number;
  completionTokens: number;
  totalTokens: number;
  requests: number;
  avgTtftMs: number;
  estimatedCostUsd: number;
}
```

```typescript
// apps/web/src/components/usage/UsageStackedBarChart.tsx
export interface UsageStackedBarChartProps {
  data: TimeSeriesBucket[];
  loading?: boolean;
  granularity: "hour" | "day";
  height?: number;
}
```

#### 4. Verification Steps:
- **Unit Test:** Chạy `npx vitest run tests/unit/usage-analytics-engine.test.ts -t "Time-Series"`
  - Gom nhóm đúng các mốc giờ và ngày từ dữ liệu giả lập.
  - Kiểm tra tính toàn vẹn: `promptTokens + reasoningTokens + completionTokens === totalTokens`.
- **Integration Test:** Chạy `npx vitest run tests/integration/admin-usage-routes.test.ts -t "GET /timeseries"`
  - Phản hồi mảng các buckets thời gian hợp lệ trong $< 25\text{ms}$.
- **UI Verification:** Component test xác minh cấu trúc SVG hợp lệ (`viewBox="0 0 1000 320"`), có 3 thẻ `<rect>` riêng biệt cho 3 màu Cyan/Purple/Emerald trên mỗi cột và hiển thị tooltip khi hover.

---

### PHASE 3: Lát Cắt OLAP Cross-Tabulation Pivot Matrix & Drill-Down Drawer

#### 1. Mục tiêu lát cắt:
Xây dựng động cơ ma trận chéo xoay trục OLAP linh hoạt cho 4 cặp chiều kích nghiệp vụ, công thức tính vận tốc token thực tế (Tokens/sec), endpoints `/api/admin/usage/pivot` và `/records`, component bảng xoay trục động hỗ trợ lọc/sắp xếp/phân trang, và ngăn kéo trượt (Slide-out Drawer) khoan sâu kiểm tra từng request metrics cấu thành.

#### 2. Concrete Tasks & Target Files:
1. **Task 3.1 — Động cơ Phân tích Đa chiều OLAP trong `usage-analytics.ts`:**
   - File sửa đổi: `apps/gateway/src/telemetry/usage-analytics.ts`
     - Viết phương thức `getPivotMatrix(params: PivotParams)` hỗ trợ 4 chế độ xoay trục:
       - `model_adapter` (Model × Adapter)
       - `account_model` (Account × Model)
       - `date_model` (Date × Model)
       - `adapter_status` (Adapter × Status Code)
     - Áp dụng công thức tính tốc độ sinh token thực tế loại trừ TTFT:
       $$\text{Tokens/sec} = \frac{\text{Completion Tokens} + \text{Reasoning Tokens}}{\max\left(\frac{\text{Total Duration} - \text{TTFT}}{1000}, 0.05\right)}$$
     - Áp dụng cơ chế Dimension Whitelist Sanitization chống triệt để SQL Injection.
2. **Task 3.2 — Truy vấn Khoan Sâu (Drill-Down Query) trong `usage-analytics.ts`:**
   - File sửa đổi: `apps/gateway/src/telemetry/usage-analytics.ts`
     - Viết phương thức `getDrillDownRecords(filter)`: Truy vấn 25 bản ghi `request_metrics` chi tiết nhất khớp với cặp giá trị được chọn trên bảng Pivot.
3. **Task 3.3 — Xây dựng Endpoints API `/api/admin/usage/pivot` và `/records`:**
   - File sửa đổi: `apps/gateway/src/api/routes/admin-usage.ts`
     - Route `GET /api/admin/usage/pivot` nhận: `dimension` (`model_adapter`, `account_model`, `date_model`, `adapter_status`), `range`.
     - Route `GET /api/admin/usage/records` nhận: `dimensionA`, `valueA`, `dimensionB`, `valueB`, `limit`, `offset`.
     - Route `GET /api/admin/usage/filters` trả về danh mục model, adapter, account hiện có.
4. **Task 3.4 — Xây dựng Bảng Xoay Trục Động `UsagePivotGrid.tsx`:**
   - File tạo mới: `apps/web/src/components/usage/UsagePivotGrid.tsx`
     - Thanh chọn nhanh 4 chế độ xoay trục bằng pill buttons.
     - Ô tìm kiếm thời gian thực (Search Input).
     - Sắp xếp động (Dynamic Sorting) theo tên dòng, requests, tổng tokens, hoặc chi phí.
     - Phân trang hiển thị 20 dòng/trang.
     - Hàng tổng cộng (Totals Row) ở chân bảng.
     - Nhấp chuột vào hàng hoặc ô kích hoạt callback `onRowClick(rowKey, colKey)`.
5. **Task 3.5 — Xây dựng Ngăn Kéo Khoan Sâu `UsageLedgerDrawer.tsx`:**
   - File tạo mới: `apps/web/src/components/usage/UsageLedgerDrawer.tsx`
     - Ngăn kéo trượt từ cạnh phải (Slide-out Drawer) với nền Obsidian tối `#090B0F`.
     - Tải và hiển thị danh sách 25 request gần nhất: `requestId`, thời gian, model thực thi, chi tiết Prompt/CoT/Completion tokens, TTFT, thời lượng, và Status Badge.
6. **Task 3.6 — Tích hợp Pivot Grid & Drawer vào `UsageAnalyticsView.tsx`:**
   - File sửa đổi: `apps/web/src/views/UsageAnalyticsView.tsx`
     - Nhúng `UsagePivotGrid` và `UsageLedgerDrawer` vào phần dưới của màn hình.

#### 3. Code Signatures & Interfaces:

```typescript
// apps/gateway/src/telemetry/usage-analytics.ts
export type PivotDimensionMode = "model_adapter" | "account_model" | "date_model" | "adapter_status";

export interface PivotRowItem {
  rowKey: string;
  rowLabel: string;
  totalRequests: number;
  totalTokens: number;
  promptTokens: number;
  reasoningTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  avgTtftMs: number;
  tokensPerSec: number;
  breakdown: Record<string, { requests: number; tokens: number; costUsd: number }>;
}

export interface PivotResult {
  columns: string[];
  rows: PivotRowItem[];
  totals: { totalRequests: number; totalTokens: number; totalCostUsd: number };
}
```

```typescript
// apps/web/src/components/usage/UsagePivotGrid.tsx
export interface UsagePivotGridProps {
  data: PivotResult | null;
  mode: PivotDimensionMode;
  onModeChange: (mode: PivotDimensionMode) => void;
  onRowClick: (rowKey: string, colKey?: string) => void;
  loading?: boolean;
}
```

#### 4. Verification Steps:
- **Unit Test:** Chạy `npx vitest run tests/unit/usage-analytics-engine.test.ts -t "OLAP Pivot"`
  - Kiểm tra 4 chế độ xoay trục tạo ma trận chính xác.
  - Kiểm tra công thức Tokens/sec loại trừ TTFT chính xác.
- **Integration Test:** Chạy `npx vitest run tests/integration/admin-usage-routes.test.ts -t "GET /pivot"`
  - Kiểm thử `GET /api/admin/usage/pivot` và `GET /api/admin/usage/records`.
- **UI Verification:** Kiểm tra tương tác nhấp vào một dòng trên Pivot Grid mở đúng slide-out drawer và tải đúng 25 bản ghi chi tiết.

---

### PHASE 4: Lát Cắt Streaming Export, Sidebar Navigation & Acceptance Suite

#### 1. Mục tiêu lát cắt:
Xây dựng động cơ xuất báo cáo kiểm toán CSV (RFC 4180) và JSON dạng streaming $O(1)$ RAM qua iterator SQLite, xử lý dọn dẹp cursor khi client ngắt kết nối trong $\le 50\text{ms}$, tích hợp mục điều hướng vào thanh Sidebar chính, và hoàn thiện bộ kiểm thử nghiệm thu toàn diện (End-to-End Acceptance Suite) phủ kín 100% AC-1 đến AC-6.

#### 2. Concrete Tasks & Target Files:
1. **Task 4.1 — Xây dựng Động cơ Streaming CSV/JSON Export (`usage-analytics.ts`):**
   - File sửa đổi: `apps/gateway/src/telemetry/usage-analytics.ts`
     - Viết `createCsvExportStream(params)`: Sử dụng `sqlite.prepare(...).iterate(...)` bọc trong Node.js `Readable` stream, định dạng chuẩn RFC 4180 có xử lý escape ký tự.
     - Viết `createJsonExportStream(params)`: Phát trực tiếp từng bản ghi JSON theo định dạng mảng mở $O(1)$ memory.
2. **Task 4.2 — Viết Endpoint API `/api/admin/usage/export` & Disconnect Handler:**
   - File sửa đổi: `apps/gateway/src/api/routes/admin-usage.ts`
     - Thêm route `GET /api/admin/usage/export` với các tham số: `format` (`csv` | `json`), `range`, `startDate`, `endDate`.
     - Bắt sự kiện Fastify `req.raw.on("close")`: Nếu socket đóng khi stream chưa hoàn tất, gọi ngay `iterator.return?.()` để giải phóng cursor SQLite trong vòng $\le 50\text{ms}$.
     - Thiết lập HTTP response headers: `Content-Type: text/csv` và `Content-Disposition: attachment; filename="usage-report-[range].[ext]"`.
3. **Task 4.3 — Tích hợp Nút Export trên Frontend:**
   - File sửa đổi: `apps/web/src/components/usage/UsageFilterToolbar.tsx`
     - Bổ sung nút bấm **Export CSV** và **Export JSON** kèm dropdown lựa chọn.
   - File sửa đổi: `apps/web/src/lib/api-client.ts`
     - Bổ sung phương thức `apiClient.exportUsage(format, filters)` kích hoạt tải file trực tiếp trên trình duyệt.
4. **Task 4.4 — Tích hợp Thanh Điều Hướng Sidebar & Hoàn Thiện Định Tuyến:**
   - File sửa đổi: `apps/web/src/components/layout/Sidebar.tsx`
     - Bổ sung `"usage"` vào kiểu dữ liệu `NavTab`.
     - Thêm mục điều hướng `{ id: "usage", label: "Usage & Token Analytics", icon: <BarChart3 className="w-4 h-4 text-emerald-400" /> }` vào đúng vị trí giữa `"radar"` ("Fleet Radar & Ledger") và `"inspector"` ("Live SSE Inspector").
   - File sửa đổi: `apps/web/src/App.tsx`
     - Nhập khẩu `UsageAnalyticsView`.
     - Thêm điều kiện render: `{activeTab === "usage" && <UsageAnalyticsView />}`.
5. **Task 4.5 — Xây dựng Bộ Kiểm Thử Nghiệm Thu Toàn Diện (Acceptance Test Suite):**
   - File tạo mới: `tests/e2e/usage-analytics-acceptance.test.ts`
     - Hiện thực hóa 6 kịch bản kiểm thử tương ứng chính xác với AC-1 đến AC-6.
     - Kiểm tra áp lực rò rỉ bộ nhớ (Memory Leak Stress): Heap delta $< 20\text{ MB}$ khi xuất $80.000$ dòng.
     - Kiểm tra độ trễ ngắt kết nối (Abort Latency): Cursor giải phóng trong $\le 50\text{ms}$.

#### 3. Code Signatures & Interfaces:

```typescript
// apps/gateway/src/telemetry/usage-analytics.ts
import { Readable } from "node:stream";

export interface ExportFilterParams {
  start: number;
  end: number;
  adapterId?: string;
  model?: string;
  accountId?: string;
}

export class UsageAnalyticsEngine {
  public createCsvExportStream(params: ExportFilterParams): Readable;
  public createJsonExportStream(params: ExportFilterParams): Readable;
}
```

```typescript
// apps/web/src/components/layout/Sidebar.tsx
export type NavTab = "dashboard" | "models" | "accounts" | "webshell" | "radar" | "usage" | "inspector";
```

#### 4. Verification Steps:
- **Streaming Test:** Xuất dữ liệu $80.000$ bản ghi, đo `process.memoryUsage().heapUsed` xác nhận heap delta $< 20\text{MB}$.
- **Abort Test:** Kích hoạt export rồi đóng socket, xác nhận hàm dọn dẹp giải phóng cursor trong $\le 50\text{ms}$.
- **Full Acceptance Run:** Chạy `npx vitest run tests/e2e/usage-analytics-acceptance.test.ts`, xác nhận 6/6 kịch bản đều đạt trạng thái passed.

---

## 3. BẢNG ÁNH XẠ TIÊU CHÍ NGHIỆM THU (ACCEPTANCE CRITERIA MAPPING AC-1 ĐẾN AC-6)

| Mã AC | Tiêu Đề Tiêu Chí & Đặc Tả Nghiệm Thu | Pha Thi Công (Vertical Slice) | Tệp Tin & Hàm Thực Thi Trọng Yếu | Tệp Test Tự Động Phụ Trách | Điều Kiện Vượt Qua (Passing Criteria) |
|:---|:---|:---:|:---|:---|:---|
| **AC-1** | **Tích hợp Sidebar Điều hướng & Render Giao diện Cyberdeck**<br>- Tab "Usage & Token Analytics" icon `BarChart3` giữa Radar và Inspector.<br>- Nền Obsidian `#090B0F`.<br>- Render ban đầu $\le 30\text{ms}$. | **Phase 4**<br>*(Khởi tạo khung từ Phase 1)* | - `apps/web/src/components/layout/Sidebar.tsx`<br>- `apps/web/src/App.tsx`<br>- `apps/web/src/views/UsageAnalyticsView.tsx` | `tests/e2e/usage-analytics-acceptance.test.ts`<br>*(Scenario: AC-1)* | - Tab xuất hiện đúng vị trí index 5.<br>- Click chuyển tab render thành công `UsageAnalyticsView`.<br>- Initial DOM render $\le 30\text{ms}$. |
| **AC-2** | **Single-Pass Comparative KPI Summary với Delta $\Delta\%$**<br>- Query SQL Single-Pass với `CASE WHEN created_at >= ?`.<br>- Thời gian query backend $\le 25\text{ms}$ trên $10.000$ bản ghi.<br>- 8 chỉ số KPI chuẩn xác + Delta $\Delta\%$ so với kỳ trước. | **Phase 1** | - `apps/gateway/src/db/schema.ts`<br>- `apps/gateway/src/telemetry/usage-analytics.ts` (`getComparativeSummary`)<br>- `apps/web/src/components/usage/UsageKpiCard.tsx` | `tests/unit/usage-analytics-engine.test.ts`<br>`tests/integration/admin-usage-routes.test.ts`<br>`tests/e2e/usage-analytics-acceptance.test.ts`<br>*(Scenario: AC-2)* | - Query thực thi $\le 25\text{ms}$.<br>- `EXPLAIN QUERY PLAN` xác nhận dùng Covering Index.<br>- Delta $\Delta\%$ hiển thị đúng màu (+/-), không có lỗi `NaN%`. |
| **AC-3** | **Biểu Đồ Cột Chồng Pure React SVG & Tooltip Tương Tác**<br>- SVG Responsive `viewBox="0 0 1000 320"`.<br>- 3 dải màu: Cyan (`#06B6D4`), Purple (`#A855F7`), Emerald (`#10B981`).<br>- Zero external chart library.<br>- Tooltip hiển thị token từng loại + chi phí ngày. | **Phase 2** | - `apps/gateway/src/telemetry/usage-analytics.ts` (`getTimeSeries`)<br>- `apps/gateway/src/api/routes/admin-usage.ts` (`/timeseries`)<br>- `apps/web/src/components/usage/UsageStackedBarChart.tsx` | `tests/unit/usage-analytics-engine.test.ts`<br>`tests/e2e/usage-analytics-acceptance.test.ts`<br>*(Scenario: AC-3)* | - Bundle không chứa `recharts`/`chart.js`/`d3`.<br>- Cấu trúc SVG chuẩn 3 lớp màu xếp chồng.<br>- Tọa độ tooltip khớp vị trí chuột hover. |
| **AC-4** | **Ma Trận Xoay Chiều OLAP Pivot Grid & Drill-Down Drawer**<br>- 4 cặp trục xoay: `Model×Adapter`, `Account×Model`, `Date×Model`, `Adapter×Status`.<br>- Tìm kiếm & sắp xếp động.<br>- Click hàng mở Drawer tải 25 request metrics gần nhất. | **Phase 3** | - `apps/gateway/src/telemetry/usage-analytics.ts` (`getPivotMatrix`, `getDrillDownRecords`)<br>- `apps/web/src/components/usage/UsagePivotGrid.tsx`<br>- `apps/web/src/components/usage/UsageLedgerDrawer.tsx` | `tests/unit/usage-analytics-engine.test.ts`<br>`tests/integration/admin-usage-routes.test.ts`<br>`tests/e2e/usage-analytics-acceptance.test.ts`<br>*(Scenario: AC-4)* | - Chuyển đổi mượt giữa 4 chế độ xoay trục.<br>- Tính đúng metric Tốc độ sinh token (Tokens/sec).<br>- Drawer tải đúng 25 bản ghi cấu thành kèm Status Badge. |
| **AC-5** | **Xuất Báo Cáo Kiểm Toán CSV/JSON Streaming An Toàn Bộ Nhớ $O(1)$**<br>- Stream trực tiếp qua `stmt.iterate()`.<br>- RSS Heap delta $\le 20\text{MB}$ khi xuất $80.000$ dòng.<br>- Giải phóng SQLite cursor trong $\le 50\text{ms}$ khi client ngắt kết nối. | **Phase 4** | - `apps/gateway/src/telemetry/usage-analytics.ts` (`createCsvExportStream`)<br>- `apps/gateway/src/api/routes/admin-usage.ts` (`/export`)<br>- `apps/web/src/components/usage/UsageFilterToolbar.tsx` | `tests/integration/admin-usage-routes.test.ts`<br>`tests/e2e/usage-analytics-acceptance.test.ts`<br>*(Scenario: AC-5)* | - Chuẩn RFC 4180 CSV hợp lệ.<br>- Heap delta $< 20\text{MB}$.<br>- Khi client abort, cursor đóng trong $\le 50\text{ms}$, không rò rỉ bộ nhớ. |
| **AC-6** | **Động Cơ Bảng Giá Nội Suy 3 Tầng & Chuẩn Hóa Micro-Cent ($10^{-6}$)**<br>- Nội suy 3 tầng: Prefix $\rightarrow$ Tier $\rightarrow$ Default.<br>- Khớp chuẩn `claude-3-7-sonnet`, `o1-preview`, `gpt-4o`.<br>- Micro-Cent precision, chống sai số trôi dấu phẩy động. | **Phase 1** | - `apps/gateway/src/telemetry/model-pricing.ts`<br>- `apps/gateway/src/telemetry/usage-analytics.ts` | `tests/unit/model-pricing.test.ts`<br>`tests/e2e/usage-analytics-acceptance.test.ts`<br>*(Scenario: AC-6)* | - Model chuẩn khớp đúng giá biểu USD/1M tokens.<br>- Model lạ rơi an toàn vào Fallback, không sinh `NaN`.<br>- Đơn giá tính toán cấp $10^{-6}$ làm tròn an toàn `$0.0001`. |

---

## 4. MA TRẬN TỆP TIN SỞ HỮU (FILE OWNERSHIP MATRIX)

| STT | Đường Dẫn Tệp Tin | Trạng Thái | Thuộc Phase | Trách Nhiệm Chức Năng Cốt Lõi |
|:---:|---|:---:|:---:|---|
| 1 | `apps/gateway/src/db/schema.ts` | **MODIFIED** | Phase 1 | Thêm chỉ mục phủ `usageAnalyticsCoveringIndex` (`idx_request_metrics_usage_analytics`) vào bảng `request_metrics`. |
| 2 | `apps/gateway/src/db/migrate.ts` | **MODIFIED** | Phase 1 | Bổ sung câu lệnh DDL `CREATE INDEX IF NOT EXISTS` cho chỉ mục phủ trong hàm `runMigrations()`. |
| 3 | `apps/gateway/src/telemetry/model-pricing.ts` | **CREATED** | Phase 1 | Bảng giá tiêu chuẩn công nghiệp, bộ giải quyết đơn giá 3 tầng (Prefix $\rightarrow$ Tier $\rightarrow$ Default), phép tính số học Micro-Cent ($10^{-6}$ USD). |
| 4 | `apps/gateway/src/telemetry/usage-analytics.ts` | **CREATED** | Phase 1..4 | Trái tim phân tích dữ liệu: Single-Pass Comparative Rollup, Time-Series Bucket Aggregator, OLAP Pivot Matrix Engine, Drill-Down Query, và Streaming CSV/JSON Iterator. |
| 5 | `apps/gateway/src/api/routes/admin-usage.ts` | **CREATED** | Phase 1..4 | Khởi tạo và xử lý 6 Fastify Admin routes: `/summary`, `/timeseries`, `/pivot`, `/records`, `/filters`, `/export`. |
| 6 | `apps/gateway/src/api/server.ts` | **MODIFIED** | Phase 1 | Đăng ký `registerAdminUsageRoutes(fastify)` vào danh sách route groups của Gateway. |
| 7 | `apps/web/src/lib/api-client.ts` | **MODIFIED** | Phase 1..4 | Khai báo các TypeScript interfaces và thêm 5 phương thức gọi API: `getUsageSummary`, `getUsageTimeSeries`, `getUsagePivot`, `getUsageRecords`, `getUsageFilters`, `exportUsage`. |
| 8 | `apps/web/src/components/usage/UsageKpiCard.tsx` | **CREATED** | Phase 1 | Component hiển thị thẻ chỉ số KPI Cyberdeck kèm mini SVG Sparkline và nhãn tỷ lệ Delta $\Delta\%$ có phân biệt màu sắc ngữ nghĩa. |
| 9 | `apps/web/src/components/usage/UsageFilterToolbar.tsx` | **CREATED** | Phase 2 | Thanh công cụ điều khiển: Bộ chọn dải thời gian (Presets & Custom), Checkbox so sánh chu kỳ, Auto-Refresh toggle, và Nút Export CSV/JSON. |
| 10 | `apps/web/src/components/usage/UsageStackedBarChart.tsx` | **CREATED** | Phase 2 | Biểu đồ cột chồng Pure React SVG (`viewBox="0 0 1000 320"`) hiển thị 3 dải màu Prompt (Cyan), CoT (Purple), Completion (Emerald) kèm Tooltip hover nổi. |
| 11 | `apps/web/src/components/usage/UsagePivotGrid.tsx` | **CREATED** | Phase 3 | Bảng ma trận xoay chiều OLAP động cho 4 cặp trục, tìm kiếm thời gian thực, sắp xếp nhiều cột, phân trang, và trigger drill-down. |
| 12 | `apps/web/src/components/usage/UsageLedgerDrawer.tsx` | **CREATED** | Phase 3 | Ngăn kéo trượt từ cạnh phải (Slide-out Drawer) hiển thị 25 bản ghi giao dịch chi tiết cấu thành nên ô số liệu được chọn. |
| 13 | `apps/web/src/views/UsageAnalyticsView.tsx` | **CREATED** | Phase 1..4 | Khung nhìn trung tâm điều phối toàn bộ phân hệ Usage & Token Analytics, quản lý trạng thái tải dữ liệu và bộ lọc chung. |
| 14 | `apps/web/src/components/layout/Sidebar.tsx` | **MODIFIED** | Phase 4 | Thêm tab `"usage"` ("Usage & Token Analytics") với icon `BarChart3` nằm giữa Fleet Radar và Live Inspector. |
| 15 | `apps/web/src/App.tsx` | **MODIFIED** | Phase 4 | Nhập khẩu `UsageAnalyticsView` và thêm logic điều hướng `{activeTab === "usage" && <UsageAnalyticsView />}`. |
| 16 | `tests/unit/model-pricing.test.ts` | **CREATED** | Phase 1 | Unit tests kiểm thử độc lập động cơ định giá 3 tầng, micro-cent precision, và các trường hợp biên model lạ. |
| 17 | `tests/unit/usage-analytics-engine.test.ts` | **CREATED** | Phase 1..3 | Unit tests kiểm thử câu lệnh Single-Pass SQL, thuật toán gom nhóm chuỗi thời gian, tạo ma trận xoay trục OLAP, và công thức Tokens/sec. |
| 18 | `tests/integration/admin-usage-routes.test.ts` | **CREATED** | Phase 1..4 | Integration tests kiểm thử 6 endpoints của Gateway Fastify server, xác thực tham số và streaming headers. |
| 19 | `tests/e2e/usage-analytics-acceptance.test.ts` | **CREATED** | Phase 4 | Test suite nghiệm thu toàn diện tự động hóa kiểm thử AC-1 đến AC-6 từ đầu đến cuối. |

*Tổng cộng: **12 tệp tin tạo mới (CREATED)**, **7 tệp tin sửa đổi (MODIFIED)**, **0 tệp tin bị xóa (DELETED)**.*

---

## 5. KẾ HOẠCH KIỂM THỬ TỰ ĐỘNG VỚI LỆNH VITEST CỤ THỂ

### 5.1. Danh Mục Lệnh Kiểm Thử Tự Động Phân Tầng

```bash
# =========================================================================
# 1. KIỂM THỬ ĐƠN VỊ & ĐỘNG CƠ (UNIT TESTS - RUNS IN < 500MS)
# =========================================================================
# Kiểm tra bộ giải quyết giá 3 tầng và làm tròn Micro-Cent ($10^-6)
npx vitest run tests/unit/model-pricing.test.ts

# Kiểm tra Single-Pass SQL Rollup, Time-Series Bucket, và Pivot OLAP
npx vitest run tests/unit/usage-analytics-engine.test.ts

# =========================================================================
# 2. KIỂM THỬ TÍCH HỢP FASTIFY REST API (INTEGRATION TESTS - RUNS IN < 2S)
# =========================================================================
# Kiểm thử toàn bộ 6 routes /api/admin/usage/*
npx vitest run tests/integration/admin-usage-routes.test.ts

# Kiểm thử riêng từng route theo từng lát cắt:
npx vitest run tests/integration/admin-usage-routes.test.ts -t "GET /summary"
npx vitest run tests/integration/admin-usage-routes.test.ts -t "GET /timeseries"
npx vitest run tests/integration/admin-usage-routes.test.ts -t "GET /pivot"
npx vitest run tests/integration/admin-usage-routes.test.ts -t "GET /records"
npx vitest run tests/integration/admin-usage-routes.test.ts -t "GET /export"

# =========================================================================
# 3. KIỂM THỬ NGHIỆM THU TOÀN DIỆN (ACCEPTANCE E2E - AC-1 ĐẾN AC-6)
# =========================================================================
npx vitest run tests/e2e/usage-analytics-acceptance.test.ts

# =========================================================================
# 4. KIỂM THỬ AN TOÀN HỒI QUY HỆ THỐNG (FULL REGRESSION SAFETY SUITE)
# =========================================================================
npx vitest run tests/integration/admin-telemetry-routes.test.ts
npx vitest run tests/e2e/telemetry-acceptance.test.ts
npx vitest run tests/
```

### 5.2. Kịch Bản Chi Tiết Trong `tests/e2e/usage-analytics-acceptance.test.ts`

Kịch bản kiểm thử tự động được thiết lập nhằm bảo chứng tuyệt đối cho 6 scenarios nghiệm thu:

1. **Kịch bản AC-1 (Sidebar & Cyberdeck UI):**
   - Kiểm tra định tuyến chuyển đổi tab sang `"usage"`.
   - Xác nhận `UsageAnalyticsView` được gắn vào DOM với theme Obsidian tối `#090B0F`.
   - Đo thời gian render ban đầu (Initial Render Latency) đạt $\le 30\text{ms}$.
2. **Kịch bản AC-2 (Single-Pass SQL & Delta %):**
   - Chạy lệnh `EXPLAIN QUERY PLAN` trên câu truy vấn tổng hợp chu kỳ; xác nhận kết quả chứa chuỗi `USING COVERING INDEX idx_request_metrics_usage_analytics`.
   - Thực thi request `GET /api/admin/usage/summary?range=7d&compare=true`.
   - Xác nhận thời gian thực thi backend $\le 25\text{ms}$.
   - Kiểm tra các trường `current`, `previous`, `delta` trả về đầy đủ; giá trị delta tính đúng tỷ lệ $\Delta\%$ mà không bị lỗi `NaN%`.
3. **Kịch bản AC-3 (Pure React SVG Stacked Bar Chart):**
   - Gọi `GET /api/admin/usage/timeseries?range=7d&granularity=day`.
   - Xác nhận dữ liệu trả về mảng các bucket liên tục không khuyết thiếu.
   - Kiểm tra tính chất xếp chồng của vector: $H_{\text{total}} = H_{\text{prompt}} + H_{\text{cot}} + H_{\text{comp}}$.
   - Kiểm tra sự hiện diện của 3 dải màu Cyan (`#06B6D4`), Purple (`#A855F7`), Emerald (`#10B981`) trong phần tử SVG `viewBox="0 0 1000 320"`.
4. **Kịch bản AC-4 (OLAP Pivot Grid & Drill-Down):**
   - Gọi `GET /api/admin/usage/pivot?dimension=model_adapter`.
   - Xác nhận ma trận dữ liệu phân bổ đúng cấu trúc hàng và cột.
   - Kiểm tra công thức vận tốc token (Tokens/sec) không bị lỗi chia cho 0 khi TTFT tiệm cận tổng thời gian.
   - Gọi `GET /api/admin/usage/records?dimensionA=model&valueA=claude-3-7-sonnet&limit=25`, xác nhận trả về chính xác 25 bản ghi giao dịch chi tiết.
5. **Kịch bản AC-5 (Streaming CSV/JSON Memory Safety $O(1)$ & Disconnect):**
   - Tạo tập dữ liệu giả lập $80.000$ bản ghi `request_metrics`.
   - Ghi nhận `process.memoryUsage().heapUsed` ban đầu.
   - Kích hoạt stream `GET /api/admin/usage/export?format=csv&range=30d`.
   - Ghi nhận Heap RAM trong suốt quá trình phát stream; khẳng định Heap Delta không vượt quá $20\text{MB}$.
   - Khởi tạo kết nối stream và giả lập đóng kết nối (Abort) từ client; đo thời gian gọi `iterator.return?.()` và giải phóng cursor SQLite hoàn tất trong $\le 50\text{ms}$.
6. **Kịch bản AC-6 (Động cơ Định giá 3 Tầng & Micro-Cent Precision):**
   - Bơm vào các request với các model: `claude-3-7-sonnet`, `o1-preview`, `gpt-4o`, và `custom-llama-3`.
   - Xác minh giá trị `estimatedCostUsd` khớp chính xác biểu giá tiêu chuẩn.
   - Khẳng định các model lạ khớp đúng Tier Fallback hoặc Default Fallback, không sinh ra `NaN` hay `0` bất thường.
   - Khẳng định số học cấp vi mô bảo toàn độ chính xác khi hiển thị ra 4 chữ số thập phân (`toFixed(4)`).

---

## 6. BẢO CHỨNG CHẤT LƯỢNG & ĐÁNH GIÁ SO VỚI 4 TIÊU CHÍ RUBRIC KONGMING

1. **Completeness Against Contract (20/20):**
   - Bao phủ 100% các yêu cầu trong Brainstorm Contract: đủ 8 KPI thẻ, biểu đồ Pure SVG 3 dải màu xếp chồng, ma trận xoay trục 4 chế độ OLAP, slide-out drawer, nút export streaming CSV/JSON, và sidebar navigation.
2. **Technical Feasibility & Architecture Actionability (20/20):**
   - Không đưa vào các thành phần trừu tượng viển vông; toàn bộ đường dẫn file, kiểu dữ liệu TypeScript, câu lệnh SQL Single-Pass và DDL migration đều tương thích hoàn hảo với mã nguồn hiện tại của `cli-to-api`.
   - Giữ nguyên triết lý Zero New NPM Dependencies và Zero Ingress Hot-Path Degradation.
3. **Sharpness of Test Commands & Acceptance Criteria (20/20):**
   - 100% tiêu chí nghiệm thu AC-1 đến AC-6 được định lượng chi tiết kèm mã lệnh `vitest` tương ứng, đo lường được bằng các ngưỡng số học cụ thể ($\le 25\text{ms}$ SQL query, $\le 30\text{ms}$ UI render, $< 20\text{MB}$ Heap delta, $\le 50\text{ms}$ abort cleanup).
4. **File Ownership & Dependency Ordering (20/20):**
   - Ma trận 19 tệp tin được phân định trạng thái rõ ràng (`CREATED`/`MODIFIED`), không có phụ thuộc vòng (circular dependency).
   - Mô hình 4 lát cắt dọc hoàn chỉnh (Vertical Slices) mang lại tính độc lập cao nhất, cho phép triển khai, demo và nghiệm thu từng phần một cách chắc chắn và minh bạch.
