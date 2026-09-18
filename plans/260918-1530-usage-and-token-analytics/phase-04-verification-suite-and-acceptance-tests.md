# Phase 04: Bộ Nghiệm Thu Tự Động & Chống Hỗn Loạn (Verification Suite & Chaos Resilience)

## MỤC TIÊU PHA
1. Xây dựng module sinh dữ liệu giả lập có kiểm soát `tests/fixtures/usage-dataset-generator.ts` hỗ trợ sinh nhanh $1.000$ đến $50.000$ bản ghi đa dạng (nhiều model, adapter, account, thời gian).
2. Viết bộ kiểm thử nghiệm thu E2E `tests/e2e/usage-acceptance.test.ts` kiểm chứng toàn diện các tiêu chí từ AC-1 đến AC-6 theo chuẩn Gherkin.
3. Viết bộ kiểm thử hỗn loạn và khả năng chịu tải `tests/e2e/usage-chaos.test.ts`:
   - **Socket Abort Test:** Client bắt đầu tải stream CSV dung lượng lớn rồi hủy kết nối sau $10\text{ms}$; xác minh cursor SQLite giải phóng trong $\le 50\text{ms}$ và bộ nhớ heap Node.js không rò rỉ.
   - **Division-by-Zero Test:** Truy vấn summary với kỳ trước có 0 bản ghi; xác minh không phát sinh lỗi `NaN%` hay `Infinity%`.
   - **Covering Index Benchmark Test:** Đo thời gian quét query trên $10.000$ bản ghi; xác minh thời gian thực thi $\le 25\text{ms}$.
   - **50-Worker Concurrent Stress Test:** 50 request đọc/ghi analytics và telemetry đồng thời; xác minh 0 lỗi `SQLITE_BUSY`.
4. Thực hiện Typecheck và Full Test Suite trên toàn monorepo (`pnpm test` và `pnpm build`).

---

## CÁC NHIỆM VỤ CHI TIẾT (CONCRETE TASKS)

### Nhiệm vụ 4.1: Xây dựng `tests/fixtures/usage-dataset-generator.ts`
- Hàm `seedUsageDataset(db, count: number, daysSpan: number)`:
  - Sinh ngẫu nhiên có trọng số các model: `claude-3-7-sonnet`, `claude-3-5-sonnet`, `gpt-4o`, `o1-mini`, `deepseek-reasoner`.
  - Sinh ngẫu nhiên các adapter: `claude-code`, `codex-cli`, `devin-cli`, `omp-cli`.
  - Sinh ngẫu nhiên các account: `acc-01`, `acc-02`, `acc-03`.
  - Phân bổ timestamp từ quá khứ đến hiện tại để phục vụ kiểm thử so sánh chu kỳ.

### Nhiệm vụ 4.2: Hiện thực hóa `tests/e2e/usage-acceptance.test.ts`
- **Test AC-1 (Sidebar & Navigation):** Kiểm tra component Sidebar chứa tab `usage` và route render đúng.
- **Test AC-2 (Single-Pass Summary & Delta):** Kiểm tra kết quả `/api/admin/usage/summary` tính toán đúng token, chi phí và Delta $\Delta\%$ so với kỳ trước.
- **Test AC-3 (Time-Series & Chart Data):** Kiểm tra `/api/admin/usage/timeseries` nhóm đúng theo ngày/giờ và có đủ 3 kênh token.
- **Test AC-4 (Pivot Grid & Drill-Down):** Kiểm tra `/api/admin/usage/pivot` xoay trục đúng và `/api/admin/usage/records` phân trang chính xác.
- **Test AC-5 (Streaming CSV Export):** Kiểm tra stream trả về đúng chuẩn RFC 4180 và Heap RAM delta $< 20\text{MB}$.
- **Test AC-6 (Pricing & Micro-Cent):** Kiểm tra tính toán chi phí không bị lỗi số thực trôi.

### Nhiệm vụ 4.3: Hiện thực hóa `tests/e2e/usage-chaos.test.ts`
- Bài test socket close ngắt giữa chừng.
- Bài test dữ liệu rỗng (zero records).
- Bài test stress đồng thời 50 workers.

### Nhiệm vụ 4.4: Kiểm chứng toàn diện (Full Regression Verification)
- Chạy toàn bộ test suite của gateway: `pnpm --filter @cli-to-api/gateway test`.
- Chạy build của web: `pnpm --filter @cli-to-api/web build`.
- Xác nhận zero regressions trên các phân hệ cũ (Anthropic messages, Fleet radar, WebShell, Custom adapters).

---

## TIÊU CHÍ NGHIỆM THU PHA 4
- [x] Lệnh kiểm thử `npx vitest run tests/e2e/usage-acceptance.test.ts` đạt 100% PASS.
- [x] Lệnh kiểm thử `npx vitest run tests/e2e/usage-chaos.test.ts` đạt 100% PASS.
- [x] Toàn bộ test suite `pnpm test` trên monorepo chạy xanh 100%.
- [x] `pnpm build` biên dịch thành công cả gateway và web.
