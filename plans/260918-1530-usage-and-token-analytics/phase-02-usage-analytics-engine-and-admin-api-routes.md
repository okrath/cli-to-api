# Phase 02: Động Cơ Phân Tích & Admin Usage API (Analytics Engine & Control Plane Routes)

## MỤC TIÊU PHA
1. Xây dựng module động cơ phân tích `apps/gateway/src/telemetry/usage-analytics.ts` hỗ trợ:
   - Single-Pass Comparative Rollup ($T$ vs $T-1$) kèm tỷ lệ tăng giảm $\Delta\%$.
   - Time-Series Bucketed Rollup theo giờ (`hour`) hoặc theo ngày (`day`).
   - Dynamic 2-Axis Pivot Matrix cho 4 cặp chiều: `Model × Adapter`, `Account × Model`, `Date × Model`, `Adapter × Status`.
   - Streaming CSV (RFC 4180) & JSON iterator qua Node.js `Readable` stream với mức chiếm dụng RAM $O(1)$ và hook dọn dẹp cursor khi socket đóng.
2. Xây dựng route controller Fastify `apps/gateway/src/api/routes/admin-usage.ts` và đăng ký vào `server.ts`:
   - `GET /api/admin/usage/summary`
   - `GET /api/admin/usage/timeseries`
   - `GET /api/admin/usage/pivot`
   - `GET /api/admin/usage/records`
   - `GET /api/admin/usage/export`
   - `GET /api/admin/usage/filters`
3. Cập nhật SDK client `apps/web/src/lib/api-client.ts` để sẵn sàng cho frontend ở Phase 3.
4. Viết bộ Integration Test Suite `tests/integration/admin-usage.test.ts` kiểm thử toàn diện cả 6 endpoints.

---

## CÁC NHIỆM VỤ CHI TIẾT (CONCRETE TASKS)

### Nhiệm vụ 2.1: Hiện thực hóa `apps/gateway/src/telemetry/usage-analytics.ts`
- Class `UsageAnalyticsEngine` với các phương thức:
  - `getComparativeSummary(startCurrent, endCurrent, compare: boolean)`
  - `getTimeSeries(start, end, granularity: 'hour' | 'day')`
  - `getPivotMatrix(dimA, dimB, start, end, search?: string)`
  - `getDrillDownRecords(params: { dimA, valA, dimB?, valB?, start, end, limit, offset })`
  - `createCsvExportStream(start, end, filters?): Readable`
  - `getFilterOptions()`
- Tích hợp hàm `calcDelta(cur, prev)` chặn cứng chia cho 0: `prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 1000) / 10`.
- Tích hợp công thức tính tốc độ sinh token thực tế loại trừ TTFT:
  $\text{Tokens/sec} = (\text{completion} + \text{reasoning}) / \max((\text{duration} - \text{ttft})/1000, 0.05)$.
- Cơ chế Whitelist kiểm tra giá trị của `dimA` và `dimB` ngăn chặn hoàn toàn nguy cơ SQL Injection.

### Nhiệm vụ 2.2: Hiện thực hóa `apps/gateway/src/api/routes/admin-usage.ts`
- Hàm `registerAdminUsageRoutes(fastify: FastifyInstance): void`.
- Validate query params bằng Zod hoặc Fastify schema.
- Xử lý streaming export với listener `req.raw.on("close")` gọi `iterator.return()` đóng cursor SQLite ngay lập tức trong $\le 50\text{ms}$.

### Nhiệm vụ 2.3: Đăng ký router trong `apps/gateway/src/api/server.ts`
- Gọi `registerAdminUsageRoutes(fastify)` trong hàm bootstrap của gateway server.

### Nhiệm vụ 2.4: Mở rộng `apps/web/src/lib/api-client.ts`
- Thêm types: `UsageSummaryResponse`, `UsageTimeSeriesItem`, `UsagePivotItem`, `UsageRecordItem`.
- Thêm methods:
  - `getUsageSummary(params)`
  - `getUsageTimeSeries(params)`
  - `getUsagePivot(params)`
  - `getUsageRecords(params)`
  - `getUsageFilters()`
  - `getUsageExportUrl(params)`

### Nhiệm vụ 2.5: Viết Integration Test Suite `tests/integration/admin-usage.test.ts`
- Chèn dữ liệu thử nghiệm giả lập (sample records) vào SQLite.
- Test `GET /api/admin/usage/summary` trả về đúng KPI và Delta $\Delta\%$.
- Test `GET /api/admin/usage/timeseries` trả về đúng các bucket ngày/giờ.
- Test `GET /api/admin/usage/pivot` xoay trục đúng `model` x `adapter`.
- Test `GET /api/admin/usage/records` lấy đúng 25 bản ghi chi tiết.
- Test `GET /api/admin/usage/export?format=csv` trả về header RFC 4180 và body định dạng CSV hợp lệ.

---

## TIÊU CHÍ NGHIỆM THU PHA 2
- [x] Toàn bộ 6 API endpoints hoạt động ổn định và trả về HTTP 200.
- [x] Lệnh kiểm thử `npx vitest run tests/integration/admin-usage.test.ts` đạt 100% PASS.
- [x] Thời gian xử lý endpoint `/summary` dưới 25ms.
