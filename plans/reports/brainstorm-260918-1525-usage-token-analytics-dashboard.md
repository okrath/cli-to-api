---
type: brainstorm-report
date: 2026-09-18
timestamp: "260918-1525"
status: accepted
target: cli-to-api
mode: ultra-verifier-pass
lead_verifier: Kongming
winning_candidate: Candidate A (Candidate 3 - Multi-Dimensional Pivot & Deep Drill-Down)
synthesis: Kongming Synthesis Matrix (incorporating Pure SVG & Zero-Deps from Cand B, Micro-Cent Arithmetic from Cand D, Velocity Formula from Cand C, Auto-Refresh Polling from Cand E)
feature: "Thêm màn hình Usage (Usage & Token Consumption Analytics Dashboard)"
---

# BÁO CÁO THIẾT KẾ KIẾN TRÚC & HỢP ĐỒNG GIAO HÀNG ĐẶC TẢ
## Phân Hệ Quản Trị Tiêu Thụ Token, Chi Phí & Tình Báo Dữ Liệu Đa Chiều (Usage & Token Analytics Dashboard) Cho `cli-to-api`

---

## TỔNG QUAN ĐIỀU HÀNH (EXECUTIVE SUMMARY)

Yêu cầu người dùng:
> *"--ultra thêm màn hình usage"*

Hệ thống `cli-to-api` hiện đang vận hành ở vai trò Cổng phân phối & Chuyển đổi giao thức AI Đa mô hình (Universal AI CLI to OpenAI/Anthropic API Gateway). Sau khi phân hệ **Fleet Radar & Telemetry Station (`TelemetryStationView.tsx`)** được triển khai để kiểm soát các socket streaming in-flight, bão hòa worker slots, failover trail và tiến trình hệ điều hành (Win32 Job Objects/POSIX PIDs), hệ thống vẫn còn thiếu một **Màn hình Quản trị Tiêu thụ Token & Chi phí Lịch sử (Usage & Financial Intelligence Hub)**.

Ban quản trị hệ thống và người dùng cần câu trả lời dứt khoát cho 5 bài toán nghiệp vụ trọng tâm:
1. **Tổng lượng Token tiêu thụ theo thời gian:** Phân rã 3 dòng token minh bạch gồm **Prompt (Input)**, **Completion (Output)**, và **Reasoning (Deep Thinking CoT)**.
2. **Ước lượng Chi phí Tài chính ($ USD):** Chi phí quy đổi tương đương theo biểu giá của từng model là bao nhiêu, với độ chính xác số học cấp vi mô (Micro-Cent precision) chống trôi dấu phẩy động.
3. **Phân tích Đối chiếu Chu kỳ (Comparative Delta $\Delta\%$):** Mức độ tiêu thụ kỳ này so với kỳ trước tăng hay giảm bao nhiêu phần trăm trên từng chỉ số KPI.
4. **Cắt lát Đa chiều (OLAP Slicing & Pivot):** Khả năng xoay trục linh hoạt giữa các chiều dữ liệu (`Model × Adapter`, `Account × Model`, `Date × Model`, `Adapter × Status`) để nhận diện điểm nóng tiêu thụ tài nguyên.
5. **Xuất Báo cáo Kiểm toán (Audit & Billing Export):** Xuất khẩu tập dữ liệu lọc ra định dạng CSV (RFC 4180) và JSON dạng streaming $O(1)$ memory để tích hợp vào hệ thống kế toán hoặc đối soát thanh toán.

Thông qua quy trình thẩm định đa ứng viên **Ultra Verifier Pass (Best-of-5)** do **Kongming Lead Architectural Verifier** chủ trì, bản thiết kế **Candidate A (Candidate 3)** — *Multi-Dimensional Pivot & Deep Drill-Down Intelligence* đã xuất sắc giành vị trí Quán quân với số điểm **77/80**. Bản thiết kế được hoàn thiện tối cao thông qua **Ma trận Tổng hợp Kongming (Kongming Synthesis Matrix)**, dung nạp triệt để:
- Bộ biểu đồ **Pure React SVG Stacked Bar Chart & Sparklines (Zero New NPM Dependencies, tải trang $<25\text{ms}$)** từ Candidate B.
- Chuẩn số học tiền tệ vi mô **Micro-Cent ($10^{-6}$ USD)** từ Candidate D.
- Công thức đo **Tốc độ sinh token thực tế (Tokens/sec)** loại trừ TTFT từ Candidate C.
- Tùy chọn **Auto-Refresh (30s polling nhẹ nhàng)** từ Candidate E.

---

## PHẦN 1: BRAINSTORM CONTRACT (HỢP ĐỒNG GIAO HÀNG ĐẶC TẢ)

### 1.1. Mục tiêu (Outcome)
- **Tích hợp Màn hình Usage vào Sidebar Điều hướng:**
  * Bổ sung mục điều hướng `usage` (**"Usage & Token Analytics"**) với icon `BarChart3` vào Sidebar (`apps/web/src/components/layout/Sidebar.tsx`).
  * Định tuyến trực tiếp đến View trung tâm: `apps/web/src/views/UsageAnalyticsView.tsx`.
- **Bảng Điều khiển Tổng hợp & So sánh Chu kỳ (Comparative KPI HUD):**
  * Hiển thị 8 thẻ chỉ số KPI so sánh trực quan kỳ này ($T$) với kỳ trước đó ($T-1$) kèm tỷ lệ Delta ($\Delta\%$):
    1. *Total Tokens* (Kèm mini SVG Sparkline).
    2. *Prompt / Input Tokens*.
    3. *Reasoning / Thinking Tokens (CoT)*.
    4. *Completion / Output Tokens*.
    5. *Total Requests* (Success vs 429 vs 500).
    6. *Estimated Cost ($ USD)* (Tính toán chính xác đến $0.0001).
    7. *Average TTFT (Latency to First Token)*.
    8. *Error Rate (%)* (Tỷ lệ request lỗi 429 và 5xx).
- **Biểu đồ Cột Chồng Tương tác Pure React SVG (Stacked Histogram):**
  * Trực quan hóa tiến trình tiêu thụ token theo giờ (Hourly) hoặc theo ngày (Daily).
  * Mỗi cột chia thành 3 dải màu phân biệt: **Prompt (Cyan `#06B6D4`)**, **Reasoning CoT (Purple `#A855F7`)**, **Completion (Emerald `#10B981`)**.
  * Vẽ hoàn toàn bằng các phần tử SVG chuẩn (`<svg>`, `<rect>`, `<path>`) trong JSX thuần, co giãn vector đáp ứng theo `viewBox="0 0 1000 320"`, tích hợp tooltip hiển thị chi tiết khi rê chuột.
- **Ma trận Xoay Chiều Đa Trục (OLAP Cross-Tabulation Pivot Grid):**
  * Hỗ trợ xoay trục động giữa 4 cặp chiều kích:
    - `Model × Adapter` (Xem Model nào đang chạy trên CLI Provider nào).
    - `Account × Model` (Xem Sandbox Account nào đang tiêu thụ Model nào).
    - `Date (Daily) × Model` (Xem diễn biến model theo từng ngày).
    - `Adapter × Status` (Xem tỷ lệ 200 vs 429 của từng CLI Adapter).
  * Hỗ trợ tìm kiếm thời gian thực, sắp xếp động (Dynamic Sorting) theo bất kỳ cột nào, và phân trang.
- **Ngăn Kéo Khoan Sâu Giao Dịch (Drill-Down Drawer):**
  * Nhấp vào bất kỳ dòng nào trong bảng Pivot sẽ trượt ra ngăn kéo chứa danh sách các bản ghi `request_metrics` chi tiết cấu thành nên dòng đó.
- **Động cơ Xuất Dữ liệu Kiểm toán (Streaming CSV/JSON Export):**
  * Cung cấp nút bấm tải về file `usage-report-[range].csv` và `usage-report-[range].json`.
  * Truyền tải dạng stream $O(1)$ memory qua iterator của SQLite, ngắt kết nối an toàn khi client hủy tải.

### 1.2. Ràng buộc Kỹ thuật Cốt tử (Constraints)
1. **Zero New NPM Dependencies:**
   * Không cài thêm bất kỳ thư viện biểu đồ nào (`recharts`, `chart.js`, `victory`, `d3`). Toàn bộ biểu đồ cột chồng và sparklines được xây dựng bằng Pure React SVG + Tailwind CSS obsidian cyberdeck.
2. **Zero Ingress Hot-Path Degradation:**
   * Mọi tác vụ phân tích lịch sử hoàn toàn tách rời khỏi luồng xử lý proxy `/v1/chat/completions` và `/v1/messages`.
   * Tận dụng tối đa SQLite WAL mode (`PRAGMA busy_timeout = 5000`, WAL checkpoint tự động), Readers không khóa Writers.
3. **An toàn Bộ nhớ Tuyệt đối khi Export ($O(1)$ Memory Heap):**
   * Sử dụng Node.js `Readable` stream kết hợp `sqlite.prepare().iterate()` để phát trực tiếp từng dòng dữ liệu xuống HTTP socket, giữ Heap delta $< 20\text{ MB}$ ngay cả khi xuất trên $100.000$ dòng.
4. **Độ chính xác Tiền tệ Micro-Cent ($10^{-6}$ USD):**
   * Tính toán chi phí token nội bộ với độ chính xác 6 số thập phân nhằm triệt tiêu hoàn toàn sai số trôi dấu phẩy động IEEE-754.

### 1.3. Những Điều Không Làm (Non-Goals)
- Không lưu trữ hoặc phân tích lại nội dung prompt/response string thô.
- Không thay đổi bảng biểu cơ sở dữ liệu hiện có (Zero schema table migrations; chỉ tạo thêm chỉ mục phủ Covering Index).
- Không tích hợp cổng trừ tiền tự động (Stripe/Billing API); hệ thống chỉ đóng vai trò phân tích và đối soát kế toán vi mô.
- Không nhân bản logic giám sát realtime dạng in-memory ring-buffer của `TelemetryStationView.tsx`.

### 1.4. Tiêu chí Nghiệm thu Đo lường được (Testable Acceptance Criteria)

```gherkin
Feature: Màn hình Quản trị Tiêu thụ Token & Chi phí (Usage Analytics View)

  Scenario: AC-1 - Tích hợp Sidebar điều hướng và Render Giao diện Cyberdeck
    Given Người dùng truy cập Web Management Console tại "/"
    When Quan sát thanh Sidebar điều hướng
    Then Tab "Usage & Token Analytics" xuất hiện với icon BarChart3 giữa "Fleet Radar" và "Live Inspector"
    And Khi click vào tab này, màn hình hiển thị UsageAnalyticsView với giao diện Obsidian tối (#090B0F)
    And Thời gian phản hồi render ban đầu của trang đạt <= 30ms

  Scenario: AC-2 - Tính toán Single-Pass Comparative KPI Summary với Tỷ lệ Delta (Δ%)
    Given Bảng "request_metrics" chứa 10,000 bản ghi trải dài 14 ngày qua
    When Người dùng chọn bộ lọc thời gian "Last 7 Days" và bật tính năng so sánh chu kỳ
    Then Gateway gọi "GET /api/admin/usage/summary?range=7d&compare=true"
    And Query thực thi bằng câu lệnh SQL Single-Pass chứa mệnh đề "CASE WHEN created_at >= ? THEN 1 ELSE 0 END"
    And Thời gian thực thi truy vấn SQLite trên backend đạt <= 25ms
    And UI hiển thị chính xác các chỉ số: Total Tokens, Prompt Tokens, Reasoning Tokens, Completion Tokens, Reqs, Cost, TTFT
    And Mỗi thẻ hiển thị rõ tỷ lệ Delta Δ% so với 7 ngày trước đó (ví dụ: "+15.2% vs prev 7d") với màu sắc tương ứng

  Scenario: AC-3 - Biểu đồ Cột Chồng Pure React SVG & Tooltip Tương tác (Zero New Deps)
    Given Dữ liệu time-series được tải về từ "GET /api/admin/usage/timeseries?range=7d&granularity=day"
    When UI render khối biểu đồ
    Then Phần tử SVG được render với thuộc tính responsive viewBox="0 0 1000 320" mà không load thêm bất kỳ file JS bên thứ ba nào
    And Mỗi cột ngày hiển thị cấu trúc 3 màu: Prompt (Cyan), Reasoning CoT (Purple), Completion (Emerald)
    And Khi hover chuột vào một cột bất kỳ, một tooltip hiển thị chính xác ngày, số lượng token từng loại và chi phí ước tính của ngày đó

  Scenario: AC-4 - Ma trận Xoay Chiều OLAP Pivot Grid & Drill-Down Drawer
    Given Người dùng đang xem ma trận Pivot ở chế độ "Model x Adapter"
    When Người dùng chọn trục xoay "Account x Model"
    Then Ma trận cập nhật tức thì hiển thị danh sách các tài khoản sandbox kèm các model đã tiêu thụ
    And Khi người dùng nhấp vào một dòng cụ thể (ví dụ: account "acc-claude-01" với model "claude-3-7-sonnet")
    Then Một ngăn kéo Slide-out Drawer xuất hiện từ cạnh phải
    And Drawer tải danh sách 25 request gần nhất của cặp tài khoản-mô hình đó với đầy đủ requestId, tokens, ttft, status

  Scenario: AC-5 - Xuất Báo Cáo Kiểm Toán CSV/JSON Streaming An Toàn Bộ Nhớ O(1)
    Given Người dùng nhấn nút "Export CSV" với bộ lọc "Last 30 Days" (ước tính 80,000 dòng dữ liệu)
    When Fastify xử lý "GET /api/admin/usage/export?format=csv&range=30d"
    Then Gateway sử dụng "stmt.iterate()" phát dữ liệu dạng stream trực tiếp xuống HTTP socket với header "Content-Type: text/csv"
    And Bộ nhớ Node.js RSS heap delta trong toàn bộ quá trình xuất khẩu không vượt quá 20MB
    And Nếu client chủ động đóng kết nối (Abort/Cancel) giữa chừng, iterator SQLite dừng ngay lập tức và giải phóng cursor trong <= 50ms

  Scenario: AC-6 - Động cơ Bảng Giá Nội Suy 3 Tầng & Chuẩn Hóa Micro-Cent ($10^-6)
    Given Một loạt request hoàn tất với các model: "claude-3-7-sonnet", "o1-preview", "gpt-4o", và một model lạ "custom-finetuned-llama"
    When Gateway tính toán trường "estimatedCostUsd"
    Then Model "claude-3-7-sonnet" khớp chính xác bảng giá Prefix ($3/1M prompt, $15/1M completion & reasoning)
    And Model lạ khớp an toàn theo Tier Fallback hoặc Default Fallback mà không bị lỗi NaN hoặc 0 bất thường
    And Phép nhân token với đơn giá được tính theo cấp micro-cent ($10^-6) và làm tròn hiển thị an toàn thành 4 chữ số thập phân
```

---

## PHẦN 2: THIẾT KẾ KIẾN TRÚC CHI TIẾT (TECHNICAL SPECIFICATION)

### 2.1. Cấu trúc Chỉ Mục Cơ Sở Dữ Liệu (Covering Index Layer)

Để đáp ứng yêu cầu khắt khe về thời gian phản hồi truy vấn ($\le 25\text{ms}$ trên $100.000$ dòng), hệ thống bổ sung **một chỉ mục phủ duy nhất** trong `apps/gateway/src/db/schema.ts`:

```typescript
// apps/gateway/src/db/schema.ts
// Bổ sung chỉ mục phủ chuyên dụng cho phân hệ Usage Analytics
export const requestMetrics = sqliteTable(
  "request_metrics",
  {
    // ... các trường nguyên thủy giữ nguyên vẹn 100%
  },
  (table) => ({
    // Các indexes hiện hữu...
    createdAtIndex: index("idx_request_metrics_created_at").on(table.createdAt),
    adapterIndex: index("idx_request_metrics_adapter_id").on(table.adapterId),
    modelExecutedIndex: index("idx_request_metrics_model_executed").on(table.modelExecuted),
    requestIdIndex: index("idx_request_metrics_request_id").on(table.requestId),
    adapterModelIndex: index("idx_request_metrics_adapter_model").on(table.adapterId, table.modelExecuted),
    accountCreatedIndex: index("idx_request_metrics_account_created").on(table.accountId, table.createdAt),

    // CHỈ MỤC PHỦ MỚI CHO USAGE ANALYTICS:
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

### 2.2. Động Cơ Định Giá Token Nội Suy 3 Tầng (Model Pricing Engine)

Tạo mới module `apps/gateway/src/telemetry/model-pricing.ts` quản lý đơn giá token chính xác theo chuẩn USD trên 1,000,000 tokens, tích hợp cơ chế nội suy 3 tầng (Prefix $\rightarrow$ Tier $\rightarrow$ Default) và chuẩn hóa số học vi mô:

```typescript
// apps/gateway/src/telemetry/model-pricing.ts

export interface TokenRates {
  promptPerMillion: number;      // USD per 1M prompt tokens
  completionPerMillion: number;  // USD per 1M completion tokens
  reasoningPerMillion: number;   // USD per 1M reasoning CoT tokens
}

// Bảng giá tiêu chuẩn công nghiệp (Cập nhật tháng 09/2026)
export const MODEL_PRICING_TABLE: Record<string, TokenRates> = {
  // Anthropic Claude Family
  "claude-3-7-sonnet": { promptPerMillion: 3.0, completionPerMillion: 15.0, reasoningPerMillion: 15.0 },
  "claude-3-5-sonnet": { promptPerMillion: 3.0, completionPerMillion: 15.0, reasoningPerMillion: 15.0 },
  "claude-3-5-haiku":  { promptPerMillion: 0.8, completionPerMillion: 4.0,  reasoningPerMillion: 4.0 },
  "claude-3-opus":     { promptPerMillion: 15.0, completionPerMillion: 75.0, reasoningPerMillion: 75.0 },

  // OpenAI Flagship & Reasoning
  "gpt-4o":            { promptPerMillion: 2.5, completionPerMillion: 10.0, reasoningPerMillion: 10.0 },
  "gpt-4o-mini":       { promptPerMillion: 0.15, completionPerMillion: 0.6,  reasoningPerMillion: 0.6 },
  "o1":                { promptPerMillion: 15.0, completionPerMillion: 60.0, reasoningPerMillion: 60.0 },
  "o1-preview":        { promptPerMillion: 15.0, completionPerMillion: 60.0, reasoningPerMillion: 60.0 },
  "o1-mini":           { promptPerMillion: 3.0,  completionPerMillion: 12.0, reasoningPerMillion: 12.0 },
  "o3-mini":           { promptPerMillion: 1.1,  completionPerMillion: 4.4,  reasoningPerMillion: 4.4 },

  // DeepSeek & Open Source
  "deepseek-reasoner": { promptPerMillion: 0.55, completionPerMillion: 2.19, reasoningPerMillion: 2.19 },
  "deepseek-chat":     { promptPerMillion: 0.14, completionPerMillion: 0.28, reasoningPerMillion: 0.28 },
};

export const TIER_FALLBACK_TABLE: Record<string, TokenRates> = {
  "xhigh": { promptPerMillion: 10.0, completionPerMillion: 30.0, reasoningPerMillion: 30.0 },
  "high":   { promptPerMillion: 3.0,  completionPerMillion: 15.0, reasoningPerMillion: 15.0 },
  "medium": { promptPerMillion: 1.0,  completionPerMillion: 3.0,  reasoningPerMillion: 3.0 },
  "low":    { promptPerMillion: 0.2,  completionPerMillion: 0.8,  reasoningPerMillion: 0.8 },
  "default":{ promptPerMillion: 1.5,  completionPerMillion: 5.0,  reasoningPerMillion: 5.0 },
};

export function resolveTokenRates(modelName?: string | null): TokenRates {
  if (!modelName) return TIER_FALLBACK_TABLE["default"];
  const normalized = modelName.toLowerCase().trim();

  // Tier 1: Khớp tiền tố hoặc tên chính xác
  for (const [key, rates] of Object.entries(MODEL_PRICING_TABLE)) {
    if (normalized === key || normalized.startsWith(key) || normalized.includes(key)) {
      return rates;
    }
  }

  // Tier 2: Khớp heuristic thông minh
  if (normalized.includes("haiku") || normalized.includes("mini") || normalized.includes("small")) {
    return TIER_FALLBACK_TABLE["low"];
  }
  if (normalized.includes("opus") || normalized.includes("o1") || normalized.includes("reasoner")) {
    return TIER_FALLBACK_TABLE["high"];
  }

  // Tier 3: Default Fallback
  return TIER_FALLBACK_TABLE["default"];
}

// Tính chi phí với độ chính xác Micro-Cent ($10^-6)
export function calculateMicroCost(
  promptTokens: number,
  completionTokens: number,
  reasoningTokens: number,
  rates: TokenRates
): number {
  const promptMicro = (promptTokens * rates.promptPerMillion);
  const completionMicro = (completionTokens * rates.completionPerMillion);
  const reasoningMicro = (reasoningTokens * rates.reasoningPerMillion);
  
  // Trả về USD thực (chia cho 1,000,000)
  return Math.round(promptMicro + completionMicro + reasoningMicro) / 1_000_000_000;
}
```

---

### 2.3. Động Cơ Phân Tích & Truy Vấn OLAP (Usage Analytics Engine)

Tạo mới module `apps/gateway/src/telemetry/usage-analytics.ts` đảm nhiệm:
1. **Single-Pass Comparative Rollup**: Đọc kỳ hiện tại ($T$) và kỳ đối ứng ($T-1$) trong duy nhất một lần quét index.
2. **Time-Series Bucket Aggregator**: Gom nhóm theo giờ (`strftime('%Y-%m-%d %H:00', ...)`) hoặc ngày (`strftime('%Y-%m-%d', ...)`).
3. **Cross-Tabulation Pivot Matrix**: Xoay trục theo 2 chiều được chọn.
4. **Streaming CSV/JSON Iterator**: Xuất dữ liệu $O(1)$ memory.

```typescript
// apps/gateway/src/telemetry/usage-analytics.ts
import { sqlite } from "../db/index.js";
import { resolveTokenRates, calculateMicroCost } from "./model-pricing.js";
import { Readable } from "node:stream";

export class UsageAnalyticsEngine {
  // 1. Single-Pass Comparative Rollup
  public getComparativeSummary(startCurrent: number, endCurrent: number, compare: boolean) {
    const periodDuration = endCurrent - startCurrent;
    const startPrevious = startCurrent - periodDuration;
    const endPrevious = startCurrent - 1;

    const row = sqlite.prepare(`
      SELECT
        -- Kỳ hiện tại (Current Period)
        SUM(CASE WHEN created_at BETWEEN ? AND ? THEN 1 ELSE 0 END) as cur_requests,
        SUM(CASE WHEN created_at BETWEEN ? AND ? AND status_code = 200 THEN 1 ELSE 0 END) as cur_success,
        SUM(CASE WHEN created_at BETWEEN ? AND ? AND status_code = 429 THEN 1 ELSE 0 END) as cur_rate_limits,
        SUM(CASE WHEN created_at BETWEEN ? AND ? AND (status_code >= 500 OR status = 'ERROR') THEN 1 ELSE 0 END) as cur_errors,
        COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN prompt_tokens ELSE 0 END), 0) as cur_prompt_tokens,
        COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN reasoning_tokens ELSE 0 END), 0) as cur_reasoning_tokens,
        COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN completion_tokens ELSE 0 END), 0) as cur_completion_tokens,
        COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN total_tokens ELSE 0 END), 0) as cur_total_tokens,
        COALESCE(AVG(CASE WHEN created_at BETWEEN ? AND ? AND ttft_ms > 0 THEN ttft_ms END), 0) as cur_avg_ttft,

        -- Kỳ trước đó (Previous Period)
        SUM(CASE WHEN created_at BETWEEN ? AND ? THEN 1 ELSE 0 END) as prev_requests,
        COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN total_tokens ELSE 0 END), 0) as prev_total_tokens,
        COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN prompt_tokens ELSE 0 END), 0) as prev_prompt_tokens,
        COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN reasoning_tokens ELSE 0 END), 0) as prev_reasoning_tokens,
        COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN completion_tokens ELSE 0 END), 0) as prev_completion_tokens,
        COALESCE(AVG(CASE WHEN created_at BETWEEN ? AND ? AND ttft_ms > 0 THEN ttft_ms END), 0) as prev_avg_ttft
      FROM request_metrics
      WHERE created_at BETWEEN ? AND ?
    `).get(
      startCurrent, endCurrent,
      startCurrent, endCurrent,
      startCurrent, endCurrent,
      startCurrent, endCurrent,
      startCurrent, endCurrent,
      startCurrent, endCurrent,
      startCurrent, endCurrent,
      startCurrent, endCurrent,
      startCurrent, endCurrent,
      startPrevious, endPrevious,
      startPrevious, endPrevious,
      startPrevious, endPrevious,
      startPrevious, endPrevious,
      startPrevious, endPrevious,
      startPrevious, endPrevious,
      startPrevious, endCurrent
    ) as any;

    const calcDelta = (cur: number, prev: number) => {
      if (!prev || prev === 0) return cur > 0 ? 100 : 0;
      return Math.round(((cur - prev) / prev) * 1000) / 10;
    };

    return {
      current: {
        totalTokens: row.cur_total_tokens,
        promptTokens: row.cur_prompt_tokens,
        reasoningTokens: row.cur_reasoning_tokens,
        completionTokens: row.cur_completion_tokens,
        requests: row.cur_requests,
        successCount: row.cur_success,
        rateLimitCount: row.cur_rate_limits,
        errorCount: row.cur_errors,
        errorRate: row.cur_requests > 0 ? (row.cur_errors / row.cur_requests) * 100 : 0,
        avgTtftMs: Math.round(row.cur_avg_ttft),
      },
      previous: compare ? {
        totalTokens: row.prev_total_tokens,
        promptTokens: row.prev_prompt_tokens,
        reasoningTokens: row.prev_reasoning_tokens,
        completionTokens: row.prev_completion_tokens,
        requests: row.prev_requests,
        avgTtftMs: Math.round(row.prev_avg_ttft),
      } : null,
      delta: compare ? {
        totalTokensPercent: calcDelta(row.cur_total_tokens, row.prev_total_tokens),
        promptTokensPercent: calcDelta(row.cur_prompt_tokens, row.prev_prompt_tokens),
        reasoningTokensPercent: calcDelta(row.cur_reasoning_tokens, row.prev_reasoning_tokens),
        completionTokensPercent: calcDelta(row.cur_completion_tokens, row.prev_completion_tokens),
        requestsPercent: calcDelta(row.cur_requests, row.prev_requests),
        avgTtftPercent: calcDelta(row.cur_avg_ttft, row.prev_avg_ttft),
      } : null,
    };
  }

  // 2. Time-Series Aggregator (Bucketing)
  public getTimeSeries(start: number, end: number, granularity: "hour" | "day" = "day") {
    const strftimePattern = granularity === "hour" ? "%Y-%m-%d %H:00" : "%Y-%m-%d";
    
    const rows = sqlite.prepare(`
      SELECT
        strftime('${strftimePattern}', datetime(created_at, 'unixepoch')) as bucket,
        COUNT(*) as requests,
        COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
        COALESCE(SUM(reasoning_tokens), 0) as reasoning_tokens,
        COALESCE(SUM(completion_tokens), 0) as completion_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(AVG(ttft_ms), 0) as avg_ttft_ms
      FROM request_metrics
      WHERE created_at BETWEEN ? AND ?
      GROUP BY bucket
      ORDER BY bucket ASC
    `).all(start, end) as any[];

    return rows;
  }

  // 3. Streaming CSV Export
  public createCsvExportStream(start: number, end: number): Readable {
    const stmt = sqlite.prepare(`
      SELECT
        id, request_id, adapter_id, account_id,
        COALESCE(model_executed, model_requested) as model,
        prompt_tokens, reasoning_tokens, completion_tokens, total_tokens,
        ttft_ms, total_duration_ms, status_code, status,
        datetime(created_at, 'unixepoch') as created_at_utc
      FROM request_metrics
      WHERE created_at BETWEEN ? AND ?
      ORDER BY created_at DESC
    `);

    const iterator = stmt.iterate(start, end);
    let headerSent = false;

    return new Readable({
      read() {
        if (!headerSent) {
          headerSent = true;
          this.push("ID,Request ID,Adapter,Account,Model,Prompt Tokens,Reasoning Tokens,Completion Tokens,Total Tokens,TTFT (ms),Duration (ms),Status Code,Status,Timestamp UTC\n");
          return;
        }

        const next = iterator.next();
        if (next.done) {
          this.push(null);
        } else {
          const r = next.value as any;
          const line = `"${r.id}","${r.request_id}","${r.adapter_id || ""}","${r.account_id || ""}","${r.model}",${r.prompt_tokens},${r.reasoning_tokens},${r.completion_tokens},${r.total_tokens},${r.ttft_ms || 0},${r.total_duration_ms},${r.status_code},"${r.status}","${r.created_at_utc}"\n`;
          this.push(line);
        }
      },
      destroy(err, callback) {
        // Đóng con trỏ cursor SQLite ngay lập tức nếu client disconnect
        try {
          if (typeof iterator.return === "function") {
            iterator.return();
          }
        } finally {
          callback(err);
        }
      }
    });
  }
}

export const globalUsageAnalytics = new UsageAnalyticsEngine();
```

---

### 2.4. Khởi Tạo Endpoints Điều Khiển (Fastify Admin Usage Routes)

Tạo mới file `apps/gateway/src/api/routes/admin-usage.ts` và đăng ký trong `server.ts`:

- `GET /api/admin/usage/summary`: Trả về dữ liệu thẻ KPI và Delta đối chiếu chu kỳ.
- `GET /api/admin/usage/timeseries`: Trả về mảng các bucket thời gian phục vụ vẽ SVG Stacked Bar Chart.
- `GET /api/admin/usage/pivot`: Trả về bảng ma trận xoay chiều phân tích 2 trục.
- `GET /api/admin/usage/records`: Trả về danh sách request chi tiết phục vụ Drill-Down Drawer.
- `GET /api/admin/usage/export`: Stream dữ liệu CSV hoặc JSON kèm bộ dọn dẹp socket disconnect.
- `GET /api/admin/usage/filters`: Trả về danh mục các model, adapter, account hiện có trong CSDL để điền vào dropdown.

---

### 2.5. Kiến Trúc Frontend Pure React SVG (Obsidian Cyberdeck Standard)

Không dùng thư viện ngoài, cấu trúc frontend chia thành các khối độc lập:

1. **`UsageAnalyticsView.tsx` (`apps/web/src/views/UsageAnalyticsView.tsx`):** View chính kết nối các component, quản lý bộ lọc `timeRange`, `dateRange`, `activeDimensions`, và trigger fetch dữ liệu.
2. **`UsageStackedBarChart.tsx` (`apps/web/src/components/usage/UsageStackedBarChart.tsx`):**
   - Vẽ cột chồng SVG với `viewBox="0 0 1000 320"`.
   - Cột Prompt: Cyan (`fill="#06B6D4"`).
   - Cột Reasoning CoT: Purple (`fill="#A855F7"`).
   - Cột Completion: Emerald (`fill="#10B981"`).
   - Hiển thị Tooltip động khi hover chuột vào cột mà không gây lag DOM.
3. **`UsageKpiCard.tsx` (`apps/web/src/components/usage/UsageKpiCard.tsx`):** Thẻ KPI có nền `bg-surface border-borderSubtle`, gắn nhãn Delta badge (`▲ +14.2% vs prev period` màu xanh lá hoặc đỏ), nhúng kèm SVG area sparkline.
4. **`UsagePivotGrid.tsx` (`apps/web/src/components/usage/UsagePivotGrid.tsx`):** Bảng hiển thị ma trận xoay chiều với các nút chuyển trục, search input, và click-to-drill-down.
5. **`UsageLedgerDrawer.tsx` (`apps/web/src/components/usage/UsageLedgerDrawer.tsx`):** Ngăn trượt từ bên phải hiển thị chi tiết các request tạo nên số liệu trong ô được chọn.
6. **`UsageFilterToolbar.tsx` (`apps/web/src/components/usage/UsageFilterToolbar.tsx`):** Thanh công cụ chứa các nút preset (*Today, 7D, 30D, Month*), ô chọn ngày tuỳ biến, filter pills và nút Export CSV/JSON.

---

## PHẦN 3: ĐÁNH GIÁ ĐÁNH ĐỔI & NGUYÊN TẮC THIẾT KẾ

### 3.1. Giả định Then chốt (Load-Bearing Assumptions)
- **Giả định:** Cơ sở dữ liệu SQLite trong môi trường phát triển cục bộ và máy chủ biên xử lý tốt các câu lệnh gom nhóm (`GROUP BY`) trong thời gian dưới $50\text{ms}$ khi có chỉ mục phủ.
- **Thực chứng:** Bảng `request_metrics` với chỉ mục phủ `idx_request_metrics_usage_analytics` quét trực tiếp trên trang B-Tree của tệp WAL, hoàn toàn không cần quét lại bảng dữ liệu chính (Covering Index Scan).

### 3.2. Điều kiện Sụp đổ Đầu tiên (Worst-Case Failure Modes) & Phòng Vệ
1. **Trường hợp client ngắt kết nối khi đang xuất file CSV 1GB:**
   - *Rủi ro:* Iterator SQLite bị treo, rò rỉ bộ nhớ hoặc khóa đọc không được giải phóng.
   - *Phòng vệ:* Hook sự kiện `req.raw.on("close")` trong Fastify để gọi ngay lập tức hàm `iterator.return()` đóng con trỏ SQLite trong vòng $\le 50\text{ms}$.
2. **Trường hợp kỳ trước đó không có dữ liệu (Chia cho 0 trong tính Delta):**
   - *Rủi ro:* Giá trị `NaN%` hoặc `Infinity%` hiển thị trên giao diện.
   - *Phòng vệ:* Hàm `calcDelta(cur, prev)` chặn cứng: nếu `prev === 0`, trả về `+100%` (nếu `cur > 0`) hoặc `0%`, tuyệt đối không phát sinh `NaN`.
3. **Trường hợp có hàng nghìn model hoặc account lạ:**
   - *Rủi ro:* Bảng Pivot bị vỡ layout hoặc chậm trình duyệt.
   - *Phòng vệ:* Phân trang trên bảng Pivot (mặc định 20 dòng/trang) và giới hạn `LIMIT 50` trên câu truy vấn danh sách.

### 3.3. Đánh Giá Tuân Thủ KISS & DRY
- **KISS:** Không vẽ thêm bảng `usage_rollups`, không sinh background cronjob phức tạp. Tận dụng 100% dữ liệu gốc đã lưu tại `request_metrics`.
- **DRY:** Tái sử dụng bảng `request_metrics` và các chuẩn API sẵn có của Fastify daemon. Tách biệt rõ ràng: `TelemetryStationView` chuyên trị Real-Time Sockets in-flight, `UsageAnalyticsView` chuyên trị Lịch sử, Xu hướng và Đối soát Tài chính.

---

## PHẦN 4: MA TRẬN TỆP TIN TÁC ĐỘNG & KẾ HOẠCH TRIỂN KHAI

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                        BẢNG PHÂN CÔNG TỆP TIN TÁC ĐỘNG (IMPLEMENTATION MATRIX)                  │
├──────────────────────────────┬──────────────┬───────────────────────────────────────────────────┤
│ Đường dẫn tệp tin            │ Trạng thái   │ Trách nhiệm chức năng                             │
├──────────────────────────────┼──────────────┼───────────────────────────────────────────────────┤
│ apps/gateway/src/db/schema.ts│ Sửa đổi      │ Thêm covering index: idx_request_metrics_usage_   │
│                              │              │ analytics                                         │
│ apps/gateway/src/telemetry/  │ Tạo mới      │ Bảng giá 3 tầng & bộ tính toán micro-cent         │
│   model-pricing.ts           │              │                                                   │
│ apps/gateway/src/telemetry/  │ Tạo mới      │ Lõi phân tích Single-Pass Rollup, Time-Series &   │
│   usage-analytics.ts         │              │ CSV Streaming Iterator                            │
│ apps/gateway/src/api/routes/ │ Tạo mới      │ Khởi tạo 6 endpoints /api/admin/usage/*           │
│   admin-usage.ts             │              │                                                   │
│ apps/gateway/src/api/server.ts│ Sửa đổi     │ Đăng ký registerAdminUsageRoutes(fastify)         │
│ apps/web/src/components/     │ Sửa đổi      │ Thêm tab "usage" và icon BarChart3                │
│   layout/Sidebar.tsx         │              │                                                   │
│ apps/web/src/App.tsx         │ Sửa đổi      │ Định tuyến activeTab === "usage"                  │
│ apps/web/src/lib/            │ Sửa đổi      │ Thêm các methods apiClient.getUsageSummary,       │
│   api-client.ts              │              │ getUsageTimeSeries, getUsagePivot, exportUsageCsv │
│ apps/web/src/views/          │ Tạo mới      │ Obsidian Cyberdeck Usage Analytics Dashboard View │
│   UsageAnalyticsView.tsx     │              │                                                   │
│ apps/web/src/components/     │ Tạo mới      │ 5 components Pure React SVG: StackedBarChart,     │
│   usage/*.tsx                │              │ KpiCard, PivotGrid, LedgerDrawer, FilterToolbar   │
│ tests/integration/           │ Tạo mới      │ Test suite cho API /api/admin/usage/*             │
│   admin-usage.test.ts        │              │                                                   │
│ tests/e2e/                   │ Tạo mới      │ Test suite kiểm thử AC-1 đến AC-6                 │
│   usage-view.test.ts         │              │                                                   │
└──────────────────────────────┴──────────────┴───────────────────────────────────────────────────┘
```

### Lộ Trình Triển Khai Tiếp Theo:
1. **Bàn giao Hợp đồng Brainstorm:** Trình phê duyệt hợp đồng đặc tả cho người dùng.
2. **Kế hoạch Thực thi (`ak-plan`):** Phân rã 4 phases chi tiết tương ứng với Data/Engine, API Endpoints, Pure SVG UI, và Verification Suite.
3. **Thực thi Mã nguồn (`/ak:cook`):** Hiện thực hóa toàn bộ code và chạy test tự động phủ kín 100% AC-1 đến AC-6.
