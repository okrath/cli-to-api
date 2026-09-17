# BÁO CÁO THẨM ĐỊNH VÀ ĐÁNH GIÁ KIẾN TRÚC ĐA PHƯƠNG ÁN
## Đề án: Khai Tử Chat Playground & Triển Khai Obsidian Hybrid Telemetry & Fleet Radar (OHTFR)

**Đơn vị thẩm định:** Hội đồng Thẩm định Kiến trúc Độc lập `cli-to-api`  
**Chủ tọa Thẩm định:** Kongming — Lead Architectural Verifier (`Ultra Verifier Mode`)  
**Đối tượng thẩm định:** 5 Đề án Kế hoạch Thi công Ứng viên (Candidate Plan A, B, C, D, E)  
**Thư mục Đích Chuẩn hóa:** `plans/260917-1130-runtime-telemetry-and-fleet-radar/`  
**Hệ quy chiếu:** 4-Dimensional Planning Rubric (Thang điểm 1-20 mỗi chiều, tổng /80)

---

## 1. BẢNG XẾP HẠNG TOÀN DIỆN & TỔNG ĐIỂM ĐÁNH GIÁ (FULL RANKING TABLE)

### Khung Tiêu Chuẩn Thẩm Định 4 Chiều (4-Dimensional Planning Rubric):
1. **Completeness Against Contract (1-20):** Mức độ bao phủ toàn diện hợp đồng kiến trúc: đủ 4 phân khu chức năng (Top HUD & Diagnostic Probes, Slot Saturation & Cooldown Matrix, Live Execution Radar Plane 1, Token Accounting & Historical Ledger Plane 2); bóc tách 3 luồng token (Ingress Prompt / Thinking CoT / Egress Content); liên kết OS PID tức thời ($< 20\text{ms}$); vận tốc token sliding window ($tok/s$); vết điều hướng lỗi (Failover Trail Breadcrumbs); và công tắc hủy cưỡng chế khẩn cấp (Emergency Kill Switch $< 200\text{ms}$).
2. **Technical Feasibility & Architecture Actionability (1-20):** Tính khả thi kỹ thuật và độ sắc nét trong thi công: đường dẫn file chính xác; migration Drizzle ORM an toàn (chế độ non-destructive additive `ALTER TABLE` qua `PRAGMA table_info`); bảo đảm an toàn SQLite WAL (`busy_timeout = 5000`, `synchronous = NORMAL`, batching debounced $2000\text{ms} / 50$ items, triệt tiêu `SQLITE_BUSY`); Fastify lifecycle hooks (`onClose`, `/api/admin/events` SSE, `/api/admin/telemetry/*`); cấu trúc React Component chuẩn Cyberdeck `ak-ui-ux-pro-max`; và bảo đảm tuyệt đối zero hot-path overhead ($< 0.1\text{ms}$, adaptive multilingual heuristic $O(1)$ thay cho BPE WASM).
3. **Sharpness of Test Commands & Acceptance Criteria (1-20):** Lệnh kiểm thử thực thi được trong môi trường monorepo (`pnpm test`, `vitest run ...`, `pnpm --filter @cli-to-api/web build`); tiêu chí nghiệm thu định lượng theo chuẩn Gherkin (AC-1 đến AC-8); kiểm thử chịu tải đồng thời (50 concurrent streams không lock DB); và kiểm thử tiến trình zombie (mock hanging CLI, bắt PID và hủy cây tiến trình).
4. **File Ownership & Dependency Ordering (1-20):** Mức độ độc lập và phân rã pha; tính khả thi của tiến trình tuần tự hoặc song song; không có vòng lặp phụ thuộc (circular dependency); ma trận sở hữu file minh bạch (`MODIFIED`, `CREATED`, `DELETED`), tránh xung đột giữa các module.

---

### Bảng Xếp Hạng Toàn Diện (Ranking Table)

| Hạng | Ứng viên | Định vị Phương pháp Luận & Trọng tâm Kế hoạch | D1: Hợp đồng (/20) | D2: Khả thi (/20) | D3: Kiểm thử (/20) | D4: Phân rã (/20) | Tổng điểm (/80) | Phán Quyết |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| 🥇 | **Candidate Plan C** | **Production Reliability & Observability First Plan** *(Khả năng chống chịu sản xuất cao, bounded queue 5.000 items, Win32 Job Object containment, O(1) ring buffer, zero hot-path overhead, zero-regression E2E)* | **20** | **20** | **19** | **19** | **78 / 80** | **ĐẮC CỬ QUÁN QUÂN (WINNER)** |
| 🥈 | **Candidate Plan D** | **Strict Phased Sequential Rollout** *(Triển khai tuần tự hạ tầng trước: Schema DB -> Registry & PID -> Gateway SSE -> UI Console -> E2E Acceptance, bảng ánh xạ AC-1 đến AC-8 sắc bén)* | **19** | **19** | **18** | **19** | **75 / 80** | **Á Quân (Hợp nhất Ma trận AC)** |
| 🥉 | **Candidate Plan E** | **Test-Driven & Resilient Architecture Plan** *(TDD-First: Test harness SQLite & ring buffer viết trước logic, 50-concurrency chaos verification, runaway stream circuit breaker 16k tokens)* | **19** | **18** | **19** | **18** | **74 / 80** | **Top 3 (Hợp nhất Circuit Breaker)** |
| 4th | **Candidate Plan B** | **Vertical Feature Slice Planning** *(Tracer Bullet / Dual-Plane Slice: đi từng lát cắt dọc từ DB -> Supervisor -> Ingress -> UI -> Resilience, tiến độ thực dụng nhưng phân mảnh cross-cutting)* | **19** | **18** | **18** | **18** | **73 / 80** | **Top 4 (Tham chiếu)** |
| 5th | **Candidate Plan A** | **Subsystem-Isolated Parallel-Ready Plan** *(Phân rã tĩnh theo subsystem: Data -> Supervisor -> Ingress -> UI -> Test; rủi ro đứt gãy luồng dọc và phụ thuộc giả định giữa các subsystem)* | **17** | **16** | **15** | **17** | **65 / 80** | **Bị Loại (Lo ngại Tích hợp)** |

---

## 2. PHÂN TÍCH VÀ PHÊ BÌNH CHI TIẾT TỪNG ỨNG VIÊN (GRANULAR CRITIQUE)

---

### 2.1. Candidate Plan C: Production Reliability & Observability First Plan
*(Tham chiếu nguồn: `plans/260917-1200-obsidian-telemetry-and-fleet-radar/`)*

* **Điểm mạnh cốt lõi (Strengths):**
  1. **Độ sâu kiến trúc vượt trội nhất (Superior Architectural Depth):** Kế hoạch chi tiết với hơn 116 KB đặc tả kỹ thuật, không dừng lại ở mức mô tả chức năng mà cung cấp mã nguồn TypeScript, cấu trúc Drizzle schema, và layout React hoàn chỉnh cho cả 5 pha.
  2. **Cơ chế phòng vệ bộ nhớ & Bounded Queue:** Là kế hoạch duy nhất thiết kế cơ chế bảo vệ tràn RAM Node.js (`Bounded Memory Safeguard` tối đa 5.000 phần tử trong `TelemetryPersistQueue`). Nếu SQLite bị nghẽn bất thường, hệ thống tự động drop các bản ghi cũ nhất kèm cảnh báo log thay vì để sập process do `ERR_WORKER_OUT_OF_MEMORY`.
  3. **Quản lý tiến trình cấp Kernel chuẩn mực:** Chỉ rõ cơ chế đóng gói tiến trình con qua Win32 Job Object với cờ `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE (0x2000)` trên Windows và `setsid` Process Group trên POSIX, bảo đảm lệnh hủy `killProcessTree(pid)` quét sạch cây tiến trình con trong $< 200\text{ms}$.
  4. **Tách biệt vi mô TTFR vs TTFT:** Phân biệt rạch ròi giữa Time-To-First-Reasoning-Token (TTFR) khi khối `<think>` bắt đầu và Time-To-First-Content-Token (TTFT) khi nội dung thực xuất hiện.
  5. **Tối ưu hóa UI chống giật khung hình (Zero DOM Churn):** Thiết kế giao diện Obsidian Cyberdeck chuẩn `ak-ui-ux-pro-max` sử dụng cơ chế đệm React ref và throttle xung SSE $100\text{ms}$, triệt tiêu hiện tượng lag UI khi mô hình stream ở tốc độ $> 100\text{ tok/s}$.
* **Lỗ hổng & Điểm mù (Architectural Gaps):**
  * Chưa tích hợp sẵn cơ chế tự động ngắt mạch (Runaway Stream Circuit Breaker) khi một tiến trình CLI bị kẹt trong vòng lặp sinh token vô tận (ví dụ xả $> 16.384$ tokens) như Candidate E và B đã đề xuất.
  * Bảng ánh xạ tiêu chí nghiệm thu chưa được chuẩn hóa thành mã định danh trực diện AC-1 đến AC-8 như Candidate D.
* **Giả định chịu tải chính (Primary Load-Bearing Assumption):**
  * Tốc độ xả của hàng đợi `TelemetryPersistQueue` trong 1 transaction SQLite WAL luôn nhanh hơn tốc độ tích lũy của 50 stream đồng thời, bảo đảm kích thước hàng đợi không bao giờ chạm ngưỡng giới hạn 5.000 bản ghi.
* **Điều kiện sụp đổ đầu tiên (First Failure Condition):**
  * Nếu đĩa lưu trữ (Disk I/O) bị khóa cứng do tác vụ sao lưu hệ thống hoặc phần cứng gặp sự cố kéo dài quá `busy_timeout = 5000ms`, các lệnh flush batch sẽ thất bại liên tục, kích hoạt chính sách drop dữ liệu của hàng đợi bounded queue.

---

### 2.2. Candidate Plan D: Strict Phased Sequential Rollout
*(Tham chiếu nguồn: `plans/260917-1200-obsidian-telemetry-fleet-radar/`)*

* **Điểm mạnh cốt lõi (Strengths):**
  1. **Khung truy vết nghiệm thu hoàn hảo (AC-1 to AC-8 Traceability):** Candidate D xây dựng một bảng ánh xạ trực diện từ AC-1 đến AC-8 ngay trong `plan.md`, gắn chặt từng tiêu chí nghiệm thu với pha thực thi và file kiểm thử tương ứng.
  2. **Trật tự phụ thuộc tuần tự tự nhiên (Infrastructure-First Ordering):** Thiết kế lộ trình 5 pha cực kỳ mạch lạc: Hạ tầng DB (`request_metrics` + Queue) ➔ Core Registry & PID Binding ➔ Gateway Ingress & SSE ➔ Cyberdeck UI & Playground Retirement ➔ Verification Suite. Mỗi pha đều có nền tảng vững chắc từ pha trước.
  3. **Đặc tả composite indexes sắc bén:** Đưa ra 4 chỉ mục đơn và phức hợp phục vụ lọc đa chiều (`idx_request_metrics_created_at`, `idx_request_metrics_adapter_created`, `idx_request_metrics_model_created`, `idx_request_metrics_status_created`), tối ưu cho cả biểu đồ trượt thời gian lẫn truy vấn tìm kiếm.
* **Lỗ hổng & Điểm mù (Architectural Gaps):**
  * Chưa có giải pháp bảo vệ hàng đợi bộ nhớ (chưa giới hạn cận trên `maxBufferSize` như Candidate C, tiềm ẩn rủi ro rò rỉ RAM nếu có lỗi DB kéo dài).
  * Mã nguồn React mẫu trong Phase 4 ở mức khung sườn (wireframe logic), chưa chi tiết hóa từng token màu sắc neon và trạng thái hover/active như Candidate C.
* **Giả định chịu tải chính (Primary Load-Bearing Assumption):**
  * Thư viện `better-sqlite3` ở chế độ WAL với mutex `isFlushing` sẽ hoàn toàn loại trừ hiện tượng ghi đè hoặc xung đột race condition giữa các tác vụ nền.
* **Điều kiện sụp đổ đầu tiên (First Failure Condition):**
  * Khi client IDE ngắt kết nối mạng bất ngờ (Silent Socket Drop), nếu tầng Ingress không kích hoạt `finally` block kịp thời, request có thể bị kẹt ở trạng thái `STREAMING` trong in-memory registry mà không được giải phóng.

---

### 2.3. Candidate Plan E: Test-Driven & Resilient Architecture Plan
*(Tham chiếu nguồn: `plans/260917-1120-runtime-telemetry-token-radar/`)*

* **Điểm mạnh cốt lõi (Strengths):**
  1. **Kỷ luật kiểm thử hướng hành vi cao nhất (TDD-First Rigor):** Candidate E bắt buộc viết test suite trước khi viết mã nguồn ở mọi pha (`telemetry-db-persistence.test.ts`, `velocity-buffer.test.ts`, `adaptive-token-estimator.test.ts`). Điều này giảm thiểu tối đa bug hồi quy trong quá trình tái cấu trúc.
  2. **Ngắt mạch tự động chống lặp vô hạn (Runaway Stream Circuit Breaker):** Nhận diện chính xác nguy cơ một CLI con gặp lỗi sinh chuỗi lặp vô tận (infinite repetition loop). Tự động ngắt kết nối và giải phóng slot khi vượt ngưỡng 16.384 completion tokens.
  3. **Đặc tả kịch bản Chaos & Concurrency thực chiến:** Pha 5 của Candidate E thiết kế kịch bản kiểm thử giả lập ngắt tiến trình đột ngột, kiểm tra độ suy giảm vận tốc (velocity decay về 0 khi stream ngừng $> 2000\text{ms}$) rất sắc sảo.
* **Lỗ hổng & Điểm mù (Architectural Gaps):**
  * Kế hoạch UI (Phase 4) chia nhỏ thành quá nhiều sub-components (`HudStatusCards.tsx`, `DiagnosticProbeHarness.tsx`, `ProviderSaturationBar.tsx`, `LiveExecutionRadar.tsx`, `FailoverTrailStrip.tsx`, `TokenLedgerTable.tsx`) làm tăng độ phức tạp trong quản lý props và state synchronization qua SSE so với kiến trúc component tích hợp của Candidate C.
  * Chi tiết mã migration SQL trong `migrate.ts` chưa được viết tường minh từng câu lệnh `ALTER TABLE` như Candidate C và D.
* **Giả định chịu tải chính (Primary Load-Bearing Assumption):**
  * Việc viết test trước cho các module RAM và SQLite độc lập sẽ phản ánh chính xác 100% hành vi khi ghép nối vào luồng stream Fastify thực tế.
* **Điều kiện sụp đổ đầu tiên (First Failure Condition):**
  * Sự phân mảnh trạng thái giữa 6 sub-components UI có thể gây re-render thừa (excessive re-rendering) trên React Virtual DOM khi nhận xung SSE $100\text{ms}$, dẫn đến hiện tượng drop FPS trên trình duyệt.

---

### 2.4. Candidate Plan B: Vertical Feature Slice Planning
*(Tham chiếu nguồn: `plans/260917-1145-obsidian-hybrid-telemetry-fleet-radar/`)*

* **Điểm mạnh cốt lõi (Strengths):**
  1. **Phương pháp lát cắt dọc thực dụng (Vertical Tracer Bullet):** Triển khai từ sớm một luồng dữ liệu thông suốt từ DB đến UI giúp nhóm kỹ sư có thể nhìn thấy sản phẩm chạy thử ngay từ các pha đầu.
  2. **Tích hợp sẵn Runaway Circuit Breaker:** Kế hoạch có bổ sung ngưỡng trần 16.384 tokens để bảo vệ heap memory.
  3. **Định dạng Breadcrumb trực quan:** Định nghĩa định dạng chuỗi breadcrumb trực quan rõ ràng cho bảng điều khiển HUD: `[P0: codex-acc-1 ⚠️ 429 (+142ms)] ➔ [P1: gemini-acc-2 🟢 200 Streaming]`.
* **Lỗ hổng & Điểm mù (Architectural Gaps):**
  * **Phân mảnh cross-cutting concerns:** Do chia theo lát cắt tính năng, một số file (như `execution-registry.ts`) bị sửa đi sửa lại ở nhiều pha khác nhau (Phase 2 tạo mới, Phase 3 sửa, Phase 5 lại mở ra để nhét circuit breaker). Điều này gây khó khăn cho việc quản lý mã nguồn và kiểm soát diff.
  * Thiếu kịch bản kiểm tra biên độ lỗi (error margin) cho bộ đếm Heuristic đa ngữ trong Phase 2.
* **Giả định chịu tải chính (Primary Load-Bearing Assumption):**
  * Các lát cắt dọc ban đầu có thể dễ dàng mở rộng để tích hợp tải 50 concurrent streams mà không cần đập đi xây lại cấu trúc in-flight registry.
* **Điều kiện sụp đổ đầu tiên (First Failure Condition):**
  * Xung đột hợp nhất code (Merge conflicts) và lỗi hồi quy logic khi các pha sau liên tục chỉnh sửa vào cùng một core registry singleton được tạo từ pha trước.

---

### 2.5. Candidate Plan A: Subsystem-Isolated Parallel-Ready Plan
*(Kế hoạch phân rã tĩnh theo phân hệ kiến trúc)*

* **Điểm mạnh cốt lõi (Strengths):**
  1. **Ranh giới sở hữu file tuyệt đối (Strict Subsystem Ownership):** Mỗi pha quản lý một thư mục độc lập (`db/`, `supervisor/`, `api/`, `web/`, `tests/`), tạo cảm giác an toàn cho việc phân chia công việc song song giữa các nhóm độc lập.
  2. **Mô đun hóa cao:** Các phân hệ dữ liệu, tiến trình và giao diện được tách biệt về mặt cấu trúc thư mục.
* **Lỗ hổng & Điểm mù (Architectural Gaps):**
  1. **Sai lệch bản chất luồng thực thi dọc của AI Gateway:** `cli-to-api` là một hệ thống proxy thời gian thực. Một request hoàn chỉnh bắt buộc phải xuyên qua: Ingress (`openai-chat.ts`) ➔ Router (`pipeline-executor.ts`) ➔ Supervisor (`process-manager.ts` & `pipe-executor.ts`) ➔ Demuxer (`ThinkingDemuxer`) ➔ Telemetry (`execution-registry.ts`) ➔ SSE Broadcaster (`admin-events.ts`) ➔ Persistence Queue (`persist-queue.ts`). Việc cô lập thành các subsystem khiến nhóm làm Ingress phải tạo mock cho Supervisor, nhóm làm Supervisor phải tạo mock cho Telemetry, tạo ra "ảo tưởng hoàn thành" (illusion of progress) ở từng phân hệ nhưng khi ghép nối sẽ bùng nổ lỗi giao tiếp (interface mismatch).
  2. **Dồn toàn bộ rủi ro tích hợp vào pha cuối:** Phase 5 (Verification Suite) phải gánh toàn bộ trọng trách kiểm thử tích hợp, concurrency và zombie process. Mọi lỗi thiết kế ở Phase 1-4 sẽ chỉ phát lộ tại Phase 5, dẫn đến nguy cơ vỡ kế hoạch (schedule slip).
  3. **Phụ thuộc ngầm định (Hidden Couplings):** Nhóm Ingress không thể hoàn thiện `openai-chat.ts` nếu `onSpawn` của Supervisor và `ExecutionRegistry` của Telemetry chưa được chốt contract bằng code thực tế.
* **Giả định chịu tải chính (Primary Load-Bearing Assumption):**
  * Ranh giới API giữa các subsystem được định nghĩa trên giấy là hoàn hảo và không cần bất kỳ sự điều chỉnh tương hỗ nào trong quá trình tích hợp luồng stream thời gian thực.
* **Điều kiện sụp đổ đầu tiên (First Failure Condition):**
  * Ngay khi ghép nối Phase 3 (Ingress Subsystem) với Phase 2 (Supervisor Subsystem), callback `onSpawn` không khớp signature hoặc luồng SSE bị dead-lock do thứ tự khởi tạo lifecycle giữa Fastify plugins và Supervisor processes.

---

## 3. TUYÊN BỐ ỨNG VIÊN ĐẮC CỬ (OFFICIAL PROCLAMATION OF THE WINNER)

### Ứng Viên Chiến Thắng: CANDIDATE PLAN C — Production Reliability & Observability First Plan (78 / 80 Điểm)

### Lý Do Kỹ Thuật Đưa Candidate Plan C Trở Thành Thiết Kế Chuẩn Thước:
1. **Tiêu Chuẩn Sản Xuất Tuyệt Đối (Production-Grade Invariants):** Candidate Plan C là bản kế hoạch duy nhất tính toán tới mọi rủi ro vận hành thực tế ở môi trường tải cao: từ việc đặt ngưỡng cận trên chống sập bộ nhớ (`Bounded Queue 5000 items`), cấu hình tối ưu SQLite WAL (`PRAGMA busy_timeout = 5000`, `PRAGMA synchronous = NORMAL`), cho tới việc dùng Mutex đơn luồng cho tác vụ ghi đĩa.
2. **Khống Chế Tiến Trình Sâu Cấp Kernel:** Giải pháp tích hợp Win32 Job Object và POSIX Process Group thông qua callback `onSpawn` $< 20\text{ms}$ và công tắc hủy $< 200\text{ms}$ giải quyết triệt để vấn đề nhức nhối nhất của các gateway AI CLI địa phương: **Tiến trình Zombie (Zombie Subprocesses)** làm cạn kiệt tài nguyên máy phát triển.
3. **Zero Hot-Path Latency:** Các giải thuật đo đạc token heuristic thích ứng đa ngữ (3.7 ASCII / 2.2 Unicode) và bộ đệm vòng $O(1)$ sliding 3 giây hoàn toàn triệt tiêu rủi ro làm nghẽn Event Loop Fastify, bảo đảm độ trễ TTFT không suy giảm.
4. **Hợp Nhất Tinh Hoa Kongming (Kongming Synthesis):** Để biến Candidate Plan C thành một kế hoạch hoàn hảo không tì vết, Hội đồng thẩm định quyết định: **Sử dụng bộ khung kiến trúc và mã nguồn chi tiết của Candidate Plan C làm nòng cốt, đồng thời tích hợp Ma trận Nghiệm thu AC-1 đến AC-8 từ Candidate Plan D và Ngắt mạch Runaway Circuit Breaker (16k tokens) từ Candidate Plan E.**

---

## 4. CHỈ THỊ THI CÔNG CHI TIẾT CHO CONTROLLER (ACTIONABLE DIRECTIVES)
### Địa chỉ lưu trữ Kế hoạch Chính thức: `plans/260917-1130-runtime-telemetry-and-fleet-radar/`

Controller có trách nhiệm hiện thực hóa kế hoạch tổng thể `plan.md` và 5 tài liệu pha thi công chi tiết (`phase-01` đến `phase-05`) vào thư mục `plans/260917-1130-runtime-telemetry-and-fleet-radar/` tuân thủ nghiêm ngặt các chỉ thị kỹ thuật sau:

---

### PHA 1: NÂNG CẤP LƯỢC ĐỒ DỮ LIỆU & BỘ ĐỆM GHI BỀN VỮNG (SCHEMA & PERSISTENCE SUBSTRATE)
* **File mục tiêu:**
  * `apps/gateway/src/db/schema.ts` (MODIFIED)
  * `apps/gateway/src/db/migrate.ts` (MODIFIED)
  * `apps/gateway/src/telemetry/types.ts` (CREATED)
  * `apps/gateway/src/telemetry/persist-queue.ts` (CREATED)
  * `apps/gateway/src/telemetry/telemetry-store.ts` (CREATED)
  * `tests/unit/telemetry-persist-queue.test.ts` (CREATED)
* **Chỉ thị kỹ thuật:**
  1. Cập nhật bảng `requestMetrics` trong `schema.ts`: thêm `adapterId` (text), `reasoningTokens` (integer default 0), `totalTokens` (integer default 0).
  2. Cập nhật `migrate.ts`: dùng `PRAGMA table_info(request_metrics)` kiểm tra và chạy các lệnh `ALTER TABLE` thêm cột an toàn, tạo composite index `idx_request_metrics_created_at`, `idx_request_metrics_adapter_model`, `idx_request_metrics_request_id`.
  3. Xây dựng `TelemetryPersistQueue`:
     * Đệm in-memory có giới hạn trần `maxBufferSize = 5000` (FIFO drop oldest khi đầy để chống tràn heap).
     * Hai điều kiện kích hoạt flush: Đủ $50$ bản ghi HOẶC sau $2.000\text{ms}$ debounce.
     * Sử dụng single-flight mutex (`isFlushing: boolean`) và 1 transaction `db.transaction()` duy nhất.
     * Đăng ký hook `fastify.addHook("onClose", ...)` để xả cạn hàng đợi khi gateway tắt.
  4. Xây dựng `TelemetryStore`: cung cấp hàm truy vấn phân trang `getHistoricalLedger(params)` và tổng hợp rollup đa cửa sổ `getMetricsSummary(window)`.
* **Lệnh kiểm thử xác minh:**
  ```bash
  pnpm --filter @cli-to-api/gateway db:migrate
  pnpm vitest run tests/unit/telemetry-persist-queue.test.ts
  ```

---

### PHA 2: BẮT PID TIẾN TRÌNH HỆ ĐIỀU HÀNH, BỘ ĐỆM VẬN TỐC O(1) & TOKEN ESTIMATOR
* **File mục tiêu:**
  * `apps/gateway/src/supervisor/types.ts` (MODIFIED)
  * `apps/gateway/src/supervisor/pipe-executor.ts` (MODIFIED)
  * `apps/gateway/src/supervisor/pty-executor.ts` (MODIFIED)
  * `apps/gateway/src/supervisor/process-manager.ts` (MODIFIED)
  * `apps/gateway/src/utils/token-estimator.ts` (MODIFIED)
  * `apps/gateway/src/telemetry/execution-registry.ts` (CREATED)
  * `tests/unit/token-speedometer.test.ts` (CREATED)
  * `tests/unit/process-containment-kill.test.ts` (CREATED)
* **Chỉ thị kỹ thuật:**
  1. Thêm `onSpawn?: (pid: number) => void` vào `ProcessSpawnOptions` và `ExecutionContext`.
  2. Kích hoạt `onSpawn(child.pid)` ngay sau `execa()` trong `pipe-executor.ts` và ngay sau `pty.spawn()` trong `pty-executor.ts` ($< 20\text{ms}$).
  3. Nâng cấp `token-estimator.ts` với giải thuật Adaptive Multilingual Heuristic:
     * Phân tách mã ký tự: $\le 127$ (ASCII/Code) tính tỷ lệ $3.7$ ký tự/token; $> 127$ (Unicode/Tiếng Việt/CJK) tính tỷ lệ $2.2$ ký tự/token. Độ phức tạp $O(1)$ bộ nhớ, tốc độ tính $< 0.05\text{ms}$.
  4. Xây dựng `ExecutionRegistry` Singleton:
     * Quản lý `Map<string, ActiveExecutionRecord>`.
     * Cài đặt `CircularVelocityBuffer`: bộ đệm vòng 3 giây, tự động prune các mốc cũ hơn $now - 3000ms$, tính vận tốc tức thời $tok/s$ với chi phí $O(1)$.
     * Tích hợp **Runaway Stream Circuit Breaker (từ Candidate E)**: tự động kích hoạt `killStream` khi tổng output tokens vượt quá 16.384.
     * Cung cấp phương thức `killExecution(requestId)`: gọi `abortController.abort()` và gọi hàm `killProcessTree(pid)`, giải phóng slot account ngay lập tức trong $< 200\text{ms}$.
* **Lệnh kiểm thử xác minh:**
  ```bash
  pnpm vitest run tests/unit/token-speedometer.test.ts tests/unit/process-containment-kill.test.ts
  ```

---

### PHA 3: TÍCH HỢP HOOK STREAMING, SSE PULSE & CONTROL PLANE REST API
* **File mục tiêu:**
  * `apps/gateway/src/api/routes/openai-chat.ts` (MODIFIED)
  * `apps/gateway/src/router/pipeline-executor.ts` (MODIFIED)
  * `apps/gateway/src/api/routes/admin-events.ts` (MODIFIED)
  * `apps/gateway/src/api/routes/admin-telemetry.ts` (CREATED)
  * `apps/gateway/src/api/server.ts` (MODIFIED)
  * `tests/unit/admin-telemetry-routes.test.ts` (CREATED)
  * `tests/integration/telemetry-sse-snapshot.test.ts` (CREATED)
* **Chỉ thị kỹ thuật:**
  1. Trong `openai-chat.ts`:
     * Khi nhận request: tính prompt tokens, gọi `registerExecution`, truyền callback `onSpawn` vào supervisor.
     * Móc nối `ThinkingDemuxer`: `onThoughtDelta` ghi nhận reasoning tokens, cập nhật phase `REASONING`; `onContentDelta` ghi nhận content tokens, cập nhật phase `STREAMING`, ghi nhận `TTFT` tại chunk đầu tiên.
     * Trong block `finally`: đưa bản ghi hoàn tất vào `globalTelemetryPersistQueue`, giải phóng slot tài khoản.
  2. Trong `pipeline-executor.ts`: khi xảy ra failover (ví dụ mã 429 hoặc crash ở 250ms đầu), ghi nhận hop vào `failoverTrail` của record và phát event `telemetry:failover`.
  3. Trong `admin-events.ts`:
     * Thiết lập vòng lặp micro-throttled pulse $100\text{ms}$ (`telemetry:pulse`), chỉ phát khi có request in-flight để tránh tốn CPU.
     * Snapshot Hydration: Ngay khi client kết nối tới `GET /api/admin/events`, phát ngay event `radar:snapshot` chứa toàn bộ danh sách active executions và saturation matrix hiện thời.
  4. Xây dựng `admin-telemetry.ts` với các endpoint:
     * `GET /api/admin/telemetry/active`: lấy snapshot in-flight.
     * `GET /api/admin/telemetry/ledger`: truy vấn phân trang lịch sử có filter.
     * `GET /api/admin/telemetry/summary`: lấy số liệu KPI theo sliding window (`5m`, `1h`, `24h`, `all`).
     * `POST /api/admin/telemetry/kill/:requestId`: kích hoạt công tắc hủy khẩn cấp.
     * `POST /api/admin/telemetry/probe`: phát xung kiểm thử nhanh (ping, code, cot).
* **Lệnh kiểm thử xác minh:**
  ```bash
  pnpm vitest run tests/unit/admin-telemetry-routes.test.ts tests/integration/telemetry-sse-snapshot.test.ts
  ```

---

### PHA 4: GIAO DIỆN OBSIDIAN CYBERDECK CONSOLE HUD & KHAI TỬ PLAYGROUND
* **File mục tiêu:**
  * `apps/web/src/views/PlaygroundView.tsx` (DELETED)
  * `apps/web/src/components/layout/Sidebar.tsx` (MODIFIED)
  * `apps/web/src/App.tsx` (MODIFIED)
  * `apps/web/src/lib/api-client.ts` (MODIFIED)
  * `apps/web/src/views/TelemetryStationView.tsx` (CREATED)
* **Chỉ thị kỹ thuật:**
  1. Khai tử Chat Playground:
     * Xóa bỏ hoàn toàn file `PlaygroundView.tsx`.
     * Trong `Sidebar.tsx`: loại bỏ mục `"playground"`, thay bằng `"radar"` với nhãn `"Fleet Radar & Ledger"` và icon `Radar` / `Cpu`.
     * Trong `App.tsx`: gỡ bỏ import `PlaygroundView`, mount `TelemetryStationView` khi `activeTab === "radar"`.
  2. Mở rộng `api-client.ts`: bổ sung các phương thức gọi REST endpoint `/api/admin/telemetry/*` và kiểu dữ liệu TypeScript tương ứng.
  3. Xây dựng `TelemetryStationView.tsx` chuẩn Cyberdeck `ak-ui-ux-pro-max` (nền carbon `#090B0F`, font monospace cho số đo, viền neon tinh tế) chia thành 4 Phân Khu:
     * **Zone 1: Top HUD Status Cards & Diagnostic Probe Harness:** Thẻ đo Prompt / Content / Reasoning Tokens, Fleet Velocity $tok/s$, cụm 3 nút phát xung nhanh `[⚡ Ping]`, `[💻 Code Gen]`, `[🧠 CoT Logic]`.
     * **Zone 2: Provider Slot Saturation & Concurrency Matrix:** Thanh đo tỷ lệ chiếm dụng worker slot (`activeSlots / maxSlots`) cho từng CLI, cảnh báo viền đỏ nhấp nháy khi đạt 100% SATURATED, đồng hồ đếm ngược Cooldown thời gian thực.
     * **Zone 3: Plane 1 - Live Execution Radar:** Bảng tiến trình in-flight thời gian thực hiển thị OS PID, Request ID, Model, Sandbox, 3 loại Tokens, Vận tốc $tok/s$, dải Failover Trail Breadcrumbs, và nút `[KILL ✕]` màu đỏ neon.
     * **Zone 4: Plane 2 - Token Accounting Matrix & SQLite Audit Ledger:** Bộ lọc khung trượt thời gian `[ 5m ]`, `[ 1h ]`, `[ 24h ]`, `[ All ]`, thanh tìm kiếm, và bảng nhật ký kiểm toán phân trang từ SQLite WAL.
* **Lệnh kiểm thử xác minh:**
  ```bash
  pnpm --filter @cli-to-api/web build
  ```

---

### PHA 5: KIỂM THỬ CHỊU TẢI 50 STREAM, CHỐNG ZOMBIE & NGHIỆM THU AC-1 ĐẾN AC-8
* **File mục tiêu:**
  * `tests/e2e/telemetry-concurrency-stress.test.ts` (CREATED)
  * `tests/e2e/telemetry-acceptance.test.ts` (CREATED)
* **Chỉ thị kỹ thuật:**
  1. Kiểm thử Concurrency Stress 50 Stream:
     * Bắn 50 request streaming đồng thời trong cửa sổ 2 giây.
     * Xác nhận 100% request hoàn tất mã 200, **không có bất kỳ lỗi `SQLITE_BUSY` nào** trong log.
     * Kiểm tra `SELECT COUNT(*) FROM request_metrics` trả về đúng 50 bản ghi với số token khớp tuyệt đối.
  2. Kiểm thử Khống chế Tiến trình & Kill Switch:
     * Khởi chạy tiến trình giả lập treo I/O (`mock-hanging-cli.js`).
     * Xác nhận PID được bắt trong $< 20\text{ms}$.
     * Gửi yêu cầu abort qua API: xác nhận toàn bộ cây tiến trình bị tiêu diệt trong $< 200\text{ms}$, slot account lập tức được trả về trạng thái `READY`.
  3. Kiểm thử Snapshot Hydration:
     * Mở tab mới giữa lúc có 2 stream đang chạy, xác nhận event đầu tiên nhận được là `radar:snapshot` chứa đầy đủ state mà không bị trắng màn hình.
  4. Xác nhận bộ tiêu chí nghiệm thu toàn diện (AC-1 đến AC-8 từ Candidate Plan D):
     * AC-1: Playground khai tử, tab Radar hiển thị chuẩn.
     * AC-2: PID bắt trong $< 20\text{ms}$.
     * AC-3: Bóc tách CoT vs Content tokens, vận tốc sliding $tok/s$.
     * AC-4: Cảnh báo bão hòa slot 100% và đếm ngược cooldown.
     * AC-5: Vết chuyển vùng lỗi failover breadcrumbs.
     * AC-6: Nút Kill khẩn cấp $< 200\text{ms}$.
     * AC-7: Snapshot hydration khi F5.
     * AC-8: Ghi SQLite WAL gom mẻ không lock database.
  5. Đảm bảo toàn bộ 28+ test suite cũ của hệ thống tiếp tục pass 100%.
* **Lệnh kiểm thử xác minh:**
  ```bash
  pnpm vitest run tests/e2e/telemetry-concurrency-stress.test.ts
  pnpm vitest run tests/e2e/telemetry-acceptance.test.ts
  pnpm test
  pnpm build
  ```

---

## 5. PHÁN QUYẾT CUỐI CÙNG (FINAL VERDICT)

Bản thẩm định này có hiệu lực ngay lập tức. **Candidate Plan C** chính thức được phê duyệt là phương án kiến trúc nền tảng, được tăng cường bởi các cơ chế ngắt mạch từ Candidate Plan E và bảng nghiệm thu từ Candidate Plan D.

Controller được ủy quyền đầy đủ để tiến hành cấu trúc hóa và vật chất hóa toàn bộ hồ sơ thi công vào thư mục:
`plans/260917-1130-runtime-telemetry-and-fleet-radar/`

*Ký duyệt bởi:*  
**Kongming — Lead Architectural Verifier**  
*Ultra Verifier Mode, Gateway Core Architecture Council*
