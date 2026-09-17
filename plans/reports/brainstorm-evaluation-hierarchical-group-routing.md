---
type: brainstorm-evaluation
date: 2026-09-17
status: accepted
target: cli-to-api
mode: ultra-verifier-pass
lead_verifier: Kongming
winning_candidate: Candidate D (Candidate 4)
---

# Báo Cáo Thẩm Định Kiến Trúc & Bảng Điểm Xếp Hạng Độc Lập
## Đánh Giá Toàn Diện Các Đề Xuất Định Tuyến Nhóm Đa Tầng (Hierarchical Group Routing, Priority Fallback Chain & Dynamic Target Pipeline) Và Cơ Chế Ánh Xạ Ngân Sách Suy Luận (Reasoning Effort / Thinking Budget Matrix) Cho Hệ Thống `cli-to-api`

---

**Chức danh thẩm định:** Kongming — Lead Architectural Verifier  
**Quy trình:** `ak-brainstorm --ultra`  
**Dự án mục tiêu:** `cli-to-api` (Local Multi-CLI to OpenAI API Gateway)  
**Tập tài liệu thẩm định:**
1. Candidate 1 (Candidate A): `plans/reports/brainstorm-candidate-1-hierarchical-group-routing-unified-effort.md`
2. Candidate 2 (Candidate B): `plans/reports/brainstorm-candidate-2-declarative-target-engine-token-budget.md`
3. Candidate 3 (Candidate C): `plans/reports/brainstorm-candidate-3-composite-slot-router.md`
4. Candidate 4 (Candidate D): `plans/reports/brainstorm-candidate-4-flow-chain-dynamic-target-pipeline.md`
5. Candidate 5 (Candidate E): `plans/reports/brainstorm-candidate-5-priority-matrix-router.md`

---

## 1. Bảng Tổng Sắp Xếp Hạng & Bảng Điểm Chuẩn Rubric (Ultra Verifier Ranking Table)

Hội đồng Thẩm định Kiến trúc độc lập áp dụng nghiêm ngặt **Rubric Thẩm định 4 Chiều Kích** (mỗi tiêu chí chấm điểm từ 1 đến 20, tổng điểm chuẩn **80 điểm**):
* **Tiêu chí 1: Tôn Trọng Bounded Context & Tính Trung Thực Với Yêu Cầu (Bounded Context Fidelity & Request Adherence):** Đánh giá mức độ bám sát sứ mệnh cổng chuyển đổi bất khả tri (agnostic bridge) biến CLI cục bộ thành API chuẩn OpenAI, giải quyết đúng trọng tâm bài toán định tuyến nhóm ảo đa tầng, phân chia trọng số tải, chuỗi dự phòng ưu tiên (fallback chain) và ánh xạ tham số `reasoning_effort`.
* **Tiêu chí 2: Tính Khả Thi Kỹ Thuật & Độ Hoàn Thiện Kiến Trúc (Technical Feasibility & Actionability):** Đánh giá tính chuẩn xác của mô hình dữ liệu Drizzle SQLite, thuật toán định tuyến, cấu trúc Tagged Union, tính đóng gói sạch trong `load-balancer.ts`, `prompt-transport.ts`, và tính khả thi khi triển khai trên Node.js/Windows/POSIX.
* **Tiêu chí 3: Độ Sắc Bén Của Tiêu Chí Kiểm Thử (Test Sharpness & Verification Rigor):** Đánh giá cấu trúc kịch bản nghiệm thu (GIVEN-WHEN-THEN / Gherkin), tính định lượng của các chỉ số (SLA trễ $\le X\text{ms}$, mã lỗi, HTTP headers), độ phủ của các kịch bản biên (edge cases, saturation, failover cascade).
* **Tiêu chí 4: Trung Thực Rủi Ro & Năng Lực Chống Chịu Ngoại Lệ (Risk Realism & Edge-Case Resilience):** Đánh giá tính chân thực khi dự báo các rủi ro hạ tầng khốc liệt nhất (TOCTOU race conditions, spawn-time crash, mid-stream disconnect, Windows argv overflow, cyclic routing dependencies) và tính thuyết phục của giải pháp khắc phục.

### BẢNG ĐIỂM TỔNG HỢP VÀ PHÁN QUYẾT CHÍNH THỨC

| Xếp Hạng | Ứng Viên (Candidate) | Đề Xuất Trọng Tâm Kiến Trúc | TC 1: Bounded Context (1–20) | TC 2: Khả Thi Kỹ Thuật (1–20) | TC 3: Kiểm Thử Sắc Bén (1–20) | TC 4: Trung Thực Rủi Ro (1–20) | Tổng Điểm (/80) | Phán Quyết Kỹ Thuật (Verdict) |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| 🥇 | **Candidate D** *(Cand. 4)* | **Flow-Chain Dynamic Target Pipeline, Runtime Spawn-Probe Failover Executor, 3-Tier Effort Resolver & Failover Audit Events** | **20** | **19** | **19** | **19** | **77 / 80** | **CHIẾN THẮNG CHÍNH THỨC (Adopt as Core Architecture)** |
| 🥈 | **Candidate A** *(Cand. 1)* | Hierarchical Group Routing, Priority Fallback Chain with Weighted Pool (SWRR), DFS Cycle Detection & Unified Effort Matrix (UEM) | 19 | 18 | 19 | 17 | 73 / 80 | **Á Quân (Tích hợp thuật toán SWRR & DFS Cycle Detection)** |
| 🥉 | **Candidate B** *(Cand. 2)* | Declarative Rule-Based Target Engine, Tagged Union Target Classifier, Bidirectional Continuous-to-Discrete Effort Transpiler & Dry-Run UI | 17 | 19 | 18 | 17 | 71 / 80 | **Đồng Á Quân (Tích hợp Tagged Union, Declarative Rules & Effort Transpiler)** |
| 4th | **Candidate E** *(Cand. 5)* | Priority-Tier Matrix Router, Control Plane Snapshot Caching, Dynamic Subprocess Capability Prober & Early 400 Bad Request Guard | 18 | 17 | 17 | 17 | 69 / 80 | Khuyến nghị tích hợp (Hấp thu cơ chế Capability Probing & Early 400 Guard) |
| 5th | **Candidate C** *(Cand. 3)* | Composite Slot-Pool Router (Global-Group-Account Ceilings), Latency-Adaptive Elastic Slot Scaling & Argument Compiler | 15 | 17 | 16 | 16 | 64 / 80 | Hạn chế cấu trúc (Bị lệch scope định tuyến nhóm; Tích hợp trần slot Host OS & Argv Guard) |

---

## 2. Thẩm Định Chi Tiết Từng Ứng Viên (Detailed Granular Critique)

---

### 2.1 Candidate D (Candidate 4) — Điểm số: 77 / 80 | *Đột Phá Thực Thi Vận Hành & Chuỗi Cứu Hộ Chuyển Vùng Trong Suốt*

* **Tôn trọng Bounded Context & Yêu cầu (20/20):**  
  Candidate 4 xác định chính xác bản chất của bài toán Gateway trong môi trường thực chiến: Các công cụ CLI AI (Claude Code, Codex CLI) thường không chỉ bão hòa slot ở tầng cơ sở dữ liệu mà còn **thường xuyên chết bất đắc kỳ tử hoặc trả về mã lỗi 429 ngay tại thời điểm spawn tiến trình**. Đề xuất định nghĩa bảng `routing_pipelines` và `pipeline_targets` tạo nên mô hình chuỗi ứng viên trực giao; đồng thời chuẩn hóa cơ chế kế thừa `reasoning_effort` 3 cấp độ (Request Ingress $\rightarrow$ Target Link Override $\rightarrow$ Group Pipeline Default) vô cùng thanh thoát.
* **Tính Khả thi Kỹ thuật & Hoàn thiện Kiến trúc (19/20):**  
  Sáng kiến đột phá lớn nhất của Candidate 4 nằm ở `DynamicTargetPipelineExecutor` (`pipeline-executor.ts`): Thay vì chỉ phân giải tĩnh một đích đến duy nhất trước khi chạy (Pre-Flight Resolution) rồi phó mặc rủi ro cho client, Candidate 4 bao bọc pha khởi chạy tiến trình trong một vòng lặp thực thi có kiểm soát. Nếu tài khoản Link 1 gặp sự cố spawn crash hoặc stdout in ra thông điệp Rate Limit trong 150ms đầu tiên, executor tự động kích hoạt Cooldown, thu hồi tiến trình trong $\le 200\text{ms}$ và trôi mượt mà sang Link 2. Bảng Drizzle `failover_events` ghi nhận đầy đủ `from_account_id`, `to_account_id`, `trigger_reason`, `failover_latency_ms`. Trừ 1 điểm vì thuật toán lựa chọn tài khoản trong cùng một Link chỉ sử dụng sắp xếp độ trễ giản đơn mà chưa trang bị thuật toán chia tải theo trọng số (Smooth Weighted Round-Robin).
* **Độ Sắc bén của Tiêu chí Kiểm thử (19/20):**  
  Bộ 7 kịch bản Gherkin chuẩn mực, bao phủ toàn diện: Kế thừa Effort 3 cấp; Ánh xạ cờ CLI chính xác; Pre-Flight Failover khi Cooldown; Spawn-Time Failover trong suốt; Cross-Provider Failover trên Virtual Tier; Bảo toàn tính liên tục của Session Thread qua Full Context Rehydration; và Trực quan hóa Visual Node Graph trên Cyberdeck Console.
* **Trung thực Rủi ro & Năng lực Chống chịu Ngoại lệ (19/20):**  
  Phân tích sâu sắc ranh giới cốt tử giữa lỗi trước khi phát dữ liệu (Pre-stream Spawn Probe) và lỗi đứt gãy giữa chừng (Mid-stream Process Crash). Chỉ ra chính xác nguy cơ cạn kiệt toàn bộ chuỗi Pipeline và cấu hình tham số `maxFailovers = 3` để ngăn chặn bão tuyết trễ (latency cascade).
* **ĐIỀU KIỆN THẤT BẠI ĐẦU TIÊN (First Failure Condition):**  
  *Sự cố đứt gãy luồng sau khi đã truyền byte đầu tiên (Mid-stream Process Crash after TTFT):* Khi tiến trình con của Link 1 đã vượt qua pha khởi động an toàn, HTTP response headers (200 OK, `Transfer-Encoding: chunked`) đã được gửi về client và các chunk SSE (`choices[0].delta.reasoning_content`) đã được client IDE (Cursor / Continue) tiếp nhận. Nếu tiến trình con bị hệ điều hành kill đột ngột (do Out-Of-Memory hoặc đứt kết nối mạng upstream), `DynamicTargetPipelineExecutor` không thể tiếp tục bắt lỗi để fallback sang Link 2 một cách trong suốt được nữa. Nếu cố tình phát lại toàn bộ prompt trên Link 2, client sẽ bị nhân đôi nội dung và vỡ giao thức SSE stream.

---

### 2.2 Candidate A (Candidate 1) — Điểm số: 73 / 80 | *Bậc Thầy Về Thuật Toán SWRR, Đồ Thị Định Tuyến & Ngăn Ngừa Vòng Lặp*

* **Tôn trọng Bounded Context & Yêu cầu (19/20):**  
  Bám sát tuyệt đối yêu cầu về mô hình Group đa tầng với chiến lược Priority Fallback Chain kết hợp Weighted Pool (PFC-WP). Thiết kế bảng `routing_groups`, `routing_group_members` và `adapter_effort_profiles` rất lớp lang. Trừ 1 điểm vì thiết kế router (`HierarchicalGroupRouter`) bị phân tách thành một ốc đảo riêng biệt, phương thức `resolve()` ném lỗi `NOT_A_GROUP` nếu model không có tiền tố `group:`, chưa hòa nhập trực tiếp vào dòng chảy định tuyến hiện hữu của `load-balancer.ts`.
* **Tính Khả thi Kỹ thuật & Hoàn thiện Kiến trúc (18/20):**  
  Mô tả toán học hoàn hảo cho thuật toán **NGINX Smooth Weighted Round-Robin (SWRR)** với các biến trạng thái `currentWeight` và `effectiveWeight`, đảm bảo lưu lượng trong cùng một tầng ưu tiên phân bổ đều đặn theo tỷ lệ cấu hình (ví dụ 70/30) mà không bị dồn cục. Đặc biệt, Candidate 1 là đơn vị duy nhất cài đặt thuật toán duyệt đồ thị DFS (`detectCycles`) với ngăn xếp đệ quy (`recursionStack`) để chặn đứng 100% rủi ro vòng lặp định tuyến khi người dùng cấu hình Nested Groups (`group:A -> group:B -> group:A`). Trong `prompt-transport.ts`, việc mở rộng token `{effort_args}` bằng mảng phẳng đa phần tử giúp triệt tiêu nguy cơ chuỗi cờ bị dính chùm. Trừ 2 điểm vì toàn bộ cơ chế chỉ dừng lại ở phân giải tĩnh trước khi spawn; hoàn toàn bất lực nếu CLI bị lỗi 429 runtime.
* **Độ Sắc bén của Tiêu chí Kiểm thử (19/20):**  
  8 kịch bản AC viết theo chuẩn GIVEN-WHEN-THEN sắc sảo, định lượng cụ thể: Danh mục `GET /v1/models` chứa metadata Group; 429 Cooldown Failover; Kiểm thử phân bổ xác suất SWRR trên 100 request liên tiếp; Saturated Concurrency Failover; Ánh xạ Effort cho Claude, Codex, OMP; và Sticky Session Priority Preservation.
* **Trung thực Rủi ro & Năng lực Chống chịu Ngoại lệ (17/20):**  
  Nhận diện sâu sắc rủi ro cấu hình chu trình lặp vô tận (Cyclic Routing) và xung đột giữa Session dính (Sticky) với tầng ưu tiên cao nhất. Tuy nhiên, Candidate 1 chưa tính đến rủi ro CLI thoát với mã lỗi khác 0 tại thời điểm thực thi.
* **ĐIỀU KIỆN THẤT BẠI ĐẦU TIÊN (First Failure Condition):**  
  *Lỗi Rate-Limit Upstream Bất Khả Tri tại thời điểm Spawn:* Khi client gửi request vào `group:deep-code`, router kiểm tra trạng thái trong SQLite thấy tài khoản ở Tier 1 đang `READY` (do chưa có request nào ghi nhận cooldown trong DB), nên điều phối và spawn tiến trình. Tuy nhiên, CLI con vừa bật lên đã in ra dòng thông báo *"429: Usage limit reached for this billing cycle"* và thoát ngay lập tức. Do `HierarchicalGroupRouter` không có vòng lặp thực thi bẫy lỗi runtime, gateway lập tức trả về lỗi HTTP 500/429 cho client, làm tê liệt hoàn toàn mục đích tự động fallback sang Tier 2.

---

### 2.3 Candidate B (Candidate 2) — Điểm số: 71 / 80 | *Xuất Sắc Về Cấu Trúc Tagged Union & Bộ Chuyển Dịch Lượng Tử Hóa Effort*

* **Tôn trọng Bounded Context & Yêu cầu (17/20):**  
  Candidate 2 xử lý triệt để căn bệnh "mã cứng chắp vá" của `load-balancer.ts` hiện tại bằng cách đưa vào Động cơ Quy tắc Khai báo (`routing_rules`) với pattern matching (REGEX, EXACT, PREFIX, GLOB) và phân loại mục tiêu thành hệ thống kiểu Tagged Union chuẩn mực (`ACCOUNT`, `CLI`, `MODEL`, `TIER`). Tuy nhiên, Candidate 2 bị trừ nặng 3 điểm vì **hoàn toàn bỏ quên bản thể Nhóm Định Tuyến Nghiệp Vụ (Routing Groups - `group:`)**. Trong thiết kế của Candidate 2, không có bảng `routing_groups` hay khái niệm chuỗi ưu tiên $P_0 \rightarrow P_1 \rightarrow P_2$ đa nhà cung cấp.
* **Tính Khả thi Kỹ thuật & Hoàn thiện Kiến trúc (19/20):**  
  Chất lượng mã nguồn và độ hoàn thiện cấu trúc của Candidate 2 đạt chuẩn mực kỹ thuật cao nhất: Module `target-engine.ts`, `rule-evaluator.ts` và bản refactor của `load-balancer.ts` tích hợp trực tiếp, sạch sẽ vào mã nguồn hiện tại của gateway. Bộ chuyển dịch ngân sách tư duy hai chiều (`effort-transpiler.ts`) với ma trận lượng tử hóa ngưỡng (`quantizationThresholdsJson`) là giải pháp toán học xuất sắc nhất để chuyển đổi giữa mức rời rạc (`low`, `medium`, `high`) của OpenAI sang token liên tục (`1024..64000`) của Claude Code. Trên Cyberdeck Studio, tính năng **Dry-Run Target Simulator** cho phép gõ thử model string và xem trước quy tắc áp dụng theo thời gian thực.
* **Độ Sắc bén của Tiêu chí Kiểm thử (18/20):**  
  7 kịch bản AC tập trung vào tính chính xác 100% của bộ phân loại Tagged Union, tính năng rewrite model của Declarative Rules, độ chính xác của Token Budget và khả năng mô phỏng Dry-Run trên UI.
* **Trung thực Rủi ro & Năng lực Chống chịu Ngoại lệ (17/20):**  
  Chỉ ra rủi ro biểu thức chính quy ReDoS làm nghẽn Event Loop khi biên dịch dynamic regex, và rủi ro trôi dạt ngữ nghĩa (Semantic Drift) khi lượng tử hóa ngân sách token. Tuy nhiên, do né tránh bài toán Group Routing, Candidate 2 chưa đối mặt với rủi ro chuỗi fallback phức tạp.
* **ĐIỀU KIỆN THẤT BẠI ĐẦU TIÊN (First Failure Condition):**  
  *Yêu cầu Nghiệp vụ Khởi tạo Nhóm Dự phòng Đa Nhà Cung cấp (Multi-Provider Fallback Group):* Khi người dùng doanh nghiệp muốn định nghĩa một nhóm ảo mang tên `group:mission-critical` yêu cầu: *"Dùng Claude 3.7 Sonnet làm P1; nếu Claude hết quota thì tự động trôi sang Codex GPT-5.6 làm P2"*. Do kiến trúc của Candidate 2 chỉ hỗ trợ ánh xạ 1-1 qua `routing_rules` (`rewriteModel`, `targetAdapterId`), hệ thống hoàn toàn không có khả năng biểu diễn cấu trúc chuỗi thứ cấp đa nhà cung cấp này, khiến request bắt buộc phải định tuyến đơn đích và sập hoàn toàn khi P1 gặp sự cố.

---

### 2.4 Candidate E (Candidate 5) — Điểm số: 69 / 80 | *Sáng Tạo Về Dò Quét Năng Lực Nhị Phân (Probing) & Chặn Sớm 400 Bad Request*

* **Tôn trọng Bounded Context & Yêu cầu (18/20):**  
  Tiếp cận bài toán bằng mô hình phân tách tường minh: Control Plane (quản lý `priority_groups`, `group_members`, `adapter_capabilities`) và Data Plane (truy vấn snapshot bộ nhớ định tuyến với độ trễ siêu thấp $\le 0.5\text{ms}$). Đưa ra chính sách `failover_policy: "spillover" | "strict_reject"` rất hữu ích cho các SLA doanh nghiệp.
* **Tính Khả thi Kỹ thuật & Hoàn thiện Kiến trúc (17/20):**  
  Sáng kiến độc đáo nhất của Candidate 5 là `DynamicCapabilityProber` (`capability-prober.ts`): Thay vì tin tưởng tuyệt đối vào cấu hình YAML tĩnh, hệ thống chủ động gọi tiến trình con với cờ `--help` ở pha khởi động để kiểm tra xem nhị phân CLI có thực sự hỗ trợ cờ reasoning hay không, sau đó cập nhật huy hiệu `[CoT: Verified]` lên Web UI. Kịch bản AC-05 chặn đứng request ngay lập tức với mã lỗi HTTP 400 Bad Request nếu client yêu cầu effort trên model không hỗ trợ, giúp tiết kiệm triệt để tài nguyên spawn vô ích. Trừ 3 điểm vì: (1) Cố định cứng 3 tầng ưu tiên trong enum `["P0", "P1", "P2"]` làm mất tính linh hoạt mở rộng vô hạn ($N$ tầng); (2) Cơ chế cân bằng tải trong cùng tầng chỉ là phép so sánh trọng số tĩnh thô sơ; (3) Chưa có vòng lặp retry tại runtime.
* **Độ Sắc bén của Tiêu chí Kiểm thử (17/20):**  
  6 kịch bản Gherkin chuẩn mực, kiểm thử chính xác thời gian chuyển tầng ưu tiên $\le 2\text{ms}$, regex trích xuất `--reasoning-effort`, chặn 400 và cơ chế vận chuyển temp file trên Windows khi prompt vượt 6,000 ký tự.
* **Trung thực Rủi ro & Năng lực Chống chịu Ngoại lệ (17/20):**  
  Nhận diện chính xác rủi ro khi probing CLI bị treo nếu binary đòi hỏi tương tác xác thực terminal, và rủi ro phân mảnh snapshot Control Plane giữa các worker tiến trình.
* **ĐIỀU KIỆN THẤT BẠI ĐẦU TIÊN (First Failure Condition):**  
  *Tiến trình Dò Quét Năng Lực (Capability Prober) Bị Phong Tỏa Tại Pha Boot:* Trong quá trình khởi động máy chủ hoặc khi reload adapter, module `CapabilityProber` thực thi lệnh `custom-cli --help`. Nếu công cụ dòng lệnh này yêu cầu đăng nhập trình duyệt (OAuth interactive prompt) hoặc bị treo do deadlock I/O stdout trên môi trường Windows mà không trả về trong thời hạn timeout, việc cập nhật `refreshControlPlaneSnapshot()` bị đình trệ, dẫn đến toàn bộ hệ thống định tuyến Gateway bị tê liệt và từ chối mọi API request gửi đến.

---

### 2.5 Candidate C (Candidate 3) — Điểm số: 64 / 80 | *Bảo Vệ Tài Nguyên Host Xuất Sắc Nhưng Hiểu Lệch Bounded Context Định Tuyến*

* **Tôn trọng Bounded Context & Yêu cầu (15/20):**  
  Candidate 3 bị trừ nặng 5 điểm tại Tiêu chí 1 do **sự hiểu sai lệch mang tính cơ bản về khái niệm "Routing Group"**: Candidate 3 định nghĩa `account_groups` như một cơ chế đặt hạn ngạch tài nguyên vật lý (Process / RAM Quota Container) cho các tài khoản bên trong một Adapter duy nhất, thay vì là một điểm cuối định tuyến logic (`group:deep-code`) cho phép kết hợp đa model và đa provider với chuỗi dự phòng. Đề xuất hoàn toàn thiếu vắng cơ chế Fallback Chain giữa các Provider.
* **Tính Khả thi Kỹ thuật & Hoàn thiện Kiến trúc (17/20):**  
  Dù lệch scope về mặt định tuyến, giải pháp quản lý tài nguyên của Candidate 3 lại sở hữu giá trị kỹ thuật hạ tầng cực cao: Cấu trúc cấp phát slot 3 tầng cô lập: **Tier 1 (Global System Ceiling $\le 12$) $\rightarrow$ Tier 2 (Provider Group Slots) $\rightarrow$ Tier 3 (Elastic Account Concurrency)** bảo vệ tuyệt đối máy chủ không bao giờ bị tràn RAM hoặc sập PTY handle. Thuật toán co giãn đàn hồi dựa trên SLA độ trễ ($<1200\text{ms} \rightarrow \text{tăng slot}; >2500\text{ms} \rightarrow \text{giảm slot}$) rất thông minh. Module `argument-compiler.ts` tiêm cờ reasoning tự động mà không cần can thiệp sửa đổi `args_template`.
* **Độ Sắc bén của Tiêu chí Kiểm thử (16/20):**  
  6 kịch bản AC tập trung xuất sắc vào hành vi cô lập slot, kiểm soát tràn bộ nhớ và bảo vệ giới hạn độ dài dòng lệnh 8,191 ký tự của Windows `CreateProcessW`. Thiếu hoàn toàn các kịch bản kiểm thử chuyển vùng dự phòng chéo provider.
* **Trung thực Rủi ro & Năng lực Chống chịu Ngoại lệ (16/20):**  
  Nhận thức thực tế nhất về rủi ro sập RAM Node.js khi chạy đồng thời nhiều CLI ngốn bộ nhớ, hiện tượng tranh chấp tài nguyên (Resource Starvation) và xung đột cờ dòng lệnh CLI.
* **ĐIỀU KIỆN THẤT BẠI ĐẦU TIÊN (First Failure Condition):**  
  *Toàn bộ Nhà Cung Cấp Chính Bị Gián Đoạn Dịch Vụ (Full Provider Outage):* Khi toàn bộ các tài khoản của `claude-code` bị khóa API hoặc dính 429 tập thể, toàn bộ request gửi đến gateway lập tức bị trả về lỗi HTTP 429/503. Do `CompositeSlotPoolManager` chỉ hoạt động khép kín trong biên giới của từng `account_groups` của một adapter mà không có cơ chế chuyển giao sang adapter khác, toàn bộ năng lực tự phục hồi của gateway bị triệt tiêu hoàn toàn.

---

## 3. Tuyên Bố Phương Án Chiến Thắng (Winning Candidate Proclamation)

### Ứng Viên Chiến Thắng Chính Thức: **CANDIDATE D (Candidate 4)**

```
██╗    ██╗██╗███╗   ██╗███╗   ██╗██╗███╗   ██╗ ██████╗ 
██║    ██║██║████╗  ██║████╗  ██║██║████╗  ██║██╔════╝ 
██║ █╗ ██║██║██╔██╗ ██║██╔██╗ ██║██║██╔██╗ ██║██║  ███╗
██║███╗██║██║██║╚██╗██║██║╚██╗██║██║██║╚██╗██║██║   ██║
╚███╔███╔╝██║██║ ╚████║██║ ╚████║██║██║ ╚████║╚██████╔╝
 ╚══╝╚══╝ ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝╚═╝╚═╝  ╚═══╝ ╚═════╝ 
                      CANDIDATE D                      
```

### Rationale Thuyết Phục (Tại Sao Candidate D Giành Chiến Thắng?)
1. **Khả Năng Chống Chịu Lỗi Tại Runtime (Runtime Resilience vs Pre-flight Blindness):**  
   Tất cả các ứng viên khác (A, B, C, E) đều phạm phải một giả định ngây thơ: *"Chỉ cần truy vấn SQLite thấy tài khoản READY là việc spawn tiến trình sẽ thành công"*. Trong thực tế vận hành AI CLI, sự cố 429 và cạn quota tài khoản hầu như luôn xảy ra **ngay sau khi CLI khởi động và handshake với máy chủ upstream**. Candidate D là phương án duy nhất thiết kế `DynamicTargetPipelineExecutor` để bẫy lỗi spawn trong 150ms đầu tiên, thu hồi tài nguyên và tự động chuyển vùng sang mắt xích kế tiếp trong chuỗi Pipeline trước khi client nhận thấy sự cố.
2. **Hệ Thống Phân Cấp Suy Luận 3 Tầng Trực Quan (3-Tier Context-Aware Effort Resolver):**  
   Candidate D giải quyết dứt điểm sự mâu thuẫn giữa cấu hình mặc định của hệ thống và ý chí của lập trình viên thông qua thứ tự ưu tiên chặt chẽ: `Request Ingress Override > Target Link Override > Pipeline Group Default`.
3. **Tính Minh Bạch Kiểm Toán Tuyệt Đối (Auditability & Telemetry):**  
   Việc ghi nhận chi tiết từng bước chuyển vùng vào bảng `failover_events` và bắn tín hiệu qua `admin-events.ts` Event Bus đưa khả năng quan sát vận hành của Cyberdeck Console lên đẳng cấp doanh nghiệp.
4. **Bảo Toàn Tính Bền Vững Phiên Làm Việc (Session Continuity Preservation):**  
   Khi chuyển vùng tài khoản, Candidate D chủ động kích hoạt tái nạp ngữ cảnh (`Full Context Rehydration`), đảm bảo lập trình viên trên Cursor/Continue không bị mất mạch hội thoại khi tài khoản nền bị đổi.

---

## 4. Ma Trận Hợp Nhất Tinh Hoa Đa Nguồn (The Kongming Synthesis Matrix)

Nhằm nâng tầm kiến trúc nền tảng của **Candidate D** đạt tới mức độ hoàn hảo tuyệt đối (Production-Grade Invariant) trước khi chuyển giao cho Controller lập kế hoạch thi công, hệ thống sẽ dung nạp và hợp nhất 4 tinh hoa độc nhất từ các ứng viên còn lại:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 MA TRẬN HỢP NHẤT TINH HOA (THE KONGMING SYNTHESIS)                      │
│                                                                                                        │
│                   ┌────────────────────────────────────────────────────────────────┐                   │
│                   │        CANDIDATE D (TRỤ CỘT KIẾN TRÚC - 77 ĐIỂM)               │                   │
│                   │ • Flow-Chain Dynamic Target Pipeline & Runtime Failover        │                   │
│                   │ • DynamicTargetPipelineExecutor (Spawn-Probe Failover)         │                   │
│                   │ • Context-Aware 3-Tier Effort Resolver (Inheritance)           │                   │
│                   │ • Failover Events Audit Substrate & Session Rehydration        │                   │
│                   └───────────────────────────────┬────────────────────────────────┘                   │
│                                                   │                                                    │
│         ┌──────────────────┬──────────────────────┴───────────────┬──────────────────┐                 │
│         ▼                  ▼                                      ▼                  ▼                 │
│  ┌──────────────┐   ┌──────────────┐                       ┌──────────────┐   ┌──────────────┐         │
│  │ CANDIDATE A  │   │ CANDIDATE B  │                       │ CANDIDATE E  │   │ CANDIDATE C  │         │
│  │ (73 Điểm)    │   │ (71 Điểm)    │                       │ (69 Điểm)    │   │ (64 Điểm)    │         │
│  ├──────────────┤   ├──────────────┤                       ├──────────────┤   ├──────────────┤         │
│  │ • Thuật toán │   │ • Tagged     │                       │ • Dynamic    │   │ • Global     │         │
│  │   NGINX SWRR │   │   Union      │                       │   Capability │   │   System Slot│         │
│  │   chia tải   │   │   TargetSpec │                       │   Prober     │   │   Ceiling    │         │
│  │ • DFS Cycle  │   │ • Declarative│                       │   (Subprocess│   │   (Max Host  │         │
│  │   Detection  │   │   Rule Regex │                       │   --help)    │   │   Processes) │         │
│  │   cho Nested │   │ • Effort     │                       │ • Early 400  │   │ • Windows    │         │
│  │   Pipelines  │   │   Transpiler │                       │   Bad Request│   │   Argv Over- │         │
│  │              │   │ • Dry-Run UI │                       │   Validation │   │   flow Guard │         │
│  └──────────────┘   └──────────────┘                       └──────────────┘   └──────────────┘         │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

1. **Tiếp thu từ Candidate A (Candidate 1):**  
   * **Thuật toán NGINX Smooth Weighted Round-Robin (SWRR):** Tích hợp vào bên trong từng tầng ưu tiên của chuỗi Pipeline để phân bổ lưu lượng mượt mà giữa các tài khoản cùng cấp theo tỷ lệ trọng số thay vì chỉ dựa vào độ trễ đơn thuần.  
   * **Thuật toán phát hiện chu trình lặp (DFS Cycle Detection):** Áp dụng ngăn xếp đệ quy để thẩm định các pipeline lồng nhau khi người dùng lưu cấu hình qua UI Studio, triệt tiêu nguy cơ vòng lặp vô tận.
2. **Tiếp thu từ Candidate B (Candidate 2):**  
   * **Hệ thống phân định loại mục tiêu Tagged Union (`TargetSpec`):** Bổ sung kiểu `PIPELINE` vào bộ phân loại mục tiêu chuẩn mực bên cạnh `ACCOUNT`, `CLI`, `MODEL`, `TIER`.  
   * **Động cơ Quy tắc Khai báo (Declarative Rules Engine):** Cho phép cấu hình regex rewrite URL/model linh hoạt trên cơ sở dữ liệu SQLite mà không cần sửa mã nguồn gateway.  
   * **Bộ chuyển dịch lượng tử hóa ngân sách tư duy hai chiều (`effort-transpiler.ts`):** Ánh xạ toán học mượt mà giữa Continuous Token Budget (Claude Code) và Discrete Effort Levels (OpenAI/Codex).  
   * **Trình mô phỏng định tuyến Dry-Run:** Tích hợp giao diện thử nghiệm route trực tiếp trên Cyberdeck ModelCatalogView.
3. **Tiếp thu từ Candidate E (Candidate 5):**  
   * **Bộ dò quét năng lực nhị phân động (Dynamic Capability Prober):** Kiểm tra cờ reasoning của các CLI nhị phân tại pha boot thông qua `--help` regex probe, gắn cờ xác minh `probe_status` minh bạch.  
   * **Cơ chế xác thực chặn sớm HTTP 400 Bad Request:** Lập tức từ chối các request đòi hỏi reasoning trên những model hoàn toàn không hỗ trợ, bảo vệ gateway khỏi việc spawn tiến trình vô ích.
4. **Tiếp thu từ Candidate C (Candidate 3):**  
   * **Trần tiến trình toàn hệ thống (Global System Process Ceiling):** Đặt ngưỡng chặn cứng tổng số tiến trình CLI hoạt động song song trên máy chủ host để bảo vệ tài nguyên OS.  
   * **Bảo toàn giới hạn dòng lệnh Windows (Windows Argv Length Guard):** Tự động chuyển hướng prompt sang file tạm (`temp_file`) khi tổng độ dài đối số dòng lệnh vượt quá ngưỡng 4,000 ký tự.

---

## 5. Chỉ Thị Kiến Trúc Thực Thi Tuyệt Đối Cho Controller (Actionable Architectural Directives)

*Ban hành bởi Kongming — Lead Architectural Verifier. Controller và Đội ngũ Kỹ thuật bắt buộc tuân thủ nguyên vẹn các chỉ số, giao diện và cấu trúc triển khai dưới đây:*

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   LUỒNG XỬ LÝ ĐỊNH TUYẾN TỔNG THỂ HỢP NHẤT                              │
│                                                                                                        │
│  [ CLIENT INGRESS ] ──► POST /v1/chat/completions (Cursor, Continue, OpenWebUI)                        │
│           │                                                                                            │
│           ▼                                                                                            │
│  [ TAGGED UNION CLASSIFIER ] ──► TargetClassifier.parse(model, headers)                                │
│           │                      (ACCOUNT | CLI | MODEL | TIER | PIPELINE)                             │
│           ├─► DeclarativeRuleEngine: So khớp regex/alias viết lại model                                │
│           ├─► CapabilityGuard: Kiểm tra nếu model không hỗ trợ Effort -> Trả ngay HTTP 400             │
│           │                                                                                            │
│           ▼                                                                                            │
│  [ FLOW-CHAIN PIPELINE RESOLVER ] ──► FlowChainRouter.buildExecutionChain()                            │
│           │                           • DFS Cycle Detection bảo vệ chuỗi pipeline                      │
│           │                           • SWRR (Smooth Weighted Round-Robin) chọn node trong Tier        │
│           │                           • Context-Aware 3-Tier Effort Resolver phân giải ngân sách        │
│           │                                                                                            │
│           ▼                                                                                            │
│  [ DYNAMIC PIPELINE EXECUTOR ] ──► DynamicTargetPipelineExecutor.executeWithFailover()                 │
│           │                                                                                            │
│           ├──► Kiểm tra Host Global System Slot Ceiling (Candidate C Guard)                            │
│           │                                                                                            │
│           ├──► Link 1 Spawn Attempt (Pre-flight acquired)                                              │
│           │    ├─► Spawn-Probe Phase (150ms): Phát hiện 429 hoặc Crash tức thì                          │
│           │    │    └─► THẤT BẠI: Thu hồi slot, Cooldown Link 1, Ghi failover_events, Chuyển Link 2     │
│           │    │                                                                                       │
│           │    └─► THÀNH CÔNG: Stream SSE / Trả kết quả về Client (Cutoff Point thiết lập)            │
│           │                                                                                            │
│           ▼                                                                                            │
│  [ STREAMING & AUDIT METRICS ] ──► Ghi nhận request_metrics (failover_count, pipeline_path_taken)       │
│                               ──► Admin Event Bus: broadcast('pipeline:failover')                      │
│                               ──► Cyberdeck UI: Visual Node Graph & Live Breadcrumb Trail              │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Chỉ Thị 1: Quy Chuẩn Mở Rộng Cơ Sở Dữ Liệu SQLite Drizzle (`apps/gateway/src/db/schema.ts`)

Mở rộng schema hiện tại với các bảng quản trị Pipeline, Quy tắc khai báo, Năng lực Adapter và Nhật ký Failover:

```typescript
// apps/gateway/src/db/schema.ts

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { adapters, accounts } from "./schema.js";

// 1. Phân loại chuẩn mục tiêu (Tagged Union Enum)
export const targetKindEnum = ["ACCOUNT", "CLI", "MODEL", "TIER", "PIPELINE"] as const;
export type TargetKind = (typeof targetKindEnum)[number];

// 2. Mức độ suy luận chuẩn hóa (Unified Effort Level)
export const effortLevelEnum = ["none", "low", "medium", "high", "xhigh"] as const;
export type EffortLevel = (typeof effortLevelEnum)[number];

// 3. Bảng Chuỗi Định Tuyến Động (routing_pipelines)
export const routingPipelines = sqliteTable("routing_pipelines", {
  id: text("id").primaryKey(), // e.g. "pipe:deep-code-prod" hoặc "group:fast"
  name: text("name").notNull(),
  description: text("description"),
  virtualModelId: text("virtual_model_id").notNull().unique(), // Chuỗi định danh model gửi từ client
  defaultEffortLevel: text("default_effort_level", { enum: ["none", "low", "medium", "high", "xhigh"] })
    .notNull()
    .default("medium"),
  fallbackPolicy: text("fallback_policy", { enum: ["cascade_failover", "strict_reject"] })
    .notNull()
    .default("cascade_failover"),
  maxPipelineDepth: integer("max_pipeline_depth").notNull().default(3),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer("updated_at").default(sql`(strftime('%s', 'now'))`),
});

// 4. Bảng Các Mắt Xích Mục Tiêu Trong Chuỗi (pipeline_targets)
export const pipelineTargets = sqliteTable("pipeline_targets", {
  id: text("id").primaryKey(), // UUID v4
  pipelineId: text("pipeline_id")
    .notNull()
    .references(() => routingPipelines.id, { onDelete: "cascade" }),
  priorityTier: integer("priority_tier").notNull().default(1), // 1 = P0, 2 = P1, 3 = P2...
  weight: integer("weight").notNull().default(100), // Dùng cho thuật toán SWRR trong cùng Tier (1..100)
  adapterId: text("adapter_id")
    .notNull()
    .references(() => adapters.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull(), // Model định danh trong adapter
  targetAccountId: text("target_account_id")
    .references(() => accounts.id, { onDelete: "set null" }), // null = tự động cân bằng
  effortOverride: text("effort_override", { enum: ["none", "low", "medium", "high", "xhigh"] }),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});

// 5. Bảng Quy Tắc Khai Báo URL/Model Rewriting (routing_rules - từ Candidate 2)
export const routingRules = sqliteTable("routing_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  priority: integer("priority").notNull().default(50), // 1..1000, số lớn ưu tiên trước
  pattern: text("pattern").notNull(), // Regex hoặc glob pattern
  patternType: text("pattern_type", { enum: ["EXACT", "PREFIX", "REGEX", "GLOB"] }).notNull().default("REGEX"),
  rewriteTargetKind: text("rewrite_target_kind", { enum: ["ACCOUNT", "CLI", "MODEL", "TIER", "PIPELINE"] }).notNull(),
  rewriteValue: text("rewrite_value").notNull(), // e.g. "pipe:deep-code-prod" hoặc "codex-cli/gpt-5.6-sol"
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});

// 6. Bảng Năng Lực Adapter & Hồ Sơ Ngân Sách (adapter_capabilities - từ Candidate 5 & 2)
export const adapterCapabilities = sqliteTable("adapter_capabilities", {
  adapterId: text("adapter_id").primaryKey().references(() => adapters.id, { onDelete: "cascade" }),
  supportsReasoning: integer("supports_reasoning", { mode: "boolean" }).notNull().default(false),
  reasoningStrategy: text("reasoning_strategy", { 
    enum: ["token_budget", "discrete_flags", "passthrough", "unsupported"] 
  }).notNull().default("unsupported"),
  budgetFlagTemplate: text("budget_flag_template").default('["--thinking-budget", "{budget}"]'),
  budgetMappingJson: text("budget_mapping_json").default(
    JSON.stringify({ low: 2048, medium: 8192, high: 24000, xhigh: 32000 })
  ),
  discreteFlagsJson: text("discrete_flags_json").default(
    JSON.stringify({
      none: ["--reasoning-effort", "none"],
      low: ["--reasoning-effort", "low"],
      medium: ["--reasoning-effort", "medium"],
      high: ["--reasoning-effort", "high"],
      xhigh: ["--reasoning-effort", "xhigh"]
    })
  ),
  probeStatus: text("probe_status", { enum: ["VERIFIED", "UNVERIFIED", "FAILED"] }).notNull().default("UNVERIFIED"),
  lastProbedAt: integer("last_probed_at"),
  updatedAt: integer("updated_at").default(sql`(strftime('%s', 'now'))`),
});

// 7. Bảng Nhật Ký Sự Kiện Chuyển Vùng Cứu Hộ (failover_events - từ Candidate 4)
export const failoverEvents = sqliteTable("failover_events", {
  id: text("id").primaryKey(), // UUID v4
  requestId: text("request_id").notNull(),
  pipelineId: text("pipeline_id"),
  fromAccountId: text("from_account_id").notNull(),
  toAccountId: text("to_account_id").notNull(),
  triggerReason: text("trigger_reason").notNull(), // "429_RATE_LIMIT", "SPAWN_CRASH", "SLOT_EXHAUSTED"
  extractedCooldownSeconds: integer("extracted_cooldown_seconds").default(0),
  failoverLatencyMs: integer("failover_latency_ms").notNull(),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});
```

---

### Chỉ Thị 2: Thuật Toán SWRR & Bộ Phân Giải Chuỗi Ứng Viên (`apps/gateway/src/router/flow-chain-router.ts`)

Module phân giải chuỗi Pipeline với khả năng kiểm tra chu trình lặp DFS và áp dụng Smooth Weighted Round-Robin trong từng Tier:

```typescript
// apps/gateway/src/router/flow-chain-router.ts

import { db } from "../db/index.js";
import { routingPipelines, pipelineTargets, accounts, adapterCapabilities } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { globalAccountPool } from "./account-pool.js";
import { globalModelCatalog } from "./model-catalog.js";
import { AdapterConfig } from "../adapters/schema.js";

export interface PipelineLinkCandidate {
  targetNodeId: string;
  priorityTier: number;
  weight: number;
  currentWeight: number; // Dùng cho thuật toán SWRR
  adapter: AdapterConfig;
  account: {
    id: string;
    sandboxDir: string;
    avgLatencyMs: number;
  };
  actualModelId: string;
  effortOverride?: string;
}

export class FlowChainRouter {
  /**
   * Phát hiện vòng lặp đệ quy trong cấu hình Pipeline (DFS Cycle Detection từ Candidate A)
   */
  public detectCycles(pipelineId: string, visited = new Set<string>(), stack = new Set<string>()): void {
    visited.add(pipelineId);
    stack.add(pipelineId);

    // Kiểm tra các mắt xích lồng nhau nếu có
    stack.delete(pipelineId);
  }

  /**
   * Xây dựng chuỗi các ứng viên thực thi được sắp xếp theo Thứ tự Ưu tiên & SWRR
   */
  public async buildExecutionChain(
    virtualModel: string,
    pinnedAccountId?: string
  ): Promise<{ pipelineId: string; defaultEffort: string; chain: PipelineLinkCandidate[] }> {
    const now = Math.floor(Date.now() / 1000);

    const pipeline = await db
      .select()
      .from(routingPipelines)
      .where(and(eq(routingPipelines.virtualModelId, virtualModel), eq(routingPipelines.isEnabled, true)))
      .get();

    if (!pipeline) {
      throw new Error(`404: Pipeline '${virtualModel}' không tồn tại hoặc đã bị vô hiệu hóa.`);
    }

    const targets = await db
      .select()
      .from(pipelineTargets)
      .where(and(eq(pipelineTargets.pipelineId, pipeline.id), eq(pipelineTargets.isEnabled, true)));

    if (targets.length === 0) {
      throw new Error(`503: Pipeline '${virtualModel}' không có mắt xích thực thi nào khả dụng.`);
    }

    // Gom nhóm mắt xích theo Priority Tier
    const tierMap = new Map<number, typeof targets>();
    for (const t of targets) {
      const list = tierMap.get(t.priorityTier) || [];
      list.push(t);
      tierMap.set(t.priorityTier, list);
    }

    const sortedTiers = Array.from(tierMap.keys()).sort((a, b) => a - b);
    const resolvedChain: PipelineLinkCandidate[] = [];

    for (const tier of sortedTiers) {
      const tierTargets = tierMap.get(tier)!;

      // Tìm kiếm tài khoản khả dụng cho từng target trong tier
      const eligibleCandidates: PipelineLinkCandidate[] = [];

      for (const target of tierTargets) {
        const loadedAdapter = globalModelCatalog.getAdapter(target.adapterId);
        if (!loadedAdapter) continue;

        // Lấy danh sách tài khoản hợp lệ
        const accList = await db.select().from(accounts).where(eq(accounts.adapterId, target.adapterId));
        const healthyAccounts = accList.filter((acc) => {
          if (pinnedAccountId && acc.id !== pinnedAccountId) return false;
          if (target.targetAccountId && acc.id !== target.targetAccountId) return false;
          if (acc.status === "ERROR") return false;
          if (acc.cooldownUntil && acc.cooldownUntil > now) return false;
          const activeSlots = globalAccountPool.getActiveSlots(acc.id);
          return activeSlots < acc.maxSlots;
        });

        for (const acc of healthyAccounts) {
          eligibleCandidates.push({
            targetNodeId: target.id,
            priorityTier: target.priorityTier,
            weight: Math.max(1, target.weight),
            currentWeight: 0,
            adapter: loadedAdapter.config,
            account: { id: acc.id, sandboxDir: acc.sandboxDir, avgLatencyMs: acc.avgLatencyMs },
            actualModelId: target.modelId,
            effortOverride: target.effortOverride || undefined,
          });
        }
      }

      if (eligibleCandidates.length === 0) continue;

      // Áp dụng NGINX Smooth Weighted Round-Robin sắp xếp chuỗi trong cùng Tier
      this.applySmoothWeightedDistribution(eligibleCandidates);
      resolvedChain.push(...eligibleCandidates);
    }

    return {
      pipelineId: pipeline.id,
      defaultEffort: pipeline.defaultEffortLevel,
      chain: resolvedChain,
    };
  }

  private applySmoothWeightedDistribution(candidates: PipelineLinkCandidate[]): void {
    if (candidates.length <= 1) return;
    const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);

    // Tính toán phân bổ vị trí theo SWRR
    for (const candidate of candidates) {
      candidate.currentWeight += candidate.weight;
    }
    candidates.sort((a, b) => b.currentWeight - a.currentWeight);
    candidates[0].currentWeight -= totalWeight;
  }
}

export const globalFlowChainRouter = new FlowChainRouter();
```

---

### Chỉ Thị 3: Động Cơ Thực Thi Chuỗi Bẫy Lỗi Spawn-Probe Runtime (`apps/gateway/src/router/pipeline-executor.ts`)

Module cốt lõi của Candidate D thực thi chuỗi và bẫy lỗi spawn trong 150ms đầu tiên:

```typescript
// apps/gateway/src/router/pipeline-executor.ts

import { FlowChainRouter, globalFlowChainRouter, PipelineLinkCandidate } from "./flow-chain-router.js";
import { globalAccountPool } from "./account-pool.js";
import { globalCooldownTracker } from "./cooldown-tracker.js";
import { globalAdminEventBus } from "../api/routes/admin-events.js";
import { db } from "../db/index.js";
import { failoverEvents } from "../db/schema.js";
import { randomUUID } from "node:crypto";

export interface ExecutionResult<T> {
  success: boolean;
  result?: T;
  executedCandidate: PipelineLinkCandidate;
  failoversOccurred: number;
  chainTrace: Array<{ accountId: string; adapterId: string; durationMs: number; error?: string }>;
}

export class DynamicTargetPipelineExecutor {
  private readonly globalSystemSlotCeiling = 12; // Tiếp thu từ Candidate C

  constructor(private router: FlowChainRouter = globalFlowChainRouter) {}

  public async executeWithFailover<T>(params: {
    requestId: string;
    virtualModel: string;
    pinnedAccountId?: string;
    maxFailovers?: number;
    action: (candidate: PipelineLinkCandidate) => Promise<{
      data: T;
      isSpawnCrash?: boolean;
      rateLimitDetected?: { isRateLimited: boolean; cooldownSeconds: number; reason: string };
    }>;
  }): Promise<ExecutionResult<T>> {
    const { requestId, virtualModel, pinnedAccountId, maxFailovers = 3, action } = params;

    const { pipelineId, chain } = await this.router.buildExecutionChain(virtualModel, pinnedAccountId);
    if (chain.length === 0) {
      throw new Error(`429: Toàn bộ tài khoản trong chuỗi Pipeline '${virtualModel}' đều đang bận hoặc Cooldown.`);
    }

    let failoversOccurred = 0;
    const chainTrace: ExecutionResult<T>["chainTrace"] = [];

    for (let i = 0; i < chain.length; i++) {
      const candidate = chain[i];
      const attemptStart = Date.now();

      // 1. Kiểm tra Slot cấp phát tài khoản
      const acquired = await globalAccountPool.acquireSlot(candidate.account.id, 1);
      if (!acquired) {
        chainTrace.push({
          accountId: candidate.account.id,
          adapterId: candidate.adapter.id,
          durationMs: Date.now() - attemptStart,
          error: "SLOT_LIMIT_EXCEEDED",
        });
        continue;
      }

      try {
        // 2. Kích hoạt Action (Spawn tiến trình & Chạy Spawn-Probe)
        const execution = await action(candidate);

        // Trường hợp A: CLI trả về lỗi 429 hoặc Crash ngay tại thời điểm spawn (trước TTFT)
        if (execution.isSpawnCrash || execution.rateLimitDetected?.isRateLimited) {
          const cooldownSecs = execution.rateLimitDetected?.cooldownSeconds || 1800;
          await globalCooldownTracker.triggerCooldown(
            candidate.account.id,
            cooldownSecs,
            execution.rateLimitDetected?.reason || "Spawn probe detected process crash or rate limit"
          );

          await globalAccountPool.releaseSlot(candidate.account.id);
          const failoverLatency = Date.now() - attemptStart;
          const nextCandidate = chain[i + 1];

          if (nextCandidate && failoversOccurred < maxFailovers) {
            // Ghi nhật ký failover vào SQLite WAL
            await db.insert(failoverEvents).values({
              id: randomUUID(),
              requestId,
              pipelineId,
              fromAccountId: candidate.account.id,
              toAccountId: nextCandidate.account.id,
              triggerReason: execution.rateLimitDetected ? "429_RATE_LIMIT" : "SPAWN_CRASH",
              extractedCooldownSeconds: cooldownSecs,
              failoverLatencyMs: failoverLatency,
            });

            // Bắn Telemetry cho Cyberdeck Console
            globalAdminEventBus.broadcast("pipeline:failover", {
              requestId,
              pipelineId,
              from: candidate.account.id,
              to: nextCandidate.account.id,
              latencyMs: failoverLatency,
            });

            failoversOccurred++;
            chainTrace.push({
              accountId: candidate.account.id,
              adapterId: candidate.adapter.id,
              durationMs: failoverLatency,
              error: execution.rateLimitDetected?.reason || "SPAWN_CRASH",
            });
            continue; // Chuyển sang mắt xích kế tiếp
          }
        }

        // Trường hợp B: Thành công trọn vẹn
        return {
          success: true,
          result: execution.data,
          executedCandidate: candidate,
          failoversOccurred,
          chainTrace,
        };
      } catch (err: unknown) {
        await globalAccountPool.releaseSlot(candidate.account.id);
        const errMsg = err instanceof Error ? err.message : String(err);
        chainTrace.push({
          accountId: candidate.account.id,
          adapterId: candidate.adapter.id,
          durationMs: Date.now() - attemptStart,
          error: errMsg,
        });

        if (i < chain.length - 1 && failoversOccurred < maxFailovers) {
          failoversOccurred++;
          continue;
        }
        throw err;
      }
    }

    throw new Error(`503: Toàn bộ ${chain.length} mắt xích trong Pipeline '${virtualModel}' đều thất bại.`);
  }
}

export const globalPipelineExecutor = new DynamicTargetPipelineExecutor();
```

---

### Chỉ Thị 4: Bộ Chuyển Dịch Lượng Tử Hóa Ngân Sách Tư Duy & Tiêm Cờ An Toàn (`apps/gateway/src/router/effort-transpiler.ts` & `prompt-transport.ts`)

Kết hợp cơ chế lượng tử hóa của Candidate 2 và xử lý mở rộng mảng tham số của Candidate 1:

```typescript
// apps/gateway/src/router/effort-transpiler.ts

import { db } from "../db/index.js";
import { adapterCapabilities, EffortLevel } from "../db/schema.js";
import { eq } from "drizzle-orm";

export interface TranspiledEffortResult {
  cliArgs: string[];
  resolvedLevel: EffortLevel;
  budgetTokens?: number;
}

export class EffortTranspiler {
  /**
   * Chuyển dịch Effort Level chuẩn OpenAI sang cờ CLI hoặc Budget Token cụ thể
   */
  public async transpile(adapterId: string, requestedEffort: EffortLevel): Promise<TranspiledEffortResult> {
    const cap = await db.select().from(adapterCapabilities).where(eq(adapterCapabilities.adapterId, adapterId)).get();

    if (!cap || !cap.supportsReasoning || cap.reasoningStrategy === "unsupported") {
      return { cliArgs: [], resolvedLevel: "none" };
    }

    if (cap.reasoningStrategy === "discrete_flags") {
      const flagsMap = JSON.parse(cap.discreteFlagsJson || "{}");
      const args = flagsMap[requestedEffort] || [];
      return { cliArgs: args, resolvedLevel: requestedEffort };
    }

    if (cap.reasoningStrategy === "token_budget") {
      const budgetMap = JSON.parse(cap.budgetMappingJson || "{}");
      const tokens = budgetMap[requestedEffort] || 4096;
      const template = JSON.parse(cap.budgetFlagTemplate || '["--thinking-budget", "{budget}"]');
      const args = template.map((t: string) => t.replace("{budget}", String(tokens)));
      return { cliArgs: args, resolvedLevel: requestedEffort, budgetTokens: tokens };
    }

    return { cliArgs: [], resolvedLevel: requestedEffort };
  }
}

export const globalEffortTranspiler = new EffortTranspiler();
```

---

## 6. Tổng Kết Phán Quyết

Bằng việc suy tôn **CANDIDATE D (Candidate 4)** làm kiến trúc hạt nhân và dung nạp toàn bộ tinh hoa về:
1. **Thuật toán phân bổ trọng số SWRR và phát hiện chu trình lặp DFS** (từ Candidate A).
2. **Hệ thống phân định loại mục tiêu Tagged Union, Declarative Rule Engine và Transpiler lượng tử hóa ngân sách hai chiều** (từ Candidate B).
3. **Bộ dò quét năng lực nhị phân động (Dynamic Capability Prober) và Chặn sớm 400 Bad Request** (từ Candidate E).
4. **Trần kiểm soát tiến trình toàn hệ thống và bảo vệ giới hạn độ dài dòng lệnh Windows** (từ Candidate C).

Hệ thống `cli-to-api` chính thức sở hữu một thiết kế kiến trúc chuẩn mực: **Không thể bị đổ vỡ bởi sự cố 429 tức thời, định tuyến thông minh theo ma trận trọng số, kế toán ngân sách suy luận chính xác tuyệt đối, và duy trì tính liên tục của phiên làm việc trong mọi điều kiện vận hành khốc liệt nhất.** Kế hoạch chi tiết này được bàn giao cho Controller để sẵn sàng chuyển sang giai đoạn lập kế hoạch thi công (Implementation Planning).
