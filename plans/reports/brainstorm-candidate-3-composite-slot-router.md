---
type: brainstorm
date: 2026-09-17
status: candidate-proposal
candidate: candidate-3
target: cli-to-api
mode: ultra-brainstorm
design_standards: ak-ui-ux-pro-max
---

# Bounded Architectural Contract: Composite Slot-Pool Router & Adaptive CLI Argument Compiler

**Đơn vị đề xuất:** Candidate 3 (Quy trình `ak-brainstorm --ultra`)  
**Mã tài liệu:** `BAC-260917-CANDIDATE-3-COMPOSITE-SLOT-ROUTER`  
**Hệ thống mục tiêu:** `cli-to-api` Core Gateway, Process Supervisor, Router & Obsidian Cyberdeck Console  
**Tiêu chuẩn thiết kế:** AK UI/UX Pro Max (`Obsidian Cyberdeck Developer Standard`)  
**Môi trường mục tiêu:** Node.js 22 LTS | Fastify v5 | SQLite WAL (`better-sqlite3` + Drizzle ORM) | React 19 + Tailwind CSS v4  

---

## Tiêu đề & Tóm tắt điều hành (Executive Summary)

Trong các phiên bản tiền nhiệm của `cli-to-api`, cơ chế quản lý tài nguyên và biên dịch tham số dòng lệnh bộc lộ hai điểm nghẽn kiến trúc cốt tử khi mở rộng quy mô vận hành:

1. **Điểm nghẽn Quản lý Slot Tĩnh & Xung đột Cấp Nhóm (Flat Account Concurrency & Group Resource Starvation):**  
   Hệ thống hiện tại chỉ quản lý semaphore phân tán độc lập trên từng tài khoản đơn lẻ (`accounts.activeSlots` và `accounts.maxSlots`), hoàn toàn thiếu vắng khái niệm **Group Quota** và **Global System Ceiling**. Khi triển khai nhiều tài khoản cho cùng một công cụ (ví dụ: 5 tài khoản `claude-code` hoặc 4 tài khoản `codex-cli`), các tiến trình chạy đồng thời dễ dẫn tới cạn kiệt RAM hệ thống (mỗi tiến trình ConPTY/V8 CLI chiếm từ $250\text{MB}$ đến $600\text{MB}$ RAM), nghẽn I/O disk socket, hoặc kích hoạt lệnh cấm Rate Limit cấp dải IP máy trạm từ nhà cung cấp upstream. Ngoài ra, việc gán cứng `maxSlots = 1` làm mất đi tính co giãn thích ứng (Elasticity) khi hệ thống rảnh rỗi hoặc khi các truy vấn chỉ đòi hỏi tải nhẹ.

2. **Sự Bế Tắc Của Mẫu Lệnh Tĩnh (Rigid Static Invocation Templates):**  
   Cấu hình gọi CLI phụ thuộc hoàn toàn vào mảng chuỗi `args_template` cố định trong YAML (ví dụ: `["exec", "--model", "{model}", "{prompt}"]`). Khi client OpenAI gửi các tham số điều khiển lập luận nâng cao như `reasoning_effort` (`low`, `medium`, `high`, `xhigh`), `temperature`, hoặc `max_completion_tokens`, gateway buộc phải bỏ qua hoặc người vận hành phải nhân bản thủ công hàng loạt template YAML khác nhau. Mọi nỗ lực sửa trực tiếp template gốc đều tiềm ẩn rủi ro phá vỡ tính tương thích ngược khi cập nhật adapter và dễ dẫn đến lỗi tràn bộ đệm dòng lệnh Windows (`cmd.exe` 8,191 ký tự).

**Đột phá kiến trúc của Candidate 3:**  
Candidate 3 thiết lập bản giao kèo kiến trúc hoàn chỉnh thông qua hai trụ cột cốt lõi:
- **Kiến trúc Composite Slot-Pool Router:** Mô hình phân bổ tài nguyên 3 tầng phân cấp (**Global Ceiling $\rightarrow$ Provider Group Pool $\rightarrow$ Elastic Account Lease**) tích hợp thuật toán tự co giãn Concurrency theo độ trễ $P_{95}$ và tỷ lệ lỗi, giải quyết dứt điểm tình trạng xung đột tài nguyên giữa các account trong cùng group.
- **Adaptive CLI Argument Compiler (Dynamic CLI Flag Injector):** Bộ biên dịch đối số động sử dụng AST/Token Stream, có khả năng tự động phân tích OpenAI Request Envelope và chèn các cờ CLI đặc thù (như Claude `--effort`, Codex `-c model_reasoning_effort=...`) vào đúng vị trí cú pháp mà **tuyệt đối không làm thay đổi template YAML gốc**, đồng thời tự động bảo toàn các cờ này khi kích hoạt cơ chế tràn file tạm (`temp_file`).

---

## 1. Outcome & Sơ đồ kiến trúc luồng dữ liệu

### 1.1 Trạng Thái Vận Hành Đích (Target Operational State)
- **100% Zero-Template-Mutation:** Toàn bộ adapter blueprints gốc giữ nguyên tính bất biến (`read-only`). Mọi tham số mở rộng (`reasoning_effort`, `temperature`, `max_tokens`) được biên dịch JIT thông qua bảng quy tắc `cli_flag_mappings`.
- **Group Isolation & Elastic Concurrency:** Không bao giờ xảy ra tình trạng "bão tiến trình" làm sập máy trạm. Tổng số tiến trình của một nhóm CLI (ví dụ: toàn bộ tài khoản `claude-code`) bị chặn cứng bởi `max_group_slots`, trong khi slot từng tài khoản tự động co giãn từ $1 \rightarrow N$ dựa trên tải thực tế và trừng phạt tức thì (backoff) khi latency tăng vọt.
- **Trans-Transport Argument Fidelity:** Dù prompt ngắn (truyền qua `argv`) hay prompt dài $>4,000$ ký tự (chuyển sang `temp_file`), toàn bộ các dynamic flags đã inject vẫn được định tuyến chính xác vào câu lệnh thực thi OS.
- **Cyberdeck Studio Real-Time Observability:** Nhà phát triển trực tiếp quan sát năng lượng của từng Group Slot Pool, điều chỉnh Reasoning Effort trên thanh trượt 4 mức, và xem trước câu lệnh thực thi đã được biên dịch thời gian thực trước khi gửi request.

### 1.2 Sơ Đồ Luồng Dữ Liệu Phân Cấp (Data Flow Architecture)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           CLIENT INGRESS LAYER                                         │
│          Cursor IDE / LibreChat / Open WebUI / OpenAI SDK / cURL (Bearer sk-cta-prod-...)              │
│          Payload: { model: "codex/gpt-5.6-asta", reasoning_effort: "high", stream: true, ... }        │
└───────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                    │ POST /v1/chat/completions
                                                    ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       FASTIFY GATEWAY RUNTIME                                          │
│                                                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 1. Request Normalizer & Capability Extractor                                                     │  │
│  │    • Tách payload: Messages, Model, Dynamic Controls (reasoning_effort, temperature, max_tokens) │  │
│  │    • Kiểm tra Model Catalog & Namespace Resolution                                               │  │
│  └────────────────────────────────────────────────┬─────────────────────────────────────────────────┘  │
│                                                   │ Ingress Context                                    │
│                                                   ▼                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 2. COMPOSITE SLOT-POOL ROUTER ENGINE                                                             │  │
│  │                                                                                                  │  │
│  │  [Tier 1: Global System Ceiling] (Giới hạn tổng tiến trình OS: Max 12 worker concurrent)        │  │
│  │    │  Acquire Global Ticket (CAS Atomic Lock)                                                    │  │
│  │    ▼                                                                                             │  │
│  │  [Tier 2: Provider Group Pool] (Phòng ngừa xung đột RAM / IP-Block: codex-group max 4 slots)     │  │
│  │    │  Check Group Capacity & Active Leases                                                       │  │
│  │    ▼                                                                                             │  │
│  │  [Tier 3: Elastic Account Scheduler] (Least-Connections + Dynamic Elastic Concurrency)          │  │
│  │    • Thuật toán tính Elastic Slots: MaxSlots = Base + ElasticBonus(avgLatency, errorRate)       │  │
│  │    • Pin Session Thread (nếu có context conversation cũ)                                         │  │
│  │    • Khóa Slot thành công: Trả về Target Account Sandbox & Lease Token                           │  │
│  └────────────────────────────────────────────────┬─────────────────────────────────────────────────┘  │
│                                                   │ Target Account + Dynamic Parameters                │
│                                                   ▼                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 3. ADAPTIVE CLI ARGUMENT COMPILER & FLAG INJECTOR                                                │  │
│  │                                                                                                  │  │
│  │  [Immutable Base Template]        [Dynamic Parameters]        [Adapter Flag Mapping Ruleset]     │  │
│  │   ["exec", "--model", "{model}"]   { effort: "high" }          reasoning_effort:                 │  │
│  │                                                                  codex: "-c model_effort={val}"  │  │
│  │                                                                  claude: ["--effort", "{val}"]   │  │
│  │                                              │                                                   │  │
│  │                                              ▼                                                   │  │
│  │   ┌──────────────────────────────────────────────────────────────────────────────────────────┐   │  │
│  │   │ AST Argument Injector & Collision Resolver                                               │   │  │
│  │   │ • Tránh trùng lặp cờ đã tồn tại trong template gốc                                       │   │  │
│  │   │ • Xác định vị trí chèn tối ưu: PRE_COMMAND | POST_COMMAND | PRE_PROMPT                    │   │  │
│  │   │ • Biên dịch thành token stream hoàn chỉnh                                                 │   │  │
│  │   └──────────────────────────────────────────┬───────────────────────────────────────────────┘   │  │
│  │                                              │ Compiled Arguments Array                          │  │
│  │                                              ▼                                                   │  │
│  │   ┌──────────────────────────────────────────────────────────────────────────────────────────┐   │  │
│  │   │ Prompt Transport Multiplexer (Threshold: 4,000 chars)                                    │   │  │
│  │   │ • Trường hợp < 4,000 chars: Giữ nguyên prompt trong Argv token stream                    │   │  │
│  │   │ • Trường hợp >= 4,000 chars: Bơm prompt vào sandbox/tmp/prompt-uuid.txt                   │   │  │
│  │   │   ==> Bảo toàn 100% các Dynamic Injected Flags trong Argv, chỉ thay thế token {prompt}   │   │  │
│  │   └──────────────────────────────────────────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────┬─────────────────────────────────────────────────┘  │
│                                                   │ Executable + Final Args + Sandboxed Env            │
│                                                   ▼                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 4. Process Supervisor & Sandbox Jail                                                             │  │
│  │    • Thư mục cách ly: $DATA_DIR/sandboxes/{adapter}/{account}/                                    │  │
│  │    • Win32 Job Objects (KILL_ON_JOB_CLOSE) / POSIX setsid (-pgid SIGKILL)                        │  │
│  │    • Execution: ConPTY (pty) hoặc Non-blocking Execa Pipe (pipe)                                 │  │
│  └────────────────────────────────────────────────┬─────────────────────────────────────────────────┘  │
│                                                   │ stdout / stderr byte stream                        │
│                                                   ▼                                                    │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ 5. Streaming & SSE Demuxer Pipeline                                                              │  │
│  │    • StringDecoder('utf8') ghép byte đa ký tự (Vietnamese diacritics / Emojis)                   │  │
│  │    • Universal FSM Streaming Tag Demuxer: Tách <think> -> reasoning_content, còn lại -> content  │  │
│  │    • SSE Serializer phát chuẩn OpenAI format về client                                           │  │
│  └──────────────────────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                    │ Real-time Events & Metrics (SSE)
                                                    ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              CYBERDECK STUDIO CONSOLE (React 19 + Tailwind v4)                         │
│   • ModelCatalogView: Group Energy Bar (Pool Capacity %) | Dialect Capability Badges                  │
│   • PlaygroundView: Cyberdeck Reasoning Slider | Live CLI Command Inspector Drawer                     │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Constraints (Ràng Buộc Kỹ Thuật, Tương Thích, An Toàn)

1. **Ràng buộc Tính Bất Biến của Adapter Template (Template Immutability Constraint):**  
   File YAML và đối tượng `AdapterConfig.invocation.args_template` đã nạp vào bộ nhớ là Read-Only. Cơ chế Flag Injection không được phép chỉnh sửa mảng gốc, không ghi đè file YAML trên đĩa, và không sử dụng phép nối chuỗi thô (`string.replace`) trên toàn bộ câu lệnh nhằm triệt tiêu nguy cơ chạy sai cấu trúc đối số giữa các luồng đồng thời.
2. **Ràng buộc Chiều Dài Dòng Lệnh OS (Argv Length Limit Constraint):**  
   Trên Windows (`cmd.exe` / Win32 `CreateProcessW`), tổng chiều dài dòng lệnh bị giới hạn nghiêm ngặt ở $8,191$ ký tự. Khi Compiler chèn thêm dynamic flags, hệ thống phải tính toán tổng độ dài:
   $$\text{TotalLen} = \sum \text{len}(\text{prefixArgs}) + \sum \text{len}(\text{baseArgs}) + \sum \text{len}(\text{injectedFlags}) + \text{len}(\text{prompt})$$
   Nếu $\text{TotalLen} \ge 4,000$ ký tự, hệ thống bắt buộc tự động kích hoạt transport `temp_file` mà không làm mất bất kỳ dynamic flag nào.
3. **Ràng buộc Chống Shell Injection (Strict Token Array Constraint):**  
   Mọi đối số (bao gồm cờ tự động inject và giá trị cờ) phải được truyền dưới dạng mảng các phần tử riêng biệt (`string[]`) tới API của OS (`execa` hoặc `node-pty`). Tuyệt đối không bao bọc câu lệnh trong chuỗi shell thô dạng `sh -c "cmd ..."` hay `cmd.exe /c "..."` mà không qua tokenization, loại bỏ hoàn toàn nguy cơ Command Injection từ nội dung `user_prompt` hoặc giá trị tham số API.
4. **Ràng buộc Tính Nguyên Tử của Slot Pool (ACID Slot Allocation Constraint):**  
   Thao tác cấp phát (acquire) và hoàn trả (release) slot trên cả 3 tầng (Global, Group, Account) phải đạt tính nguyên tử tuyệt đối (Microsecond In-Memory CAS Mutex đồng bộ hóa với SQLite WAL Transaction). Không để xảy ra race condition dẫn đến tình trạng over-allocation vượt quá `max_group_slots`.
5. **Ràng buộc Tuân Thủ Chuẩn OpenAI API (Strict OpenAI Envelope Constraint):**  
   Gateway phải tiếp nhận chính xác các trường chuẩn trong request:
   - `reasoning_effort`: string (`"low"` | `"medium"` | `"high"` | `"xhigh"`).
   - `temperature`: number ($0.0 \le T \le 2.0$).
   - `max_tokens` / `max_completion_tokens`: integer positive.
   Nếu CLI đích không hỗ trợ tính năng tương ứng, hệ thống phải tự động khử cờ (Graceful Degrade) và ghi log cảnh báo, không được trả mã lỗi 500 làm gãy kết nối của client OpenAI.

---

## 3. Non-goals (Phạm Vi Loại Trừ Rõ Ràng)

1. **Không Tự Động Tải & Cài Đặt CLI:** Gateway không tích hợp logic gọi `npm install -g`, `pip install`, `brew`, hay `winget`. Người dùng chịu trách nhiệm cài đặt và cấp quyền thực thi cho các CLI trên máy trạm.
2. **Không Patch Mã Máy hoặc Reverse-Engineer Giao Thức Đóng Của CLI:** Hệ thống tương tác với CLI thông qua standard OS process abstraction (STDIN, STDOUT, STDERR, PTY, Argv, Environment Variables). Không hook DLL, không dịch ngược bytecode, không giả lập binary.
3. **Không Triển Khai Kiến Trúc Cụm Phân Tán (Multi-Node / Kubernetes Cluster):** Thiết kế này tập trung tối ưu hóa cực hạn cho mô hình **Local-first Developer Daemon** chạy trên 1 workstation/server đơn lẻ (Windows 11, macOS, Linux dev-box).
4. **Không Cho Phép Client Truyền Cờ CLI Tùy Tiện (Arbitrary Untrusted Flag Pass-through):** Client không thể tự ý truyền các cờ hệ thống nguy hiểm (ví dụ: `--dangerously-skip-permissions`, `--eval`) thông qua OpenAI API. Chỉ những cờ được định nghĩa rõ ràng trong bảng mapping của Adapter Blueprint mới được phép biên dịch.

---

## 4. Acceptance Criteria (Tiêu Chí Nghiệm Thu Sắc Nét)

### AC-1: Composite Slot-Pool Router & Group Capacity Containment
- **GIVEN:** Adapter `claude-code` thuộc nhóm `claude-group` có cấu hình `max_group_slots = 2`. Nhóm có 3 tài khoản: `acc-01`, `acc-02`, `acc-03`, mỗi tài khoản có `max_slots = 1`.
- **WHEN:** 2 request đồng thời gửi tới gateway và được phân bổ vào `acc-01` và `acc-02` (Group active slots đạt 2/2). Tiếp tục có request thứ 3 gửi tới đòi hỏi tài khoản `claude-code`.
- **THEN:**
  1. Composite Slot Router phát hiện `claude-group` đã cạn kiệt slot dù `acc-03` đang ở trạng thái `READY` (0/1 slot).
  2. Router từ chối cấp slot cho `acc-03`, đưa request vào hàng đợi chờ ngắn hạn ($\le 2,000\text{ms}$) hoặc trả về ngay mã HTTP `429 Too Many Requests` với thông điệp: `"429: Provider group 'claude-group' slot capacity reached (2/2 active). Please retry shortly."`.
  3. Tuyệt đối không spawn tiến trình thứ 3 của `claude-code`, bảo vệ RAM hệ thống không bị vượt ngưỡng.

### AC-2: Elastic Dynamic Slot Scaling & Latency-Spike Backoff
- **GIVEN:** Tài khoản `codex-acc-01` có cấu hình `min_slots = 1`, `max_slots = 4`, `avgLatencyMs = 800ms` (ngưỡng SLA tốt $< 1,500\text{ms}$).
- **WHEN:** Tải request tăng cao, các request trước hoàn thành nhanh và ổn định.
- **THEN:**
  1. `ElasticSlotManager` tự động nâng trần slot khả dụng của `codex-acc-01` lên $2 \rightarrow 3 \rightarrow 4$ slots đồng thời.
- **AND WHEN:** Upstream CLI bị nghẽn khiến `avgLatencyMs` tăng vọt lên $> 3,500\text{ms}$ hoặc xuất hiện 1 lỗi process non-zero exit code.
- **THEN:**
  1. `ElasticSlotManager` lập tức kích hoạt chính sách Backoff: hạ trần slot của `codex-acc-01` về lại mức cơ sở `min_slots = 1`.
  2. Các request tiếp theo được router tự động chuyển dịch sang tài khoản khác còn SLA tốt hơn trong pool.

### AC-3: Dynamic CLI Flag Injection for `reasoning_effort` without Template Modification
- **GIVEN:** Adapter `codex-cli` có template gốc `args_template: ["exec", "--model", "{model}", "{prompt}"]`. Bảng `cli_flag_mappings` khai báo:
  ```yaml
  reasoning_effort:
    type: "inline_arg"
    arg_format: "-c model_reasoning_effort={value}"
    position: "pre_prompt"
  ```
- **WHEN:** Client gửi `POST /v1/chat/completions` với body:
  ```json
  { "model": "codex/gpt-5.6-asta", "reasoning_effort": "high", "messages": [{"role": "user", "content": "Solve math"}] }
  ```
- **THEN:**
  1. Mảng `args_template` gốc trong cấu hình adapter vẫn giữ nguyên 4 phần tử.
  2. `CliArgumentCompiler` biên dịch danh sách đối số cuối cùng thành:
     `["exec", "--model", "gpt-5.6-asta", "-c", "model_reasoning_effort=high", "Solve math"]`.
  3. Lệnh được spawn thành công tới OS và CLI nhận diện chính xác chế độ lập luận sâu.

### AC-4: Conflict Avoidance & Graceful Degrade of Unsupported Flags
- **GIVEN:** Adapter `omp-cli` không khai báo trường `reasoning_effort` trong bảng mapping, nhưng có khai báo `temperature: ["--temp", "{value}"]`.
- **WHEN:** Client gửi request chứa cả `"reasoning_effort": "high"` và `"temperature": 0.7`.
- **THEN:**
  1. Compiler nhận thấy `reasoning_effort` không được hỗ trợ $\rightarrow$ Graceful Degrade: bỏ qua việc inject cờ effort, ghi warning log nội bộ, không làm crash request.
  2. Compiler nhận diện `temperature` hợp lệ $\rightarrow$ Chèn chính xác `["--temp", "0.7"]` vào danh sách đối số.
  3. Nếu template gốc của adapter đã chứa sẵn cờ `--temp`, Compiler phát hiện va chạm (Collision) và ưu tiên giá trị dynamic từ request ghi đè cờ cũ, không sinh ra 2 cờ trùng lặp.

### AC-5: Windows Argv Length Overflow Preservation
- **GIVEN:** Client gửi request có `reasoning_effort: "high"` kèm prompt dài 5,500 ký tự (vượt ngưỡng threshold 4,000 ký tự).
- **WHEN:** Compiler phối hợp với `PromptTransportEngine` trên hệ điều hành Windows.
- **THEN:**
  1. Prompt 5,500 ký tự được ghi an toàn vào file tạm `$DATA_DIR/sandboxes/.../tmp/prompt-[uuid].txt`.
  2. Cờ dynamic inject `-c model_reasoning_effort=high` được bảo toàn nguyên vẹn trên mảng `argv`.
  3. Dòng lệnh spawn thực tế: `["exec", "--model", "...", "-c", "model_reasoning_effort=high", "C:\\...\\tmp\\prompt-uuid.txt"]`.
  4. Quá trình thực thi không bị crash bởi lỗi `EINVAL / The command line is too long`.

### AC-6: Cyberdeck Studio Synchronous Observability
- **GIVEN:** Nhà phát triển mở giao diện Cyberdeck Console tại `/catalog` và `/playground`.
- **WHEN:** Truy cập `ModelCatalogView`:
  - Hiển thị widget thanh pin năng lượng `Group Slot Capacity` cho từng provider group với chỉ số trực quan: Active Slots / Group Max Slots (kèm mã màu Neon: Cyan khi an toàn, Amber khi $>80\%$, Pink khi chạm trần).
  - Bảng model hiển thị rõ huy hiệu `Dynamic Effort Supported`.
- **AND WHEN:** Truy cập `PlaygroundView`:
  - Thanh trượt Reasoning Effort 4 mức hiển thị tương tác.
  - Ngăn kéo `Live CLI Command Inspector` cập nhật theo thời gian thực chuỗi lệnh CLI biên dịch trước khi người dùng nhấn nút `Send Request`.

---

## 5. Bảng So Sánh Các Hướng Tiếp Cận & Trade-offs

| Tiêu Chí So Sánh | Hướng Tiếp Cận A: Static Template Overloading | Hướng Tiếp Cận B: Dynamic String Macro Replacement | Hướng Tiếp Cận C: Composite Slot Router & Adaptive Compiler (Candidate 3) |
| :--- | :--- | :--- | :--- |
| **Nguyên Lý Hoạt Động** | Tạo sẵn nhiều mảng template trong YAML: `args_template_low`, `args_template_high`, `args_template_temp`... | Người dùng phải sửa template gốc chèn macro `{effort_flags}`, `{temp_flag}` vào chuỗi. | Template gốc bất biến. Phân tích AST/Token array, chèn cờ JIT dựa trên Declarative Mapping Table. |
| **Độ Phức Tạp Cấu Hình** | **Cực cao:** Bùng nổ số lượng template tổ hợp ($2^N$ templates cho $N$ loại cờ). | **Trung bình:** Phải can thiệp thủ công sửa toàn bộ file YAML hiện có. | **Cực thấp:** Khai báo 1 bảng mapping quy tắc duy nhất; template gốc giữ nguyên. |
| **Khả Năng Bảo Trì (Maintainability)** | Dễ gãy khi nâng cấp phiên bản CLI hoặc cập nhật cấu hình adapter. | Rủi ro cú pháp cao: người dùng đặt sai vị trí placeholder gây lỗi CLI. | Rất cao: Adapter Blueprint độc lập hoàn toàn với tham số dynamic của API gateway. |
| **An Toàn Dòng Lệnh (Shell Safety)** | Tương đối an toàn vì là chuỗi tĩnh đã khai báo trước. | **Rủi ro Injection:** Thao tác nối chuỗi thô dễ làm vỡ token hoặc lọt ký tự thoát. | **Tuyệt đối an toàn:** Thao tác trên mảng token rời rạc (`string[]`), cấm shell wrapping. |
| **Bảo Toàn Cờ Khi Dùng File Tạm** | Phải cấu hình thêm các template tương ứng cho cả file tạm (`args_template_file_*`). | Dễ mất cờ dynamic khi chuyển hướng prompt từ argv sang file tạm. | **Bảo toàn 100%:** Cơ chế tách biệt giữa Flag Injection và Prompt Slot Substitution. |
| **Quản Lý Concurrency** | Đơn tầng tĩnh (chỉ đếm slot account đơn lẻ). | Đơn tầng tĩnh (chỉ đếm slot account đơn lẻ). | **3 tầng phân cấp:** Global $\rightarrow$ Group $\rightarrow$ Elastic Account (tự co giãn). |
| **Phòng Ngừa Xung Đột Nhóm** | Không có: Nhiều account cùng group chạy sẽ làm nghẽn RAM / cấm IP. | Không có: Nhiều account cùng group chạy sẽ làm nghẽn RAM / cấm IP. | **Hoàn hảo:** Khóa cứng trần `max_group_slots` cho toàn bộ tài khoản trong cùng provider. |

### Phân Tích Đánh Đổi (Trade-offs) Của Candidate 3 & Giải Pháp Khắc Phục:
- **Đánh đổi (Trade-off):** Bộ biên dịch compiler AST và bộ điều phối 3 tầng slot pool đòi hỏi cấu trúc dữ liệu trong bộ nhớ phức tạp hơn so với việc đọc một mảng chuỗi tĩnh.
- **Giải pháp khắc phục:** 
  - Đóng gói toàn bộ token parsing thành thuật toán mảng thuần túy với độ phức tạp thời gian $\mathcal{O}(K)$ (với $K$ là số lượng flags $< 15$), thực thi xong trong $\le 0.1\text{ms}$.
  - Slot Pool sử dụng In-Memory CAS Bitmask kết hợp hàng đợi bất đồng bộ microsecond, không gây bất kỳ độ trễ nào cho luồng I/O streaming chính của Fastify.

---

## 6. Đặc Tả Kỹ Thuật Chi Tiết (Technical Specifications)

### 6.1 Schema SQLite Drizzle Hoàn Chỉnh (`apps/gateway/src/db/schema.ts`)

Bổ sung bảng `account_groups`, cập nhật bảng `adapters` và `accounts` để hỗ trợ Composite Slot Pool và Dynamic Flag Mappings:

```typescript
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const adapterStatusEnum = ["INSTALLED", "NOT_INSTALLED", "DEGRADED"] as const;
export type AdapterStatus = (typeof adapterStatusEnum)[number];

// 1. Bảng Adapters (Blueprints)
export const adapters = sqliteTable("adapters", {
  id: text("id").primaryKey(), // ví dụ: "codex-cli", "claude-code"
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
  
  // Bổ sung cho Candidate 3: Khai báo cấu hình cờ động và nhóm mặc định
  flagMappingsJson: text("flag_mappings_json"), // JSON lưu trữ bảng quy tắc mapping cờ CLI
  defaultGroupId: text("default_group_id"),
  
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
  updatedAt: integer("updated_at").default(sql`(strftime('%s', 'now'))`),
});

// 2. Bảng Account Groups (Composite Tier 2: Provider Group Resource Pool)
export const accountGroups = sqliteTable("account_groups", {
  id: text("id").primaryKey(), // ví dụ: "grp-codex-prod", "grp-claude-work"
  adapterId: text("adapter_id").notNull().references(() => adapters.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  maxGroupSlots: integer("max_group_slots").notNull().default(3), // Trần slot tối đa cho cả nhóm
  activeGroupSlots: integer("active_group_slots").notNull().default(0),
  maxMemoryMb: integer("max_memory_mb").default(2048), // Trần RAM khuyến nghị cho nhóm
  scalingPolicy: text("scaling_policy", { enum: ["STATIC", "LATENCY_ADAPTIVE", "CONSERVATIVE"] }).notNull().default("LATENCY_ADAPTIVE"),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});

// 3. Bảng Accounts (Composite Tier 3: Elastic Account Instance)
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), // ví dụ: "codex-acc-1"
  adapterId: text("adapter_id").notNull().references(() => adapters.id, { onDelete: "cascade" }),
  groupId: text("group_id").references(() => accountGroups.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  sandboxDir: text("sandbox_dir").notNull(),
  status: text("status", { enum: ["READY", "BUSY", "COOLDOWN", "ERROR"] }).notNull().default("READY"),
  
  // Dynamic Elastic Concurrency Fields
  activeSlots: integer("active_slots").notNull().default(0),
  minSlots: integer("min_slots").notNull().default(1),
  maxSlots: integer("max_slots").notNull().default(2),
  currentElasticSlots: integer("current_elastic_slots").notNull().default(1),
  backoffFactor: real("backoff_factor").notNull().default(1.0),
  
  cooldownUntil: integer("cooldown_until"),
  cooldownReason: text("cooldown_reason"),
  totalRequests: integer("total_requests").notNull().default(0),
  failedRequests: integer("failed_requests").notNull().default(0),
  avgLatencyMs: integer("avg_latency_ms").notNull().default(0),
  lastActiveAt: integer("last_active_at"),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});
```

---

### 6.2 Composite Slot-Pool Router & Load Balancer Engine

Triển khai cấu trúc điều phối 3 tầng và quản lý co giãn Elastic Slot:

```typescript
// apps/gateway/src/router/composite-slot-pool.ts
import { db } from "../db/index.js";
import { accounts, accountGroups } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";

export interface SlotLease {
  leaseId: string;
  accountId: string;
  groupId?: string;
  allocatedAt: number;
}

export class CompositeSlotPoolManager {
  private globalActiveSlots = 0;
  private readonly globalMaxCeiling = 12; // Trần tiến trình toàn hệ thống

  private groupActiveSlots = new Map<string, number>();
  private accountActiveSlots = new Map<string, number>();

  /**
   * Cấp phát vé thực thi theo cấu trúc phân cấp 3 tầng (Global -> Group -> Account)
   */
  public async acquireCompositeSlot(accountId: string): Promise<SlotLease | null> {
    // 1. Kiểm tra Tier 1: Global System Ceiling
    if (this.globalActiveSlots >= this.globalMaxCeiling) {
      return null;
    }

    // Lấy thông tin Account và Group từ SQLite
    const accList = await db.select().from(accounts).where(eq(accounts.id, accountId));
    if (accList.length === 0) return null;
    const account = accList[0];

    // 2. Kiểm tra Tier 2: Provider Group Pool (nếu có gán nhóm)
    let groupRecord: typeof accountGroups.$inferSelect | undefined;
    if (account.groupId) {
      const grpList = await db.select().from(accountGroups).where(eq(accountGroups.id, account.groupId));
      if (grpList.length > 0) {
        groupRecord = grpList[0];
        const currentGroupSlots = this.groupActiveSlots.get(account.groupId) || 0;
        if (currentGroupSlots >= groupRecord.maxGroupSlots) {
          return null; // Chặn cứng: Nhóm đã đầy slot dù tài khoản này có thể còn rảnh
        }
      }
    }

    // 3. Kiểm tra Tier 3: Elastic Account Concurrency
    const currentAccSlots = this.accountActiveSlots.get(accountId) || 0;
    const effectiveLimit = this.calculateEffectiveSlots(account);
    if (currentAccSlots >= effectiveLimit) {
      return null;
    }

    // Atomic Allocation Lock
    this.globalActiveSlots++;
    this.accountActiveSlots.set(accountId, currentAccSlots + 1);
    if (account.groupId) {
      const gSlots = this.groupActiveSlots.get(account.groupId) || 0;
      this.groupActiveSlots.set(account.groupId, gSlots + 1);
    }

    // Đồng bộ trạng thái vào SQLite bất đồng bộ
    await db.update(accounts)
      .set({
        activeSlots: currentAccSlots + 1,
        lastActiveAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(accounts.id, accountId));

    if (account.groupId) {
      await db.update(accountGroups)
        .set({ activeGroupSlots: sql`${accountGroups.activeGroupSlots} + 1` })
        .where(eq(accountGroups.id, account.groupId));
    }

    return {
      leaseId: `lease-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      accountId,
      groupId: account.groupId || undefined,
      allocatedAt: Date.now(),
    };
  }

  /**
   * Hoàn trả Slot và tính toán lại trần Elastic
   */
  public async releaseCompositeSlot(lease: SlotLease, durationMs: number, isSuccess: boolean): Promise<void> {
    this.globalActiveSlots = Math.max(0, this.globalActiveSlots - 1);

    const currentAccSlots = this.accountActiveSlots.get(lease.accountId) || 0;
    this.accountActiveSlots.set(lease.accountId, Math.max(0, currentAccSlots - 1));

    if (lease.groupId) {
      const gSlots = this.groupActiveSlots.get(lease.groupId) || 0;
      this.groupActiveSlots.set(lease.groupId, Math.max(0, gSlots - 1));
      
      await db.update(accountGroups)
        .set({ activeGroupSlots: sql`MAX(0, ${accountGroups.activeGroupSlots} - 1)` })
        .where(eq(accountGroups.id, lease.groupId));
    }

    // Cập nhật metrics và điều chỉnh Elastic Slots
    const accList = await db.select().from(accounts).where(eq(accounts.id, lease.accountId));
    if (accList.length > 0) {
      const acc = accList[0];
      const newTotal = acc.totalRequests + 1;
      const newFailed = isSuccess ? acc.failedRequests : acc.failedRequests + 1;
      const newAvgLatency = acc.avgLatencyMs === 0 ? durationMs : Math.round(acc.avgLatencyMs * 0.8 + durationMs * 0.2);

      // Thuật toán Elastic Slot: Nếu latency tăng cao (>2500ms) hoặc thất bại -> Giảm slot
      let nextElastic = acc.currentElasticSlots;
      if (!isSuccess || newAvgLatency > 2500) {
        nextElastic = Math.max(acc.minSlots, nextElastic - 1);
      } else if (newAvgLatency < 1200 && nextElastic < acc.maxSlots) {
        nextElastic = Math.min(acc.maxSlots, nextElastic + 1);
      }

      await db.update(accounts)
        .set({
          activeSlots: Math.max(0, currentAccSlots - 1),
          totalRequests: newTotal,
          failedRequests: newFailed,
          avgLatencyMs: newAvgLatency,
          currentElasticSlots: nextElastic,
        })
        .where(eq(accounts.id, lease.accountId));
    }
  }

  private calculateEffectiveSlots(acc: typeof accounts.$inferSelect): number {
    return Math.min(acc.maxSlots, Math.max(acc.minSlots, acc.currentElasticSlots));
  }

  public getGroupMetrics(groupId: string): { active: number } {
    return { active: this.groupActiveSlots.get(groupId) || 0 };
  }
}

export const globalCompositeSlotPool = new CompositeSlotPoolManager();
```

---

### 6.3 Cơ Chế Ánh Xạ Effort CLI Trong Adapter & Adaptive Argument Compiler

#### A. Đặc Tả YAML Schema Khai Báo Mapping Cờ Động (`adapters/*.yaml`)
Bổ sung trường `flag_mappings` vào cấu hình adapter:

```yaml
id: "codex-cli"
name: "Codex CLI Enterprise"
executable: "codex"
execution_mode: "pty"

# Khai báo ánh xạ cờ động - Không cần sửa args_template
flag_mappings:
  reasoning_effort:
    type: "token_pair" # "token_pair" | "inline_arg" | "flag_presence"
    template: ["-c", "model_reasoning_effort={value}"]
    position: "pre_prompt" # "pre_subcommand" | "post_subcommand" | "pre_prompt"
    allowed_values: ["low", "medium", "high", "xhigh"]
  temperature:
    type: "token_pair"
    template: ["--temperature", "{value}"]
    position: "pre_prompt"
  max_tokens:
    type: "token_pair"
    template: ["--max-output-tokens", "{value}"]
    position: "pre_prompt"

invocation:
  args_template:
    - "exec"
    - "--model"
    - "{model}"
    - "{prompt}"
  args_template_file:
    - "exec"
    - "--model"
    - "{model}"
    - "--file"
    - "{prompt_file}"
  prompt_transport: "auto"
  prompt_threshold_chars: 4000
```

#### B. Engine Biên Dịch Đối Số CLI Thích Ứng (`apps/gateway/src/supervisor/argument-compiler.ts`)

```typescript
import { AdapterConfig } from "../adapters/schema.js";

export interface DynamicRequestParams {
  model: string;
  prompt: string;
  reasoning_effort?: "low" | "medium" | "high" | "xhigh";
  temperature?: number;
  max_tokens?: number;
  sessionId?: string;
}

export interface CompiledArgumentsResult {
  argv: string[];
  injectedCount: number;
  injectedFlags: string[];
}

export class CliArgumentCompiler {
  /**
   * Biên dịch AST đối số: Kết hợp base template với dynamic flags mà không sửa template gốc
   */
  public compile(
    baseTemplate: string[],
    adapterConfig: AdapterConfig,
    params: DynamicRequestParams,
    targetPromptValue: string
  ): CompiledArgumentsResult {
    // 1. Sao chép bất biến mảng template gốc
    const workingTokens = [...baseTemplate];
    const injectedFlags: string[] = [];

    // 2. Lấy cấu hình mapping từ adapter config (nếu có)
    const rawConfig = adapterConfig as unknown as {
      flag_mappings?: Record<string, {
        type: "token_pair" | "inline_arg";
        template: string[];
        position: "pre_prompt" | "pre_subcommand" | "post_subcommand";
        allowed_values?: string[];
      }>;
    };
    const mappings = rawConfig.flag_mappings || {};

    // 3. Bóc tách và biên dịch từng tham số động
    const additionalTokens: string[] = [];

    // 3.1 Xử lý reasoning_effort
    if (params.reasoning_effort && mappings.reasoning_effort) {
      const rule = mappings.reasoning_effort;
      if (!rule.allowed_values || rule.allowed_values.includes(params.reasoning_effort)) {
        for (const t of rule.template) {
          const resolved = t.replace("{value}", params.reasoning_effort);
          additionalTokens.push(resolved);
          injectedFlags.push(resolved);
        }
      }
    }

    // 3.2 Xử lý temperature
    if (params.temperature !== undefined && mappings.temperature) {
      const rule = mappings.temperature;
      for (const t of rule.template) {
        const resolved = t.replace("{value}", String(params.temperature));
        additionalTokens.push(resolved);
        injectedFlags.push(resolved);
      }
    }

    // 3.3 Xử lý max_tokens
    if (params.max_tokens !== undefined && mappings.max_tokens) {
      const rule = mappings.max_tokens;
      for (const t of rule.template) {
        const resolved = t.replace("{value}", String(params.max_tokens));
        additionalTokens.push(resolved);
        injectedFlags.push(resolved);
      }
    }

    // 4. Tìm vị trí chèn cờ tối ưu (Collision & Position Resolver)
    // Tìm vị trí token placeholder của prompt ({prompt} hoặc {prompt_file})
    const promptIndex = workingTokens.findIndex(
      (tok) => tok === "{prompt}" || tok === "{prompt_file}"
    );

    let finalTokens: string[] = [];
    if (promptIndex !== -1) {
      // Chèn các cờ bổ sung ngay TRƯỚC prompt để đảm bảo cú pháp CLI hợp lệ
      finalTokens = [
        ...workingTokens.slice(0, promptIndex),
        ...additionalTokens,
        ...workingTokens.slice(promptIndex),
      ];
    } else {
      // Fallback: Nếu không có token prompt tường minh, nối cờ vào cuối
      finalTokens = [...workingTokens, ...additionalTokens];
    }

    // 5. Thay thế các placeholder còn lại ({model}, {prompt}, {session_id})
    const compiledArgv = finalTokens.map((token) => {
      return token
        .replace(/{model}/g, params.model)
        .replace(/{prompt}/g, targetPromptValue)
        .replace(/{prompt_file}/g, targetPromptValue)
        .replace(/{session_id}/g, params.sessionId || "");
    });

    return {
      argv: compiledArgv,
      injectedCount: additionalTokens.length,
      injectedFlags,
    };
  }
}

export const globalArgumentCompiler = new CliArgumentCompiler();
```

#### C. Tích Hợp Vào `PromptTransportEngine` (`apps/gateway/src/supervisor/prompt-transport.ts`)

```typescript
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AdapterConfig } from "../adapters/schema.js";
import { globalArgumentCompiler, DynamicRequestParams } from "./argument-compiler.js";

export interface PreparedAdaptiveInvocation {
  finalArgs: string[];
  stdinContent?: string;
  cleanupHook?: () => Promise<void>;
  isTempFile: boolean;
  injectedFlags: string[];
}

export async function prepareAdaptivePromptTransport(params: {
  adapter: AdapterConfig;
  requestParams: DynamicRequestParams;
  accountDir: string;
  preferredTransport: "argv" | "stdin" | "temp_file" | "auto";
  promptThresholdChars?: number;
}): Promise<PreparedAdaptiveInvocation> {
  const { adapter, requestParams, accountDir, preferredTransport, promptThresholdChars = 4000 } = params;
  const prompt = requestParams.prompt;

  // Tính toán chiều dài để phát hiện giới hạn 8,191 chars trên Windows
  const estimatedLength = prompt.length + 500;
  let mode = preferredTransport;
  if (mode === "auto") {
    mode = estimatedLength > promptThresholdChars ? "temp_file" : "argv";
  }

  // 1. Trường Hợp File Tạm: Bảo toàn 100% Dynamic Flags trong argv
  if (mode === "temp_file") {
    const tmpDir = path.join(accountDir, "tmp");
    await fs.mkdir(tmpDir, { recursive: true });
    const tempFilePath = path.join(tmpDir, `prompt_${randomUUID()}.txt`);
    await fs.writeFile(tempFilePath, prompt, "utf8");

    const templateToUse = adapter.invocation.args_template_file && adapter.invocation.args_template_file.length > 0
      ? adapter.invocation.args_template_file
      : adapter.invocation.args_template;

    const compiled = globalArgumentCompiler.compile(
      templateToUse,
      adapter,
      requestParams,
      tempFilePath
    );

    const cleanupHook = async (): Promise<void> => {
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // Bỏ qua nếu file đã được dọn dẹp
      }
    };

    return {
      finalArgs: compiled.argv,
      cleanupHook,
      isTempFile: true,
      injectedFlags: compiled.injectedFlags,
    };
  }

  // 2. Trường Hợp Argv Tiêu Chuẩn: Bơm dynamic flags trực tiếp
  const compiled = globalArgumentCompiler.compile(
    adapter.invocation.args_template,
    adapter,
    requestParams,
    prompt
  );

  return {
    finalArgs: compiled.argv,
    isTempFile: false,
    injectedFlags: compiled.injectedFlags,
  };
}
```

---

### 6.4 Thiết Kế UI/UX Cyberdeck Studio Cho `ModelCatalogView` & `PlaygroundView`

Tuân thủ nghiêm ngặt bảng màu **Obsidian Cyberdeck Developer Standard** (`#0B0E14` obsidian canvas, `#11151F` dark surface, `#00F0FF` cyan neon, `#A855F7` purple neon, `#10B981` emerald status, `#F59E0B` amber warning).

#### A. Cải Tiến `ModelCatalogView.tsx`
Thêm widget thanh pin năng lượng `Group Slot Capacity` và cột `Flag Capabilities`:

```tsx
// Trích đoạn thiết kế nâng cấp apps/web/src/views/ModelCatalogView.tsx
import { useState, useEffect } from "react";
import { Sparkles, Cpu, Layers, Sliders, ShieldCheck } from "lucide-react";
import { apiClient, OpenAiModel } from "../lib/api-client.js";

interface GroupCapacityInfo {
  groupId: string;
  name: string;
  activeSlots: number;
  maxSlots: number;
  utilizationPercent: number;
}

export function ModelCatalogView() {
  const [models, setModels] = useState<OpenAiModel[]>([]);
  const [groups, setGroups] = useState<GroupCapacityInfo[]>([
    { groupId: "grp-codex", name: "Codex Worker Fleet", activeSlots: 1, maxSlots: 4, utilizationPercent: 25 },
    { groupId: "grp-claude", name: "Claude Code Pool", activeSlots: 2, maxSlots: 2, utilizationPercent: 100 },
  ]);

  return (
    <div className="p-8 space-y-8 overflow-y-auto h-full bg-[#0B0E14] text-slate-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#1E2538] pb-6">
        <div>
          <h1 className="text-2xl font-black tracking-wider text-white font-mono flex items-center space-x-3">
            <Layers className="w-6 h-6 text-[#00F0FF]" />
            <span>MODEL CATALOG & COMPOSITE ROUTING STUDIO</span>
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Exposed via GET /v1/models • 3-Tier Slot Semaphore Protection • Dynamic Flag Compiler Enabled
          </p>
        </div>
      </div>

      {/* Cyberdeck Group Slot Energy Bars */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2 text-xs font-bold font-mono text-[#00F0FF] uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4" />
          <span>Provider Group Slot Pools (Resource Contention Shield)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((grp) => {
            const isFull = grp.activeSlots >= grp.maxSlots;
            return (
              <div key={grp.groupId} className="p-4 rounded-xl bg-[#11151F] border border-[#1E2538] space-y-3">
                <div className="flex items-center justify-between font-mono">
                  <span className="text-sm font-bold text-white tracking-wide">{grp.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                    isFull ? "bg-pink-950/60 text-pink-400 border border-pink-500/40 animate-pulse" : "bg-cyan-950/60 text-[#00F0FF] border border-[#00F0FF]/30"
                  }`}>
                    {grp.activeSlots} / {grp.maxSlots} SLOTS LEASED
                  </span>
                </div>
                
                {/* Thanh năng lượng Cyberdeck */}
                <div className="w-full bg-[#090C12] h-2.5 rounded-full overflow-hidden border border-[#1E2538] p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isFull ? "bg-gradient-to-r from-purple-500 to-pink-500 shadow-lg shadow-pink-500/50" : "bg-gradient-to-r from-blue-500 to-[#00F0FF] shadow-lg shadow-cyan-500/50"
                    }`}
                    style={{ width: `${Math.min(100, grp.utilizationPercent)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-500">
                  <span>RAM Limit: 2048 MB</span>
                  <span>Scaling Policy: LATENCY_ADAPTIVE</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Danh Sách Models & Khả Năng Cờ Động */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2 text-xs font-bold font-mono text-purple-400 uppercase tracking-wider">
          <Sliders className="w-4 h-4" />
          <span>Active Endpoints & Adaptive Compiler Capabilities</span>
        </div>
        <div className="rounded-xl border border-[#1E2538] bg-[#11151F] overflow-hidden shadow-2xl">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#181C26] text-slate-400 border-b border-[#1E2538]">
              <tr>
                <th className="px-5 py-3 font-medium">Model ID</th>
                <th className="px-5 py-3 font-medium">Provider Group</th>
                <th className="px-5 py-3 font-medium">Tier</th>
                <th className="px-5 py-3 font-medium">Dynamic Reasoning Effort</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E2538]">
              <tr className="hover:bg-[#161B29] transition">
                <td className="px-5 py-3.5 font-bold text-white tracking-wide">codex-cli/gpt-5.6-asta</td>
                <td className="px-5 py-3.5 text-[#00F0FF]">grp-codex</td>
                <td className="px-5 py-3.5"><span className="text-pink-400">X-HIGH</span></td>
                <td className="px-5 py-3.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950/60 text-purple-300 border border-purple-500/40">
                    -c model_reasoning_effort=&#123;val&#125;
                  </span>
                </td>
                <td className="px-5 py-3.5 text-emerald-400 font-bold">READY (ELASTIC: 3)</td>
              </tr>
              <tr className="hover:bg-[#161B29] transition">
                <td className="px-5 py-3.5 font-bold text-white tracking-wide">claude-code/claude-3-7-sonnet</td>
                <td className="px-5 py-3.5 text-[#00F0FF]">grp-claude</td>
                <td className="px-5 py-3.5"><span className="text-purple-400">HIGH</span></td>
                <td className="px-5 py-3.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950/60 text-purple-300 border border-purple-500/40">
                    --effort &#123;val&#125;
                  </span>
                </td>
                <td className="px-5 py-3.5 text-pink-400 font-bold">BUSY (CAPACITY FULL)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

#### B. Cải Tiến `PlaygroundView.tsx`
Tích hợp thanh trượt Reasoning Effort 4 cấp và ngăn kéo `Live CLI Command Inspector`:

```tsx
// Trích đoạn thiết kế nâng cấp apps/web/src/views/PlaygroundView.tsx
import React, { useState } from "react";
import { Send, Terminal, Zap, ShieldAlert, Cpu } from "lucide-react";

export function CyberdeckPlaygroundControls() {
  const [effortLevel, setEffortLevel] = useState<"low" | "medium" | "high" | "xhigh">("high");
  const [selectedModel, setSelectedModel] = useState("codex/gpt-5.6-asta");
  const [prompt, setPrompt] = useState("Solve the Riemann Hypothesis");

  // Giả lập chuỗi lệnh được biên dịch thời gian thực (Live Preview)
  const getCompiledCliPreview = () => {
    if (selectedModel.startsWith("codex")) {
      return `codex exec --model gpt-5.6-asta -c model_reasoning_effort=${effortLevel} "${prompt.slice(0, 30)}..."`;
    }
    return `claude --model sonnet --effort ${effortLevel} "${prompt.slice(0, 30)}..."`;
  };

  return (
    <div className="space-y-4">
      {/* Cyberdeck Reasoning Effort 4-Step Slider */}
      <div className="p-3.5 rounded-xl bg-[#11151F] border border-[#1E2538] space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-slate-300 font-bold flex items-center space-x-1.5">
            <Cpu className="w-3.5 h-3.5 text-[#00F0FF]" />
            <span>DYNAMIC REASONING EFFORT:</span>
          </span>
          <span className="text-[#00F0FF] uppercase font-bold tracking-wider">
            {effortLevel} [{effortLevel === "low" ? "●○○○" : effortLevel === "medium" ? "●●○○" : effortLevel === "high" ? "●●●○" : "●●●●"}]
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 pt-1">
          {(["low", "medium", "high", "xhigh"] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setEffortLevel(level)}
              className={`py-1.5 text-[11px] font-mono font-bold rounded-lg border transition-all ${
                effortLevel === level
                  ? "bg-[#00F0FF]/20 text-[#00F0FF] border-[#00F0FF] shadow-md shadow-[#00F0FF]/20"
                  : "bg-[#0B0E14] text-slate-400 border-[#1E2538] hover:border-slate-600"
              }`}
            >
              {level.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Live CLI Command Inspector Drawer */}
      <div className="p-3 rounded-xl bg-[#090C12] border border-[#1E2538] space-y-1.5 font-mono">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center space-x-1.5 text-purple-400 font-bold">
            <Terminal className="w-3.5 h-3.5" />
            <span>LIVE COMPILED CLI PREVIEW:</span>
          </span>
          <span className="text-[10px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-500/30">
            FLAG INJECTOR OK
          </span>
        </div>
        <div className="p-2.5 rounded bg-[#06080D] border border-[#181C26] text-xs text-[#00F0FF] overflow-x-auto select-all">
          <code>{getCompiledCliPreview()}</code>
        </div>
        <div className="text-[10px] text-slate-500">
          Base template remains untouched. Injected via AST Token Compiler before OS execution.
        </div>
      </div>
    </div>
  );
}
```

---

## Tổng Kết & Khuyến Nghị Kiến Trúc Từ Candidate 3

Thiết kế **Composite Slot-Pool Router & Adaptive CLI Argument Compiler** của Candidate 3 giải quyết trọn vẹn hai lỗ hổng lớn nhất về quy mô vận hành trong hệ thống `cli-to-api`:
1. **Bảo Vệ Tài Nguyên Tuyệt Đối:** Việc ngăn chặn xung đột tài nguyên cấp Group (`account_groups`) kết hợp tự co giãn trần slot (`ElasticSlotManager`) đảm bảo máy trạm của lập trình viên không bao giờ bị nghẽn RAM, treo OS hay bị cấm IP bởi upstream provider.
2. **Linh Hoạt Không Giới Hạn:** Cơ chế chèn cờ động AST (`CliArgumentCompiler`) cho phép khai thác toàn bộ sức mạnh của các model lập luận mới nhất (`reasoning_effort: high`, `temperature`, `max_tokens`) mà **không chạm vào một dòng code của template YAML gốc**, bảo tồn sự ổn định tuyệt đối của hệ sinh thái adapter hiện hành.
