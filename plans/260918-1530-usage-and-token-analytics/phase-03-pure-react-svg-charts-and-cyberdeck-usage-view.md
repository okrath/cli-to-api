# Phase 03: Giao Diện Pure React SVG & Cyberdeck Usage View (Components & Dashboard View)

## MỤC TIÊU PHA
1. Xây dựng bộ component giao diện điều khiển Obsidian Cyberdeck chuẩn `ak-ui-ux-pro-max` sử dụng **Pure React SVG (Zero New Dependencies)** trong thư mục `apps/web/src/components/usage/`:
   - `UsageStackedBarChart.tsx`: Biểu đồ cột chồng SVG co giãn vector `viewBox="0 0 1000 320"`, 3 dải màu Prompt (Cyan), CoT (Purple), Completion (Emerald), tooltip hover mượt mà.
   - `UsageKpiCard.tsx`: Thẻ chỉ số kèm nhãn Delta $\Delta\%$ và SVG Area Sparkline mini.
   - `UsagePivotGrid.tsx`: Bảng ma trận xoay chiều OLAP đa trục với sorting, search, và drill-down trigger.
   - `UsageLedgerDrawer.tsx`: Ngăn trượt Slide-out từ cạnh phải hiển thị 25 giao dịch chi tiết.
   - `UsageFilterToolbar.tsx`: Thanh điều khiển chứa các nút preset (*Today, Yesterday, 7D, 30D, Month*), custom date picker, dimension selector, toggle Auto-Refresh (30s polling), và nút xuất dữ liệu CSV/JSON.
2. Xây dựng View trung tâm `apps/web/src/views/UsageAnalyticsView.tsx` kết nối toàn bộ các component trên với `apiClient`.
3. Cập nhật Sidebar navigation `apps/web/src/components/layout/Sidebar.tsx` (thêm tab `usage`, icon `BarChart3`) và tích hợp định tuyến trong `apps/web/src/App.tsx`.
4. Đảm bảo giao diện tải trang cực nhanh $\le 30\text{ms}$, không xung đột DOM, responsive mượt mà từ laptop đến màn hình siêu rộng.

---

## CÁC NHIỆM VỤ CHI TIẾT (CONCRETE TASKS)

### Nhiệm vụ 3.1: Hiện thực hóa `UsageKpiCard.tsx`
- Nhận props: `title`, `value`, `subValue`, `deltaPercent`, `deltaLabel`, `sparklineData`, `color`, `icon`.
- Render nhãn Delta badge: Màu xanh lục `text-emerald-400 bg-emerald-950/40 border-emerald-500/30` nếu tăng tích cực (hoặc giảm độ trễ), màu đỏ nếu tăng tỷ lệ lỗi.
- Render SVG Area Sparkline mini với `<path d="..." fill="url(#grad)" stroke="..." />`.

### Nhiệm vụ 3.2: Hiện thực hóa `UsageStackedBarChart.tsx` (Pure React SVG)
- Nhận props: `data: UsageTimeSeriesItem[]`, `granularity: 'hour' | 'day'`, `loading: boolean`.
- Tính toán tọa độ vector cột chuẩn xác theo tỷ lệ tổng token.
- Mỗi cột gồm 3 rect chồng lên nhau:
  * Prompt: `fill="#06B6D4"` (Cyan)
  * Reasoning CoT: `fill="#A855F7"` (Purple)
  * Completion: `fill="#10B981"` (Emerald)
- Tích hợp hovering tooltip hiển thị chính xác ngày giờ, số lượng từng dòng token và chi phí ước tính.

### Nhiệm vụ 3.3: Hiện thực hóa `UsageFilterToolbar.tsx`
- Preset buttons: `Today`, `Yesterday`, `7D`, `30D`, `This Month`, `All`.
- Custom date range input (Start Date - End Date).
- Toggle `Compare with previous period`.
- Toggle `Auto-Refresh (30s)`.
- Dropdown nút Export: `Export CSV` và `Export JSON`.

### Nhiệm vụ 3.4: Hiện thực hóa `UsagePivotGrid.tsx` & `UsageLedgerDrawer.tsx`
- Pivot Grid: Dropdown chọn 4 cặp trục xoay chiều (`Model × Adapter`, `Account × Model`, `Date × Model`, `Adapter × Status`).
- Cột bảng: Tên chiều, Requests, Prompt Tokens, Think Tokens (CoT), Completion Tokens, Total Tokens, Tokens/sec, Error Rate %, Action `[Chi tiết]`.
- Drill-Down Drawer: Bấm dòng mở Drawer bên phải chứa bảng 25 request gần nhất với timestamp, requestId, tokens, ttftMs, durationMs, status badge.

### Nhiệm vụ 3.5: Xây dựng `apps/web/src/views/UsageAnalyticsView.tsx`
- Kết nối `apiClient.getUsageSummary`, `getUsageTimeSeries`, `getUsagePivot`, `getUsageRecords`.
- State management gọn gàng, hỗ trợ retry và error toast.

### Nhiệm vụ 3.6: Cập nhật `Sidebar.tsx` và `App.tsx`
- Thêm `NavTab = "usage"`, label `"Usage & Token Analytics"`, icon `<BarChart3 className="w-4 h-4 text-brand" />`.
- Đặt tab `usage` ở vị trí giữa `radar` và `inspector`.
- Trong `App.tsx`: `{activeTab === "usage" && <UsageAnalyticsView />}`.

---

## TIÊU CHÍ NGHIỆM THU PHA 3
- [x] Tab `Usage & Token Analytics` xuất hiện trên Sidebar, nhấp vào chuyển tab tức thì không lag.
- [x] Biểu đồ cột chồng SVG render chuẩn vector, responsive và tooltip hoạt động mượt mà.
- [x] Ma trận Pivot Grid xoay trục thành công giữa các chế độ và mở được Drill-Down Drawer.
- [x] Lệnh build frontend `pnpm --filter @cli-to-api/web build` thành công 100% không có lỗi TypeScript hay Tailwind.
