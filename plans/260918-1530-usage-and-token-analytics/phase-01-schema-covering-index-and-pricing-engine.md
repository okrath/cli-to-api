# Phase 01: Cơ Sở Dữ Liệu & Động Cơ Định Giá Token (Schema Covering Index & Pricing Engine)

## MỤC TIÊU PHA
Thiết lập nền tảng dữ liệu hiệu năng cao cho toàn bộ phân hệ Usage Analytics:
1. Tạo chỉ mục phủ `idx_request_metrics_usage_analytics` trên bảng `request_metrics` trong SQLite để đảm bảo các truy vấn Single-Pass Rollup và Pivot Matrix luôn hoàn tất trong $\le 25\text{ms}$.
2. Xây dựng module Động cơ Định giá Token `apps/gateway/src/telemetry/model-pricing.ts` với cơ chế nội suy 3 tầng (Prefix $\rightarrow$ Heuristic Tier $\rightarrow$ Default Fallback) và xử lý số học Micro-Cent ($10^{-6}$ USD) chống trôi IEEE-754.
3. Viết bộ kiểm thử đơn vị `tests/unit/model-pricing.test.ts` kiểm chứng 100% các trường hợp định giá và tính toán chi phí.

---

## CÁC NHIỆM VỤ CHI TIẾT (CONCRETE TASKS)

### Nhiệm vụ 1.1: Bổ sung Covering Index vào `apps/gateway/src/db/schema.ts`
- Thêm chỉ mục phủ `usageAnalyticsCoveringIndex` vào bảng `request_metrics`:
  ```typescript
  usageAnalyticsCoveringIndex: index("idx_request_metrics_usage_analytics").on(
    table.createdAt,
    table.adapterId,
    table.modelExecuted,
    table.accountId,
    table.statusCode
  ),
  ```

### Nhiệm vụ 1.2: Cập nhật Migration Script `apps/gateway/src/db/migrate.ts`
- Thêm lệnh tạo index an toàn nếu chưa tồn tại (`CREATE INDEX IF NOT EXISTS idx_request_metrics_usage_analytics ON request_metrics (created_at, adapter_id, model_executed, account_id, status_code);`).

### Nhiệm vụ 1.3: Hiện thực hóa Module `apps/gateway/src/telemetry/model-pricing.ts`
- Định nghĩa interface `TokenRates`: `promptPerMillion`, `completionPerMillion`, `reasoningPerMillion`.
- Bảng giá `MODEL_PRICING_TABLE` chứa các dòng model tiêu chuẩn (Claude 3.7 Sonnet, Claude 3.5 Sonnet, GPT-4o, o1, o3-mini, DeepSeek-R1, v.v.).
- Bảng fallback `TIER_FALLBACK_TABLE` cho các mức `xhigh`, `high`, `medium`, `low`, `default`.
- Hàm `resolveTokenRates(modelName?: string | null): TokenRates`.
- Hàm `calculateMicroCost(promptTokens, completionTokens, reasoningTokens, rates): number`.
- Hàm `formatUsd(cost: number): string` hiển thị định dạng `$0.0001` hoặc `$12.34`.

### Nhiệm vụ 1.4: Viết Unit Test Suite `tests/unit/model-pricing.test.ts`
- Kiểm tra khớp chính xác model (`claude-3-7-sonnet`, `gpt-4o`, `o1-preview`).
- Kiểm tra khớp heuristic tier (`haiku`, `mini`, `small` $\rightarrow$ `low`; `opus`, `reasoner` $\rightarrow$ `high`).
- Kiểm tra model lạ $\rightarrow$ `default`.
- Kiểm tra độ chính xác micro-cent: cộng dồn $10.000$ request nhỏ không bị sai số trôi dấu phẩy động.
- Kiểm tra xử lý token âm hoặc `undefined` an toàn.

---

## TIÊU CHÍ NGHIỆM THU PHA 1
- [x] Chỉ mục `idx_request_metrics_usage_analytics` tồn tại trong SQLite DB và `EXPLAIN QUERY PLAN` xác nhận sử dụng index.
- [x] Lệnh kiểm thử `npx vitest run tests/unit/model-pricing.test.ts` đạt 100% PASS.
- [x] Không có lỗi type check trong `apps/gateway`.
