# BÁO CÁO ĐÁNH GIÁ VÀ THẨM ĐỊNH KIẾN TRÚC (ARCHITECTURAL EVALUATION REPORT)
**Dự án:** `cli-to-api`  
**Hệ thống:** Gateway Điều phối Mô hình Ngôn ngữ Địa phương qua Giao diện Dòng lệnh (Local AI CLI Gateway)  
**Nhiệm vụ:** Đánh giá 5 đề xuất kiến trúc (Candidate A, B, C, D, E) nhằm khai tử hoàn toàn `Chat Playground` và kiến tạo Trạm Giám sát & Đo lường Vi mô Thời gian thực (Real-time Monitoring & Runtime Diagnostics Screen)  
**Chủ tọa thẩm định:** Kongming — Lead Architectural Verifier (Ultra Verifier Mode)  
**Ngày lập báo cáo:** 17/09/2026  

---

## 1. BẢNG XẾP HẠNG TOÀN DIỆN & TỔNG ĐIỂM ĐÁNH GIÁ (FULL RANKING TABLE)

Khung tiêu chuẩn thẩm định 4 chiều (Rubric 4-Dimensional Framework, mỗi chiều tối đa 20 điểm, tổng /80):
1. **D1: Bounded Context Fidelity & Request Adherence (Độ chuẩn xác ngữ cảnh & Bám sát yêu cầu đề bài):** Mức độ thấu hiểu bài toán loại bỏ Chat Playground; đo lường đầy đủ Input/Output Tokens, Active Providers, Active Models, Runtime Diagnostics; tuân thủ zero-external telemetry infra và bảo toàn 100% chuẩn OpenAI API.
2. **D2: Technical Feasibility & Architecture Actionability (Tính khả thi kỹ thuật & Khả năng thi công):** Mức độ tương thích với Fastify, Drizzle ORM, better-sqlite3 WAL mode, React 18, TailwindCSS; thiết kế luồng non-blocking, tránh lock database (`SQLITE_BUSY`) và zero-overhead trên hot-path streaming.
3. **D3: Test Sharpness & Verification Rigor (Độ sắc bén kiểm thử & Tính chuẩn xác nghiệm thu):** Độ chi tiết của kịch bản Gherkin, tiêu chí định lượng (TTFT, TPS, batch intervals), chiến lược test unit/integration/E2E cho cả streaming chunk, abort signal và concurrency.
4. **D4: Risk Realism & Edge-Case Resilience (Hiện thực hóa rủi ro & Khả năng chống chịu biên giới):** Nhận diện chính xác điểm nghẽn bộ nhớ, tiến trình zombie, đứt gãy SSE, nghẽn Event Loop, xung đột I/O, bão hòa worker slot và các điều kiện sụp đổ đầu tiên (first failure condition).

### Bảng tổng hợp điểm số (Score Summary)

| Hạng | Ứng viên | Định vị Kiến trúc Cốt lõi | D1 (Ngữ cảnh) | D2 (Khả thi) | D3 (Kiểm thử) | D4 (Chống rủi ro) | Tổng điểm (/80) | Trạng thái Thẩm định |
| :---: | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **1** | **Candidate A** | **High-Performance Hybrid Observability Engine** *(In-Memory Execution Registry, Circular Timestamp Buffer for Token Velocity, Sliding-Window Accounting Matrix: 5m, 1h, 24h, all, Debounced SQLite Batch Writer 2000ms/50 items, Emergency Abort)* | **19/20** | **19/20** | **18/20** | **19/20** | **75/80** | **ĐẮC CỬ (WINNER)** |
| **2** | **Candidate D** | **Streaming Token Profiler & Multi-CLI Telemetry Studio** *(Chunk-by-chunk demuxing via ThinkingDemuxer [CoT vs Content], Adaptive Multi-lingual Char Heuristic, Provider Slot Saturation Bar 100% warning, Diagnostic Probe Harness)* | **19/20** | **18/20** | **18/20** | **17/20** | **72/80** | Hợp nhất vào Thiết kế Đích |
| **3** | **Candidate B** | **Obsidian Cyberdeck Runtime Telemetry Station** *(Active OS PID to Account Slot binding via executor onSpawn, Failover Trail breadcrumbs visualization, Live Token Ingress/Egress tally, Process Terminator Kill Switch)* | **18/20** | **18/20** | **17/20** | **18/20** | **71/80** | Hợp nhất vào Thiết kế Đích |
| **4** | **Candidate E** | **Persistent Token & Execution Ledger** *(SQLite request_metrics activation with adapter_id/reasoning_tokens schema migration & indexes, In-Memory TelemetryPersistQueue, 3 REST endpoints, Historical paginated ledger)* | **17/20** | **18/20** | **18/20** | **17/20** | **70/80** | Hợp nhất vào Thiết kế Đích |
| **5** | **Candidate C** | **Reactive Live-Stream & Active Fleet Radar** *(Pure SSE Event-Driven in-flight matrix, ephemeral O(1) state, throttled 100ms progress pulse, initial snapshot hydration, single write on completion to request_metrics)* | **16/20** | **17/20** | **16/20** | **15/20** | **64/80** | Loại bỏ cấu trúc chính |

---

## 2. PHÂN TÍCH VÀ PHÊ BÌNH CHI TIẾT TỪNG ỨNG VIÊN (GRANULAR CRITIQUE)

### 2.1. Candidate A: High-Performance Hybrid Observability Engine
* **Điểm mạnh cốt lõi:**
  * **Kiến trúc phân tầng kép (Dual-Plane UI):** Tách bạch rõ rệt giữa **Plane 1 (Live Execution Radar)** dành cho các luồng đang stream in-flight với tần số xung nhịp cao và **Plane 2 (Token Accounting Matrix)** dành cho kế toán token đa chiều phân tích theo Provider × Model × Account.
  * **Bộ đệm vòng tính vận tốc Token ($O(1)$ Circular Timestamp Buffer):** Đưa ra giải thuật đo lường vận tốc tức thời (**Token Velocity - tok/s**) trên cửa sổ trượt 3 giây cực kỳ tinh vi, giải quyết bài toán đo tốc độ sinh token mà không gây rò rỉ bộ nhớ (memory leak) hay tạo gánh nặng Garbage Collection (GC).
  * **Cơ chế ghi mẻ có hoãn (Debounced Batch Writer 2000ms / 50 items):** Nhận thức sâu sắc rằng SQLite WAL dù nhanh nhưng nếu ghi từng chunk hoặc ghi dồn dập ở tần số stream 50 req/s sẽ gây tranh chấp khóa (`SQLITE_BUSY`). Việc gom mẻ ghi bất đồng bộ bảo vệ toàn vẹn hot-path streaming.
  * **Ma trận cửa sổ trượt (Sliding Windows: 5m, 1h, 24h, All-Time):** Đáp ứng vượt bậc yêu cầu chẩn đoán runtime của quản trị viên khi đánh giá xu hướng tiêu hao token theo từng khung giờ vận hành.
* **Lỗ hổng & Điểm mù (Architectural Gaps):**
  * Chưa đặc tả chi tiết mã lệnh SQL migration cho bảng `request_metrics` trong Drizzle ORM (chưa định rõ việc bổ sung `adapter_id`, `reasoning_tokens` và composite index).
  * Chỉ theo dõi request theo logic abstraction (`requestId`), thiếu liên kết trực tiếp xuống **OS PID** của tiến trình CLI con bên dưới hệ điều hành để phục vụ việc cưỡng chế hủy tiến trình (kill process tree).
  * Bỏ qua việc bóc tách chuyên sâu giữa Token suy nghĩ (**Reasoning/CoT**) và Token nội dung (**Content**) ngay trong lúc đang streaming như Candidate D.
* **Giả định chịu tải chính (Primary Load-Bearing Assumption):**
  * Bộ nhớ RAM của tiến trình Gateway luôn an toàn và việc hoãn ghi 2000ms sẽ không bị mất dữ liệu quan trọng nhờ hook dọn dẹp `onClose` của Fastify.
* **Điều kiện sụp đổ đầu tiên (First Failure Condition):**
  * Trong trường hợp máy chủ hoặc tiến trình Gateway bị ngắt nguồn đột ngột (Hard Crash / SIGKILL từ OS), toàn bộ số liệu đo lường in-memory trong chu kỳ hoãn 2000ms cuối cùng sẽ bốc hơi trước khi kịp flush vào SQLite.

---

### 2.2. Candidate B: Obsidian Cyberdeck Runtime Telemetry Station
* **Điểm mạnh cốt lõi:**
  * **Ràng buộc PID Hệ điều hành với Account Slot (Active OS PID Binding):** Thiết kế chính xác và thực tế nhất đối với bản chất của `cli-to-api`. Việc đưa callback `onSpawn: (pid) => void` vào `pipe-executor.ts` và `pty-executor.ts` biến Gateway thành trạm giám sát tiến trình hệ điều hành đích thực, biết đích xác tiến trình PID nào đang chiếm giữ sandbox nào.
  * **Vết điều hướng lỗi trực quan (Failover Trail Breadcrumbs):** Tính năng mang giá trị chẩn đoán runtime cao nhất trong 5 ứng viên: trực quan hóa chuỗi fallback (ví dụ: `P0: codex-account-1 [429 (+142ms)] ➔ P1: gemini-account-2 [200 Streaming]`), giúp quản trị viên nắm bắt ngay lập tức lý do request bị chuyển hướng.
  * **Nút hủy khẩn cấp cưỡng chế (Process Terminator Kill Switch):** Không chỉ dừng lại ở `AbortSignal` của Node.js, Candidate B kích hoạt hàm `killProcessTree(pid)` để quét sạch toàn bộ cây tiến trình con (kể cả các CLI con cứng đầu trên Windows như `cmd.exe /c` hay `node-pty`), ngăn chặn triệt để hiện tượng tiến trình ma (Zombie Processes).
* **Lỗ hổng & Điểm mù (Architectural Gaps):**
  * Thiếu cơ chế kế toán cửa sổ trượt (Sliding-window Matrix) cho các khoảng thời gian 5m/1h/24h như Candidate A.
  * Đề xuất cơ chế dọn dẹp SQLite (rolling buffer tối đa 5.000 bản ghi) nhưng chưa chỉ rõ cơ chế phân trang (pagination) và tối ưu hóa index truy vấn cho bảng lịch sử.
  * Bỏ qua việc tính toán vận tốc token tức thời (Token Velocity tok/s) của từng stream riêng lẻ.
* **Giả định chịu tải chính (Primary Load-Bearing Assumption):**
  * Mã định danh PID do hệ điều hành cấp phát qua `child.pid` luôn được đảm bảo duy nhất và không bị tái sử dụng (PID recycling) trước khi tín hiệu terminate hoàn tất.
* **Điều kiện sụp đổ đầu tiên (First Failure Condition):**
  * Khi luồng failover xảy ra liên tục ở tốc độ cao (cascading 429 errors trên toàn bộ pipeline), các event SSE gửi dồn dập có thể làm nghẽn kênh truyền SSE nếu không có cơ chế debounce/throttle, khiến giao diện người dùng bị giật khung hình (UI freezing).

---

### 2.3. Candidate C: Reactive Live-Stream & Active Fleet Radar
* **Điểm mạnh cốt lõi:**
  * **Cơ chế nạp nhanh trạng thái ban đầu (Snapshot Hydration via `radar:snapshot`):** Giải quyết dứt điểm vấn đề màn hình trắng hoặc mất đồng bộ khi người dùng bấm F5 hoặc mở một tab trình duyệt mới vào giữa lúc các request đang chạy in-flight.
  * **Thiết kế hướng sự kiện thuần khiết (Pure SSE Event-Driven):** Khai thác triệt để kênh `/api/admin/events` sẵn có, duy trì trạng thái in-flight hoàn toàn $O(1)$ trong RAM, giữ cho Gateway cực kỳ thanh thoát.
  * **Chính sách Zero-Write trong lúc Stream:** Không can thiệp bất kỳ thao tác I/O đĩa nào trong suốt vòng đời stream, chỉ thực hiện một lệnh ghi duy nhất khi request kết thúc (`single write on completion`).
* **Lỗ hổng & Điểm mù (Architectural Gaps):**
  * **Hoàn toàn xem nhẹ sổ cái lịch sử (Historical Ledger):** Candidate C gần như bỏ mặc bảng `request_metrics`, chỉ hiển thị log ngắn hạn vài bản ghi gần nhất trên RAM. Điều này đi ngược lại nhu cầu vận hành lâu dài của một AI Gateway sản xuất.
  * **Lỗ hổng chịu lỗi khi treo tiến trình:** Chính sách "chỉ ghi một lần khi hoàn thành" biến thành điểm yếu chí tử nếu một tiến trình CLI bị treo vô hạn (hang/deadlock) hoặc socket bị rớt không phát sinh event đóng: không có số liệu nào được ghi nhận, token bị thất thoát khỏi hệ thống đo lường.
* **Giả định chịu tải chính (Primary Load-Bearing Assumption):**
  * Kênh kết nối Server-Sent Events giữa trình duyệt và Fastify daemon luôn luôn ổn định và không bao giờ gặp tình trạng ngắt kết nối âm thầm (silent disconnect).
* **Điều kiện sụp đổ đầu tiên (First Failure Condition):**
  * Khi client IDE hủy request (Client Abort) nhưng socket ngắt kết nối đột ngột mà không trigger kịp thời chuỗi finalizer, in-flight tracker của Candidate C sẽ giữ vĩnh viễn request đó trong RAM như một bóng ma (ghost stream) cho đến khi khởi động lại Gateway.

---

### 2.4. Candidate D: Streaming Token Profiler & Multi-CLI Telemetry Studio
* **Điểm mạnh cốt lõi:**
  * **Bóc tách sâu Token Suy nghĩ & Token Nội dung (Thinking CoT vs Content Demuxing):** Thấu hiểu sâu sắc nhất cấu trúc luồng của `cli-to-api`. Candidate D móc nối trực tiếp vào các callback `onThoughtDelta` và `onContentDelta` của `ThinkingDemuxer`, hiển thị phân tách rạch ròi giữa Reasoning Tokens (mô hình đang suy nghĩ) và Content Tokens (mô hình đang xuất kết quả) theo thời gian thực.
  * **Bộ đếm Heuristic Ký tự Thích ứng Đa ngữ (Adaptive Multi-lingual Char Heuristic):** Cải tiến thuật toán ước lượng trong `token-estimator.ts`, phân biệt rõ giữa luồng ASCII/mã nguồn (~3.7 ký tự/token) và luồng Unicode tiếng Việt/CJK (~2.2 ký tự/token), giảm sai số ước lượng từ > 25% xuống dưới 5% mà không cần nhúng thư viện WASM cồng kềnh.
  * **Cảnh báo Bão hòa Slot Provider (Slot Saturation Warning Bar):** Hiển thị thanh đo trực quan tỷ lệ chiếm dụng worker slot (`activeSlots / maxSlots`) cho từng CLI adapter, cảnh báo màu hổ phách/đỏ khi chạm ngưỡng 100% và kích hoạt đồng hồ đếm ngược Cooldown.
  * **Bộ phát lệnh chẩn đoán (Diagnostic Probe Harness):** Ý tưởng thay thế Chat Playground cực kỳ thực dụng: thay vì để giao diện chat rườm rà, Candidate D cung cấp các nút probe 1-click (Ping, Code gen, CoT Math) để lập trình viên kiểm thử nhanh đường truyền và đo đếm token tức thì.
* **Lỗ hổng & Điểm mù (Architectural Gaps):**
  * Tần suất phát xung micro-throttle 80ms trên từng delta chunk có nguy cơ gây quá tải hàng đợi microtask của Node.js Event Loop nếu có 30+ stream chạy đồng thời.
  * Chưa có giải pháp phân tích cửa sổ trượt (Sliding windows) theo các mốc thời gian lớn (1h, 24h) cho toàn bộ hệ thống.
  * Không nắm bắt OS PID để thực hiện cưỡng chế kill process.
* **Giả định chịu tải chính (Primary Load-Bearing Assumption):**
  * Tốc độ xử lý của `ThinkingDemuxer` và hàm tính heuristic ký tự luôn nhỏ hơn 0.1ms cho mỗi chunk dữ liệu đầu vào.
* **Điều kiện sụp đổ đầu tiên (First Failure Condition):**
  * Khi adapter CLI xả ra hàng loạt escape sequences ANSI bị lỗi phân mảnh byte hoặc chuỗi văn bản không chuẩn, máy trạng thái (FSM) của demuxer có thể phát nhầm phase, dẫn đến việc tính toán sai lệch giữa reasoning token và content token.

---

### 2.5. Candidate E: Persistent Token & Execution Ledger
* **Điểm mạnh cốt lõi:**
  * **Kích hoạt và hoàn thiện thực thể `request_metrics` trong SQLite:** Candidate E là ứng viên duy nhất nhận diện chuẩn xác hiện trạng cơ sở dữ liệu: bảng `request_metrics` đã có sẵn trong `apps/gateway/src/db/schema.ts` nhưng đang bị "ngủ quên" (không được ghi dữ liệu trong `openai-chat.ts`) và thiếu các trường then chốt như `adapter_id`, `reasoning_tokens`, `total_tokens`.
  * **Thiết kế Migration & Composite Indexes hoàn chỉnh:** Đưa ra lược đồ migration tường minh với các chỉ mục then chốt (`idx_request_metrics_created_at`, `idx_request_metrics_adapter_model`), đảm bảo các truy vấn thống kê aggregated queries có thời gian phản hồi dưới 5ms ngay cả khi bảng đạt 100.000 dòng.
  * **Hàng đợi đệm ghi vi mô (In-Memory TelemetryPersistQueue):** Gom mẻ 20 bản ghi hoặc 200ms giúp giảm 95% thao tác Disk I/O lên SQLite WAL mode, loại trừ hoàn toàn nguy cơ nghẽn đĩa.
  * **Sổ cái kiểm toán lịch sử hoàn thiện (Historical Audit Ledger):** Cung cấp giao diện phân trang (Pagination), bộ lọc thời gian, tìm kiếm mã request, kiểm tra mã HTTP/lỗi chi tiết.
* **Lỗ hổng & Điểm mù (Architectural Gaps):**
  * **Quá thiên về sổ cái tĩnh (Post-Mortem Ledger), xem nhẹ động lực học thời gian thực (Live Telemetry):** Không có đồng hồ đo vận tốc token tức thời (Token Velocity tok/s), không có cảnh báo bão hòa slot theo thời gian thực.
  * Sử dụng quá nhiều REST polling cho các thẻ KPI trên Dashboard thay vì duy trì kênh phản ứng SSE đồng bộ, làm tăng độ trễ cập nhật trạng thái runtime lên 2-5 giây.
  * Thiếu cơ chế can thiệp khẩn cấp (Emergency Abort/Kill Switch).
* **Giả định chịu tải chính (Primary Load-Bearing Assumption):**
  * Tốc độ ghi của SQLite trong chế độ WAL luôn duy trì dưới 1ms với cơ chế gom mẻ của `TelemetryPersistQueue`.
* **Điều kiện sụp đổ đầu tiên (First Failure Condition):**
  * Khi có đợt bùng nổ lưu lượng request đồng thời (burst of traffic), việc truy vấn aggregated trên toàn bộ bảng lịch sử từ REST API có thể xung đột đọc-ghi với tiến trình gom mẻ, kích hoạt lỗi `SQLITE_BUSY: database is locked` nếu thời gian chờ `busy_timeout` bị vượt quá.

---

## 3. TUYÊN BỐ ỨNG VIÊN ĐẮC CỬ (OFFICIAL PROCLAMATION OF THE WINNER)

### Người chiến thắng: CANDIDATE A — High-Performance Hybrid Observability Engine (75/80 Điểm)

### Lý do Candidate A chiến thắng trên cơ sở kỹ thuật thuần túy:
1. **Kiến trúc phân tầng toàn diện nhất (Dual-Plane Decoupling):** Candidate A là bản thiết kế duy nhất giải quyết trọn vẹn cả 2 mặt của bài toán giám sát AI Gateway:
   * **Mặt động (In-Flight Stream Velocity):** Giám sát các luồng đang chạy với xung nhịp cao thông qua bộ nhớ RAM $O(1)$.
   * **Mặt tĩnh & trung hạn (Sliding-Window Accounting Matrix):** Phân tích kế toán token đa chiều trên các khung trượt thời gian thực tế (5 phút, 1 giờ, 24 giờ, Toàn thời gian) mà không làm ô nhiễm hay suy giảm hiệu năng của luồng stream chính.
2. **Độ tinh vi của thuật toán đo đạc (Algorithmic Precision):** Việc áp dụng **Circular Timestamp Buffer (Bộ đệm vòng tem thời gian 3 giây)** là một giải pháp đạt chuẩn kỹ thuật cao (engineering excellence). Nó loại bỏ hoàn toàn các cấu trúc mảng tăng trưởng động vô hạn, đảm bảo việc tính toán vận tốc token (**Tokens/sec**) diễn ra trong độ phức tạp thời gian và không gian $O(1)$, bảo vệ Garbage Collector của Node.js.
3. **Chiến lược kiểm soát I/O bền vững (I/O Resilience):** Cơ chế hoãn ghi gom mẻ (**Debounced SQLite Batch Writer 2000ms / 50 items**) là điểm tựa vững chắc giúp SQLite WAL vận hành trơn tru ở tải cao, ngăn chặn 100% hiện tượng thắt cổ chai I/O khi nhiều CLI cùng xả stream dữ liệu.
4. **Bám sát triết lý Zero-External Infrastructure:** Hoàn toàn tự lực cánh sinh (self-contained) bên trong Fastify daemon và SQLite nội bộ, không kéo theo bất kỳ phần phụ thuộc cồng kềnh nào từ bên ngoài.

---

## 4. MA TRẬN TỔNG HỢP KONGMING (KONGMING SYNTHESIS MATRIX)

Mặc dù Candidate A giành chiến thắng nhờ bộ khung hạ tầng vượt trội, bản thân Candidate A vẫn tồn tại những "điểm mù" nguy hiểm nếu đưa vào sản xuất ngay lập tức. Trong vai trò Lead Architectural Verifier, Kongming thực hiện **Hợp nhất Kiến trúc Đỉnh cao (Kongming Synthesis)**: Ghép nối các phát kiến đột phá của Candidate B, C, D, và E vào nền tảng của Candidate A để tạo ra một **Hệ chuẩn Bất biến Cấp Sản xuất (Production-Grade Architectural Invariant)** mang tên:

### **"Obsidian Hybrid Telemetry & Fleet Radar" (OHTFR)**

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                       KONGMING SYNTHESIS ARCHITECTURE: OBSIDIAN HYBRID TELEMETRY                            │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                      │
                                                      ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ INGRESS & EXECUTION LAYER (Fastify / Supervisor / Routing Pipelines)                                      │
 │                                                                                                           │
 │  1. Adaptive Token Estimator [From D]: Multilingual Char Heuristic (3.7 ASCII / 2.2 Unicode)              │
 │  2. Deep Thinking Demuxer Hook [From D]: Real-time split (Prompt, Thinking/CoT, Content Tokens)           │
 │  3. Process Supervisor Spawner [From B]: Capture child.pid via onSpawn callback in pipe/pty-executor     │
 │  4. Dynamic Failover Tracker [From B]: Intercept 429 cooldowns & build Failover Trail Breadcrumbs         │
 └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                      │
                                                      ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ CONTROL PLANE CORE: HYBRID TELEMETRY ENGINE (apps/gateway/src/telemetry/)                                 │
 │                                                                                                           │
 │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ [CANDIDATE A CORE] In-Memory Execution Registry & O(1) Circular Velocity Buffer                     │  │
 │  │ - Active Streams Map: id -> { pid, provider, model, account, tokens: {in, cot, out}, velocity }    │  │
 │  │ - Sliding Window Aggregator: In-memory sliding buckets (5m, 1h, 24h, all)                           │  │
 │  │ - Dual Emergency Interceptor: AbortSignal cascade [A] + killProcessTree(pid) Kill Switch [B]        │  │
 │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
 │                                                      │                                                     │
 │          ┌───────────────────────────────────────────┴──────────────────────────────────────────┐          │
 │          ▼ (Real-time Broadcast & Hydration)                                                    ▼          │
 │  ┌────────────────────────────────────────────────┐                  ┌──────────────────────────────────┐  │
 │  │ SSE Real-time Broadcaster                      │                  │ Persistence Engine [From E + A]  │  │
 │  │ - Pulse Throttling: 100ms interval             │                  │ - TelemetryPersistQueue [E]      │  │
 │  │ - Initial Snapshot Hydration [From C]:         │                  │ - Debounced Flush: 2000ms / 50   │  │
 │  │   Emit "radar:snapshot" on SSE connect         │                  │   items into SQLite WAL [A]      │  │
 │  │ - Failover Breadcrumb & Saturation events [B+D]│                  │ - Graceful flush on Fastify close│  │
 │  └────────────────────────────────────────────────┘                  └──────────────────────────────────┘  │
 └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                │                                                         │
           SSE: /api/admin/events (Pulse & Snapshots)              REST: /api/admin/telemetry/* (Ledger & Matrix)
                                ▼                                                         ▼
 ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐
 │ WEB CONSOLE FRONTEND (apps/web/src/views/TelemetryStationView.tsx) - OBSIDIAN CYBERDECK HUD               │
 │                                                                                                           │
 │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ ZONE 1: TOP HUD STATUS CARDS & ONE-CLICK DIAGNOSTIC PROBE HARNESS [From D]                          │  │
 │  │ Cumulative Ingress (Prompt) | Egress (Content) | Thinking (CoT) | Fleet TPS | Diagnostic Probes     │  │
 │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
 │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ ZONE 2: PROVIDER SLOT SATURATION & CONCURRENCY MATRIX [From D]                                      │  │
 │  │ Visual capacity bar (activeSlots / maxSlots) per CLI Adapter | Cooldown countdowns on 429           │  │
 │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
 │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ ZONE 3: PLANE 1 - LIVE EXECUTION RADAR [From A + B]                                                 │  │
 │  │ Grid: [PID] | [ReqID] | [Provider/Model] | [Account/Sandbox] | [In/CoT/Out Toks] | [Tok/s] | [KILL] │  │
 │  │ Sub-strip: Visual Failover Trail Breadcrumbs [From B] (P0 [429] -> P1 [200 OK])                     │  │
 │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
 │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ ZONE 4: PLANE 2 - TOKEN ACCOUNTING & AUDIT LEDGER [From A + E]                                      │  │
 │  │ Sliding Filters (5m, 1h, 24h, all) [A] | Paginated SQLite Audit Log with Search & Filters [E]       │  │
 │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
 └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Bảng chi tiết các đột phá được hợp nhất:

| Đột phá Kiến trúc | Xuất xứ Gốc | Điểm mù của Candidate A được giải quyết | Cơ chế Hiện thực hóa trong Thiết kế Hợp nhất |
| :--- | :---: | :--- | :--- |
| **Bóc tách Token CoT / Thinking Thời gian thực** | **Candidate D** | Candidate A chỉ tính chung tổng output tokens, không nhìn thấy tiến trình suy nghĩ của các model thế hệ mới. | Tích hợp sâu vào `ThinkingDemuxer` (`onThoughtDelta` và `onContentDelta`), hiển thị cột token suy nghĩ riêng biệt. |
| **Bộ đếm Ký tự Thích ứng Đa ngữ** | **Candidate D** | Candidate A ước lượng token tĩnh theo tỷ lệ 3.5 ký tự/token, gây sai số nghiêm trọng với tiếng Việt và CJK. | Tích hợp thuật toán adaptive 3.7 (ASCII/Code) và 2.2 (Unicode), đạt độ chính xác > 95% mà zero-overhead. |
| **Cảnh báo Bão hòa Slot Provider (Saturation Bar)** | **Candidate D** | Candidate A không cảnh báo trước khi một adapter CLI bị đầy slot hoặc rơi vào cooldown. | Bổ sung thanh trực quan hóa `activeSlots / maxSlots` kèm chỉ báo màu amber/đỏ và đếm ngược Cooldown. |
| **Diagnostic Probe Harness** | **Candidate D** | Khi khai tử Chat Playground, lập trình viên mất đi công cụ kiểm tra nhanh đường truyền CLI. | Đưa thanh nút kiểm thử 1-click (Ping, Code, CoT) ngay trên Header HUD để phát xung test tức thì. |
| **Gắn kết OS PID thực tế (onSpawn Binding)** | **Candidate B** | Candidate A chỉ quản lý Request ID trừu tượng, không nắm được tiến trình thực sự dưới OS. | Bổ sung callback `onSpawn: (pid) => void` vào `pipe-executor` và `pty-executor`, ánh xạ 1-1 với worker slot. |
| **Cưỡng chế Kill Process Tree (Kill Switch)** | **Candidate B** | `AbortSignal` của Candidate A có thể bị bỏ qua nếu CLI subprocess bị treo I/O hoặc deadlock. | Nút Kill trên UI kích hoạt lệnh gọi `killProcessTree(pid)`, giải phóng ngay lập tức slot và thư mục sandbox. |
| **Vết điều hướng lỗi (Failover Trail Breadcrumbs)** | **Candidate B** | Candidate A không giải thích được vì sao một request bị trôi từ adapter này sang adapter khác. | Hiển thị chuỗi breadcrumb trực quan khi router thực hiện fallback (kèm mã lỗi HTTP và độ trễ). |
| **Snapshot Hydration khi kết nối SSE** | **Candidate C** | Mở tab mới hoặc F5 trong Candidate A sẽ gặp bảng trắng cho tới khi có delta chunk mới phát ra. | Gateway gửi ngay lập tức event `radar:snapshot` chứa toàn bộ in-flight map ngay khi client mở kênh SSE. |
| **Kích hoạt Schema Migration & Audit Ledger** | **Candidate E** | Candidate A chưa hoàn thiện lược đồ cơ sở dữ liệu và thiếu bảng kiểm toán phân trang. | Thực hiện migration SQLite cho bảng `request_metrics`, bổ sung `adapter_id`, `reasoning_tokens`, composite indexes, và REST endpoints phân trang. |

---

## 5. CHỈ THỊ KIẾN TRÚC CHO KẾ HOẠCH TRIỂN KHAI CỦA CONTROLLER (ARCHITECTURAL DIRECTIVES)

Để đảm bảo việc thi công đạt độ chuẩn xác cấp sản xuất, Controller và Đội ngũ Kỹ sư phải tuân thủ nghiêm ngặt 5 pha thực thi kỹ thuật dưới đây:

### PHA 1: NÂNG CẤP LƯỢC ĐỒ DỮ LIỆU & BỘ ĐỆM GHI BỀN VỮNG (SCHEMA & PERSISTENCE)
1. **Drizzle ORM Migration (`apps/gateway/src/db/schema.ts` & `migrate.ts`):**
   * Mở rộng bảng `request_metrics`:
     * Thêm trường `adapter_id` (text, not null, định danh CLI provider như `codex-cli`, `gemini-cli`).
     * Thêm trường `reasoning_tokens` (integer, default 0, lưu số token CoT).
     * Thêm trường `total_tokens` (integer, default 0, lưu tổng prompt + completion + reasoning).
   * Tạo các Composite Indexes nhằm tối ưu hóa các truy vấn lọc và aggregated metrics:
     * `idx_request_metrics_created_at` trên cột `created_at`.
     * `idx_request_metrics_adapter_model` trên bộ đôi `(adapter_id, model_executed)`.
2. **Xây dựng `TelemetryPersistQueue` gom mẻ có hoãn (`apps/gateway/src/telemetry/persist-queue.ts`):**
   * Hoãn ghi với chu kỳ **2.000ms** hoặc khi gom đủ **50 bản ghi**.
   * Sử dụng transaction duy nhất của `better-sqlite3` để thực thi batch insert, đảm bảo zero-lock cho luồng stream chính.
   * Đăng ký hook `fastify.addHook("onClose", ...)` để flush sạch sẽ toàn bộ hàng đợi trong RAM xuống đĩa trước khi gateway tắt hẳn.

### PHA 2: IN-MEMORY EXECUTION REGISTRY, PID BINDING & CƠ CHẾ ĐO VẬN TỐC
1. **Nâng cấp Process Supervisors (`pipe-executor.ts` & `pty-executor.ts`):**
   * Bổ sung thuộc tính `onSpawn?: (pid: number) => void` vào interface `ProcessSpawnOptions`.
   * Ngay sau khi hàm `execa(...)` hoặc `pty.spawn(...)` sinh ra tiến trình, gọi ngay `onSpawn(child.pid)` để chuyển giao PID cho telemetry engine.
2. **Xây dựng `ExecutionRegistry` Singleton (`apps/gateway/src/telemetry/execution-registry.ts`):**
   * Quản lý `Map<string, ActiveExecutionRecord>` với cấu trúc:
     ```typescript
     export interface ActiveExecutionRecord {
       requestId: string;
       pid?: number;
       adapterId: string;
       modelRequested: string;
       modelExecuted: string;
       accountId: string;
       sandboxDir: string;
       startTime: number;
       firstTokenTime?: number;
       promptTokens: number;
       reasoningTokens: number;
       contentTokens: number;
       phase: "CONNECTING" | "REASONING" | "STREAMING" | "COMPLETED" | "FAILED" | "ABORTED";
       velocityBuffer: Array<{ timestamp: number; tokens: number }>; // Circular buffer sliding 3s
       failoverTrail?: Array<{ stage: string; adapterId: string; status: number; latencyMs: number }>;
     }
     ```
   * Cài đặt giải thuật **Circular Timestamp Buffer (3 giây)**: Mỗi delta chunk đến sẽ đẩy `{ timestamp: Date.now(), tokens: count }`, loại bỏ các mục cũ hơn $t - 3000ms$. Vận tốc tức thời được tính:
     $$\text{Velocity (tok/s)} = \frac{\sum \text{tokens in window}}{\Delta t \text{ (seconds)}}$$
3. **Nâng cấp Thuật toán Ước lượng Token (`apps/gateway/src/utils/token-estimator.ts`):**
   * Thay thế phép chia 3.5 ký tự cứng nhắc bằng giải thuật Adaptive Char Heuristic: bóc tách đoạn văn bản, kiểm tra mã ký tự Unicode để áp dụng tỷ lệ 3.7 cho ASCII/Code và 2.2 cho ký tự đa ngữ.

### PHA 3: TÍCH HỢP HOOK STREAMING, FAILOVER VÀ API GATEWAY
1. **Móc nối Telemetry vào Luồng Chat Completion (`apps/gateway/src/api/routes/openai-chat.ts`):**
   * Khởi tạo request: Ước tính prompt tokens, đăng ký vào `ExecutionRegistry`, phát xung `request:start` qua SSE.
   * Gắn kết với `ThinkingDemuxer`:
     * Khi nhận callback `onThoughtDelta(chunk)`: Tích lũy `reasoningTokens`, cập nhật phase thành `REASONING`, tính velocity.
     * Khi nhận callback `onContentDelta(chunk)`: Tích lũy `contentTokens`, cập nhật phase thành `STREAMING`, ghi nhận `TTFT` tại chunk nội dung đầu tiên.
   * Micro-throttling SSE Pulse: Không broadcast theo từng delta nhỏ mà áp dụng bộ đệm xung nhịp tối đa **100ms/lần** (`telemetry:progress`), giảm tải 90% lượng message trên kênh SSE.
   * Finalize Request: Đưa bản ghi vào `TelemetryPersistQueue`, cập nhật trạng thái `COMPLETED` (giữ lại 5 giây trên radar trước khi dọn dẹp) và broadcast `request:complete`.
2. **Móc nối Vết chuyển hướng Lỗi (`router/load-balancer.ts` & `pipeline-executor.ts`):**
   * Khi một target gặp lỗi (ví dụ dính 429 hoặc process crash) và kích hoạt fallback sang provider/tài khoản tiếp theo, ghi lại thông tin vào mảng `failoverTrail` của record và broadcast `telemetry:failover`.
3. **Kênh SSE & REST Endpoints Quản trị:**
   * SSE `/api/admin/events`: Khi client kết nối, lập tức phát event `radar:snapshot` chứa toàn bộ danh sách active in-flight requests và slot capacity hiện tại.
   * REST Endpoint `/api/admin/telemetry/abort/:requestId`: Cho phép client UI gửi yêu cầu cưỡng chế hủy tiến trình: kích hoạt `AbortController` và gọi ngay lập tức `killProcessTree(record.pid)`.
   * REST Endpoint `/api/admin/telemetry/ledger`: Phục vụ truy vấn phân trang, tìm kiếm, lọc theo ngày/giờ và mã provider từ bảng `request_metrics`.
   * REST Endpoint `/api/admin/telemetry/probe`: Nhận lệnh kích hoạt probe kiểm thử siêu nhẹ từ header HUD.

### PHA 4: TÁI TẠO GIAO DIỆN CONSOLE FRONTEND (OBSIDIAN CYBERDECK HUD)
1. **Khai tử triệt để Chat Playground:**
   * Dỡ bỏ `playground` khỏi `NavTab` trong `apps/web/src/components/layout/Sidebar.tsx`, thay bằng `radar` với nhãn **"Fleet Radar & Ledger"** và icon `Radar` hoặc `Cpu`.
   * Dỡ bỏ hoàn toàn việc import `PlaygroundView.tsx` trong `apps/web/src/App.tsx`, thay bằng `TelemetryStationView.tsx`.
2. **Hiện thực hóa `TelemetryStationView.tsx` với 4 phân khu chức năng:**
   * **Phân khu 1 - Top Diagnostic HUD Bar:**
     * Thẻ chỉ số tổng: Cumulative Ingress (Prompt) Tokens, Cumulative Egress (Content) Tokens, Reasoning (CoT) Tokens, Fleet TPS hiện thời.
     * Cụm nút **Diagnostic Probe Harness**: 3 nút phát xung kiểm thử nhanh (Ping, CoT Math, Code Gen) kèm đèn LED báo trạng thái phản hồi.
   * **Phân khu 2 - Provider Slot Saturation Matrix:**
     * Thanh đo tỷ lệ chiếm dụng worker slot trực quan cho từng adapter (`codex-cli`, `gemini-cli`, `claude-cli`), tự động chuyển sang màu vàng hổ phách khi đạt 80% và màu đỏ khi bão hòa 100%.
     * Hiển thị đồng hồ đếm ngược thời gian Cooldown đối với các account đang bị tạm dừng vì dính lỗi 429.
   * **Phân khu 3 - Plane 1: Live Execution Radar & Failover Trail:**
     * Bảng ma trận tiến trình in-flight thời gian thực: Hiển thị OS PID, Request ID, Provider/Model, Account & Sandbox, Phân loại Tokens (In / CoT / Out), Vận tốc tức thời (tok/s), TTFT và **Nút Emergency Kill Switch (Màu đỏ neon)**.
     * Dải thông tin **Failover Trail Breadcrumbs** phía dưới: Hiển thị trực quan quá trình fallback của request (ví dụ: `P0: codex [429] ➔ P1: gemini [200 OK]`).
   * **Phân khu 4 - Plane 2: Token Accounting Matrix & Audit Ledger:**
     * Bộ chọn khung trượt thời gian (Sliding Window Selector): `[ 5 Phút ]`, `[ 1 Giờ ]`, `[ 24 Giờ ]`, `[ Toàn thời gian ]`.
     * Bảng phân tích đa chiều phân bổ token và chi phí ước tính theo từng Provider và Model.
     * Bảng nhật ký kiểm toán lịch sử (Historical Ledger) hỗ trợ phân trang và tìm kiếm theo requestId.

### PHA 5: BỘ KIỂM THỬ XÁC MINH & BẢO ĐẢM TÍNH BẤT BIẾN (VERIFICATION SUITE)
1. **Unit Tests (`tests/unit/telemetry-registry.test.ts` & `token-estimator.test.ts`):**
   * Kiểm thử giải thuật Circular Buffer: Xác minh việc xóa các mốc thời gian ngoài cửa sổ 3 giây và tính chính xác vận tốc tok/s.
   * Kiểm thử Adaptive Char Heuristic: Kiểm tra độ sai lệch token với cả chuỗi mã nguồn ASCII và chuỗi văn bản tiếng Việt/Unicode phức tạp.
   * Kiểm thử `TelemetryPersistQueue`: Đảm bảo hàng đợi tự động gom mẻ và flush đúng chu kỳ 2000ms hoặc khi đủ 50 phần tử.
2. **Integration & Concurrency Tests (`tests/integration/telemetry-concurrency.test.ts`):**
   * Giả lập 50 stream đồng thời xả dữ liệu với tốc độ cao: Xác nhận độ trễ Event Loop của Fastify không vượt quá 15ms.
   * Kiểm tra SQLite WAL Mode: Xác nhận không xuất hiện bất kỳ lỗi `SQLITE_BUSY` nào trong quá trình vừa stream vừa flush mẻ ghi.
   * Kiểm thử Snapshot Hydration: Mở kết nối SSE mới giữa chừng và kiểm tra event `radar:snapshot` có phản ánh chính xác 100% các request đang in-flight hay không.
3. **E2E Acceptance Tests (`tests/e2e/telemetry-station.test.ts`):**
   * Kiểm thử kịch bản khai tử Playground: Đảm bảo route và tab Sidebar cũ đã biến mất hoàn toàn, không còn sót lại giao diện chat bong bóng.
   * Kiểm thử Emergency Kill Switch: Gửi một request giả lập chạy ngập thời gian, bấm nút Kill trên UI và xác nhận tiến trình OS con bị tiêu diệt ngay lập tức, worker slot được giải phóng trong vòng dưới 200ms.
   * Kiểm thử Failover Breadcrumbs: Mô phỏng adapter P0 dính mã lỗi 429, kiểm tra breadcrumb trên UI vẽ chính xác đường chuyển dịch từ P0 sang P1.

---

### KẾT LUẬN THẨM ĐỊNH (FINAL VERDICT)

Bản đề xuất **Candidate A** với sự gia cố từ **Ma trận Tổng hợp Kongming (Kongming Synthesis)** mang lại một giải pháp kiến trúc hoàn hảo: Chuyển đổi `cli-to-api` từ một giao diện thử nghiệm chat sơ khai thành một **Trung tâm Điều hành & Đo lường Vi mô Đẳng cấp Obsidian Cyberdeck**. 

Kiến trúc này triệt tiêu hoàn toàn rủi ro suy giảm hiệu năng trên hot-path streaming, bảo vệ tuyệt đối cơ sở dữ liệu SQLite cục bộ, đồng thời cung cấp cho đội ngũ vận hành khả năng quan sát và kiểm soát tiến trình hệ thống ở cấp độ từng nano-giây.

**Phê duyệt chuyển tiếp:** Controller có toàn quyền sử dụng bản chỉ thị kiến trúc này để triển khai lập kế hoạch chi tiết (Phase Implementation Plan) ngay lập tức.
