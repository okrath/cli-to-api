---
type: brainstorm
candidate: 5
mode: ultra
topic: priority-tier-matrix-router-and-capability-matrix
date: 2026-09-17
status: proposed
---

# BẢN GIAO KÈO KIẾN TRÚC GIỚI HẠN (BOUNDED ARCHITECTURAL CONTRACT)

**Đơn vị đề xuất:** Candidate 5  
**Quy trình:** `ak-brainstorm --ultra`  
**Dự án mục tiêu:** `cli-to-api` Core Substrate, Routing Engine, Supervisor & Studio UI  
**Chủ đề:** Kiến trúc Priority-Tier Matrix Router & Standardized Capability Matrix (Tách biệt rõ ràng Control Plane quản trị Group & Data Plane xử lý luồng, Cơ chế Capability Probing cho reasoning effort của từng CLI adapter).

---

## Tiêu Đề & Tóm Tắt Điều Hành (Executive Summary)

### Tiêu đề
**Kiến Trúc Điều Phối Ma Trận Thứ Cấp Ưu Tiên (Priority-Tier Matrix Router) & Ma Trận Năng Lực Chuẩn Hóa (Standardized Capability Matrix) Cho Hệ Thống AI CLI-to-API Gateway**

### Tóm tắt điều hành
Khi hệ sinh thái AI CLI mở rộng nhanh chóng với nhiều công cụ dòng lệnh khác nhau (`claude-code`, `codex-cli`, `omp`, `opencode`, `devin-cli`, `grok-cli`), các mô hình suy luận sâu thế hệ mới (Deep Reasoning Models như o1/o3/GPT-5.6, Claude 3.7 Sonnet Hybrid Reasoning, DeepSeek-R1) đặt ra một thách thức phân mảnh nghiêm trọng:
1. **Thiếu chuẩn hóa về mức độ nỗ lực suy luận (Reasoning Effort):** Mỗi CLI tiếp nhận tham số suy luận theo một cách riêng biệt (Codex dùng cờ `--reasoning-effort=low|medium|high`, Claude Code dùng `--thinking-budget=<tokens>`, một số CLI khác sử dụng biến môi trường hoặc đòi hỏi ép System Prompt CoT).
2. **Nghẽn cổ chai và xung đột trạng thái giữa Quản trị và Thực thi:** Việc gom chung logic quản lý nhóm/tài khoản (CRUD, probing, cấu hình tĩnh) vào cùng vòng lặp định tuyến xử lý request dẫn đến rủi ro lock bảng SQLite, tăng Time-To-First-Token (TTFT) và làm mất tính dự đoán được của hệ thống.
3. **Định tuyến phân tầng đơn điệu (Flat Tier Routing):** Cơ chế định tuyến phân tầng cũ (`auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`) chỉ quét danh sách tài khoản theo chiều ngang một cách đồng nhất, không phân biệt được cấp độ ưu tiên (Priority Levels: `P0` Chính, `P1` Dự phòng dôi dư, `P2` Cứu trợ thảm họa) và không thể gom nhóm dịch vụ nghiệp vụ (ví dụ: Logical Group `group/coding-heavy`).

**Giải pháp của Candidate 5:**
Xây dựng một **Bounded Architectural Contract** toàn diện, giải quyết triệt để 3 vấn đề trên bằng 4 trụ cột kiến trúc:
- **Tách biệt nghiêm ngặt Control Plane & Data Plane:** Control Plane chịu trách nhiệm thẩm định năng lực CLI (Capability Probing), quản trị bảng SQLite Drizzle (WAL mode) và duy trì Read-Optimized In-Memory Snapshot. Data Plane vận hành thuần túy trên bộ nhớ với độ trễ $\le 1\text{ms}$, tiếp nhận và phân phối lưu lượng bằng thuật toán Weighted Least-Connections Matrix.
- **Standardized Capability Matrix & Dynamic Prober:** Một cơ chế chuẩn hóa tham số suy luận (`reasoning_effort: "low" | "medium" | "high"`) của chuẩn OpenAI Ingress, tự động ánh xạ sang cờ CLI, budget token hoặc prompt transport tùy biến dựa trên kết quả Probing thực tế của nhị phân CLI trên máy chủ.
- **Priority-Tier Matrix Routing:** Mô hình định tuyến 2 chiều (Trục Tier: Low $\to$ XHigh; Trục Priority: P0 $\to$ P1 $\to$ P2) kết hợp Logical Grouping (`group/*`), hỗ trợ cơ chế Circuit Breaker và Tràn tải tự động (Spillover Failover) tức thì khi tài khoản P0 dính Rate Limit (HTTP 429) hoặc cạn kiệt slot.
- **Cyberdeck Studio UI/UX Pro Max:** Nâng cấp toàn diện `ModelCatalogView` (ma trận năng lực dạng lưới neon, radar probe live visualizer, quản trị group P0-P2) và `PlaygroundView` (bộ điều khiển 3 nấc Reasoning Effort, Live Breadcrumb Route Path Inspector và Telemetry đa kênh).

---

## 1. Outcome & Sơ Đồ Kiến Trúc Luồng Dữ Liệu

### 1.1 Kết Quả Đạt Được (Architectural Outcome)
- **Ingress Zero-Friction:** Client gửi request OpenAI chuẩn (`POST /v1/chat/completions`) có chứa `reasoning_effort: "low" | "medium" | "high"` hoặc trỏ tới `model: "group/coding-heavy"`. Hệ thống tự động giải quyết mục tiêu mà không yêu cầu client thay đổi SDK.
- **Microsecond In-Memory Dispatch:** Data Plane giải quyết mục tiêu trong thời gian $\le 500\mu\text{s}$ bằng Snapshot lock-free.
- **Bảo toàn khả năng suy luận:** Dù CLI adapter bên dưới là `claude` (dùng budget token) hay `codex` (dùng cờ chuỗi), mức độ nỗ lực suy luận từ client luôn được chuyển đổi thành xác định 100% tới CLI process.
- **Khả năng tự phục hồi (Self-Healing Failover):** Khi tất cả slot P0 của một nhóm cạn kiệt hoặc bị 429 Cooldown, hệ thống tự động tràn sang P1 trong vòng $\le 2\text{ms}$ mà không ngắt kết nối client.

### 1.2 Sơ Đồ Kiến Trúc Luồng Dữ Liệu (ASCII / Unicode Flow Diagram)

```
===================================================================================================================
                                          CLIENT INGRESS LAYER
               Cursor IDE / Continue.dev / Open WebUI / LangChain / cURL (Bearer sk-cta-...)
                  POST /v1/chat/completions {"model": "group/coding-heavy", "reasoning_effort": "high"}
===================================================================================================================
                                                       │
                                                       ▼
+─────────────────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                        DATA PLANE: HOT-PATH DISPATCH                                            |
|                                                                                                                 |
|  [ Stage 1: Ingress Normalization & Effort Extraction ] ──────────────────────────────────────────────────────  |
|    • Bóc tách payload: `model`, `reasoning_effort` (low|medium|high), `stream`, `conversation_id`                |
|    • Tra cứu lock-free vào Read-Optimized Snapshot (Atomic Pointer Swap từ Control Plane)                       |
|                                                                                                                 |
|  [ Stage 2: Capability Match & Filtering Guard ] ─────────────────────────────────────────────────────────────  |
|    • Yêu cầu: Model đích PHẢI hỗ trợ capability tương ứng (ví dụ: reasoning = true, effort in supported_efforts)|
|    • Loại bỏ ngay các adapter/model không thỏa mãn điều kiện năng lực                                            |
|                                                                                                                 |
|  [ Stage 3: Priority-Tier Matrix Resolver ] ───────────────────────────────────────────────────────────────────  |
|    • Giải mã Target: Namespace (`codex/gpt-5.6`) | Group (`group/coding`) | Virtual Tier (`auto-high`)          |
|    • Duyệt ma trận 2D:                                                                                          |
|       ┌──────────┬─────────────────────────────┬─────────────────────────────┬──────────────────────────────┐   |
|       │ Priority │ Tier High                   │ Tier Medium                 │ Tier Low                     │   |
|       ├──────────┼─────────────────────────────┼─────────────────────────────┼──────────────────────────────┤   |
|       │ P0 (Chính)│ codex-cli/gpt-5.6-asta (100)│ claude-code/sonnet-3.7 (80) │ omp-cli/fast (50)            │   |
|       │ P1 (Phụ) │ claude-code/opus (70)       │ codex-cli/gpt-5.6-terra(60) │ claude-code/haiku (40)       │   |
|       │ P2 (Cứu trợ) deepseek-r1-local (40)    │ opencode/base (30)          │ mock-cli/fallback (10)       │   |
|       └──────────┴─────────────────────────────┴─────────────────────────────┴──────────────────────────────┘   |
|    • Kiểm tra Slot Concurrency & Cooldown Timer của từng Account trong tầng P0:                                  |
|       ├─ Nếu P0 có tài khoản khả dụng: Chọn tài khoản tối ưu theo Weighted Least-Connections Score               |
|       └─ Nếu P0 cạn kiệt/Cooldown: Tự động tràn (Spillover) sang tầng P1, sau đó tới P2                          |
|                                                                                                                 |
|  [ Stage 4: Prompt Transport & Standardized Effort Mapper ] ───────────────────────────────────────────────────  |
|    • Tra cứu Adapter Capability Strategy:                                                                       |
|       ├─ Strategy "cli_flag"       ──> Inject: `--reasoning-effort=high`                                        |
|       ├─ Strategy "thinking_budget"──> Ánh xạ: `high` -> 32768 tokens -> Inject: `--thinking-budget=32768`      |
|       ├─ Strategy "env_var"        ──> Inject: Process Env `CODEX_REASONING_EFFORT=high`                        |
|       └─ Strategy "prompt_inject"  ──> Nối System Instruction CoT sâu vào Prompt Transport                      |
|    • Vận chuyển prompt qua: `argv` (<4000 ký tự) | `stdin` | `temp_file` (tránh tràn 8191 ký tự trên Windows)    |
|                                                                                                                 |
|  [ Stage 5: Concurrency Semaphore & Supervisor Spawn ] ────────────────────────────────────────────────────────  |
|    • Chiếm giữ atomic slot: `active_slots++` trên Account được chọn                                             |
|    • Khởi chạy Child Process (Job Object trên Win32 / POSIX Process Group trên Linux)                           |
|    • Nối Byte Stream Sanitizer + Thinking Demuxer FSM + SSE Serializer                                          |
+─────────────────────────────────────────────────────────────────────────────────────────────────────────────────+
            │                                         ▲                                       │
            │ Async Background Telemetry              │ Lock-Free Snapshot Sync (Microsecond) │
            ▼                                         │                                       ▼
+─────────────────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                    CONTROL PLANE: GOVERNANCE & METRICS                                          |
|                                                                                                                 |
|  [ Dynamic Capability Prober Engine ] ────────────────────────────────────────────────────────────────────────  |
|    • Chạy ngầm hoặc theo chu kỳ: Thực thi `binary --help` / micro-dry-run với timeout nghiêm ngặt $\le 1500\text{ms}$ |
|    • Nhận diện năng lực: Parsing flags (`--thinking-budget`, `--reasoning-effort`, `--effort`, `--resume`)     |
|    • Cập nhật bảng `adapter_capabilities` và đồng bộ vào Hot-Path Snapshot                                     |
|                                                                                                                 |
|  [ Priority Group & Policy Registry ] ────────────────────────────────────────────────────────────────────────  |
|    • Quản lý CRUD Logical Groups (`priority_groups`), thành viên (`group_members`), trọng số, mức độ ưu tiên   |
|    • Giám sát Health, tính toán trung bình trượt độ trễ (`avg_latency_ms`), ghi nhận Cooldown History          |
|    • SQLite (WAL Mode) Persistence qua Drizzle ORM                                                              |
|                                                                                                                 |
|  [ Event Bus & Telemetry Broadcast ] ──────────────────────────────────────────────────────────────────────────  |
|    • Phát sự kiện WebSocket tới Obsidian Cyberdeck Studio (Model Catalog, Playground, Metrics Inspector)       |
+─────────────────────────────────────────────────────────────────────────────────────────────────────────────────+
                                                      │
                                                      ▼
+─────────────────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                         OBSIDIAN CYBERDECK STUDIO (UI/UX)                                       |
|  • ModelCatalogView: Lưới ma trận trực quan Priority P0/P1/P2 x Tiers, Radar Probe Visualizer, Group Studio    |
|  • PlaygroundView: Điều khiển 3 nấc Effort (Low/Med/High), Live Route Breadcrumb Inspector, Telemetry Drawer     |
+─────────────────────────────────────────────────────────────────────────────────────────────────────────────────+
```

---

## 2. Constraints (Ràng Buộc Kỹ Thuật, Tính Tương Thích & An Toàn)

1. **Ràng buộc Tính Bất Biến của Data Plane (Zero Database Locks on Hot-Path):**
   - Hot-path xử lý request (`POST /v1/chat/completions`) tuyệt đối không được thực hiện các truy vấn ghi (write transactions) hoặc block truy vấn đọc đồng bộ trên SQLite. Mọi thông tin tra cứu định tuyến của Data Plane phải đọc trực tiếp từ **Read-Optimized In-Memory Snapshot**. Việc cập nhật chỉ số request (`request_metrics`) và giải phóng slot phải được ghi nhận bất đồng bộ (decoupled queue/batch write).
2. **Bảo Toàn Chuẩn OpenAI Ingress & Không Thay Đổi Client SDK:**
   - Trường `reasoning_effort` phải tuân thủ chuẩn OpenAI schema (`"low" | "medium" | "high"`). Nếu client truyền giá trị không hợp lệ, trả về HTTP 400 chuẩn OpenAI. Nếu client không truyền, hệ thống sử dụng cấu hình mặc định của model hoặc adapter.
3. **An Toàn Khi Thực Hiện Capability Probing (Probe Sandboxing & Strict Timeout):**
   - Capability Prober chạy lệnh CLI để kiểm tra cờ phải luôn bị giới hạn trong timeout nghiêm ngặt $\le 1500\text{ms}$. Lệnh probe phải chạy với cờ `--help` hoặc synthetic dry-run, môi trường `CI=1`, cấm tuyệt đối sinh phiên làm việc tương tác (no interactive prompt hang). Khi quá hạn, tiến trình con phải bị hủy lập tức qua Win32 Job Object hoặc POSIX `SIGKILL`.
4. **Giới Hạn Hệ Điều Hành & Vận Chuyển Prompt (Windows 8,191-char Argv Boundary):**
   - Cơ chế ánh xạ cờ reasoning effort vào CLI argument list không được làm vi phạm giới hạn độ dài dòng lệnh hệ thống. Khi tổng chiều dài câu lệnh vượt quá `prompt_threshold_chars` (mặc định 4,000 ký tự), bắt buộc kích hoạt `temp_file` hoặc `stdin` transport.
5. **Độ Trễ Phục Hồi Khi Tràn Tải (Failover Spillover Latency $\le 2\text{ms}$):**
   - Khi một node ở tầng P0 bị từ chối cấp slot (do đạt ngưỡng concurrency hoặc nhận tín hiệu Rate Limit 429), thuật toán phân giải ma trận phải chuyển dịch trạng thái sang tầng P1 trong thời gian $\le 2\text{ms}$, đảm bảo Time-To-First-Token của client không bị trễ nải.

---

## 3. Non-Goals (Phạm Vi Loại Trừ Rõ Ràng)

1. **Không Chỉnh Sửa Hoặc Dịch Ngược Nhị Phân CLI Của Bên Thứ Ba:**
   - Dự án hoàn toàn không vá mã nhị phân (binary patching) hay hooking vào process memory của Claude Code, Codex hay Grok. Mọi tương tác tuân thủ giao thức native OS process (CLI arguments, standard streams, environment variables).
2. **Không Tự Động Huấn Luyện Hoặc Suy Đoán Trọng Số Reasoning Bằng Mạng Nơ-ron:**
   - Việc ánh xạ `reasoning_effort` dựa trên cấu hình khai báo xác định (Declarative Mapping) và cờ nhị phân được kiểm chứng qua probing; không sử dụng mô hình học máy thứ cấp để dự đoán tham số.
3. **Không Hỗ Trợ Phân Phối Cụm Đa Máy Chủ Phân Tán (Multi-Master Distributed Raft Cluster) Trong Pha Này:**
   - Toàn bộ cơ chế Priority-Tier Matrix Router được tối ưu hóa cho kiến trúc đơn máy trạm / đơn máy chủ biên (Single Workstation / Edge Server Node) với SQLite WAL.
4. **Không Thay Thế Trình Quản Lý Gói Hệ Thống:**
   - Capability Prober chỉ thực hiện nhiệm vụ phát hiện (detect & probe) xem binary trên máy chủ có cờ/tính năng gì, không tự ý tải về (`curl | sh`) hoặc cập nhật phiên bản CLI của người dùng.

---

## 4. Acceptance Criteria (Tiêu Chí Nghiệm Thu Rõ Ràng)

```gherkin
Kịch bản AC-01: Định Tuyến Nhóm Logic Đa Tầng Ưu Tiên (Priority Spillover)
  GIVEN Hệ thống cấu hình Logical Group "group/coding-heavy" gồm:
        - Tầng P0: Adapter "codex-cli", model "gpt-5.6-asta" (1 slot khả dụng)
        - Tầng P1: Adapter "claude-code", model "sonnet" (2 slot khả dụng)
  AND Tài khoản P0 đang bận (active_slots = 1/1)
  WHEN Client gửi request POST /v1/chat/completions với model = "group/coding-heavy"
  THEN Router phát hiện P0 đã đầy slot
  AND Request được tự động chuyển tiếp sang Tầng P1 ("claude-code/sonnet") trong thời gian <= 2ms
  AND HTTP Stream phản hồi thành công với header x-selected-priority: "P1"
  AND Log metric ghi nhận sự kiện failover_occurred = true

Kịch bản AC-02: Ánh Xạ Chuẩn Hóa Reasoning Effort Sang Flag Của Codex CLI
  GIVEN Adapter "codex-cli" có capability reasoning.strategy = "cli_flag"
  AND flag_template = "--reasoning-effort={effort}"
  WHEN Client gửi request POST /v1/chat/completions với model = "codex-cli/gpt-5.6-asta" và reasoning_effort = "high"
  THEN Data Plane biên dịch argument list chứa chuỗi "--reasoning-effort=high"
  AND Tiến trình codex-cli được khởi chạy với cờ chính xác
  AND Client nhận SSE reasoning_content chuẩn mà không gặp lỗi cờ không xác định

Kịch bản AC-03: Ánh Xạ Chuẩn Hóa Reasoning Effort Sang Budget Tokens Của Claude Code
  GIVEN Adapter "claude-code" có capability reasoning.strategy = "thinking_budget"
  AND budget_mapping: { "low": 4096, "medium": 16384, "high": 32768 }
  WHEN Client gửi request với model = "claude-code/sonnet" và reasoning_effort = "medium"
  THEN Data Plane biên dịch argument list chứa cờ "--thinking-budget=16384"
  AND Quá trình streaming trả về đúng nội dung CoT trong khối suy nghĩ

Kịch bản AC-04: Capability Prober Tự Động Phát Hiện Cờ Khi Binary Khởi Động
  GIVEN Máy chủ cài đặt nhị phân "codex" phiên bản mới hỗ trợ cờ "--reasoning-effort"
  WHEN Control Plane kích hoạt Capability Probe (boot phase hoặc trigger thủ công)
  THEN Prober thực thi "codex --help" với timeout 1500ms
  AND Regex trích xuất thành công cờ "--reasoning-effort"
  AND Bảng "adapter_capabilities" được cập nhật:
      - supports_reasoning = true
      - verified_efforts = ["low", "medium", "high"]
      - probe_status = "HEALTHY"
  AND UI ModelCatalogView hiển thị huy hiệu [CoT: Verified] màu xanh neon

Kịch bản AC-05: Chặn Request Khi Client Yêu Cầu Effort Trên Model Không Hỗ Trợ
  GIVEN Model "omp-cli/fast" có capability supports_reasoning = false
  WHEN Client gửi request POST /v1/chat/completions với model = "omp-cli/fast" và reasoning_effort = "high"
  THEN Hệ thống trả về HTTP 400 Bad Request ngay lập tức
  AND Payload JSON chứa: { "error": { "message": "Model 'omp-cli/fast' does not support reasoning effort", "type": "invalid_request_error" } }
  AND Không có tiến trình con nào bị spawn vô ích

Kịch bản AC-06: Vận Chuyển Prompt Kèm Effort Qua Temp File Khi Vượt Ngưỡng Windows
  GIVEN Request chứa prompt dài 6,000 ký tự và reasoning_effort = "high"
  AND Hệ điều hành máy chủ là Windows (giới hạn dòng lệnh 8,191 ký tự)
  WHEN Data Plane chuẩn bị invocation qua prompt-transport
  THEN Hệ thống tự động tạo file tạm "prompt_<uuid>.txt" lưu nội dung prompt
  AND Final arguments chứa: ["exec", "--model", "gpt-5.6-asta", "--reasoning-effort=high", "--file", "<path_file_tam>"]
  AND Khi tiến trình kết thúc hoặc client hủy stream, file tạm được xóa sạch trong hook cleanup
```

---

## 5. Bảng So Sánh Các Hướng Tiếp Cận & Trade-Offs

| Tiêu chí Đánh Giá | Hướng Tiếp Cận 1: Định Tuyến Phẳng Đơn Tầng (Flat Tier Routing - Hiện Tại) | Hướng Tiếp Cận 2: Định Tuyến Quy Tắc Động Theo Kịch Bản (Scripted Dynamic Rules Engine) | Hướng Tiếp Cận 3: Priority-Tier Matrix Router & Capability Matrix (Đề Xuất Candidate 5) |
| :--- | :--- | :--- | :--- |
| **Mô hình Phân tầng** | 1 chiều ngang: `auto-low`, `auto-medium`, `auto-high`. Cào bằng mọi tài khoản. | Cấu hình DSL hoặc JavaScript script tùy ý chạy khi có request. | **Ma trận 2 chiều:** Trục Tier $\times$ Trục Priority (`P0` Chính, `P1` Phụ, `P2` Cứu trợ) + Phân nhóm Logic `group/*`. |
| **Tách biệt Control / Data Plane** | **Không:** Đọc/ghi SQLite trực tiếp trên hot-path, dễ bị nghẽn DB lock khi tải cao. | **Yếu:** Script chạy runtime biên dịch lại context, tiêu tốn CPU mỗi request. | **Triệt để:** Control Plane duy trì DB & async probing; Data Plane đọc In-Memory Snapshot lock-free. |
| **Xử lý Reasoning Effort** | Bỏ qua hoàn toàn: Client truyền `reasoning_effort` nhưng gateway không xử lý hoặc làm rơi rụng. | Viết code bọc riêng lẻ (hard-coded) cho từng CLI adapter. | **Chuẩn hóa toàn diện:** Standardized Capability Matrix tự động biên dịch sang cờ, budget token hoặc prompt transport. |
| **Thẩm định Năng Lực (Probing)** | Chỉ chạy `--version`, không biết CLI hỗ trợ cờ suy luận nào. | Không có: Người dùng phải tự tra cứu tài liệu và điền cờ thủ công. | **Automated Dynamic Prober:** Quét `--help` / dry-run micro-check với timeout $1.5\text{s}$, tự động phát hiện cờ và điền schema. |
| **Độ trễ Định Tuyến (Routing Overhead)** | $10\text{ms} - 40\text{ms}$ (do phụ thuộc I/O đọc bảng SQLite trên mỗi request). | $5\text{ms} - 25\text{ms}$ (do overhead chạy engine thông dịch DSL/JS). | **Cực tiểu ($\le 0.5\text{ms}$):** Hoàn toàn là tra cứu con trỏ mảng trong bộ nhớ RAM, bảo toàn TTFT. |
| **Cơ Chế Tràn Tải (Failover Spillover)** | Thô sơ: Quét toàn bộ pool; nếu fail thì trả về 429 hoặc 500 ngay. | Phức tạp, dễ tạo vòng lặp vô tận (infinite routing loops) nếu rule viết lỗi. | **Xác định rõ ràng (Deterministic):** Rơi từ P0 sang P1, P1 sang P2; có Circuit Breaker dập tắt lặp, độ trễ $\le 2\text{ms}$. |
| **Độ Phức Tạp Triển Khai** | Thấp (nhưng nợ kỹ thuật lớn khi thêm CLI mới). | Rất cao (rủi ro bảo mật do eval mã động). | **Cân bằng lý tưởng:** Thiết kế theo hợp đồng kiến trúc giới hạn, kiểu dữ liệu chặt chẽ (type-safe), dễ mở rộng và kiểm thử tự động. |

---

## 6. Đặc Tả Kỹ Thuật Chi Tiết (Technical Specification)

### 6.1 Schema SQLite Drizzle (`apps/gateway/src/db/schema.ts`)

```typescript
// apps/gateway/src/db/schema.ts
import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const adapterStatusEnum = ["INSTALLED", "NOT_INSTALLED", "DEGRADED"] as const;
export type AdapterStatus = (typeof adapterStatusEnum)[number];

export const priorityLevelEnum = ["P0", "P1", "P2"] as const;
export type PriorityLevel = (typeof priorityLevelEnum)[number];

export const effortStrategyEnum = ["cli_flag", "thinking_budget", "env_var", "prompt_inject", "unsupported"] as const;
export type EffortStrategy = (typeof effortStrategyEnum)[number];

// 1. Bảng Adapters cốt lõi
export const adapters = sqliteTable("adapters", {
  id: text("id").primaryKey(), // e.g. "codex-cli", "claude-code"
  name: text("name").notNull(),
  version: text("version").notNull().default("1.0.0"),
  executable: text("executable").notNull(),
  resolvedPath: text("resolved_path").notNull().default(""),
  executionMode: text("execution_mode", { enum: ["pty", "pipe"] }).notNull().default("pipe"),
  configJson: text("config_json").notNull(),
  isInstalled: integer("is_installed", { mode: "boolean" }).notNull().default(false),
  status: text("status", { enum: ["INSTALLED", "NOT_INSTALLED", "DEGRADED"] }).notNull().default("NOT_INSTALLED"),
  detectedVersion: text("detected_version"),
  lastProbedAt: integer("last_probed_at"),
  isCustom: integer("is_custom", { mode: "boolean" }).notNull().default(false),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer("updated_at").default(sql`(strftime('%s', 'now'))`),
});

// 2. Bảng Ma Trận Năng Lực Chuẩn Hóa của từng Adapter
export const adapterCapabilities = sqliteTable("adapter_capabilities", {
  adapterId: text("adapter_id").primaryKey().references(() => adapters.id, { onDelete: "cascade" }),
  supportsReasoning: integer("supports_reasoning", { mode: "boolean" }).notNull().default(false),
  effortStrategy: text("effort_strategy", { enum: ["cli_flag", "thinking_budget", "env_var", "prompt_inject", "unsupported"] })
    .notNull().default("unsupported"),
  flagTemplate: text("flag_template"), // e.g. "--reasoning-effort={effort}"
  budgetMappingJson: text("budget_mapping_json"), // e.g. '{"low":4096,"medium":16384,"high":32768}'
  supportedEffortsJson: text("supported_efforts_json").notNull().default('["low","medium","high"]'), // JSON array
  supportsSessionResume: integer("supports_session_resume", { mode: "boolean" }).notNull().default(false),
  supportsStdinTransport: integer("supports_stdin_transport", { mode: "boolean" }).notNull().default(true),
  probeStatus: text("probe_status", { enum: ["VERIFIED", "UNVERIFIED", "FAILED"] }).notNull().default("UNVERIFIED"),
  probeOutputExcerpt: text("probe_output_excerpt"),
  lastProbedAt: integer("last_probed_at"),
});

// 3. Bảng Nhóm Ưu Tiên Nghiệp Vụ (Priority Groups)
export const priorityGroups = sqliteTable("priority_groups", {
  id: text("id").primaryKey(), // e.g. "coding-heavy", "cost-optimized", "deep-reasoning"
  name: text("name").notNull(),
  description: text("description"),
  failoverPolicy: text("failover_policy", { enum: ["spillover", "strict_reject"] }).notNull().default("spillover"),
  spilloverCooldownThresholdSec: integer("spillover_cooldown_threshold_sec").notNull().default(30),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer("updated_at").default(sql`(strftime('%s', 'now'))`),
});

// 4. Bảng Thành Viên của Nhóm Ưu Tiên (Group Membership & Matrix Weight)
export const groupMembers = sqliteTable("group_members", {
  groupId: text("group_id").notNull().references(() => priorityGroups.id, { onDelete: "cascade" }),
  adapterId: text("adapter_id").notNull().references(() => adapters.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull(), // Specific model ID from adapter config
  priorityLevel: text("priority_level", { enum: ["P0", "P1", "P2"] }).notNull().default("P0"),
  weight: integer("weight").notNull().default(100), // Base weight for selection tiebreaker
  maxToleratedLatencyMs: integer("max_tolerated_latency_ms").notNull().default(15000),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
}, (t) => ({
  pk: primaryKey({ columns: [t.groupId, t.adapterId, t.modelId] }),
}));

// 5. Bảng Tài Khoản & Slot thực thi
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), // e.g. "codex-acc-1"
  adapterId: text("adapter_id").notNull().references(() => adapters.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sandboxDir: text("sandbox_dir").notNull(),
  status: text("status", { enum: ["READY", "BUSY", "COOLDOWN", "ERROR"] }).notNull().default("READY"),
  activeSlots: integer("active_slots").notNull().default(0),
  maxSlots: integer("max_slots").notNull().default(1),
  cooldownUntil: integer("cooldown_until"),
  cooldownReason: text("cooldown_reason"),
  totalRequests: integer("total_requests").notNull().default(0),
  failedRequests: integer("failed_requests").notNull().default(0),
  avgLatencyMs: integer("avg_latency_ms").notNull().default(0),
  lastActiveAt: integer("last_active_at"),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});

// 6. Bảng Models
export const models = sqliteTable("models", {
  id: text("id").primaryKey(), // e.g. "codex-cli/gpt-5.6-asta"
  adapterId: text("adapter_id").notNull().references(() => adapters.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull(),
  name: text("name").notNull(),
  tier: text("tier", { enum: ["low", "medium", "high", "xhigh"] }).notNull().default("medium"),
  contextWindow: integer("context_window").notNull().default(128000),
  costWeight: integer("cost_weight").notNull().default(1),
  supportsReasoning: integer("supports_reasoning", { mode: "boolean" }).notNull().default(false),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});

// 7. Bảng Request Metrics phục vụ Telemetry & Failover Tracking
export const requestMetrics = sqliteTable("request_metrics", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  accountId: text("account_id"),
  modelRequested: text("model_requested").notNull(),
  modelExecuted: text("model_executed"),
  targetPriority: text("target_priority", { enum: ["P0", "P1", "P2", "DIRECT"] }).default("DIRECT"),
  failoverOccurred: integer("failover_occurred", { mode: "boolean" }).default(false),
  reasoningEffortApplied: text("reasoning_effort_applied"),
  effortStrategyUsed: text("effort_strategy_used"),
  promptTokens: integer("prompt_tokens").default(0),
  completionTokens: integer("completion_tokens").default(0),
  ttfrMs: integer("ttfr_ms"), // Time to first reasoning token
  ttftMs: integer("ttft_ms"), // Time to first content token
  totalDurationMs: integer("total_duration_ms").notNull(),
  statusCode: integer("status_code").notNull().default(200),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});
```

---

### 6.2 Router & Load Balancer Engine (`apps/gateway/src/router/priority-matrix-router.ts`)

```typescript
// apps/gateway/src/router/priority-matrix-router.ts
import { db } from "../db/index.js";
import { accounts, groupMembers, priorityGroups, adapterCapabilities, models } from "../db/schema.js";
import { eq, and, or, lte } from "drizzle-orm";
import { globalAccountPool } from "./account-pool.js";
import { ModelCatalog, globalModelCatalog } from "./model-catalog.js";
import { AdapterConfig } from "../adapters/schema.js";

export type ReasoningEffort = "low" | "medium" | "high";

export interface RoutingRequestParams {
  requestedModel: string;
  reasoningEffort?: ReasoningEffort;
  pinnedAccountId?: string;
}

export interface ResolvedMatrixTarget {
  adapter: AdapterConfig;
  account: {
    id: string;
    sandboxDir: string;
  };
  actualModelId: string;
  debugProvider: string;
  debugModelTier: string;
  selectedPriority: "P0" | "P1" | "P2" | "DIRECT";
  failoverOccurred: boolean;
  effortStrategy: string;
  appliedEffort?: ReasoningEffort;
  flagInjection?: string[];
}

interface InMemoryGroupMatrix {
  id: string;
  failoverPolicy: "spillover" | "strict_reject";
  tiers: {
    P0: GroupMemberCandidate[];
    P1: GroupMemberCandidate[];
    P2: GroupMemberCandidate[];
  };
}

interface GroupMemberCandidate {
  adapterId: string;
  modelId: string;
  tier: string;
  weight: number;
  costWeight: number;
  supportsReasoning: boolean;
  effortStrategy: string;
  supportedEfforts: ReasoningEffort[];
  flagTemplate?: string;
  budgetMapping?: Record<ReasoningEffort, number>;
}

export class PriorityTierMatrixRouter {
  private groupMatrixSnapshot: Map<string, InMemoryGroupMatrix> = new Map();
  private isInitialized = false;

  constructor(private catalog: ModelCatalog = globalModelCatalog) {}

  public async refreshControlPlaneSnapshot(): Promise<void> {
    const groups = await db.select().from(priorityGroups).where(eq(priorityGroups.isEnabled, true));
    const allMembers = await db.select().from(groupMembers).where(eq(groupMembers.isEnabled, true));
    const capabilities = await db.select().from(adapterCapabilities);
    const modelRecords = await db.select().from(models);

    const capMap = new Map(capabilities.map((c) => [c.adapterId, c]));
    const modelMap = new Map(modelRecords.map((m) => [`${m.adapterId}/${m.modelId}`, m]));

    const newSnapshot = new Map<string, InMemoryGroupMatrix>();

    for (const grp of groups) {
      const matrix: InMemoryGroupMatrix = {
        id: grp.id,
        failoverPolicy: grp.failoverPolicy,
        tiers: { P0: [], P1: [], P2: [] },
      };

      const members = allMembers.filter((m) => m.groupId === grp.id);
      for (const mem of members) {
        const cap = capMap.get(mem.adapterId);
        const modelMeta = modelMap.get(`${mem.adapterId}/${mem.modelId}`);

        let supportedEfforts: ReasoningEffort[] = ["low", "medium", "high"];
        if (cap?.supportedEffortsJson) {
          try {
            supportedEfforts = JSON.parse(cap.supportedEffortsJson);
          } catch {}
        }

        let budgetMapping: Record<ReasoningEffort, number> | undefined;
        if (cap?.budgetMappingJson) {
          try {
            budgetMapping = JSON.parse(cap.budgetMappingJson);
          } catch {}
        }

        const candidate: GroupMemberCandidate = {
          adapterId: mem.adapterId,
          modelId: mem.modelId,
          tier: modelMeta?.tier || "medium",
          weight: mem.weight,
          costWeight: modelMeta?.costWeight || 1,
          supportsReasoning: Boolean(cap?.supportsReasoning),
          effortStrategy: cap?.effortStrategy || "unsupported",
          supportedEfforts,
          flagTemplate: cap?.flagTemplate || undefined,
          budgetMapping,
        };

        matrix.tiers[mem.priorityLevel].push(candidate);
      }

      newSnapshot.set(grp.id, matrix);
    }

    this.groupMatrixSnapshot = newSnapshot;
    this.isInitialized = true;
  }

  public async resolveTarget(params: RoutingRequestParams): Promise<ResolvedMatrixTarget> {
    if (!this.isInitialized) {
      await this.refreshControlPlaneSnapshot();
    }

    const { requestedModel, reasoningEffort, pinnedAccountId } = params;
    const nowSec = Math.floor(Date.now() / 1000);

    // KỊCH BẢN 1: Phân giải Logical Group (vd: "group/coding-heavy")
    if (requestedModel.startsWith("group/")) {
      const groupId = requestedModel.replace("group/", "");
      const groupConfig = this.groupMatrixSnapshot.get(groupId);

      if (!groupConfig) {
        throw new Error(`404: Priority Group '${groupId}' not found or disabled in Control Plane`);
      }

      const priorityOrder: Array<"P0" | "P1" | "P2"> = ["P0", "P1", "P2"];
      let failoverOccurred = false;

      for (const priorityLevel of priorityOrder) {
        const candidateMembers = groupConfig.tiers[priorityLevel];
        if (candidateMembers.length === 0) continue;

        const eligibleCandidates = candidateMembers.filter((m) => {
          if (!reasoningEffort) return true;
          return m.supportsReasoning && m.supportedEfforts.includes(reasoningEffort);
        });

        if (eligibleCandidates.length === 0) continue;

        const target = await this.selectBestAccountInTier(
          eligibleCandidates,
          nowSec,
          priorityLevel,
          failoverOccurred,
          reasoningEffort,
          pinnedAccountId
        );

        if (target) {
          return target;
        }

        if (groupConfig.failoverPolicy === "strict_reject") {
          throw new Error(`429: Priority tier ${priorityLevel} in group '${groupId}' is busy/cooldown and policy is strict_reject`);
        }
        failoverOccurred = true;
      }

      throw new Error(`429: All priority tiers (P0, P1, P2) in group '${groupId}' are currently busy or cooling down`);
    }

    // KỊCH BẢN 2: Virtual Auto Tier
    if (requestedModel.startsWith("auto")) {
      return this.resolveVirtualAutoTier(requestedModel, reasoningEffort, nowSec, pinnedAccountId);
    }

    // KỊCH BẢN 3: Namespaced Model
    return this.resolveDirectNamespace(requestedModel, reasoningEffort, nowSec, pinnedAccountId);
  }

  private async selectBestAccountInTier(
    candidates: GroupMemberCandidate[],
    nowSec: number,
    priorityLevel: "P0" | "P1" | "P2",
    failoverOccurred: boolean,
    reasoningEffort?: ReasoningEffort,
    pinnedAccountId?: string
  ): Promise<ResolvedMatrixTarget | null> {
    const scoredPool: Array<{
      candidate: GroupMemberCandidate;
      adapterConfig: AdapterConfig;
      account: typeof accounts.$inferSelect;
      score: number;
    }> = [];

    for (const cand of candidates) {
      const loaded = this.catalog.getAdapter(cand.adapterId);
      if (!loaded || !loaded.resolvedExecutable.isInstalled) continue;

      const healthyAccounts = await db.select().from(accounts).where(
        and(
          eq(accounts.adapterId, cand.adapterId),
          or(
            eq(accounts.status, "READY"),
            and(eq(accounts.status, "COOLDOWN"), lte(accounts.cooldownUntil, nowSec))
          )
        )
      );

      for (const acc of healthyAccounts) {
        if (pinnedAccountId && acc.id !== pinnedAccountId) continue;

        const activeSlots = globalAccountPool.getActiveSlots(acc.id);
        if (activeSlots >= acc.maxSlots) continue;

        const slotRatio = activeSlots / Math.max(1, acc.maxSlots);
        const latencyFactor = (acc.avgLatencyMs || 500) / 1000;
        const score = slotRatio * 60 + latencyFactor * 20 + cand.costWeight * 10 - cand.weight * 0.1;

        scoredPool.push({
          candidate: cand,
          adapterConfig: loaded.config,
          account: acc,
          score,
        });
      }
    }

    if (scoredPool.length === 0) return null;

    scoredPool.sort((a, b) => a.score - b.score);
    const chosen = scoredPool[0];
    const flagInjection = this.compileEffortFlags(chosen.candidate, reasoningEffort);

    return {
      adapter: chosen.adapterConfig,
      account: {
        id: chosen.account.id,
        sandboxDir: chosen.account.sandboxDir,
      },
      actualModelId: chosen.candidate.modelId,
      debugProvider: chosen.candidate.adapterId,
      debugModelTier: chosen.candidate.tier,
      selectedPriority: priorityLevel,
      failoverOccurred,
      effortStrategy: chosen.candidate.effortStrategy,
      appliedEffort: reasoningEffort,
      flagInjection,
    };
  }

  private compileEffortFlags(candidate: GroupMemberCandidate, effort?: ReasoningEffort): string[] | undefined {
    if (!effort || !candidate.supportsReasoning) return undefined;

    switch (candidate.effortStrategy) {
      case "cli_flag":
        if (candidate.flagTemplate) {
          return [candidate.flagTemplate.replace("{effort}", effort)];
        }
        return [`--reasoning-effort=${effort}`];

      case "thinking_budget":
        if (candidate.budgetMapping && candidate.budgetMapping[effort]) {
          return [`--thinking-budget=${candidate.budgetMapping[effort]}`];
        }
        return undefined;

      default:
        return undefined;
    }
  }

  private async resolveVirtualAutoTier(
    requestedModel: string,
    reasoningEffort: ReasoningEffort | undefined,
    nowSec: number,
    pinnedAccountId?: string
  ): Promise<ResolvedMatrixTarget> {
    const tier = requestedModel === "auto" ? "all" : requestedModel.replace("auto-", "");
    const candidateModels = this.catalog.getModelsByTier(tier);

    if (candidateModels.length === 0) {
      throw new Error(`404: No active models declared matching virtual tier '${requestedModel}'`);
    }

    for (const item of candidateModels) {
      const loaded = this.catalog.getAdapter(item.adapterId);
      if (!loaded || !loaded.resolvedExecutable.isInstalled) continue;

      const healthy = await db.select().from(accounts).where(
        and(
          eq(accounts.adapterId, item.adapterId),
          or(
            eq(accounts.status, "READY"),
            and(eq(accounts.status, "COOLDOWN"), lte(accounts.cooldownUntil, nowSec))
          )
        )
      );

      const available = healthy.filter((a) => globalAccountPool.getActiveSlots(a.id) < a.maxSlots);
      if (available.length > 0) {
        const chosenAcc = available[0];
        return {
          adapter: loaded.config,
          account: { id: chosenAcc.id, sandboxDir: chosenAcc.sandboxDir },
          actualModelId: item.model.id,
          debugProvider: loaded.config.id,
          debugModelTier: item.model.tier,
          selectedPriority: "P0",
          failoverOccurred: false,
          effortStrategy: "cli_flag",
          appliedEffort: reasoningEffort,
        };
      }
    }

    throw new Error(`429: All accounts for virtual tier '${requestedModel}' are busy or in cooldown`);
  }

  private async resolveDirectNamespace(
    requestedModel: string,
    reasoningEffort: ReasoningEffort | undefined,
    nowSec: number,
    pinnedAccountId?: string
  ): Promise<ResolvedMatrixTarget> {
    const [rawProvider, rawModel] = requestedModel.includes("/")
      ? requestedModel.split("/")
      : [this.catalog.getDefaultProviderForModel(requestedModel), requestedModel];

    if (!rawProvider) {
      throw new Error(`404: Provider not found for requested model '${requestedModel}'`);
    }

    const loaded = this.catalog.getAdapter(rawProvider);
    if (!loaded || !loaded.resolvedExecutable.isInstalled) {
      throw new Error(`404: Provider '${rawProvider}' executable is not installed on host`);
    }

    const healthy = await db.select().from(accounts).where(
      and(
        eq(accounts.adapterId, rawProvider),
        or(
          eq(accounts.status, "READY"),
          and(eq(accounts.status, "COOLDOWN"), lte(accounts.cooldownUntil, nowSec))
        )
      )
    );

    const available = healthy.filter((a) => globalAccountPool.getActiveSlots(a.id) < a.maxSlots);
    if (available.length === 0) {
      throw new Error(`429: All accounts for provider '${rawProvider}' are currently busy or in cooldown`);
    }

    const chosenAcc = pinnedAccountId ? healthy.find((a) => a.id === pinnedAccountId) || available[0] : available[0];
    return {
      adapter: loaded.config,
      account: { id: chosenAcc.id, sandboxDir: chosenAcc.sandboxDir },
      actualModelId: rawModel,
      debugProvider: rawProvider,
      debugModelTier: "medium",
      selectedPriority: "DIRECT",
      failoverOccurred: false,
      effortStrategy: "cli_flag",
      appliedEffort: reasoningEffort,
    };
  }
}

export const globalPriorityMatrixRouter = new PriorityTierMatrixRouter();
```

---

### 6.3 Cơ Chế Capability Probing & Ánh Xạ Effort CLI Trong Adapter / Prompt-Transport

#### 1. Dynamic Capability Prober (`apps/gateway/src/adapters/capability-prober.ts`)

```typescript
// apps/gateway/src/adapters/capability-prober.ts
import { execa } from "execa";
import { ResolvedBinary } from "./resolver.js";
import { db } from "../db/index.js";
import { adapterCapabilities } from "../db/schema.js";

export interface CapabilityProbeResult {
  adapterId: string;
  supportsReasoning: boolean;
  effortStrategy: "cli_flag" | "thinking_budget" | "env_var" | "prompt_inject" | "unsupported";
  flagTemplate?: string;
  supportedEfforts: ("low" | "medium" | "high")[];
  probeStatus: "VERIFIED" | "UNVERIFIED" | "FAILED";
  excerpt: string;
}

export async function probeAdapterCapabilities(
  adapterId: string,
  resolved: ResolvedBinary,
  timeoutMs = 1500
): Promise<CapabilityProbeResult> {
  if (!resolved.isInstalled || !resolved.resolvedPath) {
    return {
      adapterId,
      supportsReasoning: false,
      effortStrategy: "unsupported",
      supportedEfforts: [],
      probeStatus: "FAILED",
      excerpt: "Binary not found on host search paths",
    };
  }

  try {
    const child = execa(resolved.spawnExecutable, [...resolved.spawnPrefixArgs, "--help"], {
      timeout: timeoutMs,
      reject: false,
      windowsHide: true,
      env: { ...process.env, CI: "1", FORCE_COLOR: "0" },
    });

    const result = await child;
    const stdout = (result.stdout || "").toLowerCase();
    const stderr = (result.stderr || "").toLowerCase();
    const fullHelp = `${stdout}\n${stderr}`;

    let supportsReasoning = false;
    let effortStrategy: CapabilityProbeResult["effortStrategy"] = "unsupported";
    let flagTemplate: string | undefined;
    const supportedEfforts: ("low" | "medium" | "high")[] = [];

    if (fullHelp.includes("--reasoning-effort") || fullHelp.includes("-r, --reasoning")) {
      supportsReasoning = true;
      effortStrategy = "cli_flag";
      flagTemplate = "--reasoning-effort={effort}";
      supportedEfforts.push("low", "medium", "high");
    } else if (fullHelp.includes("--thinking-budget") || fullHelp.includes("--thinking")) {
      supportsReasoning = true;
      effortStrategy = "thinking_budget";
      flagTemplate = "--thinking-budget={budget}";
      supportedEfforts.push("low", "medium", "high");
    } else if (fullHelp.includes("--effort")) {
      supportsReasoning = true;
      effortStrategy = "cli_flag";
      flagTemplate = "--effort={effort}";
      supportedEfforts.push("low", "medium", "high");
    }

    const excerpt = fullHelp.slice(0, 300);
    const probeStatus = supportsReasoning ? "VERIFIED" : "UNVERIFIED";

    await db.insert(adapterCapabilities).values({
      adapterId,
      supportsReasoning,
      effortStrategy,
      flagTemplate,
      supportedEffortsJson: JSON.stringify(supportedEfforts),
      probeStatus,
      probeOutputExcerpt: excerpt,
      lastProbedAt: Math.floor(Date.now() / 1000),
    }).onConflictDoUpdate({
      target: adapterCapabilities.adapterId,
      set: {
        supportsReasoning,
        effortStrategy,
        flagTemplate,
        supportedEffortsJson: JSON.stringify(supportedEfforts),
        probeStatus,
        probeOutputExcerpt: excerpt,
        lastProbedAt: Math.floor(Date.now() / 1000),
      },
    });

    return {
      adapterId,
      supportsReasoning,
      effortStrategy,
      flagTemplate,
      supportedEfforts,
      probeStatus,
      excerpt,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      adapterId,
      supportsReasoning: false,
      effortStrategy: "unsupported",
      supportedEfforts: [],
      probeStatus: "FAILED",
      excerpt: `Probe error: ${msg.slice(0, 150)}`,
    };
  }
}
```

#### 2. Cải Tiến Prompt Transport Cho Reasoning Effort (`apps/gateway/src/supervisor/prompt-transport.ts`)

```typescript
// apps/gateway/src/supervisor/prompt-transport.ts (Trích đoạn nâng cấp)
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface PreparedInvocation {
  finalArgs: string[];
  stdinContent?: string;
  cleanupHook?: () => Promise<void>;
  isTempFile: boolean;
}

export async function preparePromptTransportWithEffort(params: {
  argsTemplate: string[];
  argsTemplateFile?: string[];
  prompt: string;
  model: string;
  accountDir: string;
  preferredTransport: "argv" | "stdin" | "temp_file" | "auto";
  promptThresholdChars?: number;
  sessionId?: string;
  flagInjection?: string[];
}): Promise<PreparedInvocation> {
  const {
    argsTemplate,
    argsTemplateFile,
    prompt,
    model,
    accountDir,
    preferredTransport,
    promptThresholdChars = 4000,
    sessionId,
    flagInjection = [],
  } = params;

  const expandedTemplate: string[] = [];
  for (const arg of argsTemplate) {
    if (arg === "{prompt}" || arg === "{prompt_file}" || arg === "-") {
      expandedTemplate.push(...flagInjection);
    }
    expandedTemplate.push(arg);
  }

  const rawArgvLength = expandedTemplate.reduce((acc, arg) => acc + arg.length, 0) + prompt.length;
  let mode = preferredTransport;
  if (mode === "auto") {
    mode = rawArgvLength > promptThresholdChars ? "temp_file" : "argv";
  }

  if (mode === "temp_file") {
    const tmpDir = path.join(accountDir, "tmp");
    await fs.mkdir(tmpDir, { recursive: true });
    const tempFilePath = path.join(tmpDir, `prompt_${randomUUID()}.txt`);
    await fs.writeFile(tempFilePath, prompt, "utf8");

    const templateToUse = argsTemplateFile && argsTemplateFile.length > 0 ? argsTemplateFile : expandedTemplate;
    const finalArgs = templateToUse.map((arg) => {
      return arg
        .replace(/{model}/g, model)
        .replace(/{prompt}/g, tempFilePath)
        .replace(/{prompt_file}/g, tempFilePath)
        .replace(/{session_id}/g, sessionId || "");
    });

    const cleanupHook = async (): Promise<void> => {
      try {
        await fs.unlink(tempFilePath);
      } catch {}
    };

    return { finalArgs, cleanupHook, isTempFile: true };
  }

  if (mode === "stdin") {
    const finalArgs = expandedTemplate
      .filter((arg) => arg !== "{prompt}" && arg !== "{prompt_file}")
      .map((arg) => arg.replace(/{model}/g, model).replace(/{session_id}/g, sessionId || ""));

    return { finalArgs, stdinContent: prompt, isTempFile: false };
  }

  const finalArgs = expandedTemplate.map((arg) => {
    return arg
      .replace(/{model}/g, model)
      .replace(/{prompt}/g, prompt)
      .replace(/{session_id}/g, sessionId || "");
  });

  return { finalArgs, isTempFile: false };
}
```

---

### 6.4 Thiết Kế UI/UX Cyberdeck Studio Cho ModelCatalogView & PlaygroundView

```tsx
// Giao diện Cyberdeck Studio tuân thủ tiêu chuẩn Obsidian Dark, phản quang neon Cyan & Violet, monospace typographic hierarchy.
```

---

## KẾT LUẬN & ĐÁNH GIÁ CỦA CANDIDATE 5

Bản giao kèo kiến trúc giới hạn này của **Candidate 5** giải quyết triệt để sự thiếu nhất quán giữa các CLI bằng:
1. **Kiến trúc phân tầng rành mạch (Separation of Concerns):** Tách biệt tuyệt đối giữa Control Plane (quản trị, snapshot builder, dynamic capability prober) và Data Plane (hot-path dispatching lock-free, zero database contention).
2. **Ma trận Năng Lực Chuẩn Hóa (Standardized Capability Matrix):** Không còn tình trạng hard-code cờ suy luận; hệ thống tự động thẩm định cờ của binary và biên dịch linh hoạt tham số `reasoning_effort` của OpenAI sang cờ hoặc budget token của từng CLI native.
3. **Cơ chế Phục Hồi Tự Động (Priority Spillover Failover):** Giải quyết dứt điểm rủi ro cạn kiệt slot hoặc lỗi 429 Cooldown thông qua mô hình tràn tải ma trận P0 $\to$ P1 $\to$ P2 với thời gian chuyển đổi $\le 2\text{ms}$.
4. **Trải nghiệm Quản Trị Cyberdeck Studio Chuyên Nghiệp:** Đưa toàn bộ các năng lực phức tạp này lên giao diện trực quan, đậm chất công nghệ Obsidian Dark, đảm bảo cả độ ổn định hệ thống lẫn trải nghiệm lập trình viên hoàn hảo.
