# BẢN ĐỀ XUẤT KIẾN TRÚC & HỢP ĐỒNG GIAO HÀNG ĐẶC TẢ (BRAINSTORM CONTRACT)
## DỰ ÁN: CLI-TO-API — AI GATEWAY INFRASTRUCTURE
### Phân hệ: Usage & Token Consumption Analytics View
### Định hướng kiến trúc (Candidate 2 Angle):
> **"FinOps & Cost Governance Center: Multi-Tier Model Pricing Matrix, Configurable Budget Caps & Spend Alerts, Token Cost Attribution"**

---

**Ứng viên:** Candidate 2 — Ultra Verifier Architecture Council  
**Vai trò:** Lead Systems & FinOps Architect  
**Trạng thái:** Bounded Engineering Specification & Contract  

---

## 1. BRAINSTORM CONTRACT (HỢP ĐỒNG GIAO HÀNG ĐẶC TẢ)

### 1.1. Outcome (Trạng thái Vận hành & Trải nghiệm Đích)

1. **Chuyển hóa Gateway thành Trung tâm Quản trị Tài chính AI (FinOps Center)**:
   - Gateway không chỉ dừng lại ở vai trò là một reverse-proxy chuyển tiếp lệnh CLI vô danh, mà trở thành một **Bộ điều khiển chi phí & kế toán tài nguyên (Cost Governance & Resource Accounting Control Plane)**.
   - Cung cấp cho Ban công nghệ (CTO, VP of Engineering, Lead DevOps/FinOps) số liệu tài chính thời gian thực: Đã tiêu tốn bao nhiêu chi phí tương đương ($ USD), tiết kiệm được bao nhiêu tiền ($ USD) so với việc trả phí token trực tiếp cho OpenAI và Anthropic qua thẻ tín dụng doanh nghiệp, và tốc độ tiêu thụ ngân sách hiện tại (Burn Rate $/h).

2. **Màn hình Chuyên trách "Usage & FinOps Hub" trên Web Console**:
   - Bổ sung tab điều hướng mới `usage` (**"Usage & FinOps Hub"**) trên Sidebar thanh điều hướng của Obsidian Cyberdeck Console.
   - Hiển thị bảng điều khiển tập trung gồm:
     - **Bộ 4 FinOps KPI Cards**: *Total Incurred Spend ($ USD)*, *Avoided Retail API Cost & Net Savings ($ USD & % ROI)*, *Rolling Burn Rate ($/hour)*, *Projected Month-End Run Rate ($ USD)*.
     - **Thanh Tiến trình Ngân sách Động (Dual-Scope Budget Progress Bar)**: Trực quan hóa tỷ lệ tiêu thụ ngân sách theo Ngày (Daily Budget) và theo Tháng (Monthly Budget) với mã màu trạng thái (Xanh lá <80%, Vàng hổ phách 80–99%, Đỏ thẫm/Pulsing ≥100%).
     - **Bảng Phân bổ Chi phí theo Tài khoản (Account Cost Attribution Leaderboard)**: Bóc tách minh bạch từng Sandbox Account (`accountId`, `adapterId`) xem tài khoản nào đang tiêu tốn token và ngân sách nhiều nhất, tần suất gọi, và tỷ lệ chiếm dụng hạn mức.
     - **Ngăn Kéo Quản trị Ma trận Giá (Model Pricing Matrix Drawer/Modal)**: Cho phép xem và tùy biến bảng giá token (Prompt, Completion, Reasoning $/1M tokens) cho từng model và cấu hình giá Benchmark API đối chiếu.

3. **Cơ chế Đo lường Ba Kênh Token Riêng Biệt (Tri-Token Cost Accounting)**:
   - Phân định rạch ròi 3 luồng token khi tính toán chi phí: **Prompt (Input) Tokens**, **Completion (Output) Tokens**, và **Reasoning (Thinking CoT) Tokens**.
   - Phản ánh đúng thực tế thanh toán của các model thế hệ mới (như Claude 3.7 Sonnet Extended Thinking, OpenAI o1/o3-mini): Token tư duy (Reasoning) được hạch toán theo biểu giá riêng hoặc giá completion, giúp loại bỏ hoàn toàn sai số thất thoát chi phí suy luận ngầm.

---

### 1.2. Constraints (Ràng buộc Kỹ thuật Nghiêm ngặt)

1. **Zero External Infrastructure Dependency**:
   - Tuyệt đối không cài cắm các dịch vụ giám sát hay billing SaaS bên ngoài (không Stripe, không OpenMeter, không ClickHouse, không Prometheus). Mọi quy tắc định giá, ngân sách và lịch sử đều được vận hành độc lập, self-contained bên trong cơ sở dữ liệu SQLite cục bộ (WAL Mode).
2. **Zero Ingress Latency Overhead (< 0.2ms)**:
   - Các luồng gọi API streaming (`/v1/chat/completions` và `/v1/messages`) không bị block hoặc tăng độ trễ TTFT bởi logic tính tiền. Dữ liệu token đã được ghi nhận sẵn tại `request_metrics` trong tầng Telemetry Store; tầng FinOps chỉ khai thác, tổng hợp và phân tích bất đồng bộ hoặc theo nhu cầu truy vấn (On-demand/Cached Aggregation).
3. **Độ chính xác Tiền tệ (Micro-Cent Precision)**:
   - Vì giá mỗi token đơn lẻ là cực nhỏ ($0.000003 USD/token), hệ thống sử dụng đơn vị lưu trữ và tính toán chuẩn hóa: Giá lưu trữ dưới dạng **USD per 1,000,000 Tokens** với số thực có độ chính xác kép (Double Precision Float/Numeric) và làm tròn hiển thị đến 4 hoặc 6 chữ số thập phân (`$0.0001`), không để xảy ra sai số trôi dấu phẩy động (IEEE 754 drift).
4. **Tương thích Tuyệt đối Hệ sinh thái Hiện hữu**:
   - Sử dụng chung stack kỹ thuật: Backend Node.js/Fastify (TypeScript ESM), Drizzle ORM + `better-sqlite3`, Frontend React 18 + Vite + Tailwind CSS + Lucide Icons.

---

### 1.3. Non-Goals (Ranh giới Ngoài Phạm vi Dự án)

1. **Không phải Cổng Thanh toán Tiền thật (Payment Gateway / Stripe Checkout)**:
   - Màn hình này là công cụ **Cost Governance & Usage Analytics** nội bộ, không tích hợp trừ tiền thẻ tín dụng, không xuất hóa đơn VAT điện tử, không tạo cổng thanh toán người dùng cuối.
2. **Không Lưu Toàn văn Nội dung Prompt/Completion (Zero Payload Retention)**:
   - Tôn trọng quyền riêng tư mã nguồn của kỹ sư. Việc tính toán chi phí chỉ dựa trên số lượng token và model ID đã được lưu tại `request_metrics`, tuyệt đối không ghi lại prompt hay văn bản hoàn thành.
3. **Không Thay thế Token Bucket Rate-Limiter của Reverse Proxy**:
   - Hạn mức ngân sách (Budget Cap) quản trị trần chi tiêu tài chính theo Ngày/Tháng; không đóng vai trò thuật toán Leaky Bucket / Token Bucket chống DDoS request tức thời theo từng mili-giây.

---

### 1.4. Testable Acceptance Criteria (Gherkin Format: AC-1 đến AC-6)

```gherkin
Feature: FinOps & Cost Governance Center (Usage & Token Consumption Analytics)

  Background:
    Given Gateway đang vận hành với cơ sở dữ liệu SQLite ở chế độ WAL
    And Bảng request_metrics đã chứa dữ liệu các cuộc gọi API hợp lệ với các model khác nhau

  # AC-1: Khởi tạo và Hiển thị Điều hướng
  Scenario: AC-1 - Truy cập Màn hình Usage & FinOps Hub từ thanh Sidebar
    Given Quản trị viên đang ở bất kỳ màn hình nào trên Web Console
    When Quản trị viên nhấp chuột vào mục "Usage & FinOps" trên thanh Sidebar
    Then Hệ thống chuyển hướng sang view UsageFinOpsView mà không reload toàn bộ trang
    And Tab "Usage & FinOps" hiển thị trạng thái active với icon CircleDollarSign
    And Khối KPI Cards, Thanh tiến trình Ngân sách, và Bảng Phân bổ Tài khoản được tải hoàn tất

  # AC-2: Tính toán Chi phí Thực tế và Chi phí Tiết kiệm
  Scenario: AC-2 - Ước lượng Chi phí Thực tế và Khoản Tiết kiệm so với Benchmark API
    Given Trong 24 giờ qua có 100 request model "claude-3-7-sonnet" với tổng 1,000,000 prompt tokens và 500,000 completion tokens (bao gồm reasoning)
    And Biểu giá Benchmark của claude-3-7-sonnet là $3.00/1M prompt và $15.00/1M completion
    And Gateway được cấu hình giá custom là $0.00/1M (chạy qua tài khoản Claude Pro Subscription)
    When Quản trị viên chọn bộ lọc thời gian "Last 24 Hours"
    Then Thẻ KPI "Total Spent" hiển thị "$0.0000"
    And Thẻ KPI "Avoided Retail Cost" hiển thị "$10.5000" ($3.00 + $7.50)
    And Thẻ KPI "Net Savings" hiển thị "$10.5000" kèm nhãn ROI "100.0% saved"

  # AC-3: Quản trị Ma trận Giá Linh hoạt (Configurable Pricing Matrix)
  Scenario: AC-3 - Tùy biến Ma trận Giá Mô hình và Ánh xạ Mẫu Định danh
    Given Quản trị viên mở ngăn kéo "Model Pricing Matrix Editor"
    When Quản trị viên chỉnh sửa giá cho model "codex-cli/gpt-5.6-asta":
      | prompt_price_per_m     | $1.50 |
      | completion_price_per_m | $6.00 |
      | reasoning_price_per_m  | $6.00 |
    And Nhấp vào nút "Save Pricing Rule"
    Then Bản ghi pricing cho "gpt-5.6*" được lưu thành công vào bảng model_pricing
    And Các yêu cầu tính toán chi phí tiếp theo của gpt-5.6-asta lập tức áp dụng mức đơn giá mới này
    When Quản trị viên nhấn "Reset to Factory Benchmarks"
    Then Các giá trị quay trở về biểu giá mặc định của nhà sản xuất (OpenAI Official Pricing)

  # AC-4: Kiểm soát Ngân sách & Cảnh báo Vượt Ngưỡng (Spend Alerts)
  Scenario: AC-4 - Kích hoạt Cảnh báo Tiến trình Ngân sách khi Chạm Ngưỡng 80% và 100%
    Given Quản trị viên thiết lập "Daily Budget Cap" là $10.00 với Soft Warning là 80%
    When Tổng chi tiêu thực tế trong ngày đạt $8.50 (tương đương 85% hạn mức)
    Then Thanh Budget Progress Bar chuyển từ màu Xanh lá sang màu Vàng hổ phách
    And Một thông báo Banner "Soft Budget Warning: 85% of daily cap reached ($8.50 / $10.00)" xuất hiện
    When Tổng chi tiêu thực tế trong ngày vượt mức $10.00 (đạt $10.25 - 102.5%)
    Then Thanh Budget Progress Bar chuyển sang màu Đỏ thẫm kèm hiệu ứng nhấp nháy (pulsing)
    And Gateway phát sự kiện SSE "finops:budget_alert" với level="CRITICAL" tới Web Console

  # AC-5: Báo cáo Phân bổ Chi phí theo Tài khoản (Account Cost Attribution)
  Scenario: AC-5 - Xác định Tài khoản Tiêu tốn Token và Ngân sách Nhiều nhất
    Given Có 3 tài khoản hoạt động: "codex-acc-1" (5M tokens), "claude-dev-1" (15M tokens), "omp-acc-team" (1M tokens)
    When Quản trị viên xem bảng "Account Cost Attribution Matrix"
    Then Danh sách tài khoản được sắp xếp giảm dần theo Tổng chi phí / Tổng token tiêu thụ
    And Dòng đầu tiên hiển thị "claude-dev-1" với tỷ trọng chiếm dụng ngân sách (Budget Share %) cao nhất
    And Bảng bóc tách chi tiết: Call Count, Prompt Tokens, Reasoning Tokens, Completion Tokens, Incurred Cost, Avoided Cost

  # AC-6: Dự báo Tốc độ Đốt tiền và Tỷ lệ Chi tiêu Kỳ hạn (Burn Rate & Run Rate)
  Scenario: AC-6 - Tính toán Burn Rate theo giờ và Dự phóng Chi tiêu Cuối tháng
    Given Hệ thống đã tiêu thụ $12.00 trong 6 giờ gần nhất (Burn Rate bình quân $2.00/hour)
    And Tháng hiện tại còn 20 ngày (480 giờ)
    And Chi tiêu lũy kế từ đầu tháng đến nay là $150.00
    When Quản trị viên xem thẻ KPI "Forecast & Velocity"
    Then Thẻ Burn Rate hiển thị "$2.00 / hr" ($48.00 / day)
    And Thẻ Projected Month-End Run Rate hiển thị "$1,110.00" ($150 + 480 * $2.00)
    And Nếu Monthly Cap là $1,000.00, giao diện cảnh báo "Budget Depletion in ~17.7 days at current burn rate"
```

---

## 2. THIẾT KẾ KIẾN TRÚC CHI TIẾT (TECHNICAL SPECIFICATION)

### 2.1. Sơ đồ Kiến trúc Tổng thể (FinOps Architecture Diagram)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       INGRESS TRAFFIC                                            │
│                     (Cursor, Claude Code, Continue.dev, cURL, Open WebUI)                        │
└────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                 │
                                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 GATEWAY EXECUTION ENGINE                                         │
│                                                                                                  │
│   [TargetEngine] ──► [AccountPool] ──► [ProcessManager (CLI)] ──► [ANSI/Thinking Demuxer]        │
│                                                                             │                    │
│                                                                             ▼                    │
│                                                                  [TelemetryPersistQueue]         │
└─────────────────────────────────────────────────────────────────────────────┼────────────────────┘
                                                                              │
                                                                              ▼ (Async Write)
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    PERSISTENT DATA LAYER                                         │
│                                                                                                  │
│   ┌────────────────────────────────┐                 ┌───────────────────────────────────────┐   │
│   │ request_metrics                │                 │ model_pricing                         │   │
│   │ (prompt, reasoning, completion,│◄────────────────┤ (model_pattern, prompt_price_per_m,   │   │
│   │  total, adapter_id, account_id)│ (Cost Transform)│  comp_price_per_m, benchmark_prices)  │   │
│   └────────────────────────────────┘                 └───────────────────────────────────────┘   │
│                    │                                                     ▲                       │
│                    ▼ (Aggregate Aggregator Engine)                       │ (CRUD / Custom)       │
│   ┌──────────────────────────────────────────────────────────────────────┴───────────────────┐   │
│   │ budget_policies: { daily_cap_usd: 50, monthly_cap_usd: 1000, soft_alert: 80 }           │   │
└───┴──────────────────────────────────────────────────────────────────────────────────────────┴───┘
                                                 │
                                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    FINOPS REST & SSE APIS                                        │
│                                                                                                  │
│   GET /api/finops/summary           GET /api/finops/attribution/accounts                         │
│   GET /api/finops/pricing           PUT /api/finops/pricing/:id                                  │
│   GET /api/finops/budgets           PUT /api/finops/budgets                                      │
│   SSE: /api/admin/events (finops:budget_alert)                                                   │
└────────────────────────────────────────────────┬─────────────────────────────────────────────────┘
                                                 │
                                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 WEB CONSOLE (USAGE & FINOPS HUB)                                 │
│                                                                                                  │
│   [NavTab: "usage"] ──► <UsageFinOpsView />                                                      │
│      ├── <FinOpsKpiDeck /> (Spent USD, Savings USD, Run Rate, Burn Rate Forecast)                │
│      ├── <BudgetProgressBar /> (Dual-Scope: Daily & Monthly visual caps with color states)       │
│      ├── <AccountCostAttributionMatrix /> (Sorted table: top burning sandboxes & token share)    │
│      ├── <ModelPricingMatrixDrawer /> (Interactive editable matrix for model rates & benchmarks) │
│      └── <CostTimelineSparkline /> (Daily spend trend vs avoided retail cost)                    │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 2.2. Schema Mở rộng (Database DDL & Drizzle ORM)

Để đảm bảo tính nhất quán với SQLite WAL của Gateway, chúng ta mở rộng `apps/gateway/src/db/schema.ts` với 2 bảng chuyên trách:

#### 1. Bảng `model_pricing` (Ma trận Giá Mô hình & Benchmark Đối chiếu)

```typescript
import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const modelPricing = sqliteTable(
  "model_pricing",
  {
    id: text("id").primaryKey(), // e.g. "pricing_claude_3_7_sonnet" or UUID
    modelPattern: text("model_pattern").notNull().unique(), // e.g. "claude-3-7-sonnet*", "gpt-5.6*", "*"
    displayName: text("display_name").notNull(), // e.g. "Claude 3.7 Sonnet (Hybrid Thinking)"
    provider: text("provider").notNull(), // "anthropic" | "openai" | "deepseek" | "custom"

    // Gateway Custom Internal Costs ($ per 1,000,000 tokens)
    promptPricePerM: real("prompt_price_per_m").notNull().default(0.0),
    completionPricePerM: real("completion_price_per_m").notNull().default(0.0),
    reasoningPricePerM: real("reasoning_price_per_m").notNull().default(0.0),

    // Official Benchmark Retail Costs ($ per 1,000,000 tokens)
    benchmarkPromptPricePerM: real("benchmark_prompt_price_per_m").notNull().default(3.0),
    benchmarkCompletionPricePerM: real("benchmark_completion_price_per_m").notNull().default(15.0),
    benchmarkReasoningPricePerM: real("benchmark_reasoning_price_per_m").notNull().default(15.0),

    isCustom: integer("is_custom", { mode: "boolean" }).notNull().default(false),
    notes: text("notes"),
    createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
    updatedAt: integer("updated_at").default(sql`(strftime('%s', 'now'))`),
  },
  (table) => ({
    modelPatternIdx: index("idx_model_pricing_pattern").on(table.modelPattern),
    providerIdx: index("idx_model_pricing_provider").on(table.provider),
  })
);

export type ModelPricingRecord = typeof modelPricing.$inferSelect;
export type InsertModelPricingRecord = typeof modelPricing.$inferInsert;
```

#### 2. Bảng `budget_policies` (Chính sách Ngân sách & Ngưỡng Cảnh báo)

```typescript
export const budgetPolicies = sqliteTable("budget_policies", {
  id: text("id").primaryKey(), // "global_budget"
  dailyCapUsd: real("daily_cap_usd").notNull().default(50.0),
  monthlyCapUsd: real("monthly_cap_usd").notNull().default(1000.0),
  softAlertPercent: integer("soft_alert_percent").notNull().default(80), // 80%
  hardAlertPercent: integer("hard_alert_percent").notNull().default(100), // 100%
  enforcementMode: text("enforcement_mode", {
    enum: ["alert_only", "soft_throttle", "hard_reject"],
  })
    .notNull()
    .default("alert_only"),
  alertWebhookUrl: text("alert_webhook_url"),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at").default(sql`(strftime('%s', 'now'))`),
});

export type BudgetPolicyRecord = typeof budgetPolicies.$inferSelect;
```

#### 3. Bộ Dữ liệu Mẫu Khởi tạo Chuẩn (Factory Seed Benchmarks)
Khi chạy migration khởi tạo, hệ thống tự động gieo sẵn các biểu giá thị trường chuẩn thức:

| Model Pattern | Provider | Prompt ($/1M) | Comp ($/1M) | Reasoning ($/1M) | Benchmark Prompt | Benchmark Comp | Benchmark Reason |
|---|---|---|---|---|---|---|---|
| `claude-3-7-sonnet*` | anthropic | $0.00 | $0.00 | $0.00 | **$3.00** | **$15.00** | **$15.00** |
| `claude-3-5-sonnet*` | anthropic | $0.00 | $0.00 | $0.00 | **$3.00** | **$15.00** | **$15.00** |
| `claude-3-5-haiku*` | anthropic | $0.00 | $0.00 | $0.00 | **$0.80** | **$4.00** | **$4.00** |
| `gpt-5.6*` | openai | $0.00 | $0.00 | $0.00 | **$3.00** | **$12.00** | **$12.00** |
| `gpt-4o` | openai | $0.00 | $0.00 | $0.00 | **$2.50** | **$10.00** | **$10.00** |
| `gpt-4o-mini*` | openai | $0.00 | $0.00 | $0.00 | **$0.15** | **$0.60** | **$0.60** |
| `o1*` | openai | $0.00 | $0.00 | $0.00 | **$15.00** | **$60.00** | **$60.00** |
| `o3-mini*` | openai | $0.00 | $0.00 | $0.00 | **$1.10** | **$4.40** | **$4.40** |
| `deepseek-r1*` | deepseek | $0.00 | $0.00 | $0.00 | **$0.55** | **$2.19** | **$2.19** |
| `*` (Default Fallback) | custom | $0.00 | $0.00 | $0.00 | **$2.00** | **$8.00** | **$8.00** |

*Ghi chú FinOps:* Cấu hình mặc định đặt `promptPricePerM = $0.00` vì hầu hết các triển khai `cli-to-api` tận dụng các gói thuê bao cố định không giới hạn theo chỗ ngồi (Flat-rate Subscriptions: $20/tháng cho Claude Pro/Team, ChatGPT Plus/Team). Điều này phản ánh chính xác mô hình: Toàn bộ lượng token tiêu thụ qua Gateway là **khoản tiết kiệm ròng (Net Savings)** so với việc thanh toán API lẻ theo từng token! Nếu doanh nghiệp muốn phân bổ khấu hao cố định, họ có thể chỉnh sửa giá custom thành con số bất kỳ trong Pricing Editor.

---

### 2.3. Thuật toán Toán học & Bộ máy Tính toán FinOps (Calculation Engine)

#### 1. Thuật toán Ánh xạ Giá Mô hình (Prefix/Wildcard Matcher)
Hệ thống sử dụng thuật toán khớp mẫu ưu tiên (Longest Prefix Match):
```typescript
export function resolvePricingRule(modelName: string, pricingRules: ModelPricingRecord[]): ModelPricingRecord {
  const normalized = modelName.toLowerCase().trim();
  
  // 1. Khớp chính xác hoàn toàn (Exact Match)
  const exact = pricingRules.find(r => r.modelPattern.toLowerCase() === normalized);
  if (exact) return exact;

  // 2. Khớp tiền tố Wildcard (Prefix Match dạng "claude-3-7*", "gpt-5.6*")
  const wildcardMatches = pricingRules
    .filter(r => r.modelPattern.endsWith("*"))
    .filter(r => normalized.startsWith(r.modelPattern.slice(0, -1).toLowerCase()))
    .sort((a, b) => b.modelPattern.length - a.modelPattern.length); // Lấy mẫu khớp dài nhất

  if (wildcardMatches.length > 0) return wildcardMatches[0];

  // 3. Fallback về rule mặc định "*"
  const fallback = pricingRules.find(r => r.modelPattern === "*");
  if (fallback) return fallback;

  // 4. Hardcoded Safety Fallback
  return {
    id: "safety_fallback",
    modelPattern: "*",
    displayName: "Generic Fallback",
    provider: "custom",
    promptPricePerM: 0.0,
    completionPricePerM: 0.0,
    reasoningPricePerM: 0.0,
    benchmarkPromptPricePerM: 2.0,
    benchmarkCompletionPricePerM: 8.0,
    benchmarkReasoningPricePerM: 8.0,
    isCustom: false,
    notes: null,
    createdAt: 0,
    updatedAt: 0,
  };
}
```

#### 2. Công thức Toán học Chi phí và Khoản Tiết kiệm
Cho mỗi bản ghi request $i$ có số lượng token $\{T_{\text{prompt}}, T_{\text{comp}}, T_{\text{reason}}\}$:

$$\text{SpentUSD}_i = \frac{T_{\text{prompt}} \cdot P_{\text{prompt}} + T_{\text{comp}} \cdot P_{\text{comp}} + T_{\text{reason}} \cdot P_{\text{reason}}}{1,000,000}$$

$$\text{AvoidedRetailUSD}_i = \frac{T_{\text{prompt}} \cdot B_{\text{prompt}} + T_{\text{comp}} \cdot B_{\text{comp}} + T_{\text{reason}} \cdot B_{\text{reason}}}{1,000,000}$$

$$\text{NetSavingsUSD}_i = \max\left(0, \text{AvoidedRetailUSD}_i - \text{SpentUSD}_i\right)$$

$$\text{ROI \%} = \begin{cases} 
  \frac{\sum \text{NetSavingsUSD}}{\sum \text{AvoidedRetailUSD}} \times 100\%, & \text{khi } \sum \text{AvoidedRetailUSD} > 0 \\
  0\%, & \text{ngược lại}
\end{cases}$$

#### 3. Công thức Vận tốc Tiêu thụ (Burn Rate) & Dự phóng Kỳ hạn (Run Rate Forecast)
- **Hourly Burn Rate ($/hour)** được tính toán trên cửa sổ trượt 24 giờ gần nhất ($W = 24$ giờ):
  $$\text{BurnRate}_{\text{hourly}} = \frac{\sum_{t \in W} \text{SpentUSD}_t}{\text{Thực tế số giờ có dữ liệu trong } W}$$
  $$\text{BurnRate}_{\text{daily}} = \text{BurnRate}_{\text{hourly}} \times 24$$

- **Projected Month-End Run Rate ($ USD)**:
  Gọi $D_{\text{passed}}$ là số ngày đã trôi qua trong tháng, $D_{\text{remaining}}$ là số ngày còn lại đến hết tháng:
  $$\text{RunRate}_{\text{month\_end}} = \text{SpentToDate}_{\text{month}} + \left(\text{BurnRate}_{\text{daily}} \times D_{\text{remaining}}\right)$$

- **Thời gian Cạn kiệt Ngân sách (Days to Budget Depletion)**:
  Nếu đã cấu hình $\text{MonthlyCapUSD}$:
  $$\text{DaysRemaining} = \begin{cases}
    \frac{\max(0, \text{MonthlyCapUSD} - \text{SpentToDate}_{\text{month}})}{\text{BurnRate}_{\text{daily}}}, & \text{khi } \text{BurnRate}_{\text{daily}} > 0 \\
    \infty, & \text{ngược lại}
  \end{cases}$$

---

### 2.4. Backend API Specifications (REST Endpoints & Contract)

Các endpoint được đăng ký trong module `apps/gateway/src/api/routes/admin-finops.ts`:

#### 1. `GET /api/finops/summary`
Trả về báo cáo tổng hợp FinOps, KPI cards, tiến trình ngân sách và dự phóng.
- **Query Params**: `?window=today | 24h | 7d | month | all` (Mặc định: `month`)
- **Response Payload Schema**:
```json
{
  "window": "month",
  "periodStart": 1756684800,
  "periodEnd": 1759276800,
  "kpis": {
    "totalRequests": 14250,
    "totalTokens": 84500000,
    "promptTokens": 52000000,
    "reasoningTokens": 18500000,
    "completionTokens": 14000000,
    "totalSpentUsd": 12.4500,
    "avoidedRetailUsd": 386.8500,
    "netSavingsUsd": 374.4000,
    "savingsPercent": 96.78,
    "hourlyBurnRateUsd": 0.5187,
    "dailyBurnRateUsd": 12.4500,
    "projectedMonthEndRunRateUsd": 373.5000
  },
  "budgets": {
    "daily": {
      "capUsd": 50.0,
      "spentUsd": 12.45,
      "percentage": 24.9,
      "status": "NORMAL"
    },
    "monthly": {
      "capUsd": 1000.0,
      "spentUsd": 215.80,
      "percentage": 21.58,
      "status": "NORMAL",
      "projectedOverCap": false,
      "daysToDepletion": 62.9
    }
  },
  "activeAlerts": []
}
```

#### 2. `GET /api/finops/attribution/accounts`
Báo cáo phân bổ chi phí theo từng Sandbox Account (Account Cost Attribution Leaderboard).
- **Query Params**: `?window=month&limit=50`
- **Response Payload Schema**:
```json
{
  "accounts": [
    {
      "accountId": "codex-acc-1",
      "adapterId": "codex-cli",
      "accountName": "OpenAI Codex Main Seat",
      "callCount": 8200,
      "promptTokens": 32000000,
      "reasoningTokens": 12000000,
      "completionTokens": 8000000,
      "totalTokens": 52000000,
      "spentUsd": 7.2000,
      "avoidedRetailUsd": 216.0000,
      "netSavingsUsd": 208.8000,
      "budgetSharePercent": 57.83,
      "burnStatus": "NORMAL"
    },
    {
      "accountId": "claude-dev-team",
      "adapterId": "claude-code",
      "accountName": "Claude Code Pro Sub 1",
      "callCount": 4500,
      "promptTokens": 15000000,
      "reasoningTokens": 6000000,
      "completionTokens": 5000000,
      "totalTokens": 26000000,
      "spentUsd": 4.1500,
      "avoidedRetailUsd": 145.5000,
      "netSavingsUsd": 141.3500,
      "budgetSharePercent": 33.33,
      "burnStatus": "NORMAL"
    }
  ],
  "totalAccountsActive": 2
}
```

#### 3. `GET /api/finops/pricing` & `PUT /api/finops/pricing/:id`
Quản lý các quy tắc đơn giá mô hình trong SQLite.
- `GET /api/finops/pricing`: Lấy toàn bộ ma trận giá hiện tại.
- `PUT /api/finops/pricing/:id`: Cập nhật đơn giá custom.
```json
// PUT /api/finops/pricing/pricing_claude_3_7_sonnet Body:
{
  "promptPricePerM": 1.0,
  "completionPricePerM": 5.0,
  "reasoningPricePerM": 5.0,
  "benchmarkPromptPricePerM": 3.0,
  "benchmarkCompletionPricePerM": 15.0,
  "benchmarkReasoningPricePerM": 15.0,
  "isCustom": true
}
```

#### 4. `POST /api/finops/pricing/reset-defaults`
Khôi phục toàn bộ bảng `model_pricing` về biểu giá niêm yết chính hãng (Factory Benchmarks).

#### 5. `GET /api/finops/budgets` & `PUT /api/finops/budgets`
Tra cứu và cập nhật hạn mức ngân sách:
```json
// PUT /api/finops/budgets Body:
{
  "dailyCapUsd": 60.0,
  "monthlyCapUsd": 1200.0,
  "softAlertPercent": 85,
  "hardAlertPercent": 100,
  "enforcementMode": "alert_only"
}
```

#### 6. Sự kiện SSE: `finops:budget_alert`
Phát qua kênh SSE `/api/admin/events` khi chi tiêu vượt ngưỡng:
```json
{
  "event": "finops:budget_alert",
  "data": {
    "scope": "daily",
    "level": "WARNING",
    "spentUsd": 42.50,
    "capUsd": 50.00,
    "percentage": 85.0,
    "message": "Daily spend has reached 85.0% of limit ($42.50 / $50.00)",
    "timestamp": 1756689200
  }
}
```

---

### 2.5. Frontend Component Architecture (Web Console)

```
apps/web/src/
├── components/
│   ├── layout/
│   │   └── Sidebar.tsx                     <-- Thêm tab "usage" với icon CircleDollarSign
│   └── finops/
│       ├── FinOpsKpiDeck.tsx               <-- 4 thẻ KPI tài chính cao cấp
│       ├── BudgetProgressBar.tsx           <-- Thanh hạn mức Ngày & Tháng đa sắc thái
│       ├── AccountCostAttribution.tsx      <-- Bảng xếp hạng bóc tách chi phí Sandbox
│       ├── ModelPricingMatrixDrawer.tsx    <-- Modal/Drawer cấu hình giá tùy biến
│       └── BudgetConfigModal.tsx           <-- Modal chỉnh sửa hạn mức Daily/Monthly
└── views/
    └── UsageFinOpsView.tsx                 <-- Màn hình điều phối chính
```

#### 1. Tích hợp Sidebar (`apps/web/src/components/layout/Sidebar.tsx`)
Bổ sung mục điều hướng `usage`:
```tsx
import { LayoutDashboard, Layers, Users, Terminal, Radar, Activity, CircleDollarSign } from "lucide-react";

export type NavTab = "dashboard" | "models" | "accounts" | "webshell" | "radar" | "inspector" | "usage";

// Trong Sidebar items:
{
  id: "usage",
  label: "Usage & FinOps Hub",
  icon: <CircleDollarSign className="w-4 h-4 text-emerald-400" />,
}
```

#### 2. Kiến trúc Giao diện Chi tiết (`UsageFinOpsView.tsx`)

##### A. Header & Controls Bar
- **Bộ chọn Cửa sổ Thời gian (Time Window Filter)**: `Today`, `Last 24h`, `Last 7 Days`, `This Month` (mặc định), `All Time`.
- **Nút Hành động**: 
  - `Configure Budgets` (mở modal đặt Daily/Monthly Cap).
  - `Model Pricing Matrix` (mở drawer chỉnh sửa biểu giá).
  - `Export CSV Report` (tải báo cáo kiểm toán chi phí).

##### B. Bộ 4 Thẻ KPI FinOps Cấp Doanh nghiệp (`FinOpsKpiDeck.tsx`)
1. **Card 1: Total Incurred Spend (USD)**
   - Trị số lớn: `$12.4500` (Xanh lục / Emerald text).
   - Phụ đề: "Internal chargeback cost across 84.5M tokens".
2. **Card 2: Net Cost Savings (USD & % ROI)**
   - Trị số lớn: `$374.4000` (Cyan text).
   - Badge nổi bật: `96.78% Saved` (so với $386.85 Benchmark Retail API).
   - Chú thích: Tránh được hóa đơn trực tiếp từ OpenAI / Anthropic API.
3. **Card 3: Rolling Burn Rate**
   - Trị số lớn: `$0.52 / hr` (hoặc `$12.45 / day`).
   - Xu hướng: Tăng/giảm so với 24h trước.
4. **Card 4: Projected Month-End Run Rate**
   - Trị số lớn: `$373.50` (Amber / Slate).
   - Chỉ số an toàn: `Within $1,000 Budget Cap` (hoặc `Risk: May exceed cap in 18 days`).

##### C. Thanh Tiến trình Ngân sách Động (`BudgetProgressBar.tsx`)
- **Daily Budget Meter**:
  - Nhãn: `Daily Spend: $12.45 / $50.00 (24.9%)`.
  - Thanh fill Tailwind CSS với transition mượt mà:
    - `< 80%`: `bg-emerald-500 shadow-emerald-500/30`.
    - `80% - 99%`: `bg-amber-500 shadow-amber-500/30 animate-pulse` kèm nhãn `[SOFT WARNING]`.
    - `≥ 100%`: `bg-rose-500 shadow-rose-500/50 animate-bounce` kèm nhãn `[OVER BUDGET]`.
- **Monthly Budget Meter**:
  - Nhãn: `Monthly Spend: $215.80 / $1,000.00 (21.6%)`.
  - Hiển thị mốc phân vị thời gian của tháng (Month Elapsed Time Indicator: ví dụ hôm nay là ngày 18 của tháng 30 ngày = 60% thời gian) để so sánh trực quan xem tốc độ tiêu tiền có nhanh hơn tốc độ trôi của ngày tháng hay không.

##### D. Bảng Phân bổ Chi phí theo Tài khoản (`AccountCostAttribution.tsx`)
Bảng dữ liệu phân cấp trực quan:
- Cột 1: **Account ID & Provider** (`codex-acc-1`, `claude-dev-team` kèm icon provider).
- Cột 2: **Request Count** (Phân bổ số lượt gọi).
- Cột 3: **Token Breakdown** (Hiển thị Prompt / Reasoning / Completion dưới dạng mini stacked bar).
- Cột 4: **Incurred Gateway Spend ($)**.
- Cột 5: **Avoided Retail API Spend ($)**.
- Cột 6: **Net Savings ($)**.
- Cột 7: **Budget Share (%)** (Thanh tỷ lệ % chiếm dụng ngân sách Gateway).
- Cột 8: **Cost Efficiency** ($/1k tokens).

##### E. Ngăn Kéo Quản lý Ma trận Giá (`ModelPricingMatrixDrawer.tsx`)
- Danh sách bảng giá của từng dòng model.
- Cho phép chỉnh sửa trực tiếp 3 cột giá Gateway: `Prompt $/1M`, `Completion $/1M`, `Reasoning $/1M`.
- Hiển thị cột Benchmark thị trường để so sánh.
- Nút "Apply Changes" và nút "Restore Factory Benchmarks".

---

## 3. PHÂN TÍCH ĐÁNH ĐỔI KIẾN TRÚC (TRADE-OFFS & RESILIENCE)

### 3.1. Giả định Then chốt (Load-Bearing Assumption)

1. **Giả định về Bảng `request_metrics` Đã Có Sẵn Dữ liệu Đầy Đủ**:
   - Kiến trúc của Candidate 2 dựa trên tiền đề rằng tầng Telemetry (`request_metrics`) đã được ghi nhận đầy đủ `prompt_tokens`, `reasoning_tokens`, `completion_tokens`, `adapter_id`, `account_id`, và `model_executed`.
   - *Tính vững chắc:* Khảo sát thực tế trong `apps/gateway/src/db/schema.ts` cho thấy bảng `request_metrics` đã có đầy đủ 100% các trường này cùng các chỉ mục tối ưu (`idx_request_metrics_created_at`, `idx_request_metrics_adapter_model`, `idx_request_metrics_account_created`). Điều này cho phép module FinOps tận dụng dữ liệu lịch sử ngay lập tức mà không cần migration dữ liệu cũ.

2. **Giả định về Bản chất "Chi phí Tiết kiệm" (Savings Assumption)**:
   - Giả định rằng Gateway phục vụ các CLI có tài khoản thuê bao trọn gói (Subscription/Flat-rate), do đó việc tính toán khoản tiết kiệm (Avoided API Retail Cost) mang giá trị kinh tế thực tế cho khách hàng doanh nghiệp khi họ chứng minh hiệu quả đầu tư (ROI).

---

### 3.2. Điều kiện Sụp đổ Đầu tiên (Worst-Case Failure Modes) & Giải pháp Phòng vệ

| Tình huống Thất bại (Failure Mode) | Nguy cơ / Tác động | Giải pháp Phòng vệ Bền bỉ (Defensive Solution) |
|---|---|---|
| **1. Quá tải Truy vấn SQL Aggregate khi Ledger đạt Hàng Triệu Bản ghi** | Khi bảng `request_metrics` đạt > 500,000 dòng, các lệnh `GROUP BY` và `SUM()` tính chi phí trong ngày/tháng có thể gây nghẽn CPU SQLite và làm chậm phản hồi. | **60-Second In-Memory Rollup Cache**: Tầng backend áp dụng bộ nhớ đệm 60 giây cho kết quả tổng hợp FinOps. Chỉ tính toán lại khi có request mới hoàn tất hoặc khi cache hết hạn. Tận dụng chỉ mục tổng hợp `idx_request_metrics_account_created` để chỉ quét phạm vi thời gian hẹp (`created_at >= ?`), không bao giờ quét Full Table Scan. |
| **2. Sai số Trôi Dấu phẩy Động (Floating Point Drift)** | Tính toán phép nhân/chia trên số thực float với đơn vị micro-cent có thể gây sai số như `$0.0000000000000002` hoặc sai lệch tổng số tiền. | **Fixed Decimal Math / Micro-Cent Normalization**: Toàn bộ phép nhân chia được thực hiện ở độ chính xác chuẩn, sau đó chuẩn hóa bằng hàm làm tròn tài chính `Math.round(val * 1e6) / 1e6` (6 số lẻ) và hiển thị qua `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 4 })`. |
| **3. Model Mới Chưa Có trong Ma trận Giá (Unmatched Pricing Rule)** | Client gửi yêu cầu với model tùy biến hoặc model mới xuất xưởng (ví dụ `claude-3-8-opus-thinking`) chưa kịp cập nhật vào bảng `model_pricing`. | **Three-Tier Fallback Hierarchy**: Hệ thống áp dụng quy tắc 3 tầng: Khớp chính xác -> Khớp tiền tố (Wildcard) -> Khớp mặc định generic `*` với biểu giá thị trường dự phòng an toàn ($2.00 / $8.00 / 1M). Gateway không bao giờ throw lỗi 500 khi gặp model lạ. |
| **4. Ngân sách Vượt Ngưỡng (Budget Depletion Runaway)** | Một client vô tình chạy vòng lặp vô tận (infinite loop) gửi hàng ngàn request làm nổ tung hạn mức trong vài phút. | **SSE Instant Push + Enforcement Mode**: Khi tổng chi tiêu chạm mốc 100%, Gateway kích hoạt phát thông báo khẩn cấp `finops:budget_alert` qua SSE để Web Console hiển thị chuông cảnh báo đỏ rực; đồng thời nếu cấu hình `enforcement_mode = 'soft_throttle'`, Gateway sẽ chuyển hướng các request sau đó về tài khoản hoặc model tier thấp hơn để ngăn chặn thảm họa tài chính. |

---

### 3.3. Đánh giá Tính Đơn giản & Tái sử dụng (KISS / DRY Evaluation)

1. **KISS (Keep It Simple, Stupid)**:
   - Không dựng thêm daemon tính toán nền phức tạp. Mọi logic tính toán chi phí được đóng gói trong một file dịch vụ duy nhất: `apps/gateway/src/telemetry/finops-engine.ts` (~250 dòng code thuần TypeScript).
   - Không cài đặt các thư viện biểu đồ đồ sộ (không Recharts, Chart.js hay D3 nặng nề). Giao diện sử dụng 100% SVG thuần và các thanh CSS Tailwind Flex/Width tối giản, nhẹ nhàng, tải trang tức thì dưới 10ms.
2. **DRY (Don't Repeat Yourself)**:
   - Tái sử dụng triệt để bảng `request_metrics` có sẵn của hệ thống Telemetry Station mà Candidate trước đã xây dựng. Không nhân bản bảng lưu vết token thành hai nơi.
   - Tái sử dụng `globalAdminEventBus` để truyền phát các cảnh báo ngân sách (`budget_alert`) mà không cần tạo thêm kênh WebSocket riêng.
   - Chia sẻ chung cấu trúc API Client (`apps/web/src/lib/api-client.ts`) giữa các view `TelemetryStationView` và `UsageFinOpsView`.

---

## 4. KẾ HOẠCH BÀN GIAO & LỘ TRÌNH TRIỂN KHAI (IMPLEMENTATION MATRIX)

```
┌─────────┬───────────────────────────────────────────────────────────────┬────────────────────────┐
│ Giai đoạn│ Nhiệm vụ Trọng tâm                                           │ Tệp mã nguồn tác động  │
├─────────┼───────────────────────────────────────────────────────────────┼────────────────────────┤
│ Phase 1 │ Schema SQLite, Drizzle Migration & Factory Pricing Seeder     │ apps/gateway/src/db/   │
│         │ - Tạo bảng model_pricing, budget_policies                     │   schema.ts, migrate.ts│
│         │ - Gieo bảng giá mặc định (OpenAI & Anthropic Benchmarks)      │                        │
├─────────┼───────────────────────────────────────────────────────────────┼────────────────────────┤
│ Phase 2 │ FinOps Calculation Engine & REST Endpoints                    │ apps/gateway/src/api/  │
│         │ - Logic tính Spent, Savings, Burn Rate, Run Rate              │   routes/admin-finops.ts│
│         │ - Prefix Wildcard Matcher cho Model Pricing                   │ apps/gateway/src/      │
│         │ - SSE Budget Alert Triggering                                 │   telemetry/finops.ts  │
├─────────┼───────────────────────────────────────────────────────────────┼────────────────────────┤
│ Phase 3 │ Web Console: Sidebar Tab, View & KPI Deck                     │ apps/web/src/          │
│         │ - Bổ sung tab 'usage' vào Sidebar & App.tsx                   │   components/layout/   │
│         │ - Xây dựng FinOpsKpiDeck (4 cards tài chính)                  │   views/UsageFinOpsView│
├─────────┼───────────────────────────────────────────────────────────────┼────────────────────────┤
│ Phase 4 │ Budget Progress Bar & Account Attribution Matrix              │ apps/web/src/          │
│         │ - Dual-Scope Daily & Monthly Progress Bar                     │   components/finops/   │
│         │ - Bảng phân bổ chi phí chi tiết theo Sandbox Account          │                        │
├─────────┼───────────────────────────────────────────────────────────────┼────────────────────────┤
│ Phase 5 │ Model Pricing Matrix Drawer & Budget Config Modal             │ apps/web/src/          │
│         │ - Drawer chỉnh sửa biểu giá custom $/1M                       │   components/finops/   │
│         │ - Modal đặt hạn mức ngân sách & cảnh báo                      │                        │
├─────────┼───────────────────────────────────────────────────────────────┼────────────────────────┤
│ Phase 6 │ Verification Suite & Acceptance Suite                         │ tests/unit/,           │
│         │ - Unit test FinOps calculation engine                         │ tests/integration/,    │
│         │ - E2E verification test AC-1 đến AC-6                         │ tests/e2e/finops.test  │
└─────────┴───────────────────────────────────────────────────────────────┴────────────────────────┘
```

---

## TỔNG KẾT (CANDIDATE 2 ADVOCACY)

Là **Candidate 2**, giải pháp này giải quyết triệt để bài toán kinh tế then chốt của `cli-to-api`: **"AI Gateway của chúng ta thực sự mang lại bao nhiêu giá trị và tiêu tốn bao nhiêu chi phí?"**

Bằng việc kết hợp hài hòa giữa **Ma trận giá đa tầng linh hoạt**, **Cơ chế phân bổ chi phí chuẩn xác theo từng Sandbox Account**, và **Hệ thống kiểm soát ngân sách chủ động với cảnh báo ngưỡng trực quan**, đề xuất này biến `cli-to-api` thành một nền tảng quản trị AI Gateway cấp doanh nghiệp (Enterprise AI Gateway), sẵn sàng cho quy mô sản xuất lớn và đáp ứng đầy đủ các tiêu chuẩn FinOps khắt khe nhất năm 2026.
