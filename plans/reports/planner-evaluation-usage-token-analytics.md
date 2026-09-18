# BÁO CÁO THẨM ĐỊNH VÀ ĐÁNH GIÁ KIẾN TRÚC ĐA PHƯƠNG ÁN (BEST-OF-5)
## Đề án: Phân Hệ Quản Trị Tiêu Thụ Token, Chi Phí & Tình Báo Dữ Liệu Đa Chiều (Usage & Token Analytics Dashboard)

**Hội đồng Thẩm định:** Hội đồng Kiến trúc Hệ thống `cli-to-api`  
**Chủ tọa Thẩm định:** **Kongming — Lead Architectural Verifier** (`Ultra Verifier Mode`)  
**Dữ liệu Đối chiếu Phê duyệt:** `plans/reports/brainstorm-260918-1525-usage-token-analytics-dashboard.md`  
**Thư mục Đích Chuẩn hóa:** `plans/260918-1530-usage-and-token-analytics/`  
**Hệ Quy Chiếu:** 4-Dimensional Planning Rubric (Thang điểm 1-20 mỗi tiêu chí, Tổng điểm /80)

---

## 1. BẢNG CHẤM ĐIỂM CHI TIẾT 5 ỨNG VIÊN (SCORECARD TABLE)

### Khung Tiêu Chuẩn Thẩm Định 4 Chiều (4-Dimensional Planning Rubric):
1. **Completeness Against Contract (1-20):** Mức độ bao phủ trọn vẹn Hợp đồng Đặc tả: Phân rã 4 phân khu chức năng giao diện, bao phủ 100% tiêu chí AC-1 đến AC-6, không cài đặt thư viện ngoài (**Zero New NPM Dependencies**), biểu đồ cột chồng thuần **Pure React SVG (`viewBox="0 0 1000 320"`)**, số học tiền tệ vi mô **Micro-Cent ($10^{-6}$ USD)** chống trôi IEEE-754, và xuất dữ liệu streaming $O(1)$ RAM an toàn khi ngắt kết nối socket ($\le 50\text{ms}$).
2. **Technical Feasibility & Architecture Actionability (1-20):** Tính khả thi kỹ thuật, độ sắc nét và tính liền mạch trong thi công: Đường dẫn tệp tin chính xác tuyệt đối với cấu trúc monorepo `apps/gateway` và `apps/web`; cơ chế DDL an toàn trong SQLite WAL mode (`PRAGMA busy_timeout = 5000`); kế hoạch quét chỉ mục phủ **Covering Index Scan** ($\le 25\text{ms}$ / $100.000$ dòng); Fastify route registration và lifecycle hooks; triệt tiêu vòng lặp phụ thuộc (circular dependency); không làm suy thoái luồng proxy thời gian thực (Zero Ingress Hot-Path Degradation).
3. **Sharpness of Test Commands & Acceptance Criteria (1-20):** Độ sắc bén, định lượng và khả năng thực thi của các lệnh test Vitest (`npx vitest run ...`); kịch bản nghiệm thu kiểm thử độc lập cho từng mã AC-1 đến AC-6; các bài test hỗn loạn (Chaos/Stress testing: socket abort giữa chừng, chia cho 0 khi tính $\Delta\%$, 50 workers đọc/ghi đồng thời không dính `SQLITE_BUSY`).
4. **File Ownership & Dependency Ordering (1-20):** Phân định rạch ròi quyền sở hữu tệp (`CREATED`, `MODIFIED`, `DELETED`); tính độc lập giữa các phase; trật tự phụ thuộc một chiều bất biến từ Gốc rễ Dữ liệu $\rightarrow$ Động cơ Logic $\rightarrow$ Giao diện Trình diễn $\rightarrow$ Bộ Nghiệm thu Tự động; loại bỏ triệt để hiện tượng xáo trộn tệp tin qua nhiều phase (Zero Cross-Phase File Churn).

---

### Bảng Xếp Hạng Toàn Diện & Điểm Số Chi Tiết (Evaluation Scorecard)

| Hạng | Mã Ứng Viên | Định Vị Phương Pháp Luận & Trọng Tâm Kế Hoạch | C1: Hợp Đồng (/20) | C2: Khả Thi (/20) | C3: Kiểm Thử (/20) | C4: Phân Rã (/20) | Tổng Điểm (/80) | Phán Quyết Của Kongming |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| 🥇 | **Candidate Plan B** *(Candidate 5)* | **Strict Sequential Phased Delivery Plan**<br>*(Triển khai tuần tự gốc rễ: Schema DB & Index $\rightarrow$ Engine & REST API $\rightarrow$ Pure SVG UI & View $\rightarrow$ E2E & Benchmark; Zero Cross-Phase File Churn)* | **20** | **20** | **19** | **20** | **79 / 80** | **ĐẮC CỬ QUÁN QUÂN (WINNING PLAN)** |
| 🥈 | **Candidate Plan D** *(Candidate 3)* | **Test-Driven Development (TDD) & Chaos Resilience**<br>*(TDD Red-Green-Refactor: Synthetic Fixture Generator 10k-50k rows, kiểm thử ngắt socket CSV $\le 50\text{ms}$, chia cho 0 Delta %, 50 concurrent stress requests)* | **20** | **19** | **20** | **18** | **77 / 80** | **Á Quân 1 (Hợp nhất Chaos Tests)** |
| 🥉 | **Candidate Plan A** *(Candidate 2)* | **Vertical Feature Slice Driven Plan**<br>*(Tracer Bullets: Cắt dọc E2E qua từng tính năng HUD $\rightarrow$ Time-Series SVG $\rightarrow$ Pivot Matrix $\rightarrow$ Export & Nav; demo sớm nhưng xáo trộn file lõi qua 4 phase)* | **19** | **18** | **19** | **17** | **73 / 80** | **Á Quân 2 (Hợp nhất UX Tracer Flow)** |
| 4th | **Candidate Plan C** *(Candidate 1)* | **Production Reliability & Resilient Rollout Plan**<br>*(Tập trung an toàn sản xuất, O(1) RAM streaming, non-degradation proxy; cấu trúc tuần tự 4 phases nhưng thiếu kịch bản biên sâu)* | **18** | **18** | **17** | **18** | **71 / 80** | **Hạng 4 (Tham chiếu)** |
| 5th | **Candidate Plan E** *(Candidate 4)* | **Domain-Driven Modular & Clean Separation Plan**<br>*(Tách biệt Domain Telemetry $\rightarrow$ Transport $\rightarrow$ Presentation; quá nhiều tầng DTO/Value Object trung gian, rườm rà với gateway SQLite)* | **17** | **17** | **16** | **18** | **68 / 80** | **Bị Loại (Over-engineering)** |

---

## 2. PHÂN TÍCH ƯU VÀ NHƯỢC ĐIỂM TỪNG ỨNG VIÊN (GRANULAR CRITIQUE)

---

### 2.1. Candidate Plan B (Candidate 5) — Strict Sequential Phased Delivery Plan (Điểm: 79/80)
*Tham chiếu: `plans/reports/plan-candidate-5-strict-sequential-phased-delivery.md`*

* **Ưu điểm vượt trội (Key Strengths):**
  1. **Trật tự Kế thừa Bất biến & Không Xáo Trộn Tệp Tin (Zero Cross-Phase Churn):** Khác với mô hình lát cắt dọc làm thay đổi `usage-analytics.ts`, `admin-usage.ts` và `UsageAnalyticsView.tsx` lặp đi lặp lại qua cả 4 phases, Candidate B thiết lập ranh giới phân công rạch ròi: Mỗi tệp tin chỉ được tạo mới hoặc sửa đổi tại đúng **MỘT Phase duy nhất**.
  2. **Kiến Trúc Hạ Tầng Vững Như Bàn Thạch (Rock-Solid Infrastructure Gate):** Phase 1 hoàn thiện Covering Index và Động cơ định giá 3 tầng; Phase 2 hoàn thành toàn bộ 6 REST API endpoints và SDK Client frontend. Đến Phase 3 khi phát triển giao diện người dùng Pure React SVG, các kỹ sư UI có sẵn 100% backend endpoints hoạt động thực tế để liên kết, loại bỏ nhu cầu viết mock server tạm thời.
  3. **Bao Phủ 100% Hợp Đồng Đặc Tả:** Hiện thực hóa đầy đủ biểu đồ cột chồng Pure React SVG co giãn vector `viewBox="0 0 1000 320"`, 3 dải màu Cyan/Purple/Emerald, công thức tính vận tốc token loại trừ TTFT, Dynamic Whitelist cho 4 cặp trục OLAP pivot ngăn chặn SQL Injection, và bộ dọn dẹp socket disconnect.
  4. **Kiểm Soát Bộ Nhớ Nghiêm Ngặt:** Luồng xuất CSV/JSON sử dụng iterator SQLite phát trực tiếp xuống Node.js socket, kiểm soát độ tăng trưởng heap RSS delta $< 20\text{MB}$ ngay cả khi xuất trên $80.000$ dòng.
* **Nhược điểm & Điểm mù (Identified Gaps):**
  - Mặc dù có các bài test integration và benchmark, Candidate B chưa thiết kế sẵn một module Factory sinh dữ liệu giả lập có kiểm soát (Synthetic Fixture Generator) chuyên biệt như Candidate D, mà dựa vào script chèn dữ liệu trực tiếp trong file test.
* **Giả định Chịu Tải Chính (Load-Bearing Assumption):**
  - Thời gian truy vấn gom nhóm Single-Pass trên chỉ mục phủ `idx_request_metrics_usage_analytics` luôn hoàn tất trong $\le 25\text{ms}$ khi kích thước bảng đạt $100.000$ dòng.
* **Điều kiện Sụp đổ Đầu tiên (First Failure Condition):**
  - Nếu tầng backend (Phase 2) phát sinh lỗi trong cơ chế serialize stream JSON NDJSON khiến socket bị nghẽn, giao diện người dùng ở Phase 3 sẽ không nhận được dữ liệu để render ban đầu.

---

### 2.2. Candidate Plan D (Candidate 3) — Test-Driven Development (TDD) & Chaos Resilience Plan (Điểm: 77/80)
*Tham chiếu: `plans/reports/plan-candidate-3-tdd-chaos-resilience-usage.md`*

* **Ưu điểm vượt trội (Key Strengths):**
  1. **Tư Duy Phòng Vệ Khủng Hoảng Xuất Sắc Nhất (Top-Tier Chaos Resilience):** Là bản kế hoạch duy nhất nhận diện và lập trình sẵn các bài test hỗn loạn khắc nghiệt:
     - *Division-by-Zero Test:* Xử lý an toàn khi chu kỳ trước $T-1$ có 0 request/token, triệt tiêu hoàn toàn lỗi `NaN%` hay `Infinity%`.
     - *Hard Socket Abort Test:* Ngắt socket HTTP ở 10% tiến trình xuất CSV 50.000 dòng, đo thời gian giải phóng cursor $\le 50\text{ms}$.
     - *50 Concurrent Contention Stress:* 25 luồng ghi telemetry đồng thời với 25 luồng query OLAP, khẳng định 0 lỗi `SQLITE_BUSY`.
  2. **Bộ Sinh Dữ Liệu Chuyên Biệt (Fixture Factory First):** Xây dựng `tests/fixtures/usage-dataset-generator.ts` cung cấp dữ liệu giả lập ngẫu nhiên có kiểm soát từ $10.000$ đến $100.000$ bản ghi, phân bổ chuẩn xác status code và token CoT.
  3. **Chu Trình Red-Green-Refactor Minh Bạch:** Viết test assertion thất bại trước khi viết mã nguồn nghiệp vụ, bảo đảm mọi dòng code đều có test bảo vệ.
* **Nhược điểm & Điểm mù (Identified Gaps):**
  - Khối lượng công việc chuẩn bị fixture và viết toàn bộ test RED ở Phase 1-2 khá nặng, có thể làm chậm tiến độ bàn giao các thành phần giao diện hữu hình nếu thời gian thi công bị thắt chặt.
  - Phân bổ tệp tin kiểm thử thành 6 files khác nhau gây phân tán nhẹ trong cấu trúc thư mục test.
* **Giả định Chịu Tải Chính (Load-Bearing Assumption):**
  - Bộ sinh fixture có thể khởi tạo $10.000$ bản ghi vào database in-memory/file trong thời gian dưới $500\text{ms}$ để không làm chậm chu kỳ chạy unit test cục bộ.
* **Điều kiện Sụp đổ Đầu tiên (First Failure Condition):**
  - Sự kiện `req.raw.on("close")` nếu không được kích hoạt đúng lúc trong môi trường proxy trung gian (Reverse Proxy/Cloudflare) có thể dẫn đến việc kiểm thử ngắt socket không mô phỏng đúng 100% môi trường thực tế.

---

### 2.3. Candidate Plan A (Candidate 2) — Vertical Feature Slice Driven Plan (Điểm: 73/80)
*Tham chiếu: `plans/reports/planner-candidate-2-vertical-feature-slice-usage.md`*

* **Ưu điểm vượt trội (Key Strengths):**
  1. **Khả Năng Kiểm Chứng Nghiệp Vụ Sớm (Fast Value Feedback Loop):** Bằng việc chia theo 4 lát cắt dọc E2E (KPI HUD $\rightarrow$ Stacked Bar Chart $\rightarrow$ OLAP Pivot $\rightarrow$ Streaming Export), ngay từ cuối Phase 1 nhóm phát triển đã có thể chạy demo một màn hình có 8 thẻ KPI hiển thị số liệu thực từ SQLite.
  2. **Bám Sát Trải Nghiệm Người Dùng (UX-Centric):** Các tương tác tooltip, bộ lọc ngày preset (Today, 7D, 30D, Month) và ngăn kéo trượt Slide-out Drawer được trau chuốt chi tiết.
* **Nhược điểm & Điểm mù (Identified Gaps):**
  - **Cross-Phase File Churn Nghiêm Trọng:** Các tệp tin cốt lõi như `usage-analytics.ts`, `admin-usage.ts`, `api-client.ts`, và `UsageAnalyticsView.tsx` bị sửa đi sửa lại qua cả 4 phases. Điều này tạo ra rủi ro xung đột mã nguồn (merge conflicts) và phá vỡ nguyên tắc đóng gói module.
  - **Trì Hoãn Tích Hợp Điều Hướng Đến Phase 4:** Tab "Usage & Token Analytics" trên thanh Sidebar chỉ được kích hoạt ở Phase 4, khiến việc kiểm thử thủ công qua UI ở Phase 1, 2, 3 phải dùng đường dẫn URL trực tiếp hoặc ép trạng thái React state.
* **Giả định Chịu Tải Chính (Load-Bearing Assumption):**
  - Việc mở rộng dần dần các câu lệnh SQL trong `usage-analytics.ts` qua từng phase không làm vỡ các query đã viết ở phase trước đó.
* **Điều kiện Sụp đổ Đầu tiên (First Failure Condition):**
  - Việc cấu trúc lại component `UsageAnalyticsView.tsx` ở Phase 3 để nhúng Pivot Grid và Drawer có thể làm tái phát lỗi giật lag render đã được tối ưu ở Phase 1 và 2.

---

### 2.4. Candidate Plan C (Candidate 1) — Production Reliability & Resilient Rollout Plan (Điểm: 71/80)
* **Ưu điểm vượt trội (Key Strengths):**
  1. Tư duy ưu tiên tính ổn định môi trường sản xuất (Production Reliability First), bảo vệ nghiêm ngặt luồng proxy thời gian thực không bị ảnh hưởng bởi truy vấn phân tích.
  2. Triển khai tuần tự chuẩn tắc 4 phases kỹ thuật, kiểm soát tốt bộ nhớ $O(1)$ khi xuất file CSV.
* **Nhược điểm & Điểm mù (Identified Gaps):**
  - Thiếu chiều sâu trong các kịch bản kiểm thử điều kiện biên (chưa có kịch bản định lượng cho socket abort $\le 50\text{ms}$ hay chia cho 0).
  - Chưa phân tích chi tiết cơ chế bảo vệ Dynamic Dimension Whitelist trong câu lệnh SQL Pivot, tiềm ẩn rủi ro nếu người dùng truyền tên cột tùy ý.
* **Tổng kết:** Đạt yêu cầu cơ bản nhưng thiếu tính đột phá và sắc bén kỹ thuật.

---

### 2.5. Candidate Plan E (Candidate 4) — Domain-Driven Modular & Clean Separation Plan (Điểm: 68/80)
* **Ưu điểm vượt trội (Key Strengths):**
  1. Tách biệt kiến trúc tầng miền (Domain Telemetry) rất bài bản, phân định ranh giới rõ ràng giữa Entities, Aggregates và Transport DTOs.
* **Nhược điểm & Điểm mù (Identified Gaps):**
  - **Over-Engineering Không Cần Thiết:** Việc tạo ra quá nhiều lớp trung gian (Value Objects cho Micro-Cent, DTO Mappers, Repository Interfaces) là không phù hợp với đặc thù của một Gateway AI hiệu năng cao cục bộ chạy SQLite WAL nhúng.
  - Bộ kiểm thử tập trung quá nhiều vào việc test chuyển đổi DTO thuần túy, lơ là các bài kiểm tra áp lực I/O đĩa và khóa WAL thực tế.
* **Tổng kết:** Bị loại do độ phức tạp không tương xứng với bài toán.

---

## 3. TUYÊN BỐ KẾ HOẠCH QUÁN QUÂN (WINNING PLAN DECLARATION)

### Phán Quyết Của Kongming — Lead Architectural Verifier:
> **KẾ HOẠCH QUÁN QUÂN (WINNING PLAN): CANDIDATE PLAN B (CANDIDATE 5)**  
> *Định danh phương pháp luận: "Strict Sequential Phased Delivery Plan"*  
> **Tổng điểm thẩm định: 79 / 80**

### Lý Do Đắc Cử:
1. **Kiến trúc Kế thừa Bất biến (Strict Sequential Dependency):** Phân chia 4 phases với ranh giới trách nhiệm tuyệt đối, loại bỏ hoàn toàn hiện tượng sửa đổi phân tán trên cùng một tệp tin qua nhiều phase. Tầng dưới làm nền móng vững chắc cho tầng trên.
2. **Khả Thi Kỹ Thuật Tuyệt Đối (Zero Speculative Jumps):** Hoàn thiện 100% backend và API trước khi bước vào xây dựng giao diện người dùng Pure React SVG, giúp quá trình phát triển UI diễn ra mượt mà trên dữ liệu thật.
3. **Bao Phủ Toàn Diện Hợp Đồng Đặc Tả:** Thỏa mãn xuất sắc tất cả các ràng buộc cốt tử: Zero New NPM Dependencies, SQLite WAL Covering Index Scan $\le 25\text{ms}$, Micro-Cent Precision $10^{-6}$ USD, và Streaming Export an toàn ngắt kết nối.

### Ma Trận Tổng Hợp Kongming (Kongming Synthesis Matrix):
Để đưa Kế hoạch Quán quân đạt đến độ hoàn hảo tối cao (**80/80**), Kongming chỉ đạo tích hợp ngay các tinh hoa từ các kế hoạch Á quân vào bản kế hoạch thi công chính thức:
- **Hợp nhất từ Candidate D (TDD & Chaos):**
  - Nhập khẩu module **Synthetic Fixture Generator** (`tests/fixtures/usage-dataset-generator.ts`) để tạo bộ dữ liệu chuẩn $10.000$ - $50.000$ bản ghi phục vụ benchmark.
  - Bổ sung bài kiểm thử hỗn loạn **Socket Abort Latency ($\le 50\text{ms}$)** và **Division-by-Zero Protection** vào suite kiểm thử nghiệm thu.
  - Bổ sung kịch bản kiểm thử áp lực **50 Concurrent Contention Requests** đảm bảo 0 lỗi `SQLITE_BUSY`.
- **Hợp nhất từ Candidate A (Vertical UX):**
  - Chuẩn hóa bộ lọc thời gian 4 presets (**Today, 7D, 30D, Month**) và cơ chế **Debounced Polling (Auto-Refresh 30s)** với visual pulse indicator trên giao diện Cyberdeck.

---

## 4. KHUYẾN NGHỊ CẤU TRÚC PHÂN RÃ CHUẨN (STANDARD PHASE SPECIFICATION)

Kongming khuyến nghị cấu trúc chi tiết chuẩn mực cho thư mục kế hoạch thi công `plans/260918-1530-usage-and-token-analytics/` gồm 1 tệp tổng quan và 4 tệp phân rã phases độc lập:

```
plans/260918-1530-usage-and-token-analytics/
├── plan.md
├── phase-01-schema-covering-index-and-pricing-engine.md
├── phase-02-usage-analytics-engine-and-admin-api-routes.md
├── phase-03-pure-react-svg-charts-and-cyberdeck-usage-view.md
└── phase-04-verification-suite-and-acceptance-tests.md
```

---

### 4.1. Cấu Trúc Nội Dung Tệp `plan.md` (Master Implementation Blueprint)

```markdown
# PHÂN HỆ QUẢN TRỊ TIÊU THỤ TOKEN, CHI PHÍ & TÌNH BÁO DỮ LIỆU ĐA CHIỀU (USAGE & TOKEN ANALYTICS)
## Master Implementation Plan — Strict Sequential Phased Delivery (Kongming Synthesis)

- **Mục tiêu tổng quát:** Xây dựng màn hình Usage & Token Analytics hoàn chỉnh cho `cli-to-api`, bóc tách 3 dòng token (Prompt, Reasoning CoT, Completion), ước lượng chi phí Micro-Cent ($10^{-6}$ USD), so sánh chu kỳ Single-Pass SQL Delta $\Delta\%$, ma trận xoay chiều OLAP Pivot Grid, ngăn kéo Drill-Down Drawer, xuất streaming CSV/JSON O(1) RAM, và biểu đồ cột chồng Pure React SVG (Zero New Dependencies).
- **Phân rã 4 Giai đoạn Thi công:**
  1. Phase 1: Database Covering Index, Schema Migration & Model Pricing Engine.
  2. Phase 2: Usage Analytics OLAP Engine, Safe Streaming Iterator & Fastify Admin Routes.
  3. Phase 3: Pure React SVG Cyberdeck Components, Obsidian View & Navigation Wiring.
  4. Phase 4: Full Acceptance Suite (AC-1..AC-6), Chaos Resilience & Production Readiness.
- **Ma trận Quản trị Tệp tin Tác động Toàn diện:**
  - 13 tệp tạo mới (CREATED), 6 tệp sửa đổi (MODIFIED), 0 tệp bị xóa (DELETED).
- **Bảng Ánh xạ 100% Tiêu chí Nghiệm thu Đặc tả (AC-1 đến AC-6).**
- **Quy chuẩn Lệnh Kiểm thử Toàn dự án.**
```

---

### 4.2. Cấu Trúc Chi Tiết Tệp `phase-01-schema-covering-index-and-pricing-engine.md`

```markdown
# Phase 1: Database Covering Index & Pricing Engine Module

## 1. Mục Tiêu Trọng Tâm
Thiết lập chỉ mục phủ composite chuyên dụng trên SQLite WAL đảm bảo hiệu năng quét B-Tree sub-25ms; xây dựng Động cơ Định giá Token 3 tầng (Prefix -> Heuristic Tier -> Default Fallback) với độ chính xác Micro-Cent ($10^{-6}$ USD).

## 2. Danh Mục Tác Vụ Cụ Thể (Concrete Tasks)
- Task 1.1: Bổ sung chỉ mục phủ composite `usageAnalyticsCoveringIndex` trong `apps/gateway/src/db/schema.ts` trên các trường `(createdAt, adapterId, modelExecuted, accountId, statusCode)`.
- Task 1.2: Thêm câu lệnh DDL an toàn `CREATE INDEX IF NOT EXISTS idx_request_metrics_usage_analytics` trong hàm `runMigrations()` tại `apps/gateway/src/db/migrate.ts`.
- Task 1.3: Tạo mới module `apps/gateway/src/telemetry/model-pricing.ts`:
  * Khai báo bảng giá chuẩn `MODEL_PRICING_TABLE` (Claude 3.7/3.5, GPT-4o, o1, o3-mini, DeepSeek-Reasoner).
  * Khai báo bảng dự phòng `TIER_FALLBACK_TABLE` (`xhigh`, `high`, `medium`, `low`, `default`).
  * Hàm nội suy 3 tầng `resolveTokenRates(modelName?: string | null): TokenRates`.
  * Hàm tính toán số học Micro-Cent `calculateMicroCost(prompt, completion, reasoning, rates): number`.
  * Hàm định dạng chuỗi hiển thị `formatCostUsd(cost: number): string` ($0.0001 precision).
- Task 1.4: Tạo mới bộ unit test `tests/unit/model-pricing.test.ts` kiểm thử biểu giá, fallback, và kiểm chứng `EXPLAIN QUERY PLAN` sử dụng `USING INDEX idx_request_metrics_usage_analytics`.

## 3. File Ownership Matrix (Phase 1)
- `apps/gateway/src/db/schema.ts` (MODIFIED)
- `apps/gateway/src/db/migrate.ts` (MODIFIED)
- `apps/gateway/src/telemetry/model-pricing.ts` (CREATED)
- `tests/unit/model-pricing.test.ts` (CREATED)

## 4. Verification Gate 1
- Lệnh 1: `npx tsx apps/gateway/src/db/migrate.ts` (Migration thành công, không lỗi khóa).
- Lệnh 2: `npx vitest run tests/unit/model-pricing.test.ts` (100% assertions PASS).
```

---

### 4.3. Cấu Trúc Chi Tiết Tệp `phase-02-usage-analytics-engine-and-admin-api-routes.md`

```markdown
# Phase 2: Usage Analytics Engine & Fastify Admin API Routes

## 1. Mục Tiêu Trọng Tâm
Xây dựng động cơ tính toán OLAP Single-Pass so sánh chu kỳ ($T$ vs $T-1$), gom nhóm chuỗi thời gian Time-Series, ma trận xoay chiều OLAP Dynamic Pivot với cột Whitelist an toàn, xuất dữ liệu streaming CSV/JSON $O(1)$ RAM với bộ giải phóng cursor khi socket client abort trong $\le 50\text{ms}$; đăng ký 6 Fastify REST endpoints và mở rộng API Client SDK frontend.

## 2. Danh Mục Tác Vụ Cụ Thể (Concrete Tasks)
- Task 2.1: Tạo mới module `apps/gateway/src/telemetry/usage-analytics.ts`:
  * Phương thức `getComparativeSummary(startCurrent, endCurrent, compare)`: SQL Single-Pass với `SUM(CASE WHEN created_at BETWEEN ... THEN ... ELSE 0 END)` gom 2 chu kỳ trong một lần quét.
  * Hàm phòng vệ `calcDeltaPercent(cur, prev)` chặn cứng chia cho 0, triệt tiêu lỗi `NaN%`.
  * Phương thức `getTimeSeries(start, end, granularity)`: gom nhóm theo `%Y-%m-%d %H:00` hoặc `%Y-%m-%d`.
  * Phương thức `getPivotMatrix(start, end, rowDim, colDim, search)`: tính tốc độ sinh token loại trừ TTFT: `(completion + reasoning) / max((duration - ttft)/1000, 0.05)`, lọc qua Whitelist cột.
  * Phương thức `getDrillDownRecords(filters, limit, offset)`: lấy 25 metrics gần nhất cấu thành nên ô số liệu.
  * Phương thức `createCsvExportStream(start, end)`: `Readable` stream bọc `stmt.iterate()`, chuẩn RFC 4180.
  * Phương thức `createJsonExportStream(start, end)`: phát stream JSON mảng $O(1)$ memory.
  * Cơ chế ngắt an toàn: gọi `iterator.return?.()` khi socket phát sinh sự kiện `close` trong $\le 50\text{ms}$.
- Task 2.2: Tạo mới route Fastify `apps/gateway/src/api/routes/admin-usage.ts` xử lý 6 endpoints:
  * `GET /api/admin/usage/summary`
  * `GET /api/admin/usage/timeseries`
  * `GET /api/admin/usage/pivot`
  * `GET /api/admin/usage/records`
  * `GET /api/admin/usage/filters`
  * `GET /api/admin/usage/export`
- Task 2.3: Đăng ký `registerAdminUsageRoutes(fastify)` trong `apps/gateway/src/api/server.ts`.
- Task 2.4: Mở rộng SDK `apps/web/src/lib/api-client.ts`: khai báo interfaces và 6 methods gọi API usage.
- Task 2.5: Tạo mới integration test suite `tests/integration/admin-usage.test.ts`.

## 3. File Ownership Matrix (Phase 2)
- `apps/gateway/src/telemetry/usage-analytics.ts` (CREATED)
- `apps/gateway/src/api/routes/admin-usage.ts` (CREATED)
- `apps/gateway/src/api/server.ts` (MODIFIED)
- `apps/web/src/lib/api-client.ts` (MODIFIED)
- `tests/integration/admin-usage.test.ts` (CREATED)

## 4. Verification Gate 2
- Lệnh 1: `npx vitest run tests/integration/admin-usage.test.ts` (100% routes PASS, query SLA <= 25ms, socket abort release cursor <= 50ms).
```

---

### 4.4. Cấu Trúc Chi Tiết Tệp `phase-03-pure-react-svg-charts-and-cyberdeck-usage-view.md`

```markdown
# Phase 3: Pure React SVG Charts & Cyberdeck Usage View

## 1. Mục Tiêu Trọng Tâm
Xây dựng giao diện Màn hình Quản trị Tiêu thụ Token theo chuẩn Obsidian Cyberdeck (`#090B0F`), sử dụng 100% Pure React SVG (Zero New NPM Dependencies), tải trang ban đầu $\le 30\text{ms}$; tích hợp 8 thẻ KPI HUD với Delta badge & mini sparkline, biểu đồ cột chồng 3 màu, bảng Pivot xoay chiều động, ngăn kéo Slide-out Drawer, thanh công cụ bộ lọc dải thời gian và tích hợp mục điều hướng trên Sidebar.

## 2. Danh Mục Tác Vụ Cụ Thể (Concrete Tasks)
- Task 3.1: Tạo mới `apps/web/src/components/usage/UsageStackedBarChart.tsx`:
  * Co giãn vector đáp ứng theo `viewBox="0 0 1000 320" preserveAspectRatio="none"`.
  * Phân rã 3 dải màu: Prompt Tokens (Cyan `#06B6D4`), Reasoning CoT (Purple `#A855F7`), Completion (Emerald `#10B981`).
  * Đường lưới ngang mờ, nhãn Y-Axis dạng rút gọn (`100k`, `500k`, `1.5M`).
  * Hitbox hover tương tác hiển thị Tooltip nổi mượt mà, không giật DOM.
- Task 3.2: Tạo mới `apps/web/src/components/usage/UsageKpiCard.tsx`:
  * Hiển thị 8 chỉ số KPI, Delta Badge (màu xanh lá/đỏ ngữ nghĩa), nhúng mini SVG area sparkline dưới đáy thẻ.
- Task 3.3: Tạo mới `apps/web/src/components/usage/UsagePivotGrid.tsx`:
  * Hỗ trợ chuyển đổi nhanh 4 cặp trục xoay, tìm kiếm thời gian thực, sắp xếp nhiều cột, phân trang 20 dòng/trang, trigger sự kiện chọn dòng mở drawer.
- Task 3.4: Tạo mới `apps/web/src/components/usage/UsageLedgerDrawer.tsx`:
  * Ngăn kéo trượt từ cạnh phải (Slide-out Drawer) tải danh sách 25 requests gần nhất cấu thành nên ô số liệu với đầy đủ tokens, ttft, duration, status.
- Task 3.5: Tạo mới `apps/web/src/components/usage/UsageFilterToolbar.tsx`:
  * Nút preset dải thời gian (*Today, 7D, 30D, This Month*), Custom Date Picker, toggle Auto-Refresh (Polling 30s với xung nhịp visual pulse), nút Export CSV và JSON.
- Task 3.6: Tạo mới View trung tâm `apps/web/src/views/UsageAnalyticsView.tsx`:
  * Lắp ráp 4 phân khu chức năng, quản lý state bộ lọc dùng chung, fetch dữ liệu song song qua `Promise.all`.
- Task 3.7: Cập nhật điều hướng Sidebar & Router:
  * Sửa đổi `apps/web/src/components/layout/Sidebar.tsx`: bổ sung tab `"usage"` với icon `BarChart3` nằm giữa Fleet Radar và Live Inspector.
  * Sửa đổi `apps/web/src/App.tsx`: định tuyến `{activeTab === "usage" && <UsageAnalyticsView />}`.

## 3. File Ownership Matrix (Phase 3)
- `apps/web/src/components/usage/UsageStackedBarChart.tsx` (CREATED)
- `apps/web/src/components/usage/UsageKpiCard.tsx` (CREATED)
- `apps/web/src/components/usage/UsagePivotGrid.tsx` (CREATED)
- `apps/web/src/components/usage/UsageLedgerDrawer.tsx` (CREATED)
- `apps/web/src/components/usage/UsageFilterToolbar.tsx` (CREATED)
- `apps/web/src/views/UsageAnalyticsView.tsx` (CREATED)
- `apps/web/src/components/layout/Sidebar.tsx` (MODIFIED)
- `apps/web/src/App.tsx` (MODIFIED)

## 4. Verification Gate 3
- Lệnh 1: `pnpm --filter @cli-to-api/web build` (Hoàn tất không có TypeScript warning/error nào).
- Lệnh 2: Khởi chạy Web Console, kiểm chứng tab "Usage & Token Analytics" render $\le 30\text{ms}$, biểu đồ SVG hiển thị chuẩn 3 dải màu, click mở drawer mượt mà 60 FPS.
```

---

### 4.5. Cấu Trúc Chi Tiết Tệp `phase-04-verification-suite-and-acceptance-tests.md`

```markdown
# Phase 4: Full Verification Suite, Chaos Resilience & Production Readiness

## 1. Mục Tiêu Trọng Tâm
Thiết lập bộ kiểm thử nghiệm thu tự động hóa toàn diện từ đầu đến cuối (E2E) bảo đảm phủ kín 100% tiêu chí AC-1 đến AC-6 theo chuẩn Gherkin; kiểm thử áp lực hỗn loạn (Chaos/Stress Verification) với 50 requests đồng thời trên SQLite WAL; kiểm chứng không rò rỉ bộ nhớ khi xuất dữ liệu lớn ($O(1)$ RAM Heap Delta $< 20\text{MB}$); bảo đảm 100% zero regression trên toàn bộ test suite hiện có của dự án.

## 2. Danh Mục Tác Vụ Cụ Thể (Concrete Tasks)
- Task 4.1: Tạo mới module sinh dữ liệu giả lập `tests/fixtures/usage-dataset-generator.ts`:
  * Cung cấp factory seed ngẫu nhiên có kiểm soát từ $10.000$ đến $50.000$ bản ghi `request_metrics` trải dài trên 14-30 ngày với đa dạng models, status codes và token CoT.
- Task 4.2: Tạo mới E2E Acceptance Test Suite `tests/e2e/usage-acceptance.test.ts`:
  * AC-1: Kiểm chứng Sidebar Tab vị trí index 5, icon `BarChart3`, chuyển tab render `UsageAnalyticsView` nền Obsidian `#090B0F` trong $\le 30\text{ms}$.
  * AC-2: Kiểm chứng Single-Pass SQL gom nhóm 10.000 bản ghi, kiểm tra 8 KPIs và Delta $\Delta\%$, thời gian thực thi backend $\le 25\text{ms}$, 0 lỗi chia cho 0.
  * AC-3: Kiểm chứng biểu đồ Pure React SVG responsive `viewBox="0 0 1000 320"`, 3 dải màu Cyan/Purple/Emerald, Zero New NPM Dependencies, hover tooltip.
  * AC-4: Kiểm chứng ma trận xoay chiều OLAP 4 cặp trục, click mở Drawer tải đúng 25 records chi tiết.
  * AC-5: Kiểm chứng xuất streaming RFC 4180 CSV và JSON, RSS Heap Delta $\le 20\text{MB}$ trên $80.000$ dòng.
  * AC-6: Kiểm chứng bảng giá 3 tầng (Claude 3.7 Sonnet, GPT-4o, o1, fallback) và chuẩn số học Micro-Cent ($10^{-6}$ USD).
- Task 4.3: Tạo mới Chaos & Performance Benchmark Suite `tests/e2e/usage-benchmark.test.ts`:
  * Benchmark thời gian truy vấn SQL backend trên $10.000$ dòng $\le 25\text{ms}$.
  * Benchmark ngắt kết nối socket client đột ngột khi đang stream CSV, khẳng định giải phóng cursor trong $\le 50\text{ms}$.
  * Kiểm thử áp lực tranh chấp: 50 requests đồng thời (25 telemetry write + 25 usage read) không phát sinh lỗi `SQLITE_BUSY`.
- Task 4.4: Tạo mới nhật ký hoàn thiện `plans/journals/2026-09-18-usage-token-analytics-completion.md` ghi nhận toàn bộ kết quả đo kiểm.

## 3. File Ownership Matrix (Phase 4)
- `tests/fixtures/usage-dataset-generator.ts` (CREATED)
- `tests/e2e/usage-acceptance.test.ts` (CREATED)
- `tests/e2e/usage-benchmark.test.ts` (CREATED)
- `plans/journals/2026-09-18-usage-token-analytics-completion.md` (CREATED)

## 4. Verification Gate 4 (Toàn Dự Án Sẵn Sàng Bàn Giao)
- Lệnh 1: `npx vitest run tests/e2e/usage-acceptance.test.ts` (100% kịch bản AC-1..AC-6 PASS).
- Lệnh 2: `npx vitest run tests/e2e/usage-benchmark.test.ts --testTimeout=60000` (PASS benchmark SLA).
- Lệnh 3: `npm run test` (100% test suites toàn dự án PASS, khẳng định ZERO REGRESSION).
```

---

## 5. KẾT LUẬN & CHỈ ĐẠO BƯỚC TIẾP THEO

Báo cáo thẩm định kiến trúc độc lập này đã hoàn thành việc đánh giá khách quan 5 ứng viên theo hệ thống rubric 4 chiều nghiêm ngặt. **Candidate Plan B (Candidate 5)** với phương pháp luận **Strict Sequential Phased Delivery Plan**, sau khi dung nạp toàn diện các rào chắn kiểm thử hỗn loạn từ Candidate D và chi tiết UX từ Candidate A, là bản kế hoạch thi công hoàn hảo nhất để hiện thực hóa phân hệ **Usage & Token Analytics Dashboard** cho `cli-to-api`.

Hội đồng Thẩm định do **Kongming** chủ tọa phê chuẩn thông qua đề án này và sẵn sàng chuyển giao sang bước sinh mã kế hoạch thi công chi tiết vào thư mục đích `plans/260918-1530-usage-and-token-analytics/`.
