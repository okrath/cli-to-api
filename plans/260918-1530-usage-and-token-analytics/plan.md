---
title: "Màn Hình Quản Trị Tiêu Thụ Token, Chi Phí & Tình Báo Dữ Liệu Đa Chiều (Usage & Token Analytics Dashboard)"
status: completed
created: 2026-09-18
mode: ultra-verifier-pass
lead_verifier: Kongming
winning_plan: Candidate Plan B (Strict Sequential Phased Delivery)
target_feature: "Thêm màn hình Usage (Usage & Token Consumption Analytics Dashboard)"
specification: plans/reports/brainstorm-260918-1525-usage-token-analytics-dashboard.md
evaluation: plans/reports/planner-evaluation-usage-token-analytics.md
---

# Kế Hoạch Thi Công: Usage & Token Analytics Dashboard Cho `cli-to-api`

## TỔNG QUAN HỆ THỐNG (ARCHITECTURE BLUEPRINT)

Hệ thống bổ sung một trạm kiểm soát tài chính và phân tích mức tiêu thụ token lịch sử (**Usage & Token Analytics Dashboard**) hoàn toàn mới vào Web Management Console (`apps/web`), bóc tách 3 luồng token (**Prompt / Ingress**, **Reasoning / Thinking CoT**, **Completion / Egress**), quy đổi chi phí tương đương ($ USD) theo đơn giá từng model với độ chính xác Micro-Cent ($10^{-6}$ USD), cung cấp biểu đồ cột chồng Pure React SVG, ma trận xoay chiều OLAP Pivot Grid, ngăn kéo khoan sâu giao dịch (Drill-Down Drawer) và cơ chế xuất dữ liệu kiểm toán CSV/JSON streaming $O(1)$ RAM.

### 4 Nguyên Tắc Thi Công Bất Biến:
1. **Zero New NPM Dependencies:** Tuyệt đối không cài thêm bất kỳ thư viện chart hay ORM nào. Biểu đồ được dựng hoàn toàn bằng Pure React SVG + Tailwind CSS Obsidian Cyberdeck.
2. **Zero Ingress Hot-Path Degradation:** Không can thiệp vào luồng proxy `/v1/chat/completions` hay `/v1/messages`. Tận dụng SQLite WAL mode và chỉ mục phủ Covering Index.
3. **Single-Pass Comparative Rollup:** Đọc dữ liệu kỳ này ($T$) và kỳ đối ứng ($T-1$) trong duy nhất một lần quét index để hiển thị tỷ lệ Delta ($\Delta\%$).
4. **O(1) Heap Safety on Export:** Sử dụng `stmt.iterate()` của `better-sqlite3` nối trực tiếp vào Node.js `Readable` stream, tự động đóng cursor trong $\le 50\text{ms}$ khi client ngắt kết nối (socket close).

---

## CẤU TRÚC 4 PHASES THI CÔNG TUẦN TỰ

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                     LỘ TRÌNH THI CÔNG STRICT SEQUENTIAL PHASED DELIVERY                         │
├───────────┬─────────────────────────────────────────────┬───────────────────────────────────────┤
│ Phase     │ Trọng tâm chức năng                         │ Tệp tin tác động chính                │
├───────────┼─────────────────────────────────────────────┼───────────────────────────────────────┤
│ **PHASE 1**│ **Cơ Sở Dữ Liệu & Động Cơ Định Giá Token**   │ • apps/gateway/src/db/schema.ts       │
│           │ - Tạo Covering Index trên request_metrics   │ • apps/gateway/src/db/migrate.ts      │
│           │ - Xây dựng model-pricing.ts (3-tier)        │ • apps/gateway/src/telemetry/         │
│           │ - Test Fixtures & Unit Test Pricing Engine  │   model-pricing.ts                    │
│           │                                             │ • tests/unit/model-pricing.test.ts    │
├───────────┼─────────────────────────────────────────────┼───────────────────────────────────────┤
│ **PHASE 2**│ **Động Cơ Phân Tích & Admin Usage API**     │ • apps/gateway/src/telemetry/         │
│           │ - Xây dựng usage-analytics.ts (OLAP Engine) │   usage-analytics.ts                  │
│           │ - Xây dựng admin-usage.ts (6 endpoints)     │ • apps/gateway/src/api/routes/        │
│           │ - Đăng ký route trong server.ts             │   admin-usage.ts                      │
│           │ - Cập nhật apiClient trong apps/web         │ • apps/gateway/src/api/server.ts      │
│           │ - Integration Test Suite                    │ • apps/web/src/lib/api-client.ts      │
│           │                                             │ • tests/integration/admin-usage.test  │
├───────────┼─────────────────────────────────────────────┼───────────────────────────────────────┤
│ **PHASE 3**│ **Giao Diện Pure React SVG & Usage View**   │ • apps/web/src/components/usage/      │
│           │ - 5 Cyberdeck UI Components (SVG Stacked    │   UsageStackedBarChart.tsx            │
│           │   Bar, KpiCard, PivotGrid, Drawer, Toolbar) │   UsageKpiCard.tsx                    │
│           │ - UsageAnalyticsView.tsx                    │   UsagePivotGrid.tsx                  │
│           │ - Tích hợp Sidebar.tsx & App.tsx            │   UsageLedgerDrawer.tsx               │
│           │                                             │   UsageFilterToolbar.tsx              │
│           │                                             │ • apps/web/src/views/                 │
│           │                                             │   UsageAnalyticsView.tsx              │
│           │                                             │ • apps/web/src/components/layout/     │
│           │                                             │   Sidebar.tsx                         │
│           │                                             │ • apps/web/src/App.tsx                │
├───────────┼─────────────────────────────────────────────┼───────────────────────────────────────┤
│ **PHASE 4**│ **Bộ Nghiệm Thu Tự Động & Chống Hỗn Loạn**  │ • tests/fixtures/usage-generator.ts   │
│           │ - Kiểm thử tự động phủ kín AC-1 đến AC-6   │ • tests/e2e/usage-acceptance.test.ts  │
│           │ - Chaos Tests: Socket Abort, Div-by-Zero,   │ • tests/e2e/usage-chaos.test.ts       │
│           │   Concurrency Stress 50 workers             │                                       │
│           │ - Build & Typecheck Verification toàn repo  │                                       │
└───────────┴─────────────────────────────────────────────┴───────────────────────────────────────┘
```

---

## TIÊU CHÍ NGHIỆM THU TỔNG THỂ (ACCEPTANCE CRITERIA MAPPING)

- [x] **AC-1 (Sidebar & Obsidian UI Render):** Tab "Usage & Token Analytics" xuất hiện trên Sidebar với icon BarChart3, mở màn hình với dark theme `#090B0F`, render $\le 30\text{ms}$.
- [x] **AC-2 (Single-Pass Comparative KPI Summary):** Query `GET /api/admin/usage/summary?range=7d&compare=true` thực thi $\le 25\text{ms}$, hiển thị đúng 8 KPI Cards kèm tỷ lệ Delta $\Delta\%$.
- [x] **AC-3 (Pure React SVG Stacked Bar Chart):** Biểu đồ responsive `viewBox="0 0 1000 320"`, 3 màu Prompt (Cyan), CoT (Purple), Completion (Emerald), hover tooltip chi tiết.
- [x] **AC-4 (OLAP Cross-Tabulation Pivot Grid & Drawer):** Xoay trục động 4 cặp chiều, tìm kiếm/sắp xếp, click mở Slide-out Drawer xem 25 giao dịch chi tiết.
- [x] **AC-5 (Streaming CSV/JSON Export O(1) RAM):** Xuất $> 50.000$ dòng với Heap Delta $< 20\text{MB}$, socket abort giải phóng cursor trong $\le 50\text{ms}$.
- [x] **AC-6 (3-Tier Pricing & Micro-Cent Arithmetic):** Khớp tiền tố hoặc fallback an toàn, tính toán cấp micro-cent ($10^{-6}$ USD) chống trôi IEEE-754.

---

## MA TRẬN TỆP TIN TRIỂN KHAI

### Tệp Tin Sửa Đổi (Modified Files):
1. `apps/gateway/src/db/schema.ts` — Thêm Covering Index `idx_request_metrics_usage_analytics`.
2. `apps/gateway/src/db/migrate.ts` — Đăng ký migration script cho index mới.
3. `apps/gateway/src/api/server.ts` — Đăng ký `registerAdminUsageRoutes(fastify)`.
4. `apps/web/src/lib/api-client.ts` — Thêm các methods gọi API Usage.
5. `apps/web/src/components/layout/Sidebar.tsx` — Thêm tab `usage` và icon `BarChart3`.
6. `apps/web/src/App.tsx` — Định tuyến `activeTab === "usage"`.

### Tệp Tin Tạo Mới (Created Files):
1. `apps/gateway/src/telemetry/model-pricing.ts`
2. `apps/gateway/src/telemetry/usage-analytics.ts`
3. `apps/gateway/src/api/routes/admin-usage.ts`
4. `apps/web/src/components/usage/UsageStackedBarChart.tsx`
5. `apps/web/src/components/usage/UsageKpiCard.tsx`
6. `apps/web/src/components/usage/UsagePivotGrid.tsx`
7. `apps/web/src/components/usage/UsageLedgerDrawer.tsx`
8. `apps/web/src/components/usage/UsageFilterToolbar.tsx`
9. `apps/web/src/views/UsageAnalyticsView.tsx`
10. `tests/fixtures/usage-dataset-generator.ts`
11. `tests/unit/model-pricing.test.ts`
12. `tests/integration/admin-usage.test.ts`
13. `tests/e2e/usage-acceptance.test.ts`
14. `tests/e2e/usage-chaos.test.ts`
