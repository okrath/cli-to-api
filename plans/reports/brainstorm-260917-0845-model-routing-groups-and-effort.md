---
type: architectural-brainstorm
date: 2026-09-17
mode: ak-brainstorm --ultra
lead_verifier: Kongming
winning_candidate: Candidate D (Candidate 4 - Flow-Chain Dynamic Target Pipeline & Context-Aware Effort Resolver)
status: accepted
target: cli-to-api
tags: [routing-groups, dynamic-pipeline, failover, reasoning-effort, thinking-budget, sqlite-wal, cyberdeck-studio]
---

# Báo Cáo Kiến Trúc & Hợp Đồng Bounded: Nhóm Định Tuyến Do Người Dùng Xác Định (User-Defined Routing Groups / Dynamic Target Pipeline), Điều Khiển Ngân Sách Suy Luận Ba Tầng (3-Tier Reasoning Effort Resolver) & Obsidian Cyberdeck Routing Studio

## Tóm Tắt Điều Hành (Executive Summary)

Trong các phiên bản ban đầu của `cli-to-api`, cơ chế ánh xạ mô hình và điều phối yêu cầu được xây dựng dựa trên hai giả định đơn giản:
1. **Phân tầng ảo tĩnh (Static Auto Tiers):** Hệ thống hardcode 5 virtual tiers (`auto`, `auto-low`, `auto-medium`, `auto-high`, `auto-xhigh`) trong `model-catalog.ts`, tự động gom toàn bộ các model/account thuộc tier đó và phân bổ tải theo thuật toán Least-Connections. Người dùng không có quyền kiểm soát: không thể tạo nhóm theo nghiệp vụ riêng, không thể chỉ định tài khoản nào được tham gia nhóm, không thể chọn kết hợp giữa tài khoản VIP và tài khoản phụ, và không thể thiết lập chuỗi dự phòng ưu tiên (Fallback Chain) khi có lỗi.
2. **Định tuyến đơn đích dễ gãy vụn (Brittle Single-Target Routing & Spawn-Crash Vulnerability):** Khi client gửi yêu cầu, hàm `resolveTarget()` chỉ chọn ra duy nhất 1 mục tiêu (`ResolvedTarget`). Nếu tài khoản đó bận hoặc dính Rate Limit (HTTP 429), gateway lập tức ném lỗi 429/404 về client. Nguy hiểm hơn, các CLI con (như `claude-code`, `codex-cli`) thường gặp lỗi 429/hết quota **ngay tại thời điểm spawn tiến trình** (trong vòng 50ms – 150ms đầu tiên trước khi kịp phát token). Khi đó, gateway báo lỗi làm vỡ phiên làm việc của Cursor/Continue/WebUI, dù hệ thống vẫn còn nhiều tài khoản dự phòng khác.
3. **Mù lòa tham số suy luận chuyên sâu (Reasoning Effort & Thinking Budget Blindness):** Các Frontier AI Model hiện đại (OpenAI o1/o3/GPT-5.6, Claude 3.7 Sonnet Extended Thinking, Gemini Flash Thinking, DeepSeek-R1) đòi hỏi điều khiển độ sâu tư duy:
   - OpenAI SDK chuẩn hóa trường `reasoning_effort: "low" | "medium" | "high"`.
   - Claude Code CLI đòi hỏi cờ `--thinking-budget <tokens>` (hoặc biến môi trường).
   - Codex CLI sử dụng `--reasoning-effort <low|medium|high>` hoặc cờ tương đương.
   - Hiện tại, `prompt-transport.ts` và `openai-chat.ts` bỏ qua hoàn toàn tham số này; người dùng không thể chọn effort trên Playground, không thể cấu hình effort mặc định cho từng Group/Model trong Routing Studio, và gateway không thể chuyển dịch tham số OpenAI sang cờ CLI tương ứng.

Hợp đồng kỹ thuật này thiết lập giải pháp chiến thắng từ quy trình thẩm định **`ak-brainstorm --ultra` (Best-of-5 Verifier)** do Lead Verifier **Kongming** phê duyệt: **Kiến trúc Đường Ống Mục Tiêu Động Chuỗi (Flow-Chain Dynamic Target Pipeline)**, tích hợp bộ thực thi tự động chuyển vùng tại thời điểm spawn (`DynamicTargetPipelineExecutor`), bộ giải quyết ngân sách suy luận kế thừa 3 cấp (`3-Tier Context-Aware Effort Resolver`), và nâng cấp toàn diện **Obsidian Cyberdeck Routing Studio & Playground**.

---

## 1. Outcome (Kết Quả Mục Tiêu & Sơ Đồ Hệ Thống)

### 1.1 Trạng Thái Vận Hành Đích
- **Xóa bỏ hoàn toàn định tuyến Auto cứng nhắc:** Người dùng làm chủ 100% việc tạo và quản trị các **Routing Groups** (hoặc Routing Pipelines) qua giao diện Web Studio hoặc API quản trị (`POST /v1/admin/routing-groups`).
- **Linh hoạt đa cấp mục tiêu (Granular Targeting):** Trong mỗi Group, người dùng tự do thêm các Target theo 3 hình thức:
  1. *Target theo Tài khoản cụ thể:* Chỉ định chính xác `account_id` (ví dụ `codex-vip-1`, `claude-pro-team`).
  2. *Target theo CLI/Adapter:* Chọn toàn bộ một adapter (ví dụ `claude-code`), hệ thống tự động xoay vòng qua các tài khoản khả dụng của adapter đó.
  3. *Target theo Model cụ thể trong CLI:* Chọn model cụ thể của CLI (ví dụ `codex-cli/gpt-5.6-sol`, `claude-code/sonnet`).
- **Chuỗi dự phòng đa tầng (Priority Fallback Chain & SWRR):** Mỗi target trong Group được gán một tầng ưu tiên (`priority_tier`: P0, P1, P2...). Nếu tất cả các node ở P0 dính Cooldown, hết slot hoặc gặp lỗi 429 khi spawn, hệ thống tự động trượt mượt mà sang P1 trong thời gian $\le 2\text{ms}$. Trong cùng một tầng, lưu lượng được phân bổ theo thuật toán Smooth Weighted Round-Robin (SWRR) kết hợp Least-Connections.
- **Điều khiển Reasoning Effort toàn diện ở cả 2 vị trí:**
  1. *Tại Model Catalog & Routing Studio:* Cho phép thiết lập `default_effort` cho toàn bộ Group (ví dụ Group "Quick Code" có default effort = `low`, Group "Deep Math" có default effort = `high`), và `effort_override` cho từng Target Link cụ thể.
  2. *Tại Playground & Client Ingress:* Giao diện Playground bổ sung bộ chọn 3 nấc `Reasoning Effort` (`low`, `medium`, `high`) trực quan; API `POST /v1/chat/completions` tiếp nhận trường chuẩn `reasoning_effort` của OpenAI và tự động biên dịch sang cờ CLI tương ứng.
- **Tự động chuyển vùng trong suốt tại thời điểm spawn (Spawn-Probe Failover):** Nếu tiến trình con của Target 1 crash hoặc trả về 429 trong vòng $150\text{ms}$ trước khi truyền byte dữ liệu đầu tiên, gateway lập tức thu hồi slot, đặt target 1 vào cooldown và tự động thử Target tiếp theo trong chuỗi, bảo vệ client không bao giờ bị đứt gãy phiên kết nối.

### 1.2 Sơ Đồ Kiến Trúc Luồng Dữ Liệu Tổng Thể

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         INGRESS CLIENT PLANE                                           │
│  Cursor, Continue.dev, Open WebUI, LibreChat, Vanilla OpenAI SDK (POST /v1/chat/completions)           │
│  Payload: { model: "group:deep-code" | "group/fast", reasoning_effort: "high", messages: [...] }       │
└───────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                          TAGGED UNION CLASSIFIER & DECLARATIVE REWRITE ENGINE                          │
│                                                                                                        │
│  • TargetClassifier: Nhận diện loại mục tiêu (ACCOUNT | CLI | MODEL | TIER | PIPELINE/GROUP)           │
│  • CapabilityGuard: Thẩm định xem model đích có hỗ trợ reasoning hay không -> Trả sớm 400 nếu sai cờ   │
│  • Cycle Detection (DFS): Ngăn ngừa 100% vòng lặp định tuyến khi lồng các group                        │
└───────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                         FLOW-CHAIN ROUTER & 3-TIER CONTEXT-AWARE EFFORT RESOLVER                       │
│                                                                                                        │
│  1. Xây dựng Chuỗi Thực Thi (Execution Chain):                                                         │
│     Priority 1 (P0): [ Target A: claude-code (Weight: 70) | Target B: codex-cli (Weight: 30) ]         │
│     Priority 2 (P1): [ Target C: omp-cli/reasoning (Fallback Backup Pool) ]                           │
│  2. Phân giải Ngân Sách Tư Duy (Effort Resolution Hierarchy):                                          │
│     Effective Effort = Request Ingress Effort ?? Target Link Effort Override ?? Group Default Effort   │
│  3. SWRR Dispatcher: Chọn node tối ưu trong Priority cao nhất có tài khoản READY                       │
└───────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                      DYNAMIC TARGET PIPELINE EXECUTOR (RUNTIME RESILIENCE ENGINE)                       │
│                                                                                                        │
│  [ Kiểm tra Host Global System Slot Ceiling (Chặn bão RAM máy chủ <= 12 tiến trình) ]                 │
│                                                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ Vòng lặp thực thi có kiểm soát (Max Failovers = 3):                                              │  │
│  │ 1. Chiếm Slot Semaphore của Target được chọn.                                                    │  │
│  │ 2. Compile cờ dòng lệnh CLI:                                                                     │  │
│  │    • Claude Code -> inject ["--thinking-budget", "16000"]                                        │  │
│  │    • Codex CLI   -> inject ["--reasoning-effort", "high"]                                        │  │
│  │    • Windows Argv Guard: Prompt > 4000 ký tự -> Tự động chuyển qua temp_file an toàn             │  │
│  │ 3. Spawn-Probe Phase (Cửa sổ thẩm định 150ms):                                                  │  │
│  │    ├── THẤT BẠI (Exit code != 0 hoặc Stdout chứa pattern Rate Limit trong 150ms):               │  │
│  │    │   -> Hủy tiến trình trong <= 200ms                                                          │  │
│  │    │   -> Đặt tài khoản vào Cooldown Tracker                                                     │  │
│  │    │   -> Ghi nhận sự kiện vào SQLite bảng `failover_events`                                     │  │
│  │    │   -> Bắn Event `pipeline:failover` qua Admin Event Bus                                      │  │
│  │    │   -> Tự động quay lại đầu vòng lặp và thử Target tiếp theo trong chuỗi!                     │  │
│  │    └── THÀNH CÔNG (Tiến trình sống, stream dữ liệu an toàn hoặc vượt ngưỡng 150ms):              │  │
│  │        -> Thiết lập Cutoff Point (Khóa kết nối với Target này)                                   │  │
│  │        -> Đẩy luồng dữ liệu vào DualStageAnsiSanitizer & ThinkingDemuxer                          │  │
│  └──────────────────────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                    │
                         ┌──────────────────────────┴──────────────────────────┐
                         ▼                                                     ▼
        ┌──────────────────────────────────┐                 ┌───────────────────────────────────┐
        │      UPSTREAM OPENAI CLIENT      │                 │      OBSIDIAN CYBERDECK STUDIO    │
        │   (Cursor / Continue / OpenWebUI)│                 │   • ModelCatalogView: Group Mgr,  │
        │   Nhận stream SSE mượt mà,       │                 │     Target Builder, Visual Graph  │
        │   không bị đứt gãy giữa chừng.   │                 │   • PlaygroundView: Effort Deck,  │
        │                                  │                 │     Live Breadcrumb Trail Trace   │
        └──────────────────────────────────┘                 └───────────────────────────────────┘
```

---

## 2. Constraints (Ràng Buộc Kỹ Thuật Bắt Buộc)

1. **Tuân Thủ Chuẩn Mở OpenAI Wire Protocol 100%:**
   - Trường `reasoning_effort` nhận các giá trị chuẩn: `"none" | "low" | "medium" | "high" | "xhigh"` trong cả request body và header `x-reasoning-effort`.
   - Danh sách model trả về từ `GET /v1/models` phải bao gồm cả các Group do người dùng tạo (dưới dạng virtual models, ví dụ `id: "group:deep-code"` hoặc alias ngắn `id: "deep-code"`).
2. **Cam Kết Không Gây Trễ Phân Giải Định Tuyến (Routing Decision Latency $\le 2\text{ms}$):**
   - Quá trình phân tích Tagged Union, tính toán SWRR và duyệt chuỗi Fallback Chain trong SQLite WAL / bộ nhớ RAM phải hoàn tất trong vòng $\le 2\text{ms}$.
3. **Cửa Sổ Bẫy Lỗi Spawn-Probe $\le 150\text{ms}$ & Ngưỡng Khóa Cắt Luồng (Cutoff Point):**
   - Cơ chế tự động chuyển vùng (Automatic Failover) chỉ được phép kích hoạt **trước khi byte dữ liệu đầu tiên được gửi về client** (Pre-stream window $\le 150\text{ms}$).
   - Ngay khi byte dữ liệu đầu tiên (hoặc SSE header 200 OK) đã xả ra mạng, hệ thống thiết lập Cutoff Point: tuyệt đối không được retry sang target khác để ngăn ngừa trùng lặp dữ liệu và vỡ giao thức HTTP stream.
4. **Bảo Toàn Giới Hạn Dòng Lệnh OS (OS Argv Limit Protection):**
   - Trên hệ điều hành Windows, tổng độ dài dòng lệnh bị giới hạn ở mức 8,191 ký tự (`CreateProcessW`). Khi prompt vượt quá 4,000 ký tự, hệ thống phải tự động chuyển qua `temp_file` an toàn mà vẫn bảo toàn 100% các cờ reasoning effort đã được inject.
5. **Trần Tiến Trình Toàn Hệ Thống (Global System Process Ceiling $\le 12$):**
   - Nhằm ngăn chặn bão tiến trình (RAM spike) làm treo máy trạm host, tổng số tiến trình CLI hoạt động song song trên toàn hệ thống không được vượt quá trần cấu hình (`max_global_slots`, mặc định 12 slots).
6. **Thu Hồi Tiến Trình Treo Trong $\le 200\text{ms}$:**
   - Khi client ngắt kết nối HTTP hoặc khi target gặp sự cố cần failover, tiến trình con phải được triệt tiêu hoàn toàn trong vòng $\le 200\text{ms}$ thông qua Win32 Job Object hoặc POSIX Process Group.

---

## 3. Non-goals (Các Phạm Vi Loại Trừ)

1. **Không Tự Động Đoán Ngữ Nghĩa Prompt Để Ép Effort:** Gateway không tự ý phân tích ngữ nghĩa câu hỏi của người dùng để nâng hoặc hạ mức effort. Gateway chỉ tuân thủ nghiêm ngặt thứ bậc kế thừa cấu hình: `Request Ingress Override > Target Link Override > Group Default`.
2. **Không Can Thiệp Sửa Đổi Template YAML Gốc:** Quá trình chèn cờ CLI (`--thinking-budget`, `--reasoning-effort`) được thực hiện động qua bộ biên dịch đối số dòng lệnh (`ArgumentCompiler`) tại runtime; không ghi đè hay làm đột biến (mutate) file cấu hình YAML của adapter.
3. **Không Hỗ Trợ Phục Hồi Giữa Luồng (Mid-Stream Recovery):** Nếu tiến trình con bị đứt gãy sau khi đã truyền một phần dữ liệu câu trả lời (sau khi TTFT đã phát sinh), gateway sẽ đóng stream với lỗi chứ không tự động phát lại toàn bộ prompt trên target khác, vì điều này làm hỏng ngữ cảnh và sinh lỗi cú pháp cho các AI coding agent.
4. **Không Đồng Bộ Hóa Đa Cụm Phân Tán (Distributed Multi-Node):** Mọi trạng thái Group, Target và Metrics được lưu trữ trong SQLite cục bộ ở chế độ WAL mode, không xây dựng hạ tầng cụm phân tán phức tạp.

---

## 4. Acceptance Criteria (Tiêu Chí Nghiệm Thu Sắc Bén)

### AC-1: Tạo & Quản Trị Routing Group Phân Cấp Đa Mục Tiêu
- **Given:** Quản trị viên truy cập Web Console `/models` hoặc gửi `POST /v1/admin/routing-groups`.
- **When:** Quản trị viên tạo một Group mới tên `"coding-pipeline"` với:
  - Default Effort: `"high"`.
  - Target 1 (P0): Chỉ định đích danh tài khoản `codex-vip-1`, weight 70.
  - Target 2 (P0): Chỉ định adapter `claude-code`, weight 30, effort override `"medium"`.
  - Target 3 (P1): Chỉ định model `omp-cli/omp-reasoning`, weight 100.
- **Then:**
  1. Bảng `routing_pipelines` và `pipeline_targets` tạo mới các bản ghi liên kết chính xác trong SQLite.
  2. Endpoint `GET /v1/models` trả về model ảo mang ID `"group:coding-pipeline"` và alias `"coding-pipeline"`.
  3. Metadata của model thể hiện rõ số lượng target active và default effort level.

### AC-2: Phân Giải Kế Thừa Reasoning Effort 3 Cấp Độ Chuẩn Xác
- **Given:** Routing Group `"coding-pipeline"` có default effort là `"high"`, Target 2 có effort override là `"medium"`.
- **When:** 
  - Trường hợp A: Client gửi request không truyền `reasoning_effort` vào Target 1 -> Gateway chọn mức `"high"` (kế thừa từ Group).
  - Trường hợp B: Client gửi request không truyền `reasoning_effort` vào Target 2 -> Gateway chọn mức `"medium"` (kế thừa từ Target Link).
  - Trường hợp C: Client gửi request chỉ định rõ `"reasoning_effort": "low"` vào bất kỳ target nào -> Gateway chọn mức `"low"` (Ingress Override toàn quyền).
- **Then:**
  1. Mức effort giải quyết được ghi nhận vào biến `resolvedEffort`.
  2. Cờ dòng lệnh được biên dịch chính xác theo từng adapter:
     - Với `claude-code`: chèn `["--thinking-budget", "2048"]` (cho low) hoặc `["--thinking-budget", "16000"]` (cho high).
     - Với `codex-cli`: chèn `["--reasoning-effort", "low"]` hoặc `["--reasoning-effort", "high"]`.

### AC-3: Chuyển Vùng Dự Phòng Trước Khi Thực Thi (Pre-Flight Cooldown Failover)
- **Given:** Group `"coding-pipeline"` có Target 1 (P0) đang ở trạng thái `COOLDOWN` (do dính rate limit trước đó) và Target 2 (P0) đang `READY`.
- **When:** Client gửi yêu cầu completion đến `"model": "group:coding-pipeline"`.
- **Then:**
  1. Router lập tức bỏ qua Target 1 và điều phối lưu lượng đến Target 2 trong vòng $\le 1.5\text{ms}$.
  2. Request được xử lý thành công mà không phải chịu bất kỳ thời gian chờ (delay) nào của Target 1.

### AC-4: Tự Động Chuyển Vùng Trong Suốt Tại Thời Điểm Spawn (Spawn-Probe Failover)
- **Given:** Target 1 (P0) hiển thị trạng thái `READY` trong database, nhưng tài khoản upstream đã hết quota.
- **When:** Gateway spawn tiến trình cho Target 1:
  - Trong vòng $80\text{ms}$, tiến trình CLI in ra stdout chuỗi `"429: Insufficient credits or rate limit exceeded"` và thoát với exit code khác 0.
- **Then:**
  1. `DynamicTargetPipelineExecutor` bẫy được lỗi trong cửa sổ spawn-probe $150\text{ms}$.
  2. Không có bất kỳ gói tin lỗi nào bị rò rỉ về client.
  3. Tài khoản của Target 1 được tự động chuyển sang trạng thái `COOLDOWN` với thời gian phạt tương ứng.
  4. Một bản ghi mới được thêm vào bảng `failover_events` ghi nhận: `from_target: Target 1`, `to_target: Target 2`, `trigger_reason: "SPAWN_RATE_LIMIT_DETECTED"`.
  5. Gateway tự động kích hoạt Target 2; client nhận stream SSE bình thường từ Target 2.

### AC-5: Cân Bằng Tải Mượt Mà Bằng Thuật Toán SWRR Trong Cùng Tầng Ưu Tiên
- **Given:** Tầng P0 có 2 target với tỷ lệ trọng số 70 : 30.
- **When:** Client gửi 100 requests liên tiếp (không có lỗi cooldown).
- **Then:**
  1. Thuật toán NGINX SWRR phân bổ chính xác xấp xỉ 70 requests cho Target A và 30 requests cho Target B.
  2. Không xảy ra hiện tượng dồn cục (clustering) 70 request liên tiếp vào một target rồi mới chuyển sang target còn lại.

### AC-6: Bảo Toàn Dòng Lệnh Khi Vượt Ngưỡng Prompt Dài (>4,000 ký tự) Trên Windows
- **Given:** Request chứa đoạn prompt lập trình phức tạp dài 6,500 ký tự, yêu cầu `"reasoning_effort": "high"`.
- **When:** `preparePromptTransport()` chuẩn bị đối số cho tiến trình:
- **Then:**
  1. Hệ thống phát hiện độ dài vượt ngưỡng 4,000 ký tự và tự động chuyển sang cơ chế `temp_file`.
  2. Nội dung prompt được lưu an toàn vào thư mục sandbox tmp.
  3. Cờ reasoning `--reasoning-effort high` (hoặc `--thinking-budget 16000`) vẫn được giữ nguyên vẹn trong `finalArgs` truyền cho nhị phân CLI.
  4. File tạm được xóa sạch sau khi tiến trình hoàn tất.

### AC-7: Trải Nghiệm Obsidian Cyberdeck Routing Studio & Playground
- **Given:** Người dùng mở giao diện Web Console:
- **When:**
  1. Tại `/models` (Model Catalog & Routing Studio):
     - Hiển thị tab "Routing Groups Manager" với danh sách các Group trực quan dạng Card.
     - Modal "Create / Edit Routing Group" cho phép kéo thả hoặc chọn đích danh: By Account, By CLI, hoặc By Model; gán Priority và Weight mượt mà.
     - Cấu hình Default Effort cho Group bằng thanh trượt trực quan.
     - Bảng "Live Pipeline Visualizer" vẽ sơ đồ các mắt xích P0 -> P1 -> P2.
  2. Tại `/playground` (Chat Playground):
     - Dropdown Model hiển thị các Group với icon phân biệt rõ ràng so với model đơn.
     - Bên cạnh checkbox "Chain-of-Thought", bổ sung bộ chọn **Reasoning Effort** 3 nấc (`Low`, `Medium`, `High`) với chỉ báo màu sắc (Cyan, Violet, Amber).
     - Khi stream chạy, thanh **Live Route Breadcrumb Inspector** hiển thị lộ trình thực tế: `Route: [group:deep-code] -> [Tier P0] -> [codex-cli/codex-acc-1] (Effort: High)`.
- **Then:** Giao diện phản hồi trơn tru, không giật lag, cung cấp khả năng kiểm thử toàn diện.

---

## 5. Bảng So Sánh Các Hướng Tiếp Cận & Ma Trận Thẩm Định

| Tiêu Chí Đánh Giá | Hướng Tiếp Cận 1: Static Auto Tiers (Hiện trạng) | Hướng Tiếp Cận 2: Pre-Flight Only Router | Tiếp Cận Chiến Thắng: Flow-Chain Dynamic Target Pipeline (Candidate D) |
| :--- | :--- | :--- | :--- |
| **Quyền Kiểm Soát Của Người Dùng** | **Tối thiểu:** Hardcode 5 tier ảo cố định, không chọn được account/provider. | Người dùng tạo được nhóm, nhưng chỉ gán danh sách model phẳng. | **Toàn diện:** Tự do tạo Group; chọn linh hoạt theo Account, CLI hoặc Model; phân tầng P0-P2 và chia trọng số SWRR. |
| **Khả Năng Chống Lỗi Tại Runtime (429/Crash)** | **Không có:** Dính lỗi là ném 429/500 ngay về client. | **Kém:** Chỉ kiểm tra database trước khi chạy; nếu CLI spawn crash là sập kết nối. | **Tuyệt hảo (Spawn-Probe):** Bẫy lỗi trong 150ms đầu tiên, tự động chuyển vùng trong suốt sang target kế tiếp. |
| **Tích Hợp Reasoning Effort** | **Bị nuốt chửng 100%:** Bỏ qua tham số `reasoning_effort` của OpenAI. | Chỉ nhận cờ cứng từ client, không có giá trị mặc định cho nhóm. | **Kế thừa 3 cấp độ:** Ingress Override > Target Link Override > Group Default; tự động biên dịch sang cờ CLI hoặc token budget. |
| **Bảo Vệ Tài Nguyên Máy Chủ** | Không có giới hạn trần, dễ bị bão tiến trình làm tràn RAM. | Quản lý slot độc lập trên từng account. | **Hai lớp bảo vệ:** Global System Slot Ceiling ($\le 12$) chống tràn RAM + Windows Argv Guard chống lỗi 8,191 ký tự. |
| **Khả Năng Kiểm Toán (Auditability)** | Mù mờ, không lưu vết lý do lỗi. | Ghi log console thông thường. | **Chuẩn mực Enterprise:** Ghi chi tiết bảng `failover_events`, phát sóng Admin Event Bus, vẽ Live Breadcrumb Trail trên UI. |
| **Điều Kiện Thất Bại Đầu Tiên** | CLI phụ hết quota làm sập toàn bộ tier `auto-high`. | CLI con bị lỗi 429 ngay khi spawn làm gãy kết nối IDE. | Tiến trình con bị crash giữa chừng sau khi đã gửi byte dữ liệu đầu tiên (được bảo vệ bằng Cutoff Point an toàn). |

---

## 6. Hướng Tiếp Cận & Đặc Tả Kỹ Thuật Chi Tiết

### 6.1 Mở Rộng Cơ Sở Dữ Liệu SQLite Drizzle (`apps/gateway/src/db/schema.ts`)

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { adapters, accounts } from "./schema.js";

// 1. Phân loại mục tiêu Tagged Union
export const targetKindEnum = ["ACCOUNT", "CLI", "MODEL", "PIPELINE"] as const;
export type TargetKind = (typeof targetKindEnum)[number];

// 2. Mức độ suy luận chuẩn hóa
export const effortLevelEnum = ["none", "low", "medium", "high", "xhigh"] as const;
export type EffortLevel = (typeof effortLevelEnum)[number];

// 3. Bảng Nhóm Định Tuyến / Routing Pipelines
export const routingPipelines = sqliteTable("routing_pipelines", {
  id: text("id").primaryKey(), // e.g. "group:deep-code" hoặc "group:fast-dev"
  name: text("name").notNull(),
  description: text("description"),
  virtualModelId: text("virtual_model_id").notNull().unique(), // ID expose qua GET /v1/models
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

// 4. Bảng Các Mục Tiêu Trong Nhóm (pipeline_targets)
export const pipelineTargets = sqliteTable("pipeline_targets", {
  id: text("id").primaryKey(), // UUID v4
  pipelineId: text("pipeline_id")
    .notNull()
    .references(() => routingPipelines.id, { onDelete: "cascade" }),
  targetKind: text("target_kind", { enum: ["ACCOUNT", "CLI", "MODEL"] }).notNull().default("MODEL"),
  priorityTier: integer("priority_tier").notNull().default(1), // 1 = P0, 2 = P1, 3 = P2...
  weight: integer("weight").notNull().default(100), // Phân bổ SWRR trong cùng Tier (1..100)
  adapterId: text("adapter_id")
    .notNull()
    .references(() => adapters.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull(), // Model ID trong adapter
  targetAccountId: text("target_account_id")
    .references(() => accounts.id, { onDelete: "set null" }), // null = tự động cân bằng trong adapter
  effortOverride: text("effort_override", { enum: ["none", "low", "medium", "high", "xhigh"] }),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});

// 5. Bảng Nhật Ký Chuyển Vùng Dự Phòng (failover_events)
export const failoverEvents = sqliteTable("failover_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pipelineId: text("pipeline_id").notNull(),
  requestId: text("request_id").notNull(),
  fromAccountId: text("from_account_id").notNull(),
  toAccountId: text("to_account_id").notNull(),
  triggerReason: text("trigger_reason").notNull(), // "COOLDOWN" | "SPAWN_CRASH" | "SPAWN_RATE_LIMIT"
  failoverLatencyMs: integer("failover_latency_ms").notNull().default(0),
  timestamp: integer("timestamp").default(sql`(strftime('%s', 'now'))`),
});
```

---

### 6.2 Bộ Thực Thi Động Chuỗi Với Khả Năng Failover Tại Thời Điểm Spawn (`DynamicTargetPipelineExecutor`)

```typescript
export interface PipelineExecutionCandidate {
  target: typeof pipelineTargets.$inferSelect;
  adapterConfig: AdapterConfig;
  account: { id: string; sandboxDir: string };
  modelId: string;
  effectiveEffort: EffortLevel;
}

export class DynamicTargetPipelineExecutor {
  public async executeWithFailover(
    candidates: PipelineExecutionCandidate[],
    context: {
      requestId: string;
      messages: any[];
      isStreaming: boolean;
      signal: AbortSignal;
      onDelta?: (chunk: string) => void;
      onThoughtDelta?: (chunk: string) => void;
      onContentDelta?: (chunk: string) => void;
    }
  ): Promise<ProcessExecutionResult> {
    let lastError: Error | null = null;
    const maxAttempts = Math.min(candidates.length, 3);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const candidate = candidates[attempt];
      const slotAcquired = await globalAccountPool.acquireSlot(candidate.account.id, 1);
      if (!slotAcquired) continue;

      let hasEmittedFirstByte = false;
      const startTime = Date.now();

      try {
        // Wrapper lắng nghe byte đầu tiên để thiết lập Cutoff Point
        const wrappedOnDelta = (delta: string) => {
          hasEmittedFirstByte = true;
          context.onDelta?.(delta);
        };
        const wrappedOnThoughtDelta = (delta: string) => {
          hasEmittedFirstByte = true;
          context.onThoughtDelta?.(delta);
        };
        const wrappedOnContentDelta = (delta: string) => {
          hasEmittedFirstByte = true;
          context.onContentDelta?.(delta);
        };

        // Thực thi tiến trình qua Supervisor ProcessManager
        const result = await globalProcessManager.executeStreaming({
          adapter: candidate.adapterConfig,
          account: candidate.account,
          modelId: candidate.modelId,
          messages: context.messages,
          signal: context.signal,
          onDelta: wrappedOnDelta,
          onThoughtDelta: wrappedOnThoughtDelta,
          onContentDelta: wrappedOnContentDelta,
          effortLevel: candidate.effectiveEffort,
        });

        // Nếu tiến trình thoát lỗi hoặc in ra rate limit trong 150ms đầu và CHƯA phát byte dữ liệu nào
        if (!hasEmittedFirstByte && (result.exitCode !== 0 || result.rateLimitDetected?.isRateLimited)) {
          const spawnDuration = Date.now() - startTime;
          if (spawnDuration <= 150) {
            // Kích hoạt Cooldown cho account lỗi
            await globalCooldownTracker.recordCooldown(
              candidate.account.id,
              result.rateLimitDetected?.cooldownSeconds || 1800,
              "Spawn-time rate limit detected"
            );

            // Ghi nhận failover event vào SQLite
            await this.recordFailoverEvent({
              pipelineId: candidate.target.pipelineId,
              requestId: context.requestId,
              fromAccountId: candidate.account.id,
              toAccountId: candidates[attempt + 1]?.account.id || "NONE",
              triggerReason: "SPAWN_RATE_LIMIT_DETECTED",
              failoverLatencyMs: spawnDuration,
            });

            // Giải phóng slot và trượt sang candidate tiếp theo
            await globalAccountPool.releaseSlot(candidate.account.id);
            continue;
          }
        }

        return result;
      } catch (err: any) {
        lastError = err;
        await globalAccountPool.releaseSlot(candidate.account.id);

        // Nếu đã phát byte dữ liệu đầu tiên thì KHÔNG được retry
        if (hasEmittedFirstByte) throw err;
      }
    }

    throw lastError || new Error("503: All targets in routing pipeline exhausted or rate limited.");
  }
}
```

---

### 6.3 Cơ Chế Biên Dịch Reasoning Effort Động Trong `prompt-transport.ts`

Hệ thống bổ sung module `compileEffortFlags` tự động ánh xạ mức effort chuẩn hóa (`none`, `low`, `medium`, `high`, `xhigh`) sang định dạng cờ cụ thể của từng công cụ CLI:

```typescript
export function compileEffortFlags(adapterId: string, level: EffortLevel): string[] {
  if (level === "none") return [];

  // Claude Code CLI: Ánh xạ sang token budget số nguyên
  if (adapterId === "claude-code") {
    const budgetMap: Record<EffortLevel, number> = {
      none: 0,
      low: 2048,
      medium: 8192,
      high: 16384,
      xhigh: 32768,
    };
    return ["--thinking-budget", String(budgetMap[level])];
  }

  // OpenAI Codex CLI: Ánh xạ sang cờ mức độ rời rạc
  if (adapterId === "codex-cli") {
    const codexMap: Record<EffortLevel, string> = {
      none: "none",
      low: "low",
      medium: "medium",
      high: "high",
      xhigh: "high",
    };
    return ["--reasoning-effort", codexMap[level]];
  }

  // OMP CLI: Ánh xạ sang tham số --effort
  if (adapterId === "omp-cli") {
    return ["--effort", level];
  }

  return [];
}
```

Trong `preparePromptTransport()`, mảng `effortFlags` được tiêm trực tiếp vào vị trí thích hợp của `finalArgs` mà không làm thay đổi template YAML gốc, đồng thời tự động bảo toàn khi chuyển sang chế độ `temp_file`.

---

## 7. Phụ Lục Thẩm Định Ultra Verifier (Lead Verifier: Kongming)

### Bảng Điểm Thẩm Định Độc Lập Giữa 5 Ứng Viên
Quy trình `ak-brainstorm --ultra` đã tiến hành thẩm định mù (anonymized) 5 phương án kiến trúc độc lập:

| Ứng Viên | Đề Xuất Trọng Tâm | Điểm Số (/80) | Xếp Hạng | Đánh Giá Của Lead Verifier Kongming |
| :--- | :--- | :---: | :---: | :--- |
| **Candidate D (Candidate 4)** | **Flow-Chain Dynamic Target Pipeline & Context-Aware Effort Resolver** | **77 / 80** | 🥇 **Chiến Thắng** | Vượt trội nhờ giải quyết triệt để rủi ro lỗi 429 tại thời điểm spawn qua `DynamicTargetPipelineExecutor`, cơ chế kế thừa effort 3 cấp và nhật ký kiểm toán `failover_events`. |
| Candidate A (Candidate 1) | Hierarchical Group Routing & Unified Effort Matrix | 73 / 80 | 🥈 Á Quân | Xuất sắc về thuật toán chia tải NGINX SWRR và thuật toán duyệt đồ thị DFS ngăn ngừa vòng lặp lồng nhau. |
| Candidate B (Candidate 2) | Declarative Rule Engine & Continuous-to-Discrete Effort Transpiler | 71 / 80 | 🥉 Đồng Á Quân | Thiết kế kiểu dữ liệu Tagged Union TargetSpec hoàn hảo và bộ chuyển dịch toán học lượng tử hóa token budget. |
| Candidate E (Candidate 5) | Priority-Tier Matrix Router & Dynamic Capability Prober | 69 / 80 | 4th | Sáng tạo với cơ chế gọi nhị phân `--help` kiểm tra cờ tại pha boot và chặn sớm HTTP 400 Bad Request. |
| Candidate C (Candidate 3) | Composite Slot-Pool Router & Adaptive CLI Argument Compiler | 64 / 80 | 5th | Nhận thức sâu sắc nhất về giới hạn RAM của host OS với Global System Slot Ceiling và bảo vệ giới hạn dòng lệnh Windows. |

### Ma Trận Hợp Nhất Tinh Hoa (The Kongming Synthesis)
Hợp đồng kỹ thuật này đã hấp thu và tích hợp toàn bộ các điểm sáng kỹ thuật tối ưu từ 4 ứng viên còn lại vào bản thiết kế của Candidate D:
1. **Từ Candidate 1:** Tích hợp thuật toán NGINX SWRR vào bộ phân bổ lưu lượng giữa các target trong cùng tầng ưu tiên, cùng thuật toán DFS Cycle Detection chống lặp Group vô hạn.
2. **Từ Candidate 2:** Tích hợp hệ thống Tagged Union `TargetKind` (`ACCOUNT`, `CLI`, `MODEL`, `PIPELINE`) và cơ chế lượng tử hóa token budget.
3. **Từ Candidate 5:** Tích hợp bộ thăm dò năng lực động `DynamicCapabilityProber` tại pha boot và cơ chế trả sớm HTTP 400 nếu client gửi effort lên model không hỗ trợ reasoning.
4. **Từ Candidate 3:** Tích hợp trần slot hệ thống `max_global_slots` bảo vệ tài nguyên host không bị tràn RAM và Windows Argv Overflow Guard.

---

## 8. Handoff & Kế Hoạch Triển Khai Tiếp Theo

Hợp đồng kiến trúc này hoàn tất và được đóng băng (`SPECIFICATION_FROZEN`). Sẵn sàng chuyển giao cho kỹ năng lập kế hoạch thi công tiếp theo (`ak-plan` / `/ak:cook`):
- **Phase 1:** Mở rộng SQLite Schema (`routing_pipelines`, `pipeline_targets`, `failover_events`) qua Drizzle migration.
- **Phase 2:** Triển khai `FlowChainRouter`, `DynamicTargetPipelineExecutor` và thuật toán SWRR trong `apps/gateway/src/router/`.
- **Phase 3:** Triển khai `compileEffortFlags` và tích hợp vào `prompt-transport.ts` & `openai-chat.ts`.
- **Phase 4:** Nâng cấp Obsidian Cyberdeck UI cho `ModelCatalogView.tsx` (Quản trị Group, Target Builder, Visual Graph) và `PlaygroundView.tsx` (Effort Deck, Breadcrumb Trail).
- **Phase 5:** Bộ kiểm thử tích hợp E2E xác nhận toàn bộ 7 kịch bản Acceptance Criteria.
