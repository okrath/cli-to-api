# Báo cáo Đề xuất Kiến trúc & Hợp đồng Kỹ thuật (Bounded Contract)
## Protocol-Level Multi-Dialect Reasoning Engine, Adapter-Level Declarative Extraction Rules & Real-Time Cognitive Telemetry

**Ứng viên:** Candidate 2  
**Chế độ:** `ak-brainstorm --ultra`  
**Các hệ thống phụ mục tiêu:** Gateway Ingress (`/v1/chat/completions` & Anthropic v1 messages), Stream Pipeline (`sse-serializer`, `ansi-sanitizer`, `utf8-decoder`), Adapter Declarative Schema (`reasoning_parser`), Process Supervisor (`pipe-executor`, `pty-executor`), Admin Telemetry Bus (`admin-events`), Web Live Inspector Studio  
**Ngày:** 16-09-2026  

---

## Tóm tắt Điều hành (Executive Summary)

Sự chuyển dịch của mô hình AI thế hệ 2025–2026 (với sự thống trị của các kiến trúc lý luận suy diễn sâu như DeepSeek-R1, OpenAI o1/o3-mini/o3, Anthropic Claude 3.7 Sonnet Thinking, Qwen-QwQ) đã biến **Chuỗi suy nghĩ (Chain-of-Thought - CoT / Reasoning)** từ một cơ chế nội bộ thành thành phần cốt lõi của giao thức truyền thông.

Hiện tại, `cli-to-api` hoạt động như một proxy chuyển tiếp text phẳng:
1. **Phân mảnh giao thức trầm trọng (Dialect Fragmentation):** Các CLI mã nguồn mở và thương mại xuất luồng reasoning theo nhiều định dạng không đồng nhất: thẻ XML thô (`<think>`, `<thought>`), trường JSON chuyên biệt (`reasoning_content`), hoặc giao thức Anthropic extended thinking block (`content_block_start` loại `thinking`). Khi trả về cho các Web Chat UI (Open WebUI, LibreChat, Chatbox, typingmind, Continue.dev), các thẻ suy nghĩ bị trộn lẫn vào văn bản phản hồi chính (`content`), gây vỡ định dạng Markdown, làm hỏng các luồng tổng hợp code của IDE và phá vỡ cấu trúc hiển thị của các client mong đợi `reasoning_content` độc lập.
2. **Thiếu cơ chế bóc tách suy diễn khai báo (Declarative Reasoning Extraction):** Mỗi adapter CLI (Claude Code, OpenAI Codex, Devin, OpenCode, Aider) có định dạng xuất chuỗi tư duy khác nhau. Việc viết code parser cứng (hard-coded) cho từng CLI vi phạm tính mở rộng và nguyên tắc cô lập của Gateway. Nếu CLI thay đổi định dạng hoặc nếu người dùng tự thêm adapter mới, Gateway không có cách nào cấu hình tách luồng reasoning mà không phải can thiệp sửa mã nguồn lõi.
3. **Mù lòa đo kiểm thời gian thực (Zero Cognitive Telemetry):** Quá trình lý luận sâu có thể kéo dài từ vài giây đến hơn một phút trước khi token câu trả lời đầu tiên xuất hiện. Live Inspector và Admin Event Bus hiện tại chỉ theo dõi `chunk:delta` chung chung. Người vận hành và nhà phát triển không thể phân biệt được CLI đang "tư duy" (thinking) hay đang bị treo (hanging), không nắm được tốc độ sinh token tư duy (Tokens Per Second - TPS), thời gian lý luận ($T_{\text{think}}$) và tỷ lệ suy luận so với phản hồi cuối.

**Candidate 2** đề xuất kiến trúc: **Động cơ Lý luận Đa phương ngữ cấp Giao thức (Protocol-Level Multi-Dialect Reasoning Engine)**, kết hợp **Bộ quy tắc bóc tách suy diễn khai báo cấp Adapter (YAML Schema Reasoning Parser)** và **Hạ tầng đo kiểm chuyên sâu với Live Inspector (Cognitive Telemetry & Thought Streaming)**.

---

## 1. Kết quả Kỳ vọng & Sơ đồ Kiến trúc Toàn diện

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           INGRESS CLIENT CONSUMERS                                              │
│   (Open WebUI, LibreChat, Chatbox, Cursor, Continue.dev, Claude Artifacts Client, Vanilla OpenAI/Anthropic SDKs)│
├─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ • OpenAI Dialect: POST /v1/chat/completions (Stream: true, expects `delta.reasoning_content` + `delta.content`)│
│ • Anthropic Dialect: POST /v1/messages (Stream: true, expects `thinking` blocks + `text` blocks)                 │
│ • Raw Tag Dialect: Clients requiring inline `<think>...</think>` preservation or stripping                     │
└──────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────┘
                                                       │
                                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                           SUBSYSTEM 1: PROTOCOL-LEVEL MULTI-DIALECT NEGOTIATOR                                  │
│                                                                                                                 │
│   1. Ingress Capability Sniffer:                                                                                │
│      ├── Client requests OpenAI endpoint ──► Output Mode: OPENAI_REASONING_CONTENT                              │
│      ├── Client requests Anthropic endpoint ──► Output Mode: ANTHROPIC_THINKING_BLOCKS                          │
│      └── Request headers / flags (e.g. `x-reasoning-transport: raw_tags`) ──► Mode: INLINE_TAGS                │
│   2. Budget & Effort Translator:                                                                                │
│      ├── `reasoning_effort: low|medium|high` ──► Mapped to Adapter CLI flags (--thinking-budget)              │
│      └── `thinking: { type: "enabled", budget_tokens: N }` ──► Normalized to execution context                 │
└──────────────────────────────────────────────────────┬──────────────────────────────────────────────────────────┘
                                                       │
                                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                          SUBSYSTEM 2: ADAPTER DECLARATIVE REASONING EXTRACTION                                  │
│                                                                                                                 │
│  Declarative Engine driven by YAML: reasoning_parser: type: "tags" | "regex" | "json_field"                     │
│                                                                                                                 │
│  ┌───────────────────────────┐ ┌─────────────────────────────┐ ┌─────────────────────────────────────────────┐  │
│  │   TAGS STREAM PARSER      │ │     REGEX STREAM PARSER     │ │         JSON_FIELD PARSER                   │  │
│  │ (Sliding Buffer Machine)  │ │ (Chunk Pattern Matcher)     │ │ (Path resolver: delta.thinking)             │  │
│  │ • Delimiter tracking      │ │ • Multi-group capture       │ │ • Stream event-type matching                │  │
│  │ • Partial tag boundary    │ │ • Unbuffered boundary       │ │ • Direct property extraction                │  │
│  │   defense (<thi | nk>)    │ │   stream normalization      │ │ • Claude Code JSON-Lines native             │  │
│  └─────────────┬─────────────┘ └──────────────┬──────────────┘ └──────────────────────┬──────────────────────┘  │
│                └──────────────────────────────┼───────────────────────────────────────┘                         │
│                                               ▼                                                                 │
│                              DUAL-CHANNEL NORMALIZED EVENT EMITTER                                              │
│                              ├── Channel A: REASONING DELTA (Tokens, Phase: THINKING)                           │
│                              └── Channel B: CONTENT DELTA (Tokens, Phase: ANSWERING)                            │
└───────────────────────────────────────────────┬─────────────────────────────────────────────────────────────────┘
                                                │
                     ┌──────────────────────────┴──────────────────────────┐
                     ▼                                                     ▼
┌──────────────────────────────────────────────┐     ┌────────────────────────────────────────────────────────┐
│ SUBSYSTEM 3: PROTOCOL WIRE SERIALIZER        │     │ SUBSYSTEM 4: COGNITIVE TELEMETRY & LIVE INSPECTOR      │
│                                              │     │                                                        │
│ • OpenAI Wire:                               │     │ • Admin Event Bus Broadcast: `chunk:thought`           │
│   data: {"choices":[{"delta":{               │     │   - completionId, model, tokenDelta, elapsedMs         │
│     "reasoning_content": "tok"               │     │   - currentTps (tokens/sec), accumulatedTokens         │
│   }}]}                                       │     │ • HTTP Ingress Response Headers:                       │
│ • Anthropic Wire:                            │     │   - X-Reasoning-Tokens, X-Reasoning-Duration-Ms        │
│   event: content_block_delta                 │     │ • Live Inspector Cyberdeck Studio UI:                  │
│   data: {"delta":{"thinking":"tok"}}         │     │   - Real-Time Thinking Speedometer (Live TPS Gauge)    │
│ • Transition to Content:                     │     │   - Dual-Track Visualizer: Reasoning vs Final Content  │
│   Closes thinking phase, begins content SSE  │     │   - Thought Collapsible Preview with Markdown/ANSI     │
└──────────────────────────────────────────────┘     └────────────────────────────────────────────────────────┘
```

### Các Khả Năng & Giá Trị Kỹ Thuật Đạt Được
1. **Phổ cập Hoàn toàn Chuỗi Suy nghĩ (Universal Reasoning Compatibility):** Khách hàng sử dụng bất kỳ Web UI nào (Open WebUI, LibreChat, Chatbox, Claude-UI) hoặc IDE extension (Continue, Cursor) đều nhận được luồng suy nghĩ đúng chuẩn giao thức họ yêu cầu, bất kể CLI bên dưới xuất định dạng thẻ `<think>`, JSON Lines hay plain text.
2. **Khai báo Độc lập Cấp Adapter (Zero-Code Extensibility):** Tích hợp CLI mới có tính năng suy luận chỉ bằng vài dòng cấu hình trong tệp `.yaml`. Không cần thay đổi mã nguồn TypeScript của Gateway. Hỗ trợ đầy đủ các cơ chế trích xuất: `tags` (với máy trạng thái chống vỡ thẻ), `regex` và `json_field`.
3. **Đo kiểm Chẩn đoán Sâu Thời gian Thực (Cognitive Telemetry):** Đập tan "hộp đen" trong lúc mô hình suy luận kéo dài. Cung cấp sự minh bạch tuyệt đối qua sự kiện `chunk:thought` trên Admin SSE Bus, hiển thị đồng hồ đếm thời gian tư duy, bộ đếm token, và tốc độ token/giây (TPS) tức thời ngay trên Live Inspector Dashboard.

---

## 2. Các Ràng buộc Kỹ thuật & Bất biến Hệ thống (Constraints & Invariants)

1. **Bất biến Tương thích Giao thức Dây (Wire Protocol Invariant):**
   - Định dạng SSE trả về cho OpenAI client phải tuân thủ nghiêm ngặt định dạng chuẩn: `choices[0].delta.reasoning_content` cho pha tư duy, và `choices[0].delta.content` cho pha trả lời chính thức.
   - Khi trả lời dạng Unary (non-streaming), payload phản hồi phải chứa đồng thời `choices[0].message.reasoning_content` (chuỗi markdown của toàn bộ tư duy) và `choices[0].message.content` (chuỗi kết quả thực thi). Không được để lẫn thẻ `<think>` vào `message.content` nếu adapter đã kích hoạt `strip_from_content: true`.
2. **Bảo vệ Ranh giới Thẻ Chia cắt theo Khung (Chunk Boundary Defense):**
   - Trong quá trình stream stdout qua Pipe hoặc PTY, các thẻ phân định như `<think>` hoặc `</think>` có thể bị cắt ngang giữa hai khối byte liên tiếp từ OS buffer (ví dụ: Chunk $N$ kết thúc bằng `</th` và Chunk $N+1$ bắt đầu bằng `ink>`).
   - Bộ phân tích cú pháp Stream Parser **bắt buộc** phải sử dụng Máy Trạng Thái Hữu Hạn (Finite State Machine - FSM) với bộ đệm trượt (sliding lookahead buffer), tuyệt đối không để rò rỉ các đoạn thẻ vỡ (partial tag fragments) vào client output stream.
3. **Độ trễ Pipeline Cận Zero (Sub-Millisecond Pipeline Overhead):**
   - Chi phí xử lý của bộ bóc tách reasoning và serializer đa phương ngữ không được vượt quá $0.5\text{ms}$ cho mỗi chunk.
   - Time-to-First-Reasoning-Token (TTFRT) phải tương đương với Time-to-First-Token (TTFT) của CLI gốc, không được giữ lại toàn bộ khối suy nghĩ trong bộ nhớ rồi mới xả luồng (zero buffering batching).
4. **Cô lập Môi trường và Đa Tài khoản (Sandbox Isolation):**
   - Tất cả các trạng thái parser, bộ đếm token và bộ đệm chuỗi suy nghĩ phải được quản lý theo từng `completionId` và gắn chặt với vòng đời của request.
   - Không được xảy ra hiện tượng rò rỉ dữ liệu tư duy (cross-tenant thought leakage) giữa các phiên làm việc song song của nhiều tài khoản.
5. **Khả năng Chống Treo và Xử lý Hủy Luồng (Abort Propagation):**
   - Nếu client ngắt kết nối trong khi CLI đang trong giai đoạn reasoning, Gateway phải lập tức kích hoạt `AbortController`, gửi tín hiệu hủy (`SIGKILL` trên POSIX hoặc Terminate Job Object trên Windows) tới CLI trong vòng $\le 200\text{ms}$.
6. **Chuẩn hóa Ký tự và UTF-8 Multi-byte Invariant:**
   - Bộ giải mã `Utf8StreamDecoder` và bộ lọc `DualStageAnsiSanitizer` phải xử lý triệt để các ký tự Unicode nhiều byte bị cắt ngang ở biên chunk trước khi chuyển văn bản qua bộ bóc tách reasoning.

---

## 3. Các Mục tiêu Nằm ngoài Phạm vi (Non-goals)

1. **Không Tự Động Tạo Chuỗi Suy Nghĩ Giả (No Synthetic Reasoning Generation):** Nếu CLI bên dưới là mô hình không có khả năng suy luận (như Claude 3.5 Haiku hoặc GPT-4o-mini tiêu chuẩn) và không xuất luồng CoT, Gateway sẽ không tự chèn hay giả lập reasoning block.
2. **Không Can thiệp Sửa Đổi Binary Gốc:** Gateway không thực hiện can thiệp nhị phân vào các công cụ CLI đóng như `claude` hay `codex`. Việc điều khiển mức độ suy luận được thực hiện nghiêm ngặt qua flags, environment variables, và stdin/stdout protocol.
3. **Không Lưu trữ Vĩnh viễn Nội dung Tư duy (Ephemeral Thought Persistence):** Nội dung reasoning chỉ tồn tại trong suốt vòng đời của request và truyền qua SSE. Database SQLite WAL chỉ lưu trữ metadata thống kê (số lượng reasoning tokens, thời gian suy luận), không lưu trữ toàn bộ văn bản CoT thô vào cơ sở dữ liệu nhằm tiết kiệm dung lượng đĩa và bảo vệ quyền riêng tư.
4. **Không Thay thế Công cụ Benchmark LLM Chuyên dụng:** Hệ thống đo kiểm tập trung vào việc giám sát vận hành thời gian thực (real-time telemetry) và hỗ trợ debug stream, không hướng tới việc thay thế các bộ đo benchmark chuyên sâu.

---

## 4. Tiêu chí Nghiệm thu (Acceptance Criteria - AC)

### AC-1: Bóc tách Thẻ Suy nghĩ XML Thô sang `reasoning_content` (Tag-based Extraction)
- **Given:** Adapter cấu hình `reasoning_parser: { type: "tags", tags_config: { open_tag: "<think>", close_tag: "</think>", strip_from_content: true } }`.
- **When:** CLI xuất luồng stdout: `"<think>Đang phân tích cấu trúc dự án...</think>Đây là kết quả hoàn thiện."`.
- **Then:**
  1. Các chunk chứa chuỗi `"Đang phân tích cấu trúc dự án..."` được phát ra qua SSE dưới dạng: `{"choices":[{"delta":{"reasoning_content":"..."}}]}`.
  2. Không có bất kỳ thẻ `<think>` hoặc `</think>` nào xuất hiện trong `delta.content`.
  3. Chunk chứa `"Đây là kết quả hoàn thiện."` được phát ra dưới dạng: `{"choices":[{"delta":{"content":"..."}}]}`.
  4. Phản hồi kết thúc bằng `data: [DONE]`.

### AC-2: Xử lý Thẻ Phân định Bị Cắt ngang Biên Chunk (Chunk Split Defenses)
- **Given:** Stream parser đang nhận luồng byte qua pipe.
- **When:** Dữ liệu tới bị phân cắt thành 4 chunks:
  - Chunk 1: `"Đang suy nghĩ: <thi"`
  - Chunk 2: `"nk>Tìm kiếm thuật toán"`
  - Chunk 3: `" tối ưu.</th"`
  - Chunk 4: `"ink>Đã tìm ra thuật toán."`
- **Then:**
  1. Máy trạng thái phát hiện phân đoạn `<thi` là tiền tố ứng viên của thẻ mở, giữ lại trong buffer trượt và không phát ra client.
  2. Khi Chunk 2 tới, thẻ `<think>` được nhận diện hoàn chỉnh, chuyển trạng thái sang `REASONING`. Chuỗi `"Tìm kiếm thuật toán"` lập tức được phát dưới trường `reasoning_content`.
  3. Tương tự, khi Chunk 3 kết thúc bằng `</th`, hệ thống giữ lại cho đến khi Chunk 4 tới để hoàn tất thẻ đóng `</think>`, chuyển trạng thái sang `CONTENT`.
  4. Tuyệt đối không có ký tự rác hoặc thẻ gãy nào bị lọt vào stream của client.

### AC-3: Bóc tách Trực tiếp từ Định dạng Cấu trúc JSON Lines (`json_field`)
- **Given:** Adapter `claude-code` cấu hình `reasoning_parser: { type: "json_field", json_config: { stream_type: "event", event_name_path: "type", thinking_event_type: "thinking_delta", reasoning_path: "delta.thinking", content_event_type: "text_delta", content_path: "delta.text" } }`.
- **When:** CLI xuất các dòng JSON Lines:
  - Dòng 1: `{"type":"thinking_delta","delta":{"thinking":"Phân tích AST..."}}`
  - Dòng 2: `{"type":"text_delta","delta":{"text":"Hàm này có độ phức tạp O(N)."}}`
- **Then:**
  1. Gateway bóc tách trực tiếp chuỗi từ `delta.thinking` và phát ra client dưới trường `reasoning_content`.
  2. Dòng thứ 2 được trích xuất từ `delta.text` và phát ra dưới trường `content`.
  3. Chi phí phân tích cú pháp mỗi dòng JSON $\le 0.2\text{ms}$.

### AC-4: Tương thích Ngược Giao thức Anthropic Thinking Block Protocol
- **Given:** Client kết nối tới Gateway qua endpoint tương thích Anthropic (`POST /v1/messages`) yêu cầu `thinking: { type: "enabled", budget_tokens: 2048 }`.
- **When:** CLI xuất luồng reasoning và nội dung.
- **Then:**
  1. Gateway phát chuỗi sự kiện:
     - `event: content_block_start` với `{"type":"thinking","index":0}`
     - `event: content_block_delta` với `{"type":"thinking_delta","thinking":"..."}`
     - `event: content_block_stop` với `{"index":0}`
     - `event: content_block_start` với `{"type":"text","index":1}`
     - `event: content_block_delta` với `{"type":"text_delta","text":"..."}`
     - `event: content_block_stop` với `{"index":1}`
  2. Client Anthropic render đầy đủ khối thinking có thể đóng/mở (collapsible thought box).

### AC-5: Chuyển đổi và Truyền tải Chỉ thị Reasoning Budget
- **Given:** Request gửi tới Gateway có trường `reasoning_effort: "high"` hoặc `reasoning_effort: "low"`.
- **When:** Gateway phân giải adapter cấu hình `reasoning_parser.effort_mapping`:
  - `low` $\to$ `--thinking-budget 1024`
  - `medium` $\to$ `--thinking-budget 4096`
  - `high` $\to$ `--thinking-budget 16384`
- **Then:** Process Supervisor khởi tạo CLI process với đúng đối số CLI tương ứng, đảm bảo mô hình bên dưới phân bổ tài nguyên tư duy chính xác theo yêu cầu.

### AC-6: Phát sóng Telemetry Đo kiểm Thời gian thực (`chunk:thought`)
- **Given:** Một phiên suy luận đang diễn ra.
- **When:** Mỗi chunk reasoning được bóc tách thành công:
- **Then:**
  1. Gateway phát một event qua `globalAdminEventBus`:
     ```json
     {
       "type": "chunk:thought",
       "data": {
         "completionId": "chatcmpl-...",
         "adapterId": "codex-cli",
         "model": "gpt-5.6-asta",
         "phase": "reasoning",
         "tokenDelta": 12,
         "accumulatedTokens": 248,
         "elapsedMs": 1420,
         "tokenRateTps": 174.6
       }
     }
     ```
  2. Tất cả các kết nối SSE tại `/api/admin/events` nhận được event trong vòng $\le 5\text{ms}$.

### AC-7: Đo kiểm Đo lường Header & Thống kê Tóm tắt Unary Response
- **Given:** Client thực hiện gọi request non-streaming (`stream: false`).
- **When:** Quá trình hoàn tất thành công:
- **Then:**
  1. HTTP Response Headers chứa:
     - `X-Reasoning-Tokens: <số lượng token>`
     - `X-Reasoning-Duration-Ms: <thời gian tính bằng ms>`
     - `X-Reasoning-Tps: <tốc độ token/giây>`
  2. Body phản hồi JSON chứa:
     - `choices[0].message.reasoning_content`: toàn bộ nội dung reasoning.
     - `choices[0].message.content`: kết quả văn bản đã được loại bỏ thẻ suy nghĩ.
     - `usage.completion_tokens_details.reasoning_tokens`: số lượng token lý luận được thống kê chính xác theo chuẩn OpenAI.

### AC-8: Trực quan hóa Live Inspector Cyberdeck Studio
- **Given:** Giao diện Live Inspector View đang mở trên trình duyệt.
- **When:** Gateway phát các sự kiện `chunk:thought`:
- **Then:**
  1. Bảng điều khiển hiển thị widget "Cognitive Thought Stream & Telemetry":
     - Đồng hồ đo tốc độ (TPS Speedometer) hiển thị số tokens/giây cập nhật theo chu kỳ 500ms.
     - Bộ đếm thời gian thực $T_{\text{think}}$ và thanh tiến trình tích lũy tokens.
  2. Khối nội dung reasoning được hiển thị trong khung viền màu hổ phách/cyan riêng biệt với nút bấm Toggle Thu gọn/Mở rộng.
  3. Cột OpenAI SSE đối chiếu bên cạnh hiển thị định dạng chuẩn `delta.reasoning_content`.

---

## 5. Ma trận Đánh giá & So sánh các Phương án Kỹ thuật

| Tiêu chí Đánh giá | Phương án 1: Multi-Dialect Declarative Reasoning Engine & Live Telemetry (Đề xuất của Candidate 2) | Phương án 2: Hard-Coded Regex Strip trong SSE Serializer (Naive Approach) | Phương án 3: Passthrough Thô Toàn bộ Luồng Text (Baseline hiện tại) |
| :--- | :--- | :--- | :--- |
| **Độ phủ Giao thức (Protocol Dialects)** | **Toàn diện:** Hỗ trợ đồng thời OpenAI `reasoning_content`, Anthropic thinking blocks, và thẻ XML tùy biến. | **Kém:** Chỉ hỗ trợ một dạng thẻ cố định; không sinh được Anthropic thinking block chuẩn. | **Không có:** Đẩy toàn bộ văn bản thô cho client tự xử lý. |
| **Bảo vệ Ranh giới Chunk (Chunk Boundary Split)** | **Tuyệt đối:** FSM với Sliding-Window Lookahead Buffer, ngăn chặn 100% hiện tượng thẻ vỡ. | **Thất bại:** Regex thông thường bị gãy khi thẻ mở/đóng bị chia cắt qua 2 chunk byte khác nhau. | **Không áp dụng:** Không bóc tách. |
| **Khả năng Mở rộng Adapter (Extensibility)** | **Tối ưu:** Khai báo $100\%$ qua YAML schema (`tags`, `regex`, `json_field`), không sửa code TypeScript. | **Tệ:** Phải thêm câu lệnh `if/else` và sửa code gateway mỗi khi có CLI hoặc định dạng mới. | **Không có cấu hình:** Adapter không thể can thiệp vào định dạng reasoning. |
| **Độ trễ Pipeline (Latency Overhead)** | **Cực thấp ($\le 0.3\text{ms}$):** Xử lý luồng zero-copy với con trỏ buffer trượt. | **Trung bình ($\approx 2\text{--}5\text{ms}$):** Re-compile hoặc chạy regex trên chuỗi tích lũy lớn. | **Zero:** Không xử lý luồng. |
| **Đo kiểm Thời gian thực (Telemetry & Live TPS)** | **Chuyên sâu:** Phát sự kiện `chunk:thought`, đo TPS, thời gian tư duy, tích hợp Live Inspector Studio. | **Không có:** Chỉ đo tổng thời gian khi kết thúc toàn bộ request. | **Mù hoàn toàn:** Không thể biết CLI đang suy nghĩ hay đang bị treo. |
| **Tương thích IDE & Web UIs** | **Hoàn hảo:** Tránh hoàn toàn việc thẻ `<think>` làm ô nhiễm file code của Continue/Cursor. | **Khá:** Thỉnh thoảng để rò rỉ thẻ vỡ làm hỏng parser Markdown của UI. | **Rất kém:** Thẻ XML thô hiển thị trực tiếp trong khung chat hoặc chèn vào source code. |
| **Giả định Cốt lõi** | Luồng dữ liệu từ CLI tuân thủ một trong ba mẫu khai báo: thẻ bao bọc, mẫu regex hoặc JSON Lines. | Định dạng của các CLI luôn bất biến và thẻ không bao giờ bị cắt ngang giữa các gói TCP/Pipe. | Client bên ngoài luôn có sẵn parser thông minh để tự bóc tách thẻ tư duy. |
| **Điều kiện Thất bại Đầu tiên** | CLI xuất định dạng dị biệt chưa được mô tả trong 3 parser schema (có thể giải quyết bằng custom regex). | CLI xuất khối lượng token lớn khiến regex quét toàn bộ buffer gây nghẽn CPU Event Loop (ReDoS/Lag). | Client là công cụ lập trình tự động (Agent) đọc nhầm thẻ `<think>` thành code syntax thực tế. |

---

## 6. Đặc tả Kỹ thuật Chi tiết & Hợp đồng Thực thi (Detailed Engineering Contract)

---

### 6.1 Mở rộng Declarative YAML Schema (`reasoning_parser`)

Cập nhật `apps/gateway/src/adapters/schema.ts` với schema Zod toàn diện:

```typescript
// apps/gateway/src/adapters/schema.ts (Phần mở rộng cho Reasoning Engine)
import { z } from "zod";

export const ReasoningParserTypeEnum = z.enum(["tags", "regex", "json_field", "none"]);
export type ReasoningParserType = z.infer<typeof ReasoningParserTypeEnum>;

export const TagsReasoningConfigSchema = z.object({
  open_tag: z.string().default("<think>"),
  close_tag: z.string().default("</think>"),
  strip_from_content: z.boolean().default(true),
  trim_tags: z.boolean().default(true),
  handle_unclosed: z.enum(["stream_as_reasoning", "fallback_to_content"]).default("stream_as_reasoning"),
});

export const RegexReasoningConfigSchema = z.object({
  pattern: z.string().describe("RegExp pattern with named groups (?<reasoning>...) and optional (?<content>...)"),
  reasoning_group: z.union([z.string(), z.number()]).default("reasoning"),
  content_group: z.union([z.string(), z.number()]).default("content"),
  multiline: z.boolean().default(true),
});

export const JsonFieldReasoningConfigSchema = z.object({
  stream_type: z.enum(["field", "event"]).default("field"),
  reasoning_path: z.string().default("delta.reasoning_content"),
  content_path: z.string().default("delta.content"),
  event_name_path: z.string().optional().describe("Keypath for event type if stream_type is 'event'"),
  thinking_event_type: z.string().optional().default("thinking_delta"),
  content_event_type: z.string().optional().default("text_delta"),
});

export const EffortMappingSchema = z.object({
  param_style: z.enum(["flag", "env", "arg_replace"]).default("flag"),
  flag_template: z.string().default("--thinking-budget {budget}"),
  budget_values: z.object({
    none: z.union([z.string(), z.number()]).default(0),
    low: z.union([z.string(), z.number()]).default(1024),
    medium: z.union([z.string(), z.number()]).default(4096),
    high: z.union([z.string(), z.number()]).default(16384),
  }).default({}),
});

export const ReasoningParserSchema = z.object({
  enabled: z.boolean().default(true),
  type: ReasoningParserTypeEnum.default("tags"),
  tags_config: TagsReasoningConfigSchema.optional(),
  regex_config: RegexReasoningConfigSchema.optional(),
  json_config: JsonFieldReasoningConfigSchema.optional(),
  effort_mapping: EffortMappingSchema.optional(),
  telemetry: z.object({
    track_tokens: z.boolean().default(true),
    track_duration: z.boolean().default(true),
    tps_sample_interval_ms: z.number().int().positive().default(500),
  }).default({}),
});

export type ReasoningParserConfig = z.infer<typeof ReasoningParserSchema>;
```

#### Ví dụ Cấu hình Adapter YAML (`adapters/claude-code.yaml` & `adapters/codex-cli.yaml`):

```yaml
# adapters/claude-code.yaml
id: "claude-code"
name: "Anthropic Claude Code CLI"
executable: "claude"
execution_mode: "pipe"

reasoning_parser:
  enabled: true
  type: "json_field"
  json_config:
    stream_type: "event"
    event_name_path: "type"
    thinking_event_type: "thinking_delta"
    reasoning_path: "delta.thinking"
    content_event_type: "text_delta"
    content_path: "delta.text"
  effort_mapping:
    param_style: "flag"
    flag_template: "--thinking-budget {budget}"
    budget_values:
      low: 1024
      medium: 4096
      high: 16384
  telemetry:
    track_tokens: true
    track_duration: true
    tps_sample_interval_ms: 500
```

```yaml
# adapters/codex-cli.yaml (Dạng thẻ Tags với DeepSeek-R1 / Qwen-QwQ)
id: "codex-cli"
name: "OpenAI Codex CLI"
executable: "codex"
execution_mode: "pipe"

reasoning_parser:
  enabled: true
  type: "tags"
  tags_config:
    open_tag: "<think>"
    close_tag: "</think>"
    strip_from_content: true
    trim_tags: true
  effort_mapping:
    param_style: "arg_replace"
    flag_template: "reasoning_effort={effort}"
  telemetry:
    track_tokens: true
    track_duration: true
    tps_sample_interval_ms: 500
```

---

### 6.2 Máy Trạng thái Hữu hạn Bóc tách Luồng Chuỗi Suy nghĩ (Sliding-Window FSM Stream Parser)

Đây là thành phần cốt lõi ngăn chặn triệt để hiện tượng vỡ thẻ qua ranh giới chunk:

```typescript
// apps/gateway/src/stream/reasoning-stream-parser.ts
import EventEmitter from "node:events";

export type StreamPhase = "IDLE" | "IN_REASONING" | "IN_CONTENT";

export interface ParsedStreamChunk {
  phase: "reasoning" | "content";
  text: string;
}

export interface StreamParserOptions {
  openTag?: string;
  closeTag?: string;
  stripFromContent?: boolean;
}

export class SlidingWindowTagParser extends EventEmitter {
  private phase: StreamPhase = "IDLE";
  private buffer: string = "";
  private readonly openTag: string;
  private readonly closeTag: string;
  private readonly stripFromContent: boolean;
  private readonly maxTagLen: number;

  constructor(options: StreamParserOptions = {}) {
    super();
    this.openTag = options.openTag || "<think>";
    this.closeTag = options.closeTag || "</think>";
    this.stripFromContent = options.stripFromContent ?? true;
    this.maxTagLen = Math.max(this.openTag.length, this.closeTag.length);
  }

  /**
   * Nạp một đoạn văn bản thô vừa đọc từ stdout vào máy trạng thái
   */
  public processChunk(incoming: string): ParsedStreamChunk[] {
    this.buffer += incoming;
    const outputEvents: ParsedStreamChunk[] = [];

    while (this.buffer.length > 0) {
      if (this.phase === "IDLE") {
        const openIdx = this.buffer.indexOf(this.openTag);

        if (openIdx !== -1) {
          // Văn bản trước openTag là content thường
          if (openIdx > 0) {
            outputEvents.push({ phase: "content", text: this.buffer.slice(0, openIdx) });
          }
          this.buffer = this.buffer.slice(openIdx + this.openTag.length);
          this.phase = "IN_REASONING";
          this.emit("phase_change", "IN_REASONING");
          continue;
        }

        // Kiểm tra xem đuôi buffer có phải là tiền tố tiềm năng của openTag không
        const matchLen = this.findCandidatePrefixLength(this.buffer, this.openTag);
        if (matchLen > 0) {
          // Xả phần an toàn trước tiền tố
          const safeLen = this.buffer.length - matchLen;
          if (safeLen > 0) {
            outputEvents.push({ phase: "content", text: this.buffer.slice(0, safeLen) });
            this.buffer = this.buffer.slice(safeLen);
          }
          // Giữ phần tiền tố lại trong buffer để đợi chunk sau
          break;
        }

        // Không có dấu hiệu của thẻ mở, toàn bộ buffer là content an toàn
        outputEvents.push({ phase: "content", text: this.buffer });
        this.buffer = "";
        break;
      }

      if (this.phase === "IN_REASONING") {
        const closeIdx = this.buffer.indexOf(this.closeTag);

        if (closeIdx !== -1) {
          // Toàn bộ chuỗi trước closeTag là reasoning
          if (closeIdx > 0) {
            outputEvents.push({ phase: "reasoning", text: this.buffer.slice(0, closeIdx) });
          }
          this.buffer = this.buffer.slice(closeIdx + this.closeTag.length);
          this.phase = "IN_CONTENT";
          this.emit("phase_change", "IN_CONTENT");
          continue;
        }

        // Kiểm tra xem đuôi buffer có phải là tiền tố của closeTag không
        const matchLen = this.findCandidatePrefixLength(this.buffer, this.closeTag);
        if (matchLen > 0) {
          const safeLen = this.buffer.length - matchLen;
          if (safeLen > 0) {
            outputEvents.push({ phase: "reasoning", text: this.buffer.slice(0, safeLen) });
            this.buffer = this.buffer.slice(safeLen);
          }
          break;
        }

        // Toàn bộ buffer hiện tại là reasoning
        outputEvents.push({ phase: "reasoning", text: this.buffer });
        this.buffer = "";
        break;
      }

      if (this.phase === "IN_CONTENT") {
        // Giai đoạn trả lời chính thức, toàn bộ token thuộc về content
        outputEvents.push({ phase: "content", text: this.buffer });
        this.buffer = "";
        break;
      }
    }

    return outputEvents;
  }

  /**
   * Xả sạch buffer còn đọng lại khi stream kết thúc
   */
  public flush(): ParsedStreamChunk[] {
    const outputEvents: ParsedStreamChunk[] = [];
    if (this.buffer.length > 0) {
      if (this.phase === "IN_REASONING") {
        outputEvents.push({ phase: "reasoning", text: this.buffer });
      } else {
        outputEvents.push({ phase: "content", text: this.buffer });
      }
      this.buffer = "";
    }
    return outputEvents;
  }

  public getPhase(): StreamPhase {
    return this.phase;
  }

  /**
   * Thuật toán kiểm tra tiền tố ứng viên:
   * Trả về độ dài lớn nhất của đuôi chuỗi `str` trùng khớp với phần đầu của `tag`
   */
  private findCandidatePrefixLength(str: string, tag: string): number {
    const maxCandidate = Math.min(str.length, tag.length - 1);
    for (let len = maxCandidate; len > 0; len--) {
      if (str.endsWith(tag.slice(0, len))) {
        return len;
      }
    }
    return 0;
  }
}
```

---

### 6.3 Động cơ Chuyển đổi Đa phương ngữ Cấp Giao thức (Multi-Dialect Wire Serializer)

Hỗ trợ đồng thời cả OpenAI API và Anthropic API Specs:

```typescript
// apps/gateway/src/stream/multi-dialect-serializer.ts

export type ClientProtocolDialect = "OPENAI_COMPATIBLE" | "ANTHROPIC_MESSAGES";

export interface SerializerOptions {
  completionId: string;
  model: string;
  created: number;
  dialect: ClientProtocolDialect;
}

export class MultiDialectStreamSerializer {
  private dialect: ClientProtocolDialect;
  private completionId: string;
  private model: string;
  private created: number;
  private hasStartedThinkingBlock: boolean = false;
  private hasEndedThinkingBlock: boolean = false;
  private hasStartedTextBlock: boolean = false;
  private textBlockIndex: number = 0;

  constructor(options: SerializerOptions) {
    this.dialect = options.dialect;
    this.completionId = options.completionId;
    this.model = options.model;
    this.created = options.created;
  }

  /**
   * Tạo payload SSE cho token Chuỗi suy nghĩ (Reasoning Chunk)
   */
  public serializeReasoningChunk(token: string): string {
    if (!token) return "";

    if (this.dialect === "OPENAI_COMPATIBLE") {
      const payload = {
        id: this.completionId,
        object: "chat.completion.chunk",
        created: this.created,
        model: this.model,
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              reasoning_content: token,
            },
            finish_reason: null,
          },
        ],
      };
      return `data: ${JSON.stringify(payload)}\n\n`;
    }

    // Anthropic Extended Thinking Blocks Wire Format
    let sseEvents = "";
    if (!this.hasStartedThinkingBlock) {
      this.hasStartedThinkingBlock = true;
      const startBlock = {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "thinking",
          thinking: "",
        },
      };
      sseEvents += `event: content_block_start\ndata: ${JSON.stringify(startBlock)}\n\n`;
    }

    const deltaBlock = {
      type: "content_block_delta",
      index: 0,
      delta: {
        type: "thinking_delta",
        thinking: token,
      },
    };
    sseEvents += `event: content_block_delta\ndata: ${JSON.stringify(deltaBlock)}\n\n`;

    return sseEvents;
  }

  /**
   * Tạo payload SSE cho token Nội dung trả lời chính thức (Content Chunk)
   */
  public serializeContentChunk(token: string): string {
    if (!token) return "";

    if (this.dialect === "OPENAI_COMPATIBLE") {
      const payload = {
        id: this.completionId,
        object: "chat.completion.chunk",
        created: this.created,
        model: this.model,
        choices: [
          {
            index: 0,
            delta: {
              content: token,
            },
            finish_reason: null,
          },
        ],
      };
      return `data: ${JSON.stringify(payload)}\n\n`;
    }

    // Anthropic Text Blocks Format
    let sseEvents = "";
    if (this.hasStartedThinkingBlock && !this.hasEndedThinkingBlock) {
      this.hasEndedThinkingBlock = true;
      const stopThinking = {
        type: "content_block_stop",
        index: 0,
      };
      sseEvents += `event: content_block_stop\ndata: ${JSON.stringify(stopThinking)}\n\n`;
      this.textBlockIndex = 1;
    }

    if (!this.hasStartedTextBlock) {
      this.hasStartedTextBlock = true;
      const startText = {
        type: "content_block_start",
        index: this.textBlockIndex,
        content_block: {
          type: "text",
          text: "",
        },
      };
      sseEvents += `event: content_block_start\ndata: ${JSON.stringify(startText)}\n\n`;
    }

    const deltaText = {
      type: "content_block_delta",
      index: this.textBlockIndex,
      delta: {
        type: "text_delta",
        text: token,
      },
    };
    sseEvents += `event: content_block_delta\ndata: ${JSON.stringify(deltaText)}\n\n`;

    return sseEvents;
  }

  /**
   * Kết thúc dòng stream hoàn chỉnh
   */
  public serializeDone(finishReason: string = "stop"): string {
    if (this.dialect === "OPENAI_COMPATIBLE") {
      const finalPayload = {
        id: this.completionId,
        object: "chat.completion.chunk",
        created: this.created,
        model: this.model,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: finishReason,
          },
        ],
      };
      return `data: ${JSON.stringify(finalPayload)}\ndata: [DONE]\n\n`;
    }

    let sseEvents = "";
    if (this.hasStartedThinkingBlock && !this.hasEndedThinkingBlock) {
      sseEvents += `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`;
    }
    if (this.hasStartedTextBlock) {
      sseEvents += `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: this.textBlockIndex })}\n\n`;
    }
    sseEvents += `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`;

    return sseEvents;
  }
}
```

---

### 6.4 Hạ tầng Đo kiểm Nhận thức (Cognitive Telemetry Bus & Real-Time TPS Tracker)

Theo dõi chặt chẽ từng token tư duy, tốc độ TPS và truyền qua SSE Admin Bus:

```typescript
// apps/gateway/src/stream/cognitive-telemetry-tracker.ts
import { globalAdminEventBus } from "../api/routes/admin-events.js";

export interface TelemetryConfig {
  completionId: string;
  adapterId: string;
  model: string;
  sampleIntervalMs?: number;
}

export class CognitiveTelemetryTracker {
  private completionId: string;
  private adapterId: string;
  private model: string;
  private sampleIntervalMs: number;

  private startTime: number = 0;
  private reasoningStartTime: number = 0;
  private reasoningEndTime: number = 0;
  private reasoningTokens: number = 0;
  private contentTokens: number = 0;

  private lastTpsSampleTime: number = 0;
  private lastTpsSampleTokens: number = 0;
  private currentTps: number = 0;

  constructor(config: TelemetryConfig) {
    this.completionId = config.completionId;
    this.adapterId = config.adapterId;
    this.model = config.model;
    this.sampleIntervalMs = config.sampleIntervalMs || 500;
  }

  public start(): void {
    this.startTime = Date.now();
    this.reasoningStartTime = Date.now();
    this.lastTpsSampleTime = this.reasoningStartTime;
    globalAdminEventBus.broadcast("reasoning:start", {
      completionId: this.completionId,
      adapterId: this.adapterId,
      model: this.model,
      timestamp: this.reasoningStartTime,
    });
  }

  /**
   * Ghi nhận một delta token tư duy (reasoning chunk)
   */
  public recordThoughtDelta(tokenText: string): void {
    const count = this.estimateTokenCount(tokenText);
    this.reasoningTokens += count;
    const now = Date.now();
    const elapsedSinceLastSample = now - this.lastTpsSampleTime;

    if (elapsedSinceLastSample >= this.sampleIntervalMs) {
      const deltaTokens = this.reasoningTokens - this.lastTpsSampleTokens;
      this.currentTps = Number(((deltaTokens / elapsedSinceLastSample) * 1000).toFixed(1));
      this.lastTpsSampleTime = now;
      this.lastTpsSampleTokens = this.reasoningTokens;
    }

    const elapsedTotalMs = now - this.reasoningStartTime;

    // Phát sóng sự kiện đo kiểm chi tiết
    globalAdminEventBus.broadcast("chunk:thought", {
      completionId: this.completionId,
      adapterId: this.adapterId,
      model: this.model,
      phase: "reasoning",
      tokenDelta: count,
      deltaText: tokenText,
      accumulatedTokens: this.reasoningTokens,
      elapsedMs: elapsedTotalMs,
      tokenRateTps: this.currentTps,
    });
  }

  /**
   * Đánh dấu kết thúc pha reasoning, chuyển sang pha answer content
   */
  public transitionToContent(): void {
    this.reasoningEndTime = Date.now();
    const totalReasoningDurationMs = this.reasoningEndTime - this.reasoningStartTime;
    const overallTps = totalReasoningDurationMs > 0
      ? Number(((this.reasoningTokens / totalReasoningDurationMs) * 1000).toFixed(1))
      : 0;

    globalAdminEventBus.broadcast("reasoning:end", {
      completionId: this.completionId,
      adapterId: this.adapterId,
      model: this.model,
      durationMs: totalReasoningDurationMs,
      totalReasoningTokens: this.reasoningTokens,
      averageTps: overallTps,
    });
  }

  public recordContentDelta(tokenText: string): void {
    this.contentTokens += this.estimateTokenCount(tokenText);
  }

  public getSummaryMetrics() {
    const durationMs = (this.reasoningEndTime || Date.now()) - this.reasoningStartTime;
    return {
      reasoningTokens: this.reasoningTokens,
      contentTokens: this.contentTokens,
      reasoningDurationMs: durationMs,
      reasoningTps: durationMs > 0 ? Number(((this.reasoningTokens / durationMs) * 1000).toFixed(1)) : 0,
    };
  }

  private estimateTokenCount(text: string): number {
    if (!text) return 0;
    // Ước lượng chuẩn: 1 token ~ 3.8 ký tự đối với code/tiếng Anh
    return Math.max(1, Math.ceil(text.length / 3.8));
  }
}
```

---

### 6.5 Tích hợp Ingress Route (`/v1/chat/completions`)

Tích hợp trực tiếp máy trạng thái, bộ tuần tự hóa và bộ đo kiểm vào `apps/gateway/src/api/routes/openai-chat.ts`:

```typescript
// apps/gateway/src/api/routes/openai-chat.ts (Đoạn mã tích hợp chính)
import { SlidingWindowTagParser } from "../../stream/reasoning-stream-parser.js";
import { MultiDialectStreamSerializer } from "../../stream/multi-dialect-serializer.js";
import { CognitiveTelemetryTracker } from "../../stream/cognitive-telemetry-tracker.js";

// Trong luồng Streaming Response (SSE):
if (isStreaming) {
  const serializer = new MultiDialectStreamSerializer({
    completionId,
    model: requestedModel,
    created: createdTimestamp,
    dialect: "OPENAI_COMPATIBLE",
  });

  const telemetry = new CognitiveTelemetryTracker({
    completionId,
    adapterId: target.adapter.id,
    model: requestedModel,
  });

  const parserConfig = target.adapter.reasoning_parser;
  const tagParser = (parserConfig?.enabled && parserConfig.type === "tags")
    ? new SlidingWindowTagParser({
        openTag: parserConfig.tags_config?.open_tag,
        closeTag: parserConfig.tags_config?.close_tag,
        stripFromContent: parserConfig.tags_config?.strip_from_content,
      })
    : null;

  telemetry.start();

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
    "X-Debug-Provider": target.debugProvider,
  });

  let hasTransitionedToContent = false;

  await globalProcessManager.executeStreaming({
    adapter: target.adapter,
    account: target.account,
    modelId: target.actualModelId,
    messages,
    session: { /* ... */ },
    signal: abortController.signal,
    onDelta: (rawDelta: string) => {
      if (tagParser) {
        const parsedChunks = tagParser.processChunk(rawDelta);
        for (const chunk of parsedChunks) {
          if (chunk.phase === "reasoning") {
            reply.raw.write(serializer.serializeReasoningChunk(chunk.text));
            telemetry.recordThoughtDelta(chunk.text);
          } else {
            if (!hasTransitionedToContent) {
              hasTransitionedToContent = true;
              telemetry.transitionToContent();
            }
            reply.raw.write(serializer.serializeContentChunk(chunk.text));
            telemetry.recordContentDelta(chunk.text);
            globalAdminEventBus.broadcast("chunk:delta", { id: completionId, content: chunk.text });
          }
        }
      } else {
        // Fallback bình thường nếu không cấu hình reasoning parser
        reply.raw.write(serializer.serializeContentChunk(rawDelta));
        globalAdminEventBus.broadcast("chunk:delta", { id: completionId, content: rawDelta });
      }
    },
  });

  // Xả dữ liệu còn tồn trong buffer
  if (tagParser) {
    const remaining = tagParser.flush();
    for (const chunk of remaining) {
      if (chunk.phase === "reasoning") {
        reply.raw.write(serializer.serializeReasoningChunk(chunk.text));
      } else {
        reply.raw.write(serializer.serializeContentChunk(chunk.text));
      }
    }
  }

  reply.raw.write(serializer.serializeDone());
  reply.raw.end();
}
```

---

### 6.6 Nâng cấp Giao diện Live Inspector Cyberdeck Studio (`LiveInspectorView.tsx`)

Mở rộng `apps/web/src/views/LiveInspectorView.tsx` với cột chuyên dụng: **"Cognitive Thought Stream & Real-Time TPS Speedometer"**:

```tsx
// apps/web/src/views/LiveInspectorView.tsx (Mở rộng cho Cognitive Telemetry)
import React, { useState, useEffect } from "react";
import { Activity, BrainCircuit, Gauge, ChevronDown, ChevronRight, Zap } from "lucide-react";

interface ThoughtEvent {
  id: string;
  completionId: string;
  adapterId: string;
  model: string;
  phase: string;
  tokenDelta: number;
  deltaText: string;
  accumulatedTokens: number;
  elapsedMs: number;
  tokenRateTps: number;
  timestamp: number;
}

export function LiveInspectorReasoningExtension() {
  const [thoughts, setThoughts] = useState<ThoughtEvent[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentTps, setCurrentTps] = useState(0);
  const [totalThoughtTokens, setTotalThoughtTokens] = useState(0);
  const [elapsedDuration, setElapsedDuration] = useState(0);

  useEffect(() => {
    const es = new EventSource("/api/admin/events");
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.type === "chunk:thought") {
          const data = payload.data as ThoughtEvent;
          setCurrentTps(data.tokenRateTps);
          setTotalThoughtTokens(data.accumulatedTokens);
          setElapsedDuration(data.elapsedMs);
          setThoughts((prev) => [...prev.slice(-200), data]);
        }
      } catch {}
    };
    return () => es.close();
  }, []);

  return (
    <div className="flex flex-col h-full rounded-xl bg-surface border border-borderSubtle overflow-hidden">
      {/* Header telemetry nhận thức */}
      <div className="px-4 py-2.5 bg-[#141822] border-b border-borderSubtle flex items-center justify-between font-mono text-xs">
        <div className="flex items-center space-x-2 text-cyan-400">
          <BrainCircuit className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span className="font-semibold tracking-wider uppercase">Cognitive Reasoning Stream</span>
        </div>
        
        {/* Speedometer & Stats */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/30 text-cyan-300">
            <Gauge className="w-3.5 h-3.5" />
            <span className="font-bold">{currentTps}</span>
            <span className="text-[10px] text-cyan-500">TPS</span>
          </div>

          <div className="text-[11px] text-slate-400">
            <span>Tokens: </span>
            <span className="text-amber-400 font-bold">{totalThoughtTokens}</span>
          </div>

          <div className="text-[11px] text-slate-400">
            <span>Duration: </span>
            <span className="text-emerald-400 font-bold">{(elapsedDuration / 1000).toFixed(1)}s</span>
          </div>

          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 text-slate-400 hover:text-white"
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Stream Viewer */}
      {!isCollapsed && (
        <div className="flex-1 p-4 bg-canvas font-mono text-xs text-slate-300 overflow-y-auto space-y-2">
          {thoughts.length === 0 ? (
            <div className="text-slate-600 text-center py-16 flex flex-col items-center space-y-2">
              <Zap className="w-6 h-6 text-slate-700" />
              <span>Awaiting model reasoning phase... Thought tokens will stream here in real-time.</span>
            </div>
          ) : (
            <div className="p-3 rounded-lg bg-[#0F131C] border border-cyan-950 text-cyan-200/90 whitespace-pre-wrap leading-relaxed">
              {thoughts.map((t) => t.deltaText).join("")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## 7. Kế hoạch Xác minh & Lộ trình Triển khai (Verification & Phased Rollout)

### Giai đoạn 1: Triển khai Thư viện Lõi & Kiểm thử Đơn vị (Unit Testing)
- **Mục tiêu:** Xây dựng `SlidingWindowTagParser`, `MultiDialectStreamSerializer`, và cập nhật Zod schema trong `schema.ts`.
- **Kiểm thử Bắt buộc:**
  - `tests/unit/reasoning-tag-parser.test.ts`:
    1. Kiểm tra 100 ca phân cắt chunk ngẫu nhiên (fuzz testing) ở các vị trí `<th`, `ink>`, `</th`, `ink>`. Xác nhận không rò rỉ bất kỳ thẻ nào.
    2. Kiểm tra stream có văn bản xen kẽ: `Content 1 -> <think>Reasoning</think> -> Content 2`.
  - `tests/unit/multi-dialect-serializer.test.ts`:
    1. Kiểm tra payload OpenAI SSE chứa `delta.reasoning_content`.
    2. Kiểm tra chuỗi sự kiện Anthropic Messages SSE (`content_block_start`, `thinking_delta`, `text_delta`).

### Giai đoạn 2: Tích hợp Process Supervisor & Declarative YAML
- **Mục tiêu:** Cập nhật các tệp `adapters/claude-code.yaml`, `codex-cli.yaml`, `opencode-cli.yaml` với cấu hình `reasoning_parser`.
- **Kiểm thử:**
  - Chạy mô phỏng adapter với `mock-spinner-cli.js` được cấu hình xuất thẻ `<think>` giả lập.
  - Đo đạc độ trễ overhead qua benchmark: đảm bảo bổ sung parser chỉ làm tăng thêm $\le 0.3\text{ms}$ trên mỗi $1,000$ chunks.

### Giai đoạn 3: Telemetry Event Bus & Live Inspector Cyberdeck Studio
- **Mục tiêu:** Tích hợp `CognitiveTelemetryTracker` vào `/v1/chat/completions` và cập nhật view `LiveInspectorView.tsx` trên web frontend.
- **Kiểm thử Nghiệm thu (E2E Acceptance):**
  - Mở đồng thời Live Inspector trên trình duyệt Chrome.
  - Gửi prompt toán học hoặc lập trình phức tạp từ Open WebUI hoặc Postman.
  - Quan sát:
    1. Live Inspector hiển thị đồng hồ đo TPS thời gian thực đạt tốc độ $\ge 120\text{ tokens/s}$.
    2. Pha tư duy đổi màu và hiển thị chính xác trong khung tư duy.
    3. Trình duyệt Open WebUI nhận `reasoning_content` và hiển thị hộp tư duy thu gọn tự nhiên chuẩn xác $100\%$.

---

## 8. Kết luận Bounded Contract của Candidate 2

Đề xuất của **Candidate 2** giải quyết dứt điểm sự hỗn loạn trong việc xử lý Chuỗi suy nghĩ (Reasoning) của các công cụ AI CLI hiện đại:
1. **Chuẩn hóa Giao thức Cấp cao (Protocol-Level Fidelity):** Đưa `cli-to-api` trở thành một Gateway thực thụ, đứng vững giữa thế giới CLI dị biệt và các chuẩn giao diện Web/IDE khắt khe.
2. **Kiến trúc Khai báo Thuần túy (Zero Code Modification Extensibility):** Tách biệt triệt để mã nguồn Gateway và cấu hình CLI, cho phép cộng đồng dễ dàng mở rộng bất kỳ mô hình suy luận nào chỉ qua tệp YAML.
3. **Minh bạch Hóa Hoàn toàn Quá trình Tư duy (Radical Telemetry Observability):** Biến Live Inspector thành một Cyberdeck Studio chuyên nghiệp, mang lại sự tin cậy tuyệt đối cho người vận hành hệ thống.
