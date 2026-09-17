---
type: architectural-brainstorm
date: 2026-09-16
mode: ak-brainstorm --ultra
lead_verifier: Kongming
winning_candidate: Candidate D (Candidate 4)
status: accepted
target: cli-to-api
tags: [reasoning, think, cot, sse, stream-demuxer, sqlite-wal, cyberdeck-ui]
---

# Báo Cáo Kiến Trúc & Hợp Đồng Bounded: Bộ Tách Luồng Suy Nghĩ Kép (Dual-Channel Deep Reasoning Demuxer), Kế Toán Token Hai Tầng & Obsidian Cyberdeck Playground

## Tóm Tắt Điều Hành (Executive Summary)

Sự chuyển dịch của các mô hình AI thế hệ 2025–2026 (DeepSeek-R1, OpenAI o1/o3/GPT-5.6, Claude 3.7 Sonnet Extended Thinking, Grok 3, Qwen-QwQ) đã biến **Chuỗi tư duy (Chain-of-Thought / Reasoning)** thành thành phần thiết yếu của tương tác AI. Thay vì trả về văn bản trực tiếp, các mô hình này phát sinh hàng trăm đến hàng chục ngàn token suy luận trước khi đưa ra câu trả lời cuối cùng.

Trong hệ thống `cli-to-api` hiện tại, toàn bộ luồng xuất từ CLI được đẩy qua `DualStageAnsiSanitizer` và chuyển tiếp phẳng thẳng vào trường `choices[0].delta.content` của Server-Sent Events (SSE). Kiến trúc này gặp phải **4 khiếm khuyết cơ cấu**:
1. **Ô Nhiễm Nội Dung Luồng Đơn (Single-Channel Content Pollution):** Các thẻ suy nghĩ (`<think>...</think>`, `<thought>...</thought>`) bị trộn lẫn trực tiếp vào nội dung trả lời chính. Điều này làm hỏng giao diện của các Web Chat UI (Open WebUI, LibreChat, Chatbox, Cursor) vốn mong đợi trường tách biệt chuẩn hóa `delta.reasoning_content`, và gây lỗi cú pháp (syntax/diff errors) cho các AI coding agent như Cursor/Continue.
2. **Mù Lòa Kế Toán Token (Token Accounting Blindness):** Hàm `estimateTokenUsage()` chỉ ước lượng gộp `prompt_tokens` và `completion_tokens`. Hệ thống không tách bạch được **Reasoning Tokens** khỏi **Completion Tokens**, vi phạm đặc tả mở rộng chuẩn của OpenAI (`completion_tokens_details.reasoning_tokens`).
3. **Mất Mát Dấu Vết Tư Duy (Ephemeral Reasoning Loss):** Hàng ngàn token suy luận có giá trị cao bị bốc hơi hoàn toàn khi tiến trình CLI thoát. Không có cơ chế lưu vết `thinking_history` phục vụ kiểm toán logic và gỡ lỗi prompt.
4. **Trải Nghiệm Playground Khiếm Khuyết:** `PlaygroundView.tsx` hiện tại là một khung text phẳng thô sơ, bỏ qua trường `reasoning_content`, không có đồng hồ đếm thời gian suy luận (Thinking Timer), và không có khối hiển thị chuỗi suy luận có thể đóng/mở (collapsible accordion).

Hợp đồng này thiết lập giải pháp chiến thắng từ quy trình thẩm định **`ak-brainstorm --ultra` (Best-of-5 Verifier)** do Lead Verifier **Kongming** phê duyệt: **Kiến Trúc Phân Luồng Kép Cấp Supervisor (Dual-Channel Event Demuxing)**, tích hợp bộ máy trạng thái FSM $O(1)$ memory, lưu vết SQLite WAL, kế toán token hai tầng và nâng cấp toàn diện Obsidian Cyberdeck Playground.

---

## 1. Outcome (Kết Quả Mục Tiêu & Sơ Đồ Hệ Thống)

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         INGRESS CLIENT PLANE                                           │
│  Open WebUI, LibreChat, Chatbox, Cursor, Continue.dev, Vanilla OpenAI SDK (POST /v1/chat/completions)  │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│  Headers: `x-reasoning-format: separate | inline | strip` (Negotiation)                                │
│  Body: { model, messages, stream: true }                                                               │
└───────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  MULTI-TURN CONTEXT DECONTAMINATION                                    │
│  `content-normalizer.ts`: Tự động gọt bỏ thẻ <think> cũ khỏi lịch sử trò chuyện gửi xuống CLI         │
│  (Tiết kiệm 30% - 70% Context Window & ngăn ngừa ô nhiễm ngữ cảnh)                                     │
└───────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                    │
                                                    ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                PROCESS SUPERVISOR & NATIVE CLI SPAWN                                   │
│  Spawn: DeepSeek-R1 / Claude 3.7 Extended Thinking / Codex CLI / OMP Reasoning                         │
│  Stdout Stream ──► Utf8StreamDecoder (Multi-byte) ──► DualStageAnsiSanitizer (Strip ANSI & \r)         │
└───────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                    │ Clean text chunks
                                                    ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                        UNIVERSAL FSM STREAMING DEMUXER (O(1) MEMORY, ZERO LAG)                         │
│                                                                                                        │
│  • Suffix-Prefix Sliding Window (findCandidatePrefixLength): Ngăn ngừa 100% vỡ thẻ qua biên chunk TCP  │
│  • Nesting Depth Counter (nestingDepth): Xử lý thẻ lồng nhau chính xác                                 │
│  • Auto-Close & Flush on EOF: Tự động đóng thẻ suy nghĩ an toàn nếu tiến trình bị crash đột ngột      │
└───────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                    │
                         ┌──────────────────────────┴──────────────────────────┐
                         ▼                                                     ▼
        ┌──────────────────────────────────┐                 ┌───────────────────────────────────┐
        │         THOUGHT CHANNEL          │                 │          CONTENT CHANNEL          │
        │    (onThoughtDelta callback)     │                 │     (onContentDelta callback)     │
        └────────────────┬─────────────────┘                 └─────────────────┬─────────────────┘
                         │                                                     │
                         ▼                                                     ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   FASTIFY WIRE SERIALIZER ENGINE                                       │
│                                                                                                        │
│  • Streaming SSE:                                                                                      │
│    - Thinking Phase ──► data: {"choices":[{"delta":{"reasoning_content":"..."}}]}                      │
│    - Answer Phase   ──► data: {"choices":[{"delta":{"content":"..."}}]}                                │
│  • Unary JSON (Non-streaming):                                                                         │
│    - choices[0].message = { role: "assistant", content: "...", reasoning_content: "..." }              │
│  • Usage Accounting:                                                                                   │
│    - usage: { completion_tokens_details: { reasoning_tokens: 420 } }                                   │
│  • Telemetry: Broadcast `chunk:thought` (Live TPS, accumulated tokens) qua Admin Event Bus            │
│  • Persistence: Ghi nhận vĩnh viễn vào SQLite WAL `thinking_history` & cập nhật `request_metrics`      │
└───────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                    │
                         ┌──────────────────────────┴──────────────────────────┐
                         ▼                                                     ▼
        ┌──────────────────────────────────┐                 ┌───────────────────────────────────┐
        │      UPSTREAM OPENAI CLIENT      │                 │      OBSIDIAN CYBERDECK UI        │
        │   (Open WebUI / LibreChat /      │                 │   (Live Milliseconds Timer,       │
        │    Cursor / Continue / SDK)      │                 │    Glowing Radar Pulse Accordion, │
        │   Render Collapsible Thought Box │                 │    Copy Reasoning, Dual Metrics)  │
        └──────────────────────────────────┘                 └───────────────────────────────────┘
```

---

## 2. Constraints (Ràng Buộc Kỹ Thuật Bắt Buộc)

1. **Tuân Thủ Chuẩn Mở OpenAI Wire Protocol 100%:**
   - Trường `delta.content` phải hoàn toàn sạch bóng các thẻ `<think>`, bảo đảm an toàn tuyệt đối cho các AI coding agent (Cursor, Continue, Cline) không bị sinh lỗi cú pháp code.
   - Token suy luận trong luồng stream phải được truyền tải qua trường chuẩn `choices[0].delta.reasoning_content` (chuẩn công nghiệp DeepSeek-R1 / OpenAI / Open WebUI).
   - Trong phản hồi Unary (non-streaming), trả về đồng thời `message.content` sạch và `message.reasoning_content`.
2. **Cam Kết Không Gây Trễ Luồng (Zero-Buffer Latency $\le 0.5\text{ms}$):**
   - Tuyệt đối không được đệm toàn bộ chuỗi suy luận vào bộ nhớ RAM rồi mới dùng Regex bóc tách. Mọi token suy luận nhận được từ CLI phải được xả ngay lập tức qua SSE chunk với chi phí trễ phân luồng $\le 0.5\text{ms}$.
   - Kích thước bộ đệm phân tích tiền tố thẻ (Sliding Lookahead Buffer) bị chặn cứng ở mức $W \le 16\text{ bytes}$, duy trì chi phí bộ nhớ hằng số $O(1)$.
3. **Bảo Toàn Ký Tự Tuyệt Đối & Khôi Phục Tiền Tố Giả (Zero-Token-Loss Guarantee):**
   - Khi gặp chuỗi toán học hoặc ký tự so sánh như `x < this and y > 2`, ngay khi xác định không khớp thẻ suy nghĩ, bộ parser phải lập tức xả toàn bộ ký tự trong buffer ra luồng nội dung theo đúng thứ tự ban đầu, không được nuốt chửng ký tự.
4. **An Toàn Đa Luồng Cơ Sở Dữ Liệu (SQLite WAL Concurrency):**
   - Quá trình ghi nhận dấu vết tư duy (`thinking_history`) vào SQLite không được gây khóa tắc nghẽn (`SQLITE_BUSY`) với router hoặc bộ theo dõi cooldown. Ghi bất đồng bộ qua WAL mode với thời gian thực thi $\le 5\text{ms}$.
5. **Tiêu Diệt Tiến Trình Treo Trong $\le 200\text{ms}$ Khi Client Abort:**
   - Khi client ngắt kết nối HTTP hoặc bấm Stop trên Playground, `AbortController` lập tức kích hoạt thu hồi sạch toàn bộ cây tiến trình CLI trong vòng $\le 200\text{ms}$ thông qua Win32 Job Object hoặc POSIX Process Group.

---

## 3. Non-goals (Các Phạm Vi Loại Trừ)

1. **Không Tự Động Sinh Reasoning Giả Lập:** Gateway không tự tạo ra chuỗi suy nghĩ nếu CLI bên dưới là mô hình không hỗ trợ reasoning. Gateway chỉ là bộ chuyển tiếp và phân tách trung thực.
2. **Không Can Thiệp Ngữ Nghĩa Chuỗi Tư Duy:** Gateway không lọc bỏ hay biên tập lại các bước giải toán/suy luận của mô hình; chuỗi CoT được truyền nguyên vẹn phục vụ kiểm toán và debug.
3. **Không Phân Tán Đa Cụm (Distributed Cloud Sync):** Toàn bộ dữ liệu SQLite được quản lý cục bộ trên host server hiện tại, không xây dựng hạ tầng đồng bộ cluster đa node.
4. **Không Thay Thế Code Editor Độc Lập:** Playground trong Web Console chỉ phục vụ kiểm thử prompt, đo đạc latency và thẩm định chất lượng suy luận, không thay thế VS Code hay Web IDE.

---

## 4. Acceptance Criteria (Tiêu Chí Nghiệm Thu Sắc Bén)

### AC-1: Bóc Tách Luồng Kép Thời Gian Thực Chuẩn OpenAI SSE
- **Given:** CLI phát ra chuỗi stdout: `<think>Phân tích bài toán: tính dãy Fibonacci.</think>Dưới đây là thuật toán O(N)...`.
- **When:** Client gửi yêu cầu `POST /v1/chat/completions` với `stream: true`.
- **Then:**
  1. Các gói tin SSE trong pha 1 phát ra: `{"choices":[{"delta":{"reasoning_content":"..."}}]}`.
  2. Tuyệt đối không có thẻ `<think>` hoặc `</think>` xuất hiện trong `reasoning_content` hay `content`.
  3. Ngay khi gặp `</think>`, gói tin SSE chuyển tức thì sang pha 2: `{"choices":[{"delta":{"content":"..."}}]}`.
  4. Luồng kết thúc an toàn bằng `data: [DONE]\n\n`.

### AC-2: Hàn Gắn Thẻ Bị Chẻ Đôi Qua Ranh Giới Chunk Mạng (Split-Tag Boundary)
- **Given:** Luồng dữ liệu TCP/PTY bị cắt thành các chunk phân mảnh:
  - Chunk 1: `"Khởi đầu suy nghĩ: <thi"`
  - Chunk 2: `"nk>Bước 1: Tính delta.</thi"`
  - Chunk 3: `"nk>Kết quả cuối cùng là 42."`
- **When:** Bộ demuxer xử lý luồng qua cửa sổ trượt (lookahead sliding window).
- **Then:**
  1. Chuỗi `"Khởi đầu suy nghĩ: "` được phát ra ngay lập tức dưới dạng `content`.
  2. Đoạn `"<thi"` được giữ lại trong lookahead buffer và ghép thành `"<think>"` khi Chunk 2 tới.
  3. Chuỗi `"Bước 1: Tính delta."` được phát ra dưới dạng `reasoning_content`.
  4. Đoạn `"</thi"` được giữ lại và ghép thành `"</think>"` khi Chunk 3 tới.
  5. Chuỗi `"Kết quả cuối cùng là 42."` được phát ra dưới dạng `content`.
  6. Không rò rỉ bất kỳ mảnh vỡ thẻ nào ra ngoài client.

### AC-3: Xử Lý Ngoại Lệ Thẻ Lồng Nhau & Mất Đóng Tại EOF (Nested & Unclosed Tag Recovery)
- **Given:** Một mô hình phát sinh thẻ lồng nhau `<think> A <think> B </think> C </think>` hoặc tiến trình CLI bị tắt đột ngột khi chưa kịp phát `</think>`.
- **When:** Stream xử lý và kích hoạt `demuxer.flush()` tại sự kiện EOF:
  1. Thẻ lồng nhau được xử lý an toàn nhờ bộ đếm `nestingDepth`, không bị cắt cụt suy nghĩ sớm.
  2. Khi EOF xảy ra mà trạng thái vẫn ở `THINKING`, demuxer tự động xả toàn bộ dữ liệu dở dang vào `reasoning_content`, đóng trạng thái an toàn và không làm mất bất kỳ ký tự nào của người dùng.

### AC-4: Kế Toán Token Hai Tầng & Ghi Nhận Dấu Vết SQLite WAL
- **Given:** Một phiên suy luận hoàn tất với 450 ký tự suy luận và 300 ký tự câu trả lời.
- **When:** Request kết thúc thành công:
  1. Payload SSE cuối cùng hoặc JSON response chứa cấu trúc usage chuẩn OpenAI:
     ```json
     "usage": {
       "prompt_tokens": 50,
       "completion_tokens": 150,
       "total_tokens": 200,
       "completion_tokens_details": {
         "reasoning_tokens": 90
       }
     }
     ```
  2. Bảng `thinking_history` tạo mới bản ghi lưu trữ toàn văn `thought_content`, `thought_tokens`, `thought_duration_ms`, `thought_hash`, liên kết với `request_id`.
  3. Bảng `request_metrics` cập nhật chính xác `reasoning_tokens` và `thought_duration_ms`.

### AC-5: Khử Nhiễm Ngữ Cảnh Đa Lượt (Multi-Turn Context Decontamination)
- **Given:** Mảng `messages` gửi lên từ client chứa tin nhắn cũ của assistant:
  `{"role": "assistant", "content": "<think>Bước suy luận cũ...</think>Câu trả lời lượt trước."}`
- **When:** `normalizeMessagesForCli(messages)` được triệu gọi trước khi spawn CLI:
- **Then:** Khối `<think>Bước suy luận cũ...</think>` bị cắt bỏ hoàn toàn, chỉ giữ lại `"Câu trả lời lượt trước."`, bảo toàn tối đa context window cho CLI.

### AC-6: Đàm Phán Giao Thức Linh Hoạt (Wire Mode Negotiation)
- **Given:** Client gửi request kèm header `x-reasoning-format`:
  - `separate` (mặc định): Tách `delta.reasoning_content` và `delta.content`.
  - `inline`: Đóng gói lại chuỗi suy luận trong thẻ `<think>` bên trong `delta.content` (phục vụ client cũ).
  - `strip`: Loại bỏ hoàn toàn khối suy luận, chỉ phát câu trả lời chính thức (phục vụ Cursor/Cline).
- **When:** Gateway xử lý stream:
- **Then:** Gateway xuất đúng định dạng dây tương ứng với thỏa thuận.

### AC-7: Trải Nghiệm Obsidian Cyberdeck Playground
- **Given:** Người dùng kích hoạt prompt trên giao diện `/playground` với model suy luận.
- **When:** Stream đổ về:
  1. Trong pha suy luận: Khối Accordion viền tím phát sáng (`border-violet-500/50 shadow-violet-900/20`) tự động bung mở, hiển thị đồng hồ bấm giờ live mili-giây (`Thinking... 4.2s`) kèm huy hiệu radar pulse nhấp nháy.
  2. Khi chuyển sang pha trả lời: Tiêu đề đổi thành `Thought for 6.8s (380 reasoning tokens)` và chốt thời gian.
  3. Câu trả lời chính bắt đầu render mượt mà bên dưới.
  4. Người dùng bấm `"Copy Reasoning"`: Toàn bộ nội dung suy luận được sao chép vào clipboard kèm thông báo toast.
  5. Thanh số liệu (`ExecutionMetricsBar`) hiển thị trực quan: TTFR, TTFT, Thinking Time ($T_{\text{thought}}$), Generation Time ($T_{\text{gen}}$), và Tốc độ Tokens/giây.

---

## 5. Bảng So Sánh Các Hướng Tiếp Cận & Ma Trận Thẩm Định

| Tiêu Chí Đánh Giá | Tiếp Cận 1: Blind Passthrough (Hiện trạng) | Tiếp Cận 2: Full-Buffer Regex (Ngây thơ) | Tiếp Cận Chiến Thắng: Dual-Channel Supervisor FSM & Cyberdeck UI |
| :--- | :--- | :--- | :--- |
| **Độ Trễ Phân Luồng (TTFT / TTFR)** | Nhanh nhưng nội dung lẫn lộn rác `<think>`. | **Thảm họa:** Bóp nghẹt streaming, độ trễ tăng vọt từ 200ms lên 30s-90s vì phải đợi hết khối `<think>`. | **Tối ưu tuyệt đối ($\le 0.5\text{ms}$):** Phát ngay lập tức từng token qua FSM, TTFR $\le 200\text{ms}$. |
| **Bảo Vệ Biên Thẻ Chẻ Đôi (Split Chunk)** | Không quan tâm. | Không bị vì gom toàn bộ vào memory. | **Hoàn hảo:** Sliding window buffer loại bỏ 100% rủi ro thẻ vỡ. |
| **Độ Sạch Của Content Stream** | **Ô nhiễm:** Trộn lẫn thẻ XML vào code/text. | Sạch, nhưng mất tính chất streaming. | **Sạch 100%:** Phân tách độc lập hoàn toàn giữa `ThoughtChannel` và `ContentChannel`. |
| **Kế Toán Token Hai Tầng** | Không hỗ trợ. | Ước lượng thô sau khi hoàn tất. | **Độc lập và chính xác:** Đo lường `completion_tokens_details.reasoning_tokens`. |
| **Lưu Trữ Dấu Vết SQLite WAL** | Không có (bị bốc hơi khi CLI thoát). | Không có. | **Bền vững:** Ghi nhận vào `thinking_history` liên kết với Thread và Metrics. |
| **Trải Nghiệm Web UI Playground** | Khung textarea phẳng, không hiển thị reasoning. | Giao diện bị đơ cả phút rồi hiện một cục text. | **Obsidian Cyberdeck Pro Max:** Accordion phát sáng, live timer, copy action, dual metrics bar. |
| **Điều Kiện Thất Bại Đầu Tiên** | Coding agent (Cursor) đọc nhầm thẻ `<think>` thành code cú pháp thực tế. | Khối reasoning dài >32k tokens làm tràn bộ nhớ Node.js hoặc timeout reverse proxy. | CLI sử dụng định dạng tag tùy biến chưa khai báo (được phòng ngừa bằng fallback parser). |

---

## 6. Hướng Tiếp Cận & Đặc Tả Kỹ Thuật Chi Tiết

### 6.1 Phân Tách Kênh Đôi Cấp Supervisor (`apps/gateway/src/supervisor/`)

Mở rộng `types.ts` để hỗ trợ kênh đôi độc lập:
```typescript
export interface ProcessSpawnOptions {
  executable: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  executionMode?: "pty" | "pipe";
  stdinContent?: string;
  signal?: AbortSignal;
  timeoutSeconds?: number;
  onDelta?: (chunk: string) => void;         // Fallback tương thích ngược
  onThoughtDelta?: (chunk: string) => void;  // Kênh chuỗi tư duy
  onContentDelta?: (chunk: string) => void;  // Kênh câu trả lời sạch
  onError?: (errText: string) => void;
}

export interface ProcessExecutionResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  aborted: boolean;
  rateLimitDetected?: { isRateLimited: boolean; cooldownSeconds: number };
  capturedSessionId?: string;
  thoughtDurationMs?: number;
  thoughtContent?: string;
  cleanContent?: string;
  reasoningTokens?: number;
}
```

### 6.2 Module Máy Trạng Thái FSM (`apps/gateway/src/stream/thinking-demuxer.ts`)

```typescript
export type ReasoningWireMode = "separate" | "inline" | "strip";

export interface ThinkingDemuxerCallbacks {
  onThoughtDelta: (token: string) => void;
  onContentDelta: (token: string) => void;
  onPhaseChange?: (phase: "IDLE" | "THINKING" | "CONTENT") => void;
}

export class ThinkingDemuxer {
  private phase: "IDLE" | "THINKING" | "CONTENT" = "IDLE";
  private buffer = "";
  private nestingDepth = 0;
  private readonly openTag: string;
  private readonly closeTag: string;
  private readonly mode: ReasoningWireMode;
  private readonly callbacks: ThinkingDemuxerCallbacks;

  public accumulatedThought = "";
  public accumulatedContent = "";
  public thoughtStartTime: number | null = null;
  public thoughtEndTime: number | null = null;

  constructor(callbacks: ThinkingDemuxerCallbacks, options: { openTag?: string; closeTag?: string; mode?: ReasoningWireMode } = {}) {
    this.callbacks = callbacks;
    this.openTag = options.openTag || "<think>";
    this.closeTag = options.closeTag || "</think>";
    this.mode = options.mode || "separate";
  }

  public feed(chunk: string): void {
    if (!chunk) return;
    this.buffer += chunk;

    while (this.buffer.length > 0) {
      if (this.phase === "IDLE") {
        const openIdx = this.buffer.indexOf(this.openTag);
        if (openIdx !== -1) {
          if (openIdx > 0) this.emitContent(this.buffer.slice(0, openIdx));
          this.buffer = this.buffer.slice(openIdx + this.openTag.length);
          this.phase = "THINKING";
          this.nestingDepth = 1;
          this.thoughtStartTime = this.thoughtStartTime || Date.now();
          this.callbacks.onPhaseChange?.("THINKING");
          continue;
        }

        const matchLen = this.findCandidatePrefixLength(this.buffer, this.openTag);
        if (matchLen > 0) {
          const safeLen = this.buffer.length - matchLen;
          if (safeLen > 0) {
            this.emitContent(this.buffer.slice(0, safeLen));
            this.buffer = this.buffer.slice(safeLen);
          }
          break;
        }

        this.emitContent(this.buffer);
        this.buffer = "";
        break;
      }

      if (this.phase === "THINKING") {
        const closeIdx = this.buffer.indexOf(this.closeTag);
        const openIdx = this.buffer.indexOf(this.openTag);

        if (openIdx !== -1 && (closeIdx === -1 || openIdx < closeIdx)) {
          this.emitThought(this.buffer.slice(0, openIdx + this.openTag.length));
          this.buffer = this.buffer.slice(openIdx + this.openTag.length);
          this.nestingDepth++;
          continue;
        }

        if (closeIdx !== -1) {
          if (closeIdx > 0) this.emitThought(this.buffer.slice(0, closeIdx));
          this.buffer = this.buffer.slice(closeIdx + this.closeTag.length);
          this.nestingDepth--;
          if (this.nestingDepth <= 0) {
            this.phase = "CONTENT";
            this.thoughtEndTime = Date.now();
            this.callbacks.onPhaseChange?.("CONTENT");
          }
          continue;
        }

        const matchLen = this.findCandidatePrefixLength(this.buffer, this.closeTag);
        if (matchLen > 0) {
          const safeLen = this.buffer.length - matchLen;
          if (safeLen > 0) {
            this.emitThought(this.buffer.slice(0, safeLen));
            this.buffer = this.buffer.slice(safeLen);
          }
          break;
        }

        this.emitThought(this.buffer);
        this.buffer = "";
        break;
      }

      if (this.phase === "CONTENT") {
        this.emitContent(this.buffer);
        this.buffer = "";
        break;
      }
    }
  }

  public flush(): void {
    if (this.buffer.length > 0) {
      if (this.phase === "THINKING") this.emitThought(this.buffer);
      else this.emitContent(this.buffer);
      this.buffer = "";
    }
    if (this.phase === "THINKING") {
      this.phase = "CONTENT";
      this.thoughtEndTime = Date.now();
      this.callbacks.onPhaseChange?.("CONTENT");
    }
  }

  private findCandidatePrefixLength(str: string, targetTag: string): number {
    const maxMatch = Math.min(str.length, targetTag.length - 1);
    for (let len = maxMatch; len > 0; len--) {
      if (str.endsWith(targetTag.slice(0, len))) return len;
    }
    return 0;
  }

  private emitThought(text: string): void {
    if (!text) return;
    this.accumulatedThought += text;
    if (this.mode === "separate") this.callbacks.onThoughtDelta(text);
    else if (this.mode === "inline") this.callbacks.onContentDelta(text);
  }

  private emitContent(text: string): void {
    if (!text) return;
    this.accumulatedContent += text;
    this.callbacks.onContentDelta(text);
  }
}
```

### 6.3 Mở Rộng Schema Cơ Sở Dữ Liệu SQLite WAL (`thinking_history`)

Trong `apps/gateway/src/db/schema.ts`:
```typescript
export const thinkingHistory = sqliteTable("thinking_history", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  threadId: text("thread_id"),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
  adapterId: text("adapter_id").notNull(),
  modelId: text("model_id").notNull(),
  thoughtContent: text("thought_content").notNull(),
  thoughtHash: text("thought_hash").notNull(),
  thoughtTokens: integer("thought_tokens").notNull().default(0),
  thoughtDurationMs: integer("thought_duration_ms").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
```

Cập nhật `request_metrics`:
- Thêm cột `reasoning_tokens INTEGER NOT NULL DEFAULT 0`
- Thêm cột `thought_duration_ms INTEGER NOT NULL DEFAULT 0`

---

## 7. Ultra Verifier Appendix (Bảng Điểm Thẩm Định Của Kongming)

*Bảng tổng sắp Best-of-5 do Lead Architectural Verifier (Kongming) chấm độc lập (Thang điểm 1–20 mỗi tiêu chí, tối đa 80):*

| Hạng | Ứng Viên | Tôn Trọng Request (1-20) | Khả Thi Kỹ Thuật (1-20) | Tiêu Chí Sắc Bén (1-20) | Trung Thực Rủi Ro (1-20) | Tổng Điểm | Phán Quyết Kỹ Thuật |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| 🥇 | **Candidate D (Thắng cuộc)** | **20** | **19** | **19** | **19** | **77 / 80** | **Kiến trúc chiến thắng chính thức (Adopt as Core Architecture)** |
| 🥈 | Candidate B | 18 | 19 | 18 | 18 | 73 / 80 | Á quân (Tích hợp cơ chế YAML Schema & Suffix Matching) |
| 🥉 | Candidate E | 18 | 18 | 18 | 18 | 72 / 80 | Đồng Á quân (Tích hợp FSM Nesting & EOF Recovery) |
| 4 | Candidate A | 18 | 17 | 17 | 16 | 68 / 80 | Loại (Thiếu kiểm toán dữ liệu và kế toán reasoning tokens) |
| 5 | Candidate C | 17 | 17 | 16 | 16 | 66 / 80 | Loại (User-Agent sniffing mong manh, thiếu nâng cấp UI/DB) |

### Chỉ Thị Tích Hợp Tinh Hoa Của Kongming:
1. **Lấy Candidate D làm lõi kiến trúc:** Phân luồng kép tại Supervisor (`ThoughtChannel` / `ContentChannel`), lưu vết `thinking_history` trong SQLite WAL, kế toán `completion_tokens_details.reasoning_tokens` và Cyberdeck Playground.
2. **Tích hợp từ Candidate B:** Cú pháp khai báo YAML Adapter (`reasoning_parser: tags | regex | json_field`) và thuật toán so khớp tiền tố lùi `findCandidatePrefixLength`.
3. **Tích hợp từ Candidate E:** Quản lý độ sâu thẻ lồng nhau (`nestingDepth`) và cơ chế phục hồi tự động chốt đóng thẻ dở dang tại điểm kết thúc luồng (Auto-Close Flush on EOF).
4. **Tích hợp từ Candidate C:** Khử nhiễm ngữ cảnh đa lượt (Multi-turn Context Decontamination) trong `content-normalizer.ts`.
5. **Tích hợp từ Candidate A:** Cơ chế đàm phán qua header `x-reasoning-format: separate | inline | strip` và đo lường thời gian kép TTFR vs TTFT.

---

## 8. Các Câu Hỏi Mở & Hướng Mở Rộng (Unresolved Questions)

1. **Cấu Hình Giới Hạn Dung Lượng Lưu Vết Thinking (`max_thought_history_mb`):** Khi các mô hình suy luận sâu chạy liên tục trong nhiều tháng, bảng `thinking_history` có thể tích lũy hàng gigabyte dữ liệu. Có nên tích hợp cơ chế dọn dẹp tự động (GC Retention Policy) tương tự như session thread cleanup (ví dụ: tự động dọn bản ghi quá 30 ngày) không?
2. **Hỗ Trợ Streaming Reasoning Effort Tương Thích Với OpenAI SDK:** OpenAI mới phát hành tham số `reasoning_effort: low | medium | high` cho dòng mô hình o-series. Có nên ánh xạ tham số này sang các cờ tương ứng của CLI (như `--thinking-budget` của Claude Code) trong các phiên bản tiếp theo không?
