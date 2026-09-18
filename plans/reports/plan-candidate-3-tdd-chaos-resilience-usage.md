# KẾ HOẠCH THI CÔNG CHI TIẾT (DETAILED IMPLEMENTATION PLAN)
## TÍNH NĂNG: MÀN HÌNH QUẢN TRỊ TIÊU THỤ TOKEN, CHI PHÍ & ĐỐI SOÁT KIỂM TOÁN (USAGE & FINANCIAL INTELLIGENCE HUB)
### CANDIDATE PLAN 3: TEST-DRIVEN DEVELOPMENT (TDD) & CHAOS RESILIENCE PLAN

---

## 1. TỔNG QUAN ĐIỀU HÀNH & PHƯƠNG PHÁP LUẬN TDD (EXECUTIVE SUMMARY & TDD METHODOLOGY)

### 1.1. Tôn Chỉ Tiếp Cận & Triết Lý Kỹ Thuật
Trong kiến trúc Gateway AI trung gian phân phối đa mô hình (`cli-to-api`), dữ liệu lịch sử tiêu thụ token và chi phí tài chính không đơn thuần là số liệu thống kê hiển thị, mà là **Dữ liệu Nhạy cảm Cấp Kiểm toán Tài chính (Financial-Grade Telemetry)**. Bất kỳ sai số tích lũy từ trôi dấu phẩy động (IEEE-754 floating point drift), treo con trỏ cơ sở dữ liệu khi socket bị ngắt đột ngột (unhandled socket abort on large streaming), lỗi chia cho 0 khi tính tỷ lệ tăng trưởng ($\Delta\%$), hay hiện tượng suy giảm hiệu năng do quét toàn bảng (Full Table Scan) đều có thể làm sụp đổ độ tin cậy của toàn bộ hạ tầng Gateway.

**Candidate Plan 3** tiếp cận việc phát triển tính năng "Thêm màn hình Usage" theo triết lý **"Test-Driven Development (TDD) & Chaos Resilience First"**:
> *"Mọi hành vi hệ thống, mọi điều kiện biên, và mọi chế độ lỗi tiềm tàng (failure modes) phải được xác định và chứng minh bằng các bài kiểm thử tự động (RED) trước khi một dòng mã nguồn nghiệp vụ nào được phép viết ra."*

### 1.2. Chu Trình TDD Đỏ - Xanh - Tái Cấu Trúc (Red-Green-Refactor Lifecycle)
Candidate Plan 3 chia nhỏ quá trình thực thi thành chu trình lặp khép kín:
1. **Fixture-First:** Xây dựng bộ sinh dữ liệu tổng hợp (Synthetic Dataset Generator) mô phỏng từ $10.000$ đến $100.000$ bản ghi đa chiều (`request_metrics`) với phân phối ngẫu nhiên có kiểm soát (deterministic seed) trước khi bắt đầu bất kỳ tác vụ nào.
2. **Red Phase (Viết Test Thất Bại Trước):**
   - Viết các bài test đo lường thời gian thực thi (Performance Benchmarks) với ràng buộc cứng: thời gian truy vấn SQL Single-Pass $\le 25\text{ms}$.
   - Viết các bài test hỗn loạn (Chaos Tests): socket hủy đột ngột giữa chừng khi đang stream CSV 50.000 dòng; mẫu số kỳ trước bằng 0 trong công thức tính Delta; dồn tải đồng thời 50 workers đọc/ghi.
   - Viết các unit tests kiểm tra độ chính xác tiền tệ vi mô (Micro-Cent precision) với sai số $\epsilon = 0$.
3. **Green Phase (Hiện Thực Mã Nguồn Tối Giản):**
   - Thiết lập chỉ mục phủ composite (Covering Index) trên SQLite WAL để thỏa mãn SLA $<25\text{ms}$.
   - Triển khai logic tính toán Micro-Cent bằng số học nguyên và các toán tử an toàn triệt tiêu `NaN`/`Infinity`.
   - Cài đặt stream iterator dọn dẹp tài nguyên thông qua `Readable.destroy()` gắn chặt vào sự kiện `req.raw.on("close")`.
4. **Refactor & Harden:**
   - Tinh chỉnh các components Pure React SVG co giãn vector đáp ứng theo `viewBox="0 0 1000 320"`, không dùng thêm bất kỳ thư viện ngoài nào (Zero New NPM Dependencies).
   - Kiểm chứng mức tiêu thụ bộ nhớ Node.js RSS Heap Delta $\le 20\text{MB}$.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│               SƠ ĐỒ PHƯƠNG PHÁP LUẬN TDD & CHAOS RESILIENCE (CANDIDATE 3)               │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [BƯỚC 1: FIXTURE FACTORY] tests/fixtures/usage-dataset-generator.ts                    │
│ • Sinh 10.000 - 100.000 bản ghi request_metrics với đa dạng status (200, 429, 500)     │
│ • Mô phỏng dữ liệu Token (Prompt, Reasoning CoT, Completion) trên 14-30 ngày           │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [BƯỚC 2: RED TEST SUITE] Viết bộ test thất bại trước (TDD)                             │
│ • Unit Tests: model-pricing.test.ts (Prefix/Tier/Default fallback & Micro-Cent)        │
│ • Chaos Tests: admin-usage.test.ts (Division-by-Zero, Socket Abort mid-stream)         │
│ • SLA Benchmark: Query latency <= 25ms trên 10k rows index scan                        │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [BƯỚC 3: GREEN IMPLEMENTATION] Mã nguồn đáp ứng hoàn hảo các bài test                  │
│ • Covering Index: idx_request_metrics_usage_analytics                                 │
│ • UsageAnalyticsEngine: Single-Pass SQL, O(1) Memory Streaming CSV/JSON                │
│ • Fastify Admin Usage Routes: 6 endpoints chuẩn RESTful                                │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [BƯỚC 4: PURE SVG UI & VISUAL TESTS] Giao diện Cyberdeck không thư viện ngoài          │
│ • Pure React SVG Stacked Bar Chart, KpiCard with Sparkline, PivotGrid & Drawer         │
│ • Visual Unit Tests: usage-components.test.ts kiểm chứng vector math & styling         │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [BƯỚC 5: STRESS & ACCEPTANCE VERIFICATION] Nghiệm thu AC-1 đến AC-6                    │
│ • tests/e2e/usage-acceptance.test.ts: 100% Gherkin scenarios đạt PASS                  │
│ • tests/e2e/usage-chaos-resilience.test.ts: 50 Parallel Requests, 0 SQLITE_BUSY        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.3. Bốn Rào Chắn Phòng Vệ Hỗn Loạn Cốt Tử (Chaos Invariants)
1. **Division-by-Zero Protection:** Khi kỳ trước ($T-1$) có $0$ request hoặc $0$ tokens, công thức tính phần trăm $\Delta\% = \frac{\text{current} - \text{previous}}{\text{previous}} \times 100$ sẽ dẫn đến phép chia cho 0. Candidate 3 cài đặt hàm chặn `calcDelta(cur, prev)`: nếu $prev = 0$, trả về dứt khoát `0.0%` (nếu $cur = 0$) hoặc `+100.0%` (nếu $cur > 0$), tuyệt đối không để lọt `NaN` hay `Infinity` xuống client.
2. **Socket Abort Cleanup in $\le 50\text{ms}$:** Khi người dùng tải file CSV lớn ($50.000$ - $100.000$ dòng) rồi đột ngột tắt tab hoặc ngắt kết nối mạng, stream HTTP bị gãy. Nếu không dọn dẹp, con trỏ `better-sqlite3` sẽ bị rò rỉ và giữ đọc khóa WAL. Candidate 3 hook trực tiếp vào `req.raw.on("close")` để kích hoạt `iterator.return()`, bảo đảm giải phóng cursor trong vòng $\le 50\text{ms}$.
3. **Covering Index Scan Sub-25ms SLA:** Truy vấn gom nhóm Single-Pass được thiết kế để SQLite engine thỏa mãn `USING COVERING INDEX idx_request_metrics_usage_analytics`. Không một trang dữ liệu chính nào bị đọc ngẫu nhiên (Zero Table Page Random Reads), duy trì thời gian phản hồi $\le 25\text{ms}$ trên $10.000$ dòng.
4. **Micro-Cent Arithmetic ($10^{-6}$ USD):** Khử toàn bộ lỗi sai số tích lũy dấu phẩy động bằng cách thực hiện phép nhân token với đơn giá theo đơn vị Micro-Dollar nguyên, sau đó làm tròn bằng `Math.round` trước khi chia lại cho $10^6$ để trả về số thực USD chuẩn xác 4 chữ số thập phân.

---

## 2. KẾ HOẠCH CHI TIẾT 4 PHASES THI CÔNG (DETAILED 4-PHASE ROADMAP)

```
═══════════════════════════════════════════════════════════════════════════════════════════
PHASE 1: SCHEMA INDEXING, TEST FIXTURES & MODEL PRICING UNIT TESTS
═══════════════════════════════════════════════════════════════════════════════════════════
```

### Mục tiêu Phase 1:
Thiết lập nền tảng lưu trữ hiệu năng cao với chỉ mục phủ chuyên dụng, xây dựng bộ sinh fixture dữ liệu hỗn loạn $10.000+$ bản ghi, và phát triển Động cơ Định giá Mô hình theo quy trình TDD chuẩn mực (viết test trước, viết code sau).

### Concrete Tasks & File Paths:

#### Task 1.1: Bổ sung Covering Index trong Schema và SQLite Migrations
* **File sửa đổi 1:** `apps/gateway/src/db/schema.ts`
  - Bổ sung chỉ mục phủ composite `usageAnalyticsCoveringIndex` trên bảng `request_metrics` gom 5 cột: `createdAt`, `adapterId`, `modelExecuted`, `accountId`, `statusCode`.
* **File sửa đổi 2:** `apps/gateway/src/db/migrate.ts`
  - Thêm câu lệnh DDL an toàn vào hàm `runMigrations()`:
    ```sql
    CREATE INDEX IF NOT EXISTS idx_request_metrics_usage_analytics 
    ON request_metrics(created_at, adapter_id, model_executed, account_id, status_code);
    ```
* **Chữ ký mã nguồn:**
  ```typescript
  // apps/gateway/src/db/schema.ts
  export const requestMetrics = sqliteTable(
    "request_metrics",
    {
      // ... giữ nguyên 100% cấu trúc hiện hữu
    },
    (table) => ({
      // ... các index hiện hữu
      usageAnalyticsCoveringIndex: index("idx_request_metrics_usage_analytics").on(
        table.createdAt,
        table.adapterId,
        table.modelExecuted,
        table.accountId,
        table.statusCode
      ),
    })
  );
  ```

#### Task 1.2: Xây dựng Bộ Sinh Fixture Dữ Liệu Lịch Sử (Synthetic Dataset Generator)
* **File tạo mới:** `tests/fixtures/usage-dataset-generator.ts`
* **Mô tả chức năng:** Cung cấp factory hàm để tạo nhanh bộ dữ liệu thực tế gồm $10.000$ đến $50.000$ records kiểm thử, trải dài trên 14 đến 30 ngày, phân bổ tỷ lệ status code (200: 70%, 429: 20%, 500: 10%), đa dạng model (Claude 3.7 Sonnet, GPT-4o, o1-preview, DeepSeek Reasoner, Custom Llama), và chứa các trường token CoT tách biệt.
* **Chữ ký mã nguồn:**
  ```typescript
  // tests/fixtures/usage-dataset-generator.ts
  import type { InsertRequestMetric } from "../../apps/gateway/src/db/schema.js";

  export interface DatasetGeneratorOptions {
    totalRecords?: number;
    daysSpan?: number;
    baseTimestamp?: number;
    errorRatio?: number;
    rateLimitRatio?: number;
  }

  export class UsageDatasetGenerator {
    public static generateMetrics(options?: DatasetGeneratorOptions): InsertRequestMetric[];
    public static seedDatabaseSync(records: InsertRequestMetric[]): void;
    public static cleanDatabaseSync(): void;
  }
  ```

#### Task 1.3: TDD - Viết Unit Tests Cho Động Cơ Định Giá Model (RED Phase)
* **File tạo mới:** `tests/unit/model-pricing.test.ts`
* **Các ca kiểm thử bắt buộc (Must-Fail trước khi có code):**
  1. *Exact & Prefix Match Test:* Khớp chính xác `claude-3-7-sonnet` ra prompt \$3/1M, completion \$15/1M, reasoning \$15/1M; khớp biến thể có hậu tố ngày tháng `claude-3-5-sonnet-20241022` về giá `claude-3-5-sonnet`.
  2. *Heuristic Fallback Test:* Các model chứa từ khóa `haiku`, `mini`, `small` khớp vào tier `low` (\$0.2 / \$0.8); các model chứa `opus`, `o1`, `reasoner` khớp vào tier `high` (\$3.0 / \$15.0).
  3. *Unknown Model Fallback Test:* Model tùy biến lạ `custom-finetuned-llama` rơi vào tier `default` (\$1.5 / \$5.0) an toàn, không trả về giá trị `undefined` hay `0`.
  4. *Micro-Cent Precision & Zero Drift Test:* Tính toán chi phí cho $123.456$ prompt tokens và $45.678$ completion tokens trên `gpt-4o`. Kiểm chứng kết quả đồng nhất với phép tính số nguyên vi mô, không trôi dấu phẩy động IEEE-754.
  5. *Null / Malformed Input Safety Test:* Truyền `model = null`, `""`, hoặc chuỗi rác, hàm vẫn hoạt động an toàn và trả về fallback hợp lệ.
  6. *EXPLAIN QUERY PLAN Verification:* Chạy câu lệnh `sqlite.prepare("EXPLAIN QUERY PLAN SELECT ... FROM request_metrics ...")` kiểm chứng hệ thống sử dụng `USING INDEX idx_request_metrics_usage_analytics`.

#### Task 1.4: Hiện Thực Hóa Động Cơ Định Giá Model (GREEN Phase)
* **File tạo mới:** `apps/gateway/src/telemetry/model-pricing.ts`
* **Chữ ký mã nguồn:**
  ```typescript
  // apps/gateway/src/telemetry/model-pricing.ts
  export interface TokenRates {
    promptPerMillion: number;      // USD per 1M prompt tokens
    completionPerMillion: number;  // USD per 1M completion tokens
    reasoningPerMillion: number;   // USD per 1M reasoning tokens
  }

  export const MODEL_PRICING_TABLE: Record<string, TokenRates>;
  export const TIER_FALLBACK_TABLE: Record<string, TokenRates>;

  export function resolveTokenRates(modelName?: string | null): TokenRates;
  export function calculateMicroCost(
    promptTokens: number,
    completionTokens: number,
    reasoningTokens: number,
    rates: TokenRates
  ): number;
  export function formatCostUsd(cost: number): string;
  ```

#### Tiêu chí Nghiệm thu Phase 1 (Verification Gate 1):
```bash
# 1. Chạy migration schema
npx tsx apps/gateway/src/db/migrate.ts

# 2. Chạy bộ unit tests pricing & query plan
npx vitest run tests/unit/model-pricing.test.ts
```
*Yêu cầu đạt được:* 100% tests PASS, query plan báo cáo `USING INDEX idx_request_metrics_usage_analytics`, độ chính xác micro-cent đạt sai số $\epsilon = 0$.

---

```
═══════════════════════════════════════════════════════════════════════════════════════════
PHASE 2: USAGE ANALYTICS ENGINE & INTEGRATION TEST SUITE (TEST TRƯỚC, CODE SAU)
═══════════════════════════════════════════════════════════════════════════════════════════
```

### Mục tiêu Phase 2:
Xây dựng Động cơ Phân tích OLAP đa chiều, truy vấn Single-Pass hiệu năng cao dưới $25\text{ms}$, bộ xử lý xuất stream CSV/JSON an toàn bộ nhớ $O(1)$ với cơ chế ngắt socket tức thì, và hệ thống Fastify Admin Routes. Toàn bộ endpoints và logic biên đều được viết test trước.

### Concrete Tasks & File Paths:

#### Task 2.1: TDD - Viết Bộ Integration Test Thất Bại Trước Cho Endpoints & Engine (RED Phase)
* **File tạo mới:** `tests/integration/admin-usage.test.ts`
* **Bộ test cases kiểm thử độ bền (Resilience & Chaos Tests):**
  1. *Comparative Summary & Delta Calculation Test:* Kiểm tra `GET /api/admin/usage/summary?range=7d&compare=true`. Kiểm tra toàn bộ 8 KPIs (`totalTokens`, `promptTokens`, `reasoningTokens`, `completionTokens`, `requests`, `estimatedCostUsd`, `avgTtftMs`, `errorRate`) và các trường Delta $\Delta\%$.
  2. *Chaos Test - Division by Zero:* Tạo kịch bản kỳ trước ($T-1$) hoàn toàn không có dữ liệu ($0$ requests, $0$ tokens). Kiểm chứng API trả về `requestsPercent: 100.0%` hoặc `0.0%`, khẳng định $100\%$ không chứa chuỗi `"NaN"` hoặc `null` trong JSON response.
  3. *Latency SLA Benchmark Test:* Seed $10.000$ records bằng fixture generator. Thực hiện truy vấn `getComparativeSummary()`, đo thời gian qua `performance.now()`. Khẳng định `durationMs <= 25`.
  4. *Time-Series Granularity Test:* Kiểm tra `GET /api/admin/usage/timeseries?range=7d&granularity=day` và `granularity=hour`. Xác minh cấu trúc mảng bucket, tính đúng đắn của 3 dòng token riêng biệt.
  5. *OLAP Cross-Tabulation Pivot Test:* Kiểm tra `GET /api/admin/usage/pivot` với 4 tổ hợp trục (`model x adapter`, `account x model`, `date x model`, `adapter x status`). Kiểm chứng tính toàn vẹn của kết quả gom nhóm và cơ chế whitelist cột chống SQL Injection.
  6. *Granular Records (Drill-Down) Test:* Kiểm tra `GET /api/admin/usage/records` với bộ lọc `model`, `adapter`, `account`, phân trang `limit=25`, `offset=0`.
  7. *Filter Metadata Discovery Test:* Kiểm tra `GET /api/admin/usage/filters` trả về danh mục duy nhất của `models`, `adapters`, `accounts`.
  8. *Chaos Test - Abrupt Socket Abort on Large CSV Stream:* Gọi `GET /api/admin/usage/export?format=csv&range=30d` trên tập dữ liệu $50.000$ bản ghi. Khi client đọc được $1.000$ bytes thì kích hoạt `req.raw.destroy()`. Kiểm chứng:
     - Con trỏ SQLite `iterator.return()` được gọi ngay lập tức.
     - Thời gian giải phóng tài nguyên $\le 50\text{ms}$.
     - Cơ sở dữ liệu SQLite sau đó vẫn thực hiện các câu lệnh `INSERT`/`SELECT` bình thường, không dính lỗi `SQLITE_BUSY`.

#### Task 2.2: Hiện Thực Hóa Động Cơ Phân Tích (Usage Analytics Engine) (GREEN Phase)
* **File tạo mới:** `apps/gateway/src/telemetry/usage-analytics.ts`
* **Kiến trúc & Chữ ký mã nguồn:**
  ```typescript
  // apps/gateway/src/telemetry/usage-analytics.ts
  import { sqlite } from "../db/index.js";
  import { resolveTokenRates, calculateMicroCost } from "./model-pricing.js";
  import { Readable } from "node:stream";

  export interface ComparativeSummary {
    current: {
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
    };
    previous: ComparativeSummary["current"] | null;
    delta: {
      totalTokensPercent: number;
      promptTokensPercent: number;
      reasoningTokensPercent: number;
      completionTokensPercent: number;
      requestsPercent: number;
      costPercent: number;
      avgTtftPercent: number;
      errorRatePercent: number;
    } | null;
  }

  export interface TimeSeriesBucket {
    bucket: string;
    requests: number;
    promptTokens: number;
    reasoningTokens: number;
    completionTokens: number;
    totalTokens: number;
    avgTtftMs: number;
    estimatedCostUsd: number;
  }

  export interface PivotRow {
    primaryKey: string;
    secondaryKey: string;
    requests: number;
    promptTokens: number;
    reasoningTokens: number;
    completionTokens: number;
    totalTokens: number;
    tokensPerSec: number;
    estimatedCostUsd: number;
    successCount: number;
    rateLimitCount: number;
    errorCount: number;
  }

  export class UsageAnalyticsEngine {
    public getComparativeSummary(startCurrent: number, endCurrent: number, compare: boolean): ComparativeSummary;
    public getTimeSeries(start: number, end: number, granularity?: "hour" | "day"): TimeSeriesBucket[];
    public getPivotMatrix(start: number, end: number, dim1: string, dim2: string, search?: string): PivotRow[];
    public getGranularRecords(params: {
      start?: number;
      end?: number;
      model?: string;
      adapterId?: string;
      accountId?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }): { records: any[]; total: number; limit: number; offset: number };
    public getFilterMetadata(): { models: string[]; adapters: string[]; accounts: string[] };
    public createCsvExportStream(start: number, end: number): Readable;
    public createJsonExportStream(start: number, end: number): Readable;
  }

  export const globalUsageAnalytics = new UsageAnalyticsEngine();
  ```

* **Thuật toán Single-Pass SQL & Chống Chia cho 0:**
  ```sql
  SELECT
    -- Chu kỳ hiện tại T
    SUM(CASE WHEN created_at BETWEEN ? AND ? THEN 1 ELSE 0 END) as cur_requests,
    SUM(CASE WHEN created_at BETWEEN ? AND ? AND status_code = 200 THEN 1 ELSE 0 END) as cur_success,
    SUM(CASE WHEN created_at BETWEEN ? AND ? AND status_code = 429 THEN 1 ELSE 0 END) as cur_rate_limits,
    SUM(CASE WHEN created_at BETWEEN ? AND ? AND (status_code >= 500 OR status = 'ERROR') THEN 1 ELSE 0 END) as cur_errors,
    COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN prompt_tokens ELSE 0 END), 0) as cur_prompt_tokens,
    COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN reasoning_tokens ELSE 0 END), 0) as cur_reasoning_tokens,
    COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN completion_tokens ELSE 0 END), 0) as cur_completion_tokens,
    COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN total_tokens ELSE 0 END), 0) as cur_total_tokens,
    COALESCE(AVG(CASE WHEN created_at BETWEEN ? AND ? AND ttft_ms > 0 THEN ttft_ms END), 0) as cur_avg_ttft,

    -- Chu kỳ đối chiếu T-1
    SUM(CASE WHEN created_at BETWEEN ? AND ? THEN 1 ELSE 0 END) as prev_requests,
    COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN prompt_tokens ELSE 0 END), 0) as prev_prompt_tokens,
    COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN reasoning_tokens ELSE 0 END), 0) as prev_reasoning_tokens,
    COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN completion_tokens ELSE 0 END), 0) as prev_completion_tokens,
    COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN total_tokens ELSE 0 END), 0) as prev_total_tokens,
    COALESCE(AVG(CASE WHEN created_at BETWEEN ? AND ? AND ttft_ms > 0 THEN ttft_ms END), 0) as prev_avg_ttft
  FROM request_metrics
  WHERE created_at BETWEEN ? AND ?;
  ```
  Hàm tính toán Delta an toàn:
  ```typescript
  export function calcDeltaPercent(cur: number, prev: number): number {
    if (!prev || prev <= 0) {
      return cur > 0 ? 100.0 : 0.0;
    }
    return Math.round(((cur - prev) / prev) * 1000) / 10;
  }
  ```

#### Task 2.3: Đăng Ký Endpoints Fastify Admin Usage
* **File tạo mới:** `apps/gateway/src/api/routes/admin-usage.ts`
* **File sửa đổi:** `apps/gateway/src/api/server.ts`
* **6 Endpoints chuẩn RESTful:**
  - `GET /api/admin/usage/summary`
  - `GET /api/admin/usage/timeseries`
  - `GET /api/admin/usage/pivot`
  - `GET /api/admin/usage/records`
  - `GET /api/admin/usage/filters`
  - `GET /api/admin/usage/export` (Stream trực tiếp, gắn `req.raw.on('close', () => stream.destroy())`)

#### Tiêu chí Nghiệm thu Phase 2 (Verification Gate 2):
```bash
npx vitest run tests/integration/admin-usage.test.ts
```
*Yêu cầu đạt được:* 100% integration tests PASS, thời gian truy vấn Single-Pass $\le 25\text{ms}$, chaos test ngắt socket giải phóng tài nguyên trong $\le 50\text{ms}$, 0 lỗi chia cho 0.

---

```
═══════════════════════════════════════════════════════════════════════════════════════════
PHASE 3: CYBERDECK PURE SVG UI COMPONENTS & VISUAL UNIT TESTS
═══════════════════════════════════════════════════════════════════════════════════════════
```

### Mục tiêu Phase 3:
Xây dựng giao diện Obsidian Cyberdeck chuẩn mực (`#090B0F`) bằng **Pure React SVG JSX** thuần túy (Zero Dependencies), loại bỏ hoàn toàn các thư viện biểu đồ nặng nề. Xây dựng 8 thẻ KPI có mini sparkline, bảng ma trận xoay chiều OLAP, ngăn kéo Drawer xem chi tiết request, và tích hợp thanh điều hướng Sidebar.

### Concrete Tasks & File Paths:

#### Task 3.1: Mở Rộng API Client Frontend
* **File sửa đổi:** `apps/web/src/lib/api-client.ts`
* **File tạo mới (Unit Test):** `tests/unit/usage-api-client.test.ts`
* **Chữ ký phương thức bổ sung:**
  ```typescript
  // apps/web/src/lib/api-client.ts
  export class ApiClient {
    public async getUsageSummary(params: { range?: string; start?: number; end?: number; compare?: boolean }): Promise<ComparativeSummary>;
    public async getUsageTimeSeries(params: { range?: string; start?: number; end?: number; granularity?: "hour" | "day" }): Promise<TimeSeriesBucket[]>;
    public async getUsagePivot(params: { range?: string; dim1: string; dim2: string; search?: string }): Promise<PivotRow[]>;
    public async getUsageRecords(params: { model?: string; adapterId?: string; accountId?: string; limit?: number; offset?: number }): Promise<{ records: any[]; total: number }>;
    public async getUsageFilters(): Promise<{ models: string[]; adapters: string[]; accounts: string[] }>;
    public getUsageExportUrl(params: { range?: string; format: "csv" | "json" }): string;
  }
  ```

#### Task 3.2: Pure React SVG Stacked Bar Chart (Zero Dependencies)
* **File tạo mới:** `apps/web/src/components/usage/UsageStackedBarChart.tsx`
* **Quy chuẩn Kỹ thuật SVG:**
  - `viewBox="0 0 1000 320"`, co giãn đáp ứng linh hoạt theo kích thước vùng chứa.
  - Phân rã 3 dải màu xếp chồng rõ ràng:
    * **Prompt (Input):** Cyan (`#06B6D4`)
    * **Reasoning (CoT):** Purple (`#A855F7`)
    * **Completion (Output):** Emerald (`#10B981`)
  - Lưới tọa độ ngầm (Subtle Gridlines) với nhãn mốc giá trị token dạng rút gọn (ví dụ: `100K`, `500K`, `1.2M`).
  - Interactive Hover Hitboxes (`<rect opacity="0">`) kích hoạt Tooltip định vị thời gian thực, hiển thị: Thời gian, Prompt Tokens, CoT Tokens, Completion Tokens, Tổng Tokens, và Chi phí Ước tính (\$ USD).

#### Task 3.3: Thẻ Chỉ Số KPI HUD & Mini SVG Sparklines
* **File tạo mới:** `apps/web/src/components/usage/UsageKpiCard.tsx`
* **Quy cách:**
  - Hiển thị 8 chỉ số: *Total Tokens, Prompt Tokens, Reasoning Tokens, Completion Tokens, Total Requests, Estimated Cost ($), Average TTFT, Error Rate (%)*.
  - Nhúng thẻ mini Area Sparkline SVG được vẽ bằng phần tử `<path>` nội suy từ mảng 10 điểm xu hướng gần nhất.
  - Delta Badge động: hiển thị `▲ +14.2% vs prev` (màu xanh lá) hoặc `▼ -8.5%` (màu đỏ). Đối với `Error Rate` và `TTFT`, logic màu được đảo ngược thông minh (giảm là tốt $\rightarrow$ màu xanh lá).

#### Task 3.4: Ma Trận Xoay Chiều OLAP (UsagePivotGrid) & Bộ Lọc (UsageFilterToolbar)
* **File tạo mới:** `apps/web/src/components/usage/UsagePivotGrid.tsx`
* **File tạo mới:** `apps/web/src/components/usage/UsageFilterToolbar.tsx`
* **Chức năng:**
  - Thanh chọn nhanh 4 cặp trục: `Model × Adapter`, `Account × Model`, `Date × Model`, `Adapter × Status`.
  - Ô tìm kiếm text theo thời gian thực (Search Filter).
  - Sắp xếp cột linh hoạt (Sort by Column).
  - Bộ nút chọn nhanh khung thời gian: *Today, 7D, 30D, All Time*.
  - Nút gạt Auto-Refresh (Polling 30s) với đèn báo xung nhịp.
  - Nút bấm xuất khẩu CSV và JSON trực tiếp.

#### Task 3.5: Ngăn Kéo Khoan Sâu Giao Dịch (UsageLedgerDrawer)
* **File tạo mới:** `apps/web/src/components/usage/UsageLedgerDrawer.tsx`
* **Chức năng:**
  - Bảng trượt từ cạnh phải (Slide-Out Drawer) kích hoạt khi nhấp chuột vào bất kỳ ô hoặc dòng nào trên bảng Pivot.
  - Hiển thị danh sách 25 request gần nhất cấu thành nên ô đó (gồm RequestId, Model, Adapter, Prompt Tokens, Reasoning Tokens, Completion Tokens, TTFT ms, Duration ms, Status Code).

#### Task 3.6: Tích Hợp Master View & Điều Hướng Sidebar
* **File sửa đổi 1:** `apps/web/src/components/layout/Sidebar.tsx`
  - Bổ sung mục điều hướng `usage` với icon `BarChart3` nằm chính xác giữa `Fleet Radar` và `Live Inspector`.
* **File sửa đổi 2:** `apps/web/src/App.tsx`
  - Định tuyến hiển thị `<UsageAnalyticsView />` khi `activeTab === "usage"`.
* **File tạo mới:** `apps/web/src/views/UsageAnalyticsView.tsx`
  - Master View đồng bộ toàn bộ trạng thái bộ lọc, auto-refresh interval, và phối hợp các component con.

#### Task 3.7: Viết Unit Tests Cho UI Components & SVG Math
* **File tạo mới:** `tests/unit/usage-components.test.ts`
* **Kiểm thử logic:** Hàm tính tọa độ Y của SVG, thuật toán scaling vector, hàm định dạng số token (`1.2M`, `450K`), hàm format tiền tệ 4 số thập phân, và logic phân định màu Delta badge.

#### Tiêu chí Nghiệm thu Phase 3 (Verification Gate 3):
```bash
# 1. Chạy UI component logic tests
npx vitest run tests/unit/usage-components.test.ts tests/unit/usage-api-client.test.ts

# 2. Kiểm tra TypeScript và build frontend
pnpm --filter @cli-to-api/web build
```
*Yêu cầu đạt được:* Bản build Web hoàn tất với 0 TypeScript errors, 0 warnings; các hàm vector math đạt 100% assertions PASS.

---

```
═══════════════════════════════════════════════════════════════════════════════════════════
PHASE 4: END-TO-END ACCEPTANCE TESTS & CONCURRENCY STRESS VERIFICATION
═══════════════════════════════════════════════════════════════════════════════════════════
```

### Mục tiêu Phase 4:
Thực hiện nghiệm thu toàn diện tự động hóa từ đầu đến cuối (E2E) bám sát tuyệt đối các kịch bản AC-1 đến AC-6; kiểm thử áp lực hỗn loạn 50 requests đồng thời trên SQLite WAL; kiểm chứng không có suy thoái hồi quy (zero regressions).

### Concrete Tasks & File Paths:

#### Task 4.1: Bộ Kiểm Thử Nghiệm Thu Chấp Nhận Toàn Diện (Acceptance Suite)
* **File tạo mới:** `tests/e2e/usage-acceptance.test.ts`
* **Nghiệm thu 6 kịch bản Gherkin:**
  - **AC-1:** Kiểm chứng Tab "Usage & Token Analytics" xuất hiện trên Sidebar giữa "Fleet Radar" và "Live Inspector", view khởi tạo với nền tối `#090B0F`, tốc độ phản hồi render ban đầu $\le 30\text{ms}$.
  - **AC-2:** Kiểm chứng Single-Pass SQL gom nhóm 10,000 bản ghi, kiểm tra toàn bộ 8 KPIs và Delta $\Delta\%$ so với kỳ trước, thời gian thực thi backend $\le 25\text{ms}$.
  - **AC-3:** Kiểm chứng cấu trúc Time-Series Pure React SVG với 3 dải màu Prompt Cyan, Reasoning CoT Purple, Completion Emerald và tooltip dữ liệu.
  - **AC-4:** Kiểm chứng khả năng xoay trục Pivot qua 4 cặp dimension và mở Drawer khoan sâu lấy 25 bản ghi chi tiết.
  - **AC-5:** Kiểm chứng xuất khẩu dữ liệu lớn dạng streaming CSV/JSON, kiểm chứng Heap RSS delta $\le 20\text{MB}$.
  - **AC-6:** Kiểm chứng 3 tầng bảng giá Model và độ chính xác Micro-Cent ($10^{-6}$ USD) hiển thị 4 chữ số thập phân.

#### Task 4.2: Bộ Kiểm Thử Áp Lực Song Song & Hỗn Loạn (Chaos & Stress Suite)
* **File tạo mới:** `tests/e2e/usage-chaos-resilience.test.ts`
* **3 Kịch bản Thử Thách Khắc Nghiệt (Extreme Chaos Scenarios):**
  1. *50 Concurrent Read/Write Contention Stress:* Đồng thời tạo 50 requests: 25 requests đẩy telemetry vào queue và 25 requests liên tục gọi endpoint `/api/admin/usage/summary` và `/pivot`. Kiểm chứng **100% không phát sinh lỗi `SQLITE_BUSY`** nhờ SQLite WAL và covering index.
  2. *Socket Abort on 50,000-Row Export:* Tạo kết nối tải CSV 50.000 dòng, đột ngột hủy socket HTTP sau 100ms. Đo thời gian giải phóng cursor của SQLite, khẳng định cursor đóng hoàn tất trong $\le 50\text{ms}$ và bộ nhớ RAM không rò rỉ.
  3. *Zero-Denominator Chaos Test:* Giả lập dữ liệu kỳ $T-1$ trống rỗng, kiểm tra API không trả về bất kỳ ký tự `NaN` nào trong toàn bộ JSON response.

#### Task 4.3: Hàng Rào Chống Suy Thoái Hồi Quy (Zero-Regression Verification)
* Chạy toàn bộ test suites hiện hữu trong thư mục `tests/` để đảm bảo phân hệ mới không làm ảnh hưởng đến các tính năng đang chạy.

#### Tiêu chí Nghiệm thu Phase 4 (Verification Gate 4):
```bash
# 1. Chạy E2E Acceptance Suite
npx vitest run tests/e2e/usage-acceptance.test.ts

# 2. Chạy Chaos & Concurrency Stress Suite
npx vitest run tests/e2e/usage-chaos-resilience.test.ts --testTimeout=60000

# 3. Chạy Full Regression Suite
npm run test
```
*Yêu cầu đạt được:* 100% test suites PASS toàn dự án.

---

## 3. BẢNG ÁNH XẠ TIÊU CHÍ NGHIỆM THU (AC-1 ĐẾN AC-6)

| Mã Tiêu Chí | Kịch Bản Nghiệm Thu & Yêu Cầu Cốt Tử | Module Chịu Trách Nhiệm & Code Signatures | Kịch Bản Thử Nghiệm Hỗn Loạn (Chaos Defense) | Lệnh Vitest Nghiệm Thu |
|---|---|---|---|---|
| **AC-1** | **Tích hợp Sidebar & Giao diện Cyberdeck**<br>- Tab "Usage & Token Analytics" với icon `BarChart3`<br>- Nằm giữa "Fleet Radar" và "Live Inspector"<br>- Nền tối `#090B0F`, render $\le 30\text{ms}$ | `apps/web/src/components/layout/Sidebar.tsx`<br>`apps/web/src/views/UsageAnalyticsView.tsx`<br>`activeTab === "usage"` | Kiểm tra khi API trả về rỗng: render trạng thái Empty State thanh lịch, không bị vỡ layout hoặc treo trang. | `npx vitest run tests/e2e/usage-acceptance.test.ts -t "AC-1"` |
| **AC-2** | **Single-Pass Comparative KPI Summary & Delta $\Delta\%$**<br>- Quét 1 lần duy nhất với `CASE WHEN`<br>- Đầy đủ 8 chỉ số KPI và Delta $\Delta\%$ so với kỳ trước<br>- Thời gian truy vấn SQLite $\le 25\text{ms}$ trên 10k bản ghi | `apps/gateway/src/telemetry/usage-analytics.ts`<br>`getComparativeSummary()`<br>`calcDeltaPercent(cur, prev)` | **Division-by-Zero Chaos:** Kỳ trước $T-1$ có $0$ request/token. Kiểm chứng Delta trả về `+100.0%` hoặc `0.0%`, triệt tiêu $100\%$ lỗi `NaN%` hoặc `Infinity%`. | `npx vitest run tests/integration/admin-usage.test.ts -t "Single-Pass"` |
| **AC-3** | **Pure React SVG Stacked Bar Chart & Tooltip**<br>- Zero New NPM Dependencies<br>- `viewBox="0 0 1000 320"` co giãn vector<br>- 3 dải màu: Prompt Cyan, CoT Purple, Completion Emerald<br>- Tooltip hiển thị chi tiết khi rê chuột | `apps/web/src/components/usage/UsageStackedBarChart.tsx`<br>`apps/gateway/src/telemetry/usage-analytics.ts`<br>`getTimeSeries()` | **Zero Height Anomaly:** Những ngày không có request, cột SVG giữ min-height 1px an toàn, không lỗi phép tính tọa độ Y. | `npx vitest run tests/unit/usage-components.test.ts -t "SVG"` |
| **AC-4** | **OLAP Pivot Grid & Drill-Down Drawer**<br>- Xoay 4 cặp trục: `Model×Adapter`, `Account×Model`, `Date×Model`, `Adapter×Status`<br>- Ngăn kéo Drawer tải 25 request chi tiết cấu thành ô được chọn | `apps/web/src/components/usage/UsagePivotGrid.tsx`<br>`apps/web/src/components/usage/UsageLedgerDrawer.tsx`<br>`getPivotMatrix()`, `getGranularRecords()` | **High Cardinality Injection:** Bảng chứa 200+ models lạ, phân trang 20 dòng/trang hoạt động trơn tru; Whitelist cột chặn đứng SQL Injection. | `npx vitest run tests/e2e/usage-acceptance.test.ts -t "AC-4"` |
| **AC-5** | **Streaming CSV/JSON Export An Toàn Bộ Nhớ $O(1)$**<br>- Stream qua `sqlite.prepare().iterate()`<br>- Heap RSS delta $\le 20\text{MB}$ trên 50k+ bản ghi<br>- Đóng cursor $\le 50\text{ms}$ khi client abort | `apps/gateway/src/telemetry/usage-analytics.ts`<br>`createCsvExportStream()`<br>`apps/gateway/src/api/routes/admin-usage.ts` | **Hard Socket Abort:** Đột ngột ngắt socket HTTP client ở 10% tiến trình tải; kiểm chứng cursor SQLite được đóng ngay trong $\le 50\text{ms}$, không gây `SQLITE_BUSY`. | `npx vitest run tests/e2e/usage-chaos-resilience.test.ts -t "Socket Abort"` |
| **AC-6** | **Bảng Giá 3 Tầng & Chuẩn Hóa Micro-Cent**<br>- Khớp Prefix $\rightarrow$ Tier Fallback $\rightarrow$ Default<br>- Số học vi mô $10^{-6}$ USD chống trôi float<br>- Hiển thị chuẩn hóa làm tròn 4 chữ số thập phân | `apps/gateway/src/telemetry/model-pricing.ts`<br>`resolveTokenRates()`<br>`calculateMicroCost()` | **Float Accumulation Drift:** Cộng dồn 100.000 giao dịch vi mô, đảm bảo kết quả trùng khớp số học nguyên, sai số $\epsilon = 0$. | `npx vitest run tests/unit/model-pricing.test.ts -t "Micro-Cent"` |

---

## 4. MA TRẬN TỆP TIN SỞ HỮU (FILE OWNERSHIP MATRIX)

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                          MA TRẬN PHÂN QUYỀN TỆP TIN (FILE OWNERSHIP MATRIX)                     │
├──────────────────────────────────────────┬───────────┬──────────────────────────────────────────┤
│ Đường dẫn tệp tin                        │ Trạng thái│ Trách nhiệm chức năng                    │
├──────────────────────────────────────────┼───────────┼──────────────────────────────────────────┤
│ apps/gateway/src/db/schema.ts            │ MODIFIED  │ Khai báo composite covering index:       │
│                                          │           │ idx_request_metrics_usage_analytics      │
│ apps/gateway/src/db/migrate.ts           │ MODIFIED  │ Thực thi câu lệnh tạo covering index     │
│                                          │           │ trong quá trình migrate SQLite           │
│ apps/gateway/src/telemetry/              │ CREATED   │ Bảng giá 3 tầng (Prefix/Tier/Default) &  │
│   model-pricing.ts                       │           │ thuật toán Micro-Cent ($10^-6) chống float│
│ apps/gateway/src/telemetry/              │ CREATED   │ Lõi phân tích Single-Pass Rollup, Time-  │
│   usage-analytics.ts                     │           │ Series Buckets, Pivot OLAP & Export Stream│
│ apps/gateway/src/api/routes/             │ CREATED   │ Định nghĩa 6 endpoints REST Fastify:     │
│   admin-usage.ts                         │           │ summary, timeseries, pivot, records, ... │
│ apps/gateway/src/api/server.ts           │ MODIFIED  │ Đăng ký registerAdminUsageRoutes(fastify) │
│ apps/web/src/components/layout/          │ MODIFIED  │ Bổ sung Tab "usage" với icon BarChart3   │
│   Sidebar.tsx                            │           │ và nhãn "Usage & Token Analytics"        │
│ apps/web/src/App.tsx                     │ MODIFIED  │ Wiring định tuyến activeTab === "usage"  │
│                                          │           │ sang UsageAnalyticsView                  │
│ apps/web/src/lib/api-client.ts           │ MODIFIED  │ Bổ sung các phương thức gọi API Usage &  │
│                                          │           │ các TypeScript interfaces dữ liệu        │
│ apps/web/src/views/                      │ CREATED   │ Giao diện trung tâm Usage Dashboard      │
│   UsageAnalyticsView.tsx                 │           │ theo chuẩn Obsidian Cyberdeck            │
│ apps/web/src/components/usage/           │ CREATED   │ Biểu đồ cột chồng Pure React SVG JSX     │
│   UsageStackedBarChart.tsx               │           │ 3 màu với Tooltip tương tác (Zero Deps)  │
│ apps/web/src/components/usage/           │ CREATED   │ Thẻ hiển thị KPI kèm Delta Badge và      │
│   UsageKpiCard.tsx                       │           │ mini area sparkline SVG thuần            │
│ apps/web/src/components/usage/           │ CREATED   │ Bảng ma trận xoay chiều OLAP 4 chiều     │
│   UsagePivotGrid.tsx                     │           │ hỗ trợ sorting, search & drill-down click │
│ apps/web/src/components/usage/           │ CREATED   │ Ngăn kéo Slide-out hiển thị 25 request   │
│   UsageLedgerDrawer.tsx                  │           │ chi tiết cấu thành dữ liệu ô được chọn   │
│ apps/web/src/components/usage/           │ CREATED   │ Thanh lọc thời gian (Today, 7D, 30D),    │
│   UsageFilterToolbar.tsx                 │           │ Auto-refresh toggle & Export buttons     │
│ tests/fixtures/                          │ CREATED   │ Bộ sinh fixture giả lập 10k - 50k metrics│
│   usage-dataset-generator.ts             │           │ phục vụ kiểm thử hiệu năng và chaos      │
│ tests/unit/model-pricing.test.ts         │ CREATED   │ Unit tests cho Model Pricing Engine &    │
│                                          │           │ độ chính xác số học Micro-Cent           │
│ tests/unit/usage-api-client.test.ts      │ CREATED   │ Unit tests cho ApiClient Usage methods   │
│ tests/unit/usage-components.test.ts      │ CREATED   │ Unit tests kiểm thử hàm tính tọa độ SVG, │
│                                          │           │ logic đảo màu Delta và format tiền tệ    │
│ tests/integration/admin-usage.test.ts    │ CREATED   │ Integration test suite cho 6 endpoints   │
│                                          │           │ /api/admin/usage/* và SLA latency        │
│ tests/e2e/usage-acceptance.test.ts       │ CREATED   │ E2E Acceptance test suite kiểm chứng     │
│                                          │           │ độc lập các tiêu chí AC-1 đến AC-6       │
│ tests/e2e/usage-chaos-resilience.test.ts │ CREATED   │ Chaos test suite: Socket abort mid-stream│
│                                          │           │ division by 0, và 50 concurrent requests │
└──────────────────────────────────────────┴───────────┴──────────────────────────────────────────┘
```
*(Tổng kết số lượng: 13 CREATED, 5 MODIFIED, 0 DELETED - Đảm bảo nguyên tắc Additive Migration tuyệt đối)*

---

## 5. KẾ HOẠCH KIỂM THỬ TỰ ĐỘNG VỚI CÁC LỆNH VITEST CỤ THỂ

Quy trình kiểm thử được cấu trúc nghiêm ngặt theo mô hình TDD, yêu cầu thực thi tuần tự các lệnh sau:

### 5.1. Kiểm Thử Đơn Vị (Unit Tests)
```bash
# Lệnh 1: Kiểm thử bảng giá model, cơ chế fallback 3 tầng và chuẩn số học Micro-Cent ($10^-6 USD)
npx vitest run tests/unit/model-pricing.test.ts

# Lệnh 2: Kiểm thử các phương thức gọi API trong ApiClient frontend SDK
npx vitest run tests/unit/usage-api-client.test.ts

# Lệnh 3: Kiểm thử toán học SVG tọa độ, logic đảo chiều màu sắc Delta và định dạng số
npx vitest run tests/unit/usage-components.test.ts
```

### 5.2. Kiểm Thử Tích Hợp API & Động Cơ Truy Vấn (Integration Tests)
```bash
# Lệnh 4: Chạy bộ integration tests cho 6 endpoints /api/admin/usage/* và benchmark query SLA <= 25ms
npx vitest run tests/integration/admin-usage.test.ts
```

### 5.3. Kiểm Thử Nghiệm Thu Chấp Nhận (Acceptance E2E Tests)
```bash
# Lệnh 5: Kiểm chứng toàn diện AC-1 đến AC-6 theo kịch bản Gherkin đặc tả
npx vitest run tests/e2e/usage-acceptance.test.ts
```

### 5.4. Kiểm Thử Áp Lực Song Song & Hỗn Loạn (Chaos & Stress Verification)
```bash
# Lệnh 6: Kiểm thử ngắt kết nối socket khi xuất file lớn, kiểm thử chia cho 0, và 50 parallel requests
npx vitest run tests/e2e/usage-chaos-resilience.test.ts --testTimeout=60000
```

### 5.5. Kiểm Thử Toàn Diện Hàng Rào Chống Suy Thoái (Full Zero-Regression Run)
```bash
# Lệnh 7: Chạy toàn bộ test suites hiện hữu của dự án đảm bảo 100% không suy thoái
npm run test
```

---

## 6. KẾT LUẬN & ĐIỂM SÁNG CỦA BẢN THIẾT KẾ CANDIDATE 3

Bản kế hoạch thi công của **Candidate 3 (TDD & Chaos Resilience)** nổi bật với:
1. **Tính Tin Cậy Cấp Kiểm Toán Tài Chính:** Loại bỏ mọi rủi ro về trôi số học hoặc lỗi hiển thị bằng giải pháp Micro-Cent ($10^{-6}$) và các hàm chặn chia cho 0 có unit tests bảo vệ.
2. **Khả Năng Chống Chịu Sự Cố Xuất Sắc:** Xử lý triệt để việc rò rỉ socket và khóa cơ sở dữ liệu khi người dùng hủy tải file lớn bằng cơ chế ngắt cursor trong $\le 50\text{ms}$.
3. **Hiệu Năng Vượt Trội và Nhẹ Nhàng:** Tận dụng 100% SQLite Covering Index và Pure React SVG, không làm nặng thêm bundle frontend với bất kỳ thư viện ngoài nào (Zero New NPM Dependencies), duy trì thời gian đáp ứng truy vấn dưới $25\text{ms}$.
4. **Sẵn Sàng Thực Thi:** Phân rã 4 Phases rõ ràng, test-first trước code-later, sẵn sàng chuyển ngay sang bước nấu mã nguồn (`/ak:cook`).
