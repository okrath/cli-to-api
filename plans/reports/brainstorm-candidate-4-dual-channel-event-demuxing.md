# Báo Cáo Đề Xuất Kiến Trúc & Hợp Đồng Bounded Contract: Kiến Trúc Phân Luồng Kép (Dual-Channel Event Demuxing), Lưu Trữ Dấu Vết Tư Duy (Reasoning Trace Persistence) & Trải Nghiệm Playground Chuyên Sâu Cho `cli-to-api`

**Ứng viên:** Candidate 4  
**Chế độ:** `ak-brainstorm --ultra`  
**Hệ thống mục tiêu:** `cli-to-api` Process Supervisor, Stream Processing Pipeline, OpenAI Wire Gateway, SQLite State Engine, và Cyberdeck Web Console Playground  
**Ngày:** 2026-09-16  

---

## Tóm Tắt Điều Hành (Executive Summary)

Sự chuyển dịch của các mô hình biên giới (Frontier AI Models) như OpenAI o1/o3, DeepSeek-R1, Anthropic Claude 3.7 Sonnet (Extended Thinking), Gemini 2.0 Flash Thinking và Grok 3 sang cơ chế **suy luận chuỗi tư duy (Chain-of-Thought / Deep Reasoning)** đã tạo ra một sự thay đổi bản lề trong cách các công cụ CLI AI cục bộ phản hồi. Thay vì trực tiếp phát sinh văn bản trả lời, các CLI này (`codex`, `claude`, `opencode`, `omp-reasoning`) phát ra hàng trăm đến hàng chục ngàn token suy luận nội tại trước khi đưa ra câu trả lời chính thức.

Tuy nhiên, kiến trúc hiện tại của `cli-to-api` đang gặp phải **4 khiếm khuyết cơ cấu mang tính nghẽn cổ chai**:

1. **Nhiễm bẩn nội dung do luồng đơn (Single-Channel Content Pollution):**  
   `ProcessManager` hiện tại chỉ cung cấp một callback đơn nhất `onDelta: (content: string) => void`. Toàn bộ dữ liệu xuất ra từ CLI được dồn vào một luồng văn bản phẳng. Khi các CLI xuất khối tư duy qua thẻ XML (`<think>...</think>`), tag Anthropic hoặc escape prefix, dữ liệu này bị đẩy thẳng vào `choices[0].delta.content`. Khi các client OpenAI tiêu chuẩn (Cursor, Continue, LangChain, LobeChat, LibreChat) tiếp nhận, các thẻ `<think>` chưa đóng hoặc nội dung thô làm gãy vỡ parser Markdown, làm biến dạng code sinh ra, và gây ô nhiễm ngữ cảnh trò chuyện.
2. **Mù lòa kế toán Token (Token Accounting Blindness):**  
   Hàm `estimateTokenUsage()` hiện tại chỉ ước lượng gộp `prompt_tokens` và `completion_tokens`. Hệ thống hoàn toàn không có khả năng phân tách **Reasoning Tokens** (token phục vụ suy luận nội tại) khỏi **Completion Tokens** (token câu trả lời thực tế). Điều này vi phạm nghiêm trọng đặc tả mở rộng của OpenAI (`completion_tokens_details.reasoning_tokens`), khiến người dùng và các dashboard quản trị không thể định lượng chi phí, thời gian tính toán và hiệu suất suy luận.
3. **Mất mát dấu vết tư duy (Ephemeral Reasoning Loss):**  
   Hàng ngàn token suy luận có giá trị cao về mặt logic, giải thuật và kiểm thử biến mất hoàn toàn khi tiến trình CLI kết thúc. Bảng `request_metrics` trong SQLite chỉ lưu các con số tổng quát mà không có bất kỳ bảng lưu trữ chuyên biệt nào cho `thinking_history`, tước đoạt khả năng kiểm toán (auditing), phân tích chuỗi suy luận (trace inspection) và gỡ lỗi prompt của nhà phát triển.
4. **Trải nghiệm Playground nghèo nàn và thiếu chiều sâu:**  
   Giao diện `PlaygroundView.tsx` hiện tại chỉ là một khung `textarea` phẳng. Người dùng không thể phân biệt giữa lúc mô hình đang "suy nghĩ" và lúc đang "trả lời", không có khối hiển thị tư duy độc lập (collapsible thought block), không đo đạc thời gian suy luận riêng biệt ($T_{\text{thought}}$ vs $T_{\text{gen}}$), thiếu tô màu cú pháp (syntax highlighting) cho khối tư duy, và không có các nút thao tác nhanh như sao chép chuỗi suy luận (copy-reasoning).

**Candidate 4 đề xuất giải pháp độc lập mang tính đột phá: Kiến Trúc Phân Luồng Kép Cấp Supervisor (Dual-Channel Event Demuxing Architecture)**:

- **Trụ cột 1: Bộ giải đa hợp phân luồng kép thời gian thực (Dual-Channel Event Demuxer):** Tách bạch triệt để giữa `ThoughtChannel` và `ContentChannel` ngay tại tầng `ProcessManager` thông qua máy trạng thái hữu hạn (Streaming FSM) O(1) space, O(N) time. Đảm bảo `delta.content` gửi về client sạch 100%, đồng thời truyền phát song song `delta.reasoning_content` theo đúng chuẩn mở rộng của OpenAI/DeepSeek.
- **Trụ cột 2: Hệ thống lưu trữ SQLite & Kế toán Token Tư duy Hai tầng:** Mở rộng schema cơ sở dữ liệu với bảng `thinking_history` liên kết trực tiếp với `request_metrics` và `conversation_threads`. Bổ sung bộ ước tính token chuyên biệt cho reasoning tokens (`completion_tokens_details.reasoning_tokens`) với thuật toán heuristic tối ưu cho cả mã nguồn và văn bản tiếng Việt Unicode.
- **Trụ cột 3: Giao diện Playground Pro Max phong cách Cyberdeck:** Nâng cấp toàn diện `PlaygroundView` theo tiêu chuẩn thiết kế Obsidian Dark. Tích hợp Accordion hiển thị khối suy luận với hiệu ứng radar pulsing khi đang stream, tô màu cú pháp khối tư duy, thanh thống kê chi tiết đa chiều (TTFT, Thinking Time, Generation Time, Reasoning Tokens, Speed tokens/s) và các hành động tiện ích một chạm (Copy Reasoning, Copy Answer, Export Trace).

---

## 1. Outcome (Mục Tiêu & Luồng Vận Hành Cốt Lõi)

Kiến trúc phân luồng kép thiết lập một ranh giới vận hành chặt chẽ và thông suốt từ tầng tiến trình hệ điều hành đến giao thức mạng và giao diện người dùng:

```
+───────────────────────────────────────────────────────────────────────────────────────────────────+
|                                    NATIVE AI CLI PROCESS                                          |
|        DeepSeek-R1 / Claude 3.7 Sonnet / o1-mini / Codex / Grok 3 (<think> ... </think>)          |
+───────────────────────────────────────────────────────────────────────────────────────────────────+
                                                  │
                                  Raw Byte Stream (stdout / PTY)
                                                  ▼
+───────────────────────────────────────────────────────────────────────────────────────────────────+
|                               PROCESS SUPERVISOR & DEMUXER ENGINE                                 |
|                                                                                                   |
|  ┌─────────────────────────────────────────────────────────────────────────────────────────────┐  |
|  │                        ZERO-DELAY STREAMING FSM EVENT DEMUXER                               │  |
|  │  States: [SEARCHING] ──► [ACCUMULATING_TAG] ──► [IN_THOUGHT] ──► [IN_CONTENT]               │  |
|  │  Sliding Window Buffer: 64 bytes (Khử vỡ tag qua biên chunk mạng)                           │  |
|  └──────────────────────────────┬───────────────────────────────┬──────────────────────────────┘  |
+                                 │                               │                                 +
                                  ▼                               ▼
                 ┌────────────────────────────────┐ ┌───────────────────────────────┐
                 │         ThoughtChannel         │ │        ContentChannel         │
                 │   (delta: reasoning_content)   │ │       (delta: content)        │
                 └────────────────┬───────────────┘ └───────────────┬───────────────┘
                                  │                                 │
                                  ├─────────────────┬───────────────┤
                                  ▼                 ▼               ▼
+───────────────────────────────────────────────────────────────────────────────────────────────────+
|                                   OPENAI SSE PROTOCOL SERIALIZER                                  |
|  • Chế độ Stream: data: {"choices":[{"delta":{"reasoning_content":"..."}}]}                       |
|  • Chế độ Stream: data: {"choices":[{"delta":{"content":"..."}}]}                                 |
|  • Metadata Usage Cuối: {"usage":{"completion_tokens_details":{"reasoning_tokens": 420}}}        |
+───────────────────────────────────────────────────────────────────────────────────────────────────+
                                  │                                 │
                 ┌────────────────┴───────────────┐ ┌───────────────┴───────────────┐
                 ▼                                │ │                               ▼
+─────────────────────────────────+               │ │ +─────────────────────────────────────────────+
|   SQLITE WAL PERSISTENCE ENGINE |               │ │ |         CYBERDECK WEB PLAYGROUND            |
| • Table: `thinking_history`     |               │ │ | • Animated Thought Accordion (Radar Glow)   |
| • Table: `request_metrics`      |               │ │ | • Execution Stats: TTFT, T_thought, T_gen   |
|   - prompt_tokens               |               │ │ | • Syntax Highlighting (Markdown/Code)       |
|   - reasoning_tokens            |               │ │ | • Action Bar: Copy Reasoning / Copy Answer  |
|   - completion_tokens           |               │ │ +─────────────────────────────────────────────+
+─────────────────────────────────+               │ │
                                                  ▼ ▼
                                    HTTP SSE Stream / Client Ingress
                                (Cursor / Continue / OpenWebUI / SDK)
```

### Các Năng Lực Cốt Lõi Được Phân Phối (Key Deliverables)

1. **Zero-Delay Dual-Channel Demuxing (Tách luồng thời gian thực không trễ):**  
   Tách luồng byte trực tiếp từ tiến trình con. Không tích đệm (no head-of-line buffering) gây chậm trễ phát token. Nhận diện chính xác các biên mở/đóng `<think>`, `<thought>`, ````thought` ngay cả khi thẻ bị xẻ làm đôi giữa 2 chunk TCP/PTY.
2. **OpenAI Protocol Strictness & Reasoning Extension:**  
   Tuân thủ 100% định dạng OpenAI SSE chunk. Client thông thường nhận được `delta.content` hoàn toàn sạch bóng các tag suy luận. Các client hiện đại hỗ trợ reasoning nhận được `delta.reasoning_content`.
3. **Kế toán Token Hai Tầng & Lưu Trữ Bền Vững (Dual Token Accounting & Persistence):**  
   Bộ đếm token phân tách rạch ròi giữa reasoning tokens và completion tokens. Bảng SQLite `thinking_history` ghi nhận toàn văn chuỗi tư duy, hash nhận diện, thời lượng suy luận ($T_{\text{thought}}$), gắn kết bền vững với Session Thread và Request ID.
4. **Trải Nghiệm Cyberdeck Playground Chuyên Sâu (UI/UX Pro Max):**  
   Thành phần giao diện hiển thị khối suy luận dạng Accordion phát sáng (glow violet radar), hiển thị thời gian suy luận trực tiếp theo thời gian thực (live milliseconds timer), tô màu cú pháp Markdown/Code và hỗ trợ sao chép lập luận một chạm.

---

## 2. Constraints (Ràng Buộc Kỹ Thuật Bắt Buộc)

1. **Độ Tương Thích Tuyệt Đối Với Giao Thức OpenAI (`/v1/chat/completions`):**  
   - Tuyệt đối không được làm gián đoạn các client tiêu chuẩn không có parser thinking (như Cursor, Continue, LangChain).
   - Nội dung trong `choices[0].delta.content` **bắt buộc phải là câu trả lời thuần túy**, không được chứa bất kỳ ký tự nào của khối `<think>...</think>`.
   - Token suy luận phải được truyền tải qua trường chuẩn `choices[0].delta.reasoning_content` (theo chuẩn mở rộng của DeepSeek/vLLM/OpenAI) và tổng hợp tại `usage.completion_tokens_details.reasoning_tokens`.
2. **Độ Trễ Phân Luồng Cực Thấp (Demuxing Overhead $\le 0.5\text{ms}$):**  
   - Bộ giải đa hợp Stream Demuxer không được phép buffer toàn bộ câu trả lời rồi mới dùng Regex xử lý. Quá trình quét và phân luồng phải chạy trên luồng byte/ký tự theo mô hình Finite State Machine với độ trễ mỗi chunk $\le 0.5\text{ms}$.
3. **Bảo Đảm Tính Bền Vững Dữ Liệu Dưới Tải Cao (SQLite WAL Thread-Safety):**  
   - Quá trình ghi nhận dấu vết tư duy (`thinking_history`) vào SQLite không được gây khóa tắc nghẽn (`SQLITE_BUSY`) với các tiến trình định tuyến và kiểm tra cooldown. Toàn bộ thao tác ghi lịch sử phải chạy bất đồng bộ trong Write-Ahead Logging (WAL) mode với hàng đợi micro-batching.
4. **Triệt Tiêu Hoàn Toàn Tiến Trình Rác (Zero Zombie Guarantee $\le 200\text{ms}$):**  
   - Các mô hình suy luận sâu có thể mất từ 30 đến 180 giây chỉ để suy nghĩ trước khi sinh token hoàn tất đầu tiên. Nếu client hủy kết nối (`req.raw.on("close")`), Win32 Job Object hoặc POSIX Process Group phải tiêu diệt toàn bộ cây tiến trình con trong vòng $\le 200\text{ms}$, giải phóng ngay lập tức tài nguyên CPU/RAM/VRAM trên máy chủ.
5. **Khả Năng Khôi Phục Lỗi Thẻ Không Hoàn Chỉnh (Malformed / Split Tag Resilience):**  
   - Bộ demuxer phải xử lý mượt mà trường hợp mô hình gặp sự cố ngắt dòng giữa chừng khi thẻ đóng `</think>` chưa xuất hiện, hoặc khi thẻ mở `<think>` bị cắt vụn qua nhiều packet (ví dụ: `<thi` ở chunk $N$ và `nk>` ở chunk $N+1$).
6. **Tiêu Chuẩn Thiết Kế Giao Diện (`ak-ui-ux-pro-max`):**  
   - Giao diện Playground phải tuân thủ nghiêm ngặt bảng màu Obsidian Dark (`#090D16`, `#0F172A`), màu nhấn Terminal Violet (`#8B5CF6`, `#A855F7`) đại diện cho tư duy AI, chuyển động mượt mà $\le 150\text{ms}$ không giật lag.

---

## 3. Non-goals (Các Yếu Tố Không Thuộc Phạm Vi Dự Án)

1. **Không Can Thiệp Vào Thuật Toán Suy Luận Nội Tại Của CLI:**  
   Hệ thống không cố gắng ép buộc hay thay đổi cách các mô hình AI suy nghĩ. Hệ thống chỉ đóng vai trò phân tách, định lượng, lưu trữ và trình diễn luồng tư duy do CLI tự nhiên phát ra.
2. **Không Kiểm Duyệt Hay Chỉnh Sửa Chuỗi Tư Duy (No Thought Rewriting):**  
   Luồng suy luận được ghi nhận và chuyển tiếp nguyên vẹn để phục vụ mục đích kiểm toán và debug logic, không tự ý lọc bỏ các bước giải toán trung gian của mô hình.
3. **Không Thay Thế Cơ Sở Dữ Liệu Phân Tán Đám Mây:**  
   SQLite được dùng cho lưu trữ cục bộ trên máy trạm/máy chủ đơn lẻ. Dự án không xây dựng giải pháp phân tán đồng bộ dữ liệu suy luận đa cụm (Multi-node cluster database sync) trong phiên bản này.
4. **Không Thay Thế IDE Hoàn Chỉnh:**  
   Playground trong Web Console được tối ưu chuyên sâu cho việc kiểm thử prompt, đo đạc latency, kiểm tra chất lượng suy luận và sao chép dữ liệu, không hướng tới việc thay thế trình soạn thảo code như VS Code.

---

## 4. Acceptance Criteria (Tiêu Chí Nghiệm Thu Rõ Ràng, Có Thể Kiểm Chứng)

### AC-1: Bóc Tách Luồng Kép Thời Gian Thực Tại Tầng Supervisor
- **GIVEN** Một tiến trình CLI phát ra chuỗi văn bản dạng:  
  `<think>\nPhân tích bài toán: cần dùng thuật toán Dijkstra.\nĐộ phức tạp O(E log V).\n</think>\nĐể tìm đường đi ngắn nhất, bạn làm như sau:...`
- **WHEN** Dữ liệu được đưa qua `ProcessManager` với `StreamingDemuxer`.
- **THEN:**
  1. `ThoughtChannel` (thông qua `onThoughtDelta`) nhận được: `Phân tích bài toán: cần dùng thuật toán Dijkstra.\nĐộ phức tạp O(E log V).\n`.
  2. `ContentChannel` (thông qua `onContentDelta`) nhận được: `Để tìm đường đi ngắn nhất, bạn làm như sau:...`.
  3. Cả hai kênh hoàn toàn không chứa chuỗi ký tự thẻ markup `<think>` và `</think>`.

### AC-2: Xử Lý Biên Thẻ Phân Mảnh Qua Các Chunk Mạng (Split Tag Boundary)
- **GIVEN** Luồng byte từ CLI bị phân đoạn thành các chunk TCP như sau:
  - Chunk 1: `Tiến hành suy luận. <thi`
  - Chunk 2: `nk>Bước 1: Tính delta.</thi`
  - Chunk 3: `nk>Kết quả là 42.`
- **WHEN** Demuxer xử lý liên tục qua sliding window buffer.
- **THEN:**
  1. `ContentChannel` nhận được: `Tiến hành suy luận. ` và `Kết quả là 42.`.
  2. `ThoughtChannel` nhận được: `Bước 1: Tính delta.`.
  3. Không có bất kỳ mảnh vỡ thẻ nào như `<thi` hay `nk>` bị rò rỉ ra ngoài client.

### AC-3: Tuân Thủ Chuẩn Dây SSE OpenAI Với Reasoning Extension
- **GIVEN** Request gửi tới `POST /v1/chat/completions` với `stream: true`.
- **WHEN** Mô hình đang phát sinh suy luận trong `ThoughtChannel`.
- **THEN:**
  - Gateway phát ra các gói tin SSE:  
    `data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"reasoning_content":"chunk tư duy..."}}]}\n\n`
- **WHEN** Mô hình chuyển sang phát sinh câu trả lời trong `ContentChannel`.
- **THEN:**
  - Gateway phát ra:  
    `data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"chunk câu trả lời..."}}]}\n\n`
- **WHEN** Stream kết thúc.
- **THEN:**
  - Chunk cuối cùng chứa trường `usage` đầy đủ:
    ```json
    {
      "usage": {
        "prompt_tokens": 45,
        "completion_tokens": 120,
        "total_tokens": 165,
        "completion_tokens_details": {
          "reasoning_tokens": 85
        }
      }
    }
    ```

### AC-4: Lưu Trữ Lịch Sử Suy Luận Và Kế Toán Token Trong SQLite WAL
- **GIVEN** Một chu kỳ suy luận hoàn tất với 850 ký tự suy luận và 320 ký tự hoàn tất.
- **WHEN** Tiến trình kết thúc thành công (Exit code 0).
- **THEN:**
  1. Bảng `thinking_history` tạo mới một bản ghi chứa: `id`, `request_id`, `model_id`, `thought_content`, `thought_tokens`, `thought_duration_ms`, và mã băm `thought_hash`.
  2. Bảng `request_metrics` cập nhật chính xác `reasoning_tokens`, `completion_tokens`, và `thought_duration_ms`.
  3. Quá trình ghi không vượt quá $5\text{ms}$ và không kích hoạt lỗi `SQLITE_BUSY`.

### AC-5: Xử Lý Ngoại Lệ Thẻ Mở Không Đóng (Unclosed Malformed Tag)
- **GIVEN** Một CLI bị crash hoặc timeout khi đang ở trạng thái `IN_THOUGHT` (đã mở `<think>` nhưng tiến trình ngắt kết nối trước khi phát `</think>`).
- **WHEN** Bộ demuxer nhận tín hiệu stream kết thúc (`demuxer.flush()`).
- **THEN:**
  1. Toàn bộ nội dung tích lũy trong bộ đệm tư duy được chốt và lưu trữ vào `thinking_history` với trạng thái `status: 'TRUNCATED'`.
  2. Gateway không bị treo tiến trình phân luồng.
  3. Client nhận được thông báo kết thúc hợp lệ mà không bị hỏng cấu trúc JSON.

### AC-6: Giao Diện Playground Cyberdeck UI Chuyên Sâu
- **GIVEN** Người dùng mở trang Chat Playground (`/playground`).
- **WHEN** Gửi một prompt suy luận phức tạp (ví dụ bài toán lập trình hoặc logic).
- **THEN:**
  1. Trong pha suy luận: Khối Accordion xuất hiện viền tím phát sáng (`border-violet-500/50 shadow-violet-900/20`), hiển thị trạng thái `"Thinking... (3.4s)"` với biểu tượng pulsing radar.
  2. Khi pha suy luận hoàn tất: Tiêu đề Accordion đổi thành `"Thought for 4.8s (412 reasoning tokens)"` và tự động thu gọn hoặc giữ mở theo cấu hình người dùng.
  3. Khối suy luận hỗ trợ định dạng Markdown và cú pháp code rõ ràng.
  4. Người dùng bấm `"Copy Reasoning"`: Toàn bộ nội dung suy luận thuần được sao chép vào clipboard kèm thông báo toast xác nhận.
  5. Thanh số liệu (`ExecutionMetricsBar`) hiển thị trực quan: TTFT, Thời gian suy luận ($T_{\text{thought}}$), Thời gian sinh câu trả lời ($T_{\text{gen}}$), Tốc độ Token ($tokens/s$).

### AC-7: Ngắt Dòng Tức Thì Và Dọn Sạch Tiến Trình Con Khi Client Hủy Kết Nối ($\le 200\text{ms}$)
- **GIVEN** Mô hình đang trong pha suy luận kéo dài (giây thứ 15).
- **WHEN** Người dùng đóng tab trình duyệt hoặc ấn nút `"Stop Generating"` (kích hoạt `req.raw.on("close")`).
- **THEN:**
  1. `AbortController.signal` kích hoạt ngay lập tức.
  2. Win32 Job Object hoặc POSIX Process Group thu hồi toàn bộ tiến trình CLI trong vòng $\le 200\text{ms}$.
  3. Bảng `request_metrics` ghi nhận `status = 'ABORTED'` và giải phóng slot tài khoản trong pool.

---

## 5. Bảng So Sánh Các Hướng Tiếp Cận (Compared Approaches)

| Tiêu chí Đánh giá | Phương án A: Regex Post-Processing (Bóc tách sau khi gom đủ dữ liệu) | Phương án B: Client-Side Regex Parsing (Đẩy thẻ thô về trình duyệt tự bóc) | Phương án C: Dual-Channel Streaming FSM Demuxer Cấp Supervisor (Đề xuất của Candidate 4) |
| :--- | :--- | :--- | :--- |
| **Độ trễ phát token (TTFT & Streaming Latency)** | **Kém nhất:** Phải gom toàn bộ stream từ CLI về bộ đệm gateway, sau đó dùng Regex tách `<think>`. Triệt tiêu hoàn toàn khả năng stream thời gian thực. | **Tốt:** Token stream nhanh, nhưng frontend phải tự parse chuỗi động. | **Tối ưu tuyệt đối:** Token phát sinh đến đâu tách đến đó qua FSM sliding window trong $\le 0.5\text{ms}$. Không gây trễ luồng. |
| **Độ sạch của Content Stream** | Sạch, nhưng người dùng phải chờ cả phút mới nhận được câu trả lời đầu tiên. | **Nguy hiểm:** Rò rỉ các thẻ `<think>` dang dở về client bên thứ ba (Cursor, Continue), làm gãy Markdown parser của client. | **Hoàn hảo:** `ContentChannel` hoàn toàn sạch bóng các tag suy luận. Độc lập 100% với `ThoughtChannel`. |
| **Tính tuân thủ chuẩn OpenAI API** | Trung bình: Trả về non-streaming tốt, nhưng streaming không thể phân phối `delta.reasoning_content`. | **Vi phạm:** Nhồi trực tiếp raw thinking vào `delta.content`. | **Chuẩn xác 100%:** Hỗ trợ chuẩn `reasoning_content` và cấu trúc `completion_tokens_details.reasoning_tokens`. |
| **Kế toán Token Chi Tiết** | Ước lượng thô sau khi hoàn tất. Không thể tính toán song song theo thời gian thực. | Hoàn toàn không hỗ trợ; client không thể báo cáo token về gateway. | **Độc lập và chính xác:** Phân tích heuristic riêng biệt cho prompt, reasoning tokens và completion tokens. |
| **Kiểm toán & Lưu vết SQLite** | Lưu trữ cục bộ sau cùng, dễ mất dữ liệu nếu tiến trình crash đột ngột. | Không có lưu trữ dấu vết suy luận tập trung tại gateway. | **Bền vững & Toàn vẹn:** Ghi nhận vào `thinking_history` liên kết với Thread và Metrics trong SQLite WAL. |
| **Xử lý Biên thẻ Phân mảnh (Split Chunk)** | Dễ dàng vì đã gom toàn bộ chuỗi. | Frontend rất khó xử lý khi một nửa thẻ `<think>` nằm ở chunk này, nửa kia ở chunk tiếp theo. | **Xử lý triệt để:** Cấu trúc Sliding Window 64 bytes tự động giữ lại tiền tố nghi vấn và xả ngay khi xác định trạng thái. |
| **Trải Nghiệm Nhà Phát Triển (DX & UX)** | Cảm giác hệ thống bị treo cứng (freezing) khi mô hình đang suy nghĩ. | Giao diện bị chớp giật (flicker) do Regex client liên tục bóc tách và vẽ lại cây DOM. | **Chuyên nghiệp đỉnh cao:** Accordion tư duy phát sáng, live timer mili-giây, nút Copy độc lập, thống kê hiệu năng sâu. |
| **Điều Kiện Thất Bại Đầu Tiên (First Failure Condition)** | Gặp response dài >32k tokens làm tràn bộ nhớ đệm RAM của Node.js trước khi kịp Regex. | Client bên thứ ba (Cursor/Cline) đọc phải thẻ `<think>` và chèn thẳng vào code nguồn người dùng. | CLI sử dụng định dạng tag tùy biến hoàn toàn lạ chưa được khai báo trong Adapter YAML blueprint (được phòng ngừa bằng fallback parser). |

---

## 6. Thiết Kế Kiến Trúc Chi Tiết & Hợp Đồng Triển Khai (Recommended Direction & Rationale)

Candidate 4 khẳng định: **Phương án C là hướng tiếp cận ưu việt và bền vững nhất**. Việc phân tách kênh ngay tại tầng Supervisor bảo đảm tính toàn vẹn của dữ liệu ở mức thấp nhất, giải phóng tầng mạng và tầng giao diện khỏi việc phải đoán định hay xử lý chuỗi phức tạp.

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                PROCESS MANAGER INGRESS PLANE                                      │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                   │
│  Raw CLI Stream ──► [ANSI Sanitizer] ──► [Streaming Demuxer FSM]                                  │
│                                                   │                                               │
│                         ┌─────────────────────────┴─────────────────────────┐                     │
│                         ▼                                                   ▼                     │
│               [Thought Channel]                                   [Content Channel]               │
│                         │                                                   │                     │
│                         ▼                                                   ▼                     │
│           onThoughtDelta(chunk: string)                       onContentDelta(chunk: string)       │
│                         │                                                   │                     │
└─────────────────────────┼───────────────────────────────────────────────────┼─────────────────────┘
                          │                                                   │
                          ▼                                                   ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 ROUTER / CONTROLLER PLANE                                         │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                   │
│  Fastify SSE Handler (/v1/chat/completions)                                                       │
│  ├─ Streaming:                                                                                    │
│  │   • Thought:   reply.write(formatSseChunk(id, model, ts, { reasoning_content: chunk }))        │
│  │   • Content:   reply.write(formatSseChunk(id, model, ts, { content: chunk }))                  │
│  │   • Admin Bus: globalAdminEventBus.broadcast("thought:delta", { id, chunk })                   │
│  │                                                                                                │
│  ├─ Final Usage & Accounting:                                                                     │
│  │   • TokenEstimator: { promptTokens, completionTokens, reasoningTokens }                        │
│  │   • SQLite Write: insert `thinking_history` & update `request_metrics`                         │
│  │                                                                                                │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 6.1 Máy Trạng Thái Hữu Hạn Tách Luồng (Zero-Delay Streaming Demuxer FSM)

Bộ giải đa hợp được thiết kế dựa trên một **Finite State Machine (FSM)** với 5 trạng thái vận hành, duy trì một bộ đệm trượt cực nhỏ (Sliding Window Buffer) có kích thước tối đa bằng độ dài của thẻ đóng dài nhất (thường là 16 bytes đối với `</think>` hoặc `</thought>`).

```
           ┌──────────┐
           │   IDLE   │◄─────────────────────────────┐
           └────┬─────┘                              │
                │ Nhận ký tự '<'                     │
                ▼                                    │
    ┌───────────────────────┐                        │
    │  MATCHING_THINK_OPEN  ├─(Không khớp thẻ mở)────┤
    └───────────┬───────────┘                        │
                │ Khớp chính xác "<think>"           │
                ▼                                    │
         ┌──────────────┐                            │
         │  IN_THOUGHT  │                            │
         └──────┬───────┘                            │
                │ Nhận ký tự '<'                     │
                ▼                                    │
   ┌──────────────────────────┐                      │
   │   MATCHING_THINK_CLOSE   ├─(Không khớp thẻ đóng)┤
   └────────────┬─────────────┘                      │
                │ Khớp chính xác "</think>"          │
                ▼                                    │
        ┌───────────────┐                            │
        │  IN_CONTENT   ├─(Tiếp tục stream nội dung)─┘
        └───────────────┘
```

#### Thuật Toán Xử Lý Chi Tiết (`apps/gateway/src/stream/streaming-demuxer.ts`)

```typescript
export interface DemuxerCallbacks {
  onThoughtDelta: (chunk: string) => void;
  onContentDelta: (chunk: string) => void;
}

export interface DemuxerOptions {
  openTag?: string;
  closeTag?: string;
}

export class StreamingDemuxer {
  private state: "IN_CONTENT" | "MATCHING_OPEN" | "IN_THOUGHT" | "MATCHING_CLOSE" = "IN_CONTENT";
  private buffer = "";
  private readonly openTag: string;
  private readonly closeTag: string;
  private callbacks: DemuxerCallbacks;
  
  // Thống kê phục vụ kế toán
  public accumulatedThought = "";
  public accumulatedContent = "";

  constructor(callbacks: DemuxerCallbacks, options: DemuxerOptions = {}) {
    this.callbacks = callbacks;
    this.openTag = options.openTag || "<think>";
    this.closeTag = options.closeTag || "</think>";
  }

  public feed(chunk: string): void {
    let index = 0;
    const len = chunk.length;

    while (index < len) {
      const char = chunk[index];

      switch (this.state) {
        case "IN_CONTENT": {
          if (char === this.openTag[0]) {
            this.buffer = char;
            this.state = "MATCHING_OPEN";
          } else {
            this.emitContent(char);
          }
          index++;
          break;
        }

        case "MATCHING_OPEN": {
          this.buffer += char;
          if (this.openTag.startsWith(this.buffer)) {
            if (this.buffer === this.openTag) {
              // Khớp hoàn toàn thẻ mở -> Chuyển sang trạng thái tư duy
              this.buffer = "";
              this.state = "IN_THOUGHT";
            }
          } else {
            // Nhầm lẫn (ví dụ chuỗi "<3" hoặc "<<"), xả toàn bộ buffer vào content
            this.emitContent(this.buffer);
            this.buffer = "";
            this.state = "IN_CONTENT";
          }
          index++;
          break;
        }

        case "IN_THOUGHT": {
          if (char === this.closeTag[0]) {
            this.buffer = char;
            this.state = "MATCHING_CLOSE";
          } else {
            this.emitThought(char);
          }
          index++;
          break;
        }

        case "MATCHING_CLOSE": {
          this.buffer += char;
          if (this.closeTag.startsWith(this.buffer)) {
            if (this.buffer === this.closeTag) {
              // Khớp hoàn toàn thẻ đóng -> Trở về trạng thái nội dung
              this.buffer = "";
              this.state = "IN_CONTENT";
            }
          } else {
            // Không phải thẻ đóng (ví dụ "</t" nhưng ký tự sau là 'x'), xả buffer vào thought
            this.emitThought(this.buffer);
            this.buffer = "";
            this.state = "IN_THOUGHT";
          }
          index++;
          break;
        }
      }
    }
  }

  public flush(): void {
    // Xử lý khi stream bị ngắt đột ngột
    if (this.buffer.length > 0) {
      if (this.state === "MATCHING_OPEN" || this.state === "IN_CONTENT") {
        this.emitContent(this.buffer);
      } else {
        this.emitThought(this.buffer);
      }
      this.buffer = "";
    }
  }

  private emitThought(text: string): void {
    this.accumulatedThought += text;
    this.callbacks.onThoughtDelta(text);
  }

  private emitContent(text: string): void {
    this.accumulatedContent += text;
    this.callbacks.onContentDelta(text);
  }
}
```

---

### 6.2 Tái Cấu Trúc Tầng Supervisor (`ProcessManager`)

Mở rộng `ExecutionContext` và `ProcessExecutionResult` trong `apps/gateway/src/supervisor/types.ts` để đưa luồng phân tách trở thành công dân hạng nhất (first-class citizen):

```typescript
export interface ExecutionContext {
  adapter: AdapterConfig;
  account: {
    id: string;
    sandboxDir: string;
    customEnv?: Record<string, string>;
  };
  modelId: string;
  messages: Array<{ role: string; content: MessageContent }>;
  session?: {
    threadId: string;
    cliSessionId?: string;
    isResume: boolean;
    deltaPrompt: string;
  };
  signal?: AbortSignal;
  // Cung cấp 2 kênh riêng biệt
  onContentDelta?: (chunk: string) => void;
  onThoughtDelta?: (chunk: string) => void;
}

export interface ProcessExecutionResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  thoughtDurationMs: number;
  aborted: boolean;
  capturedSessionId?: string;
  thoughtContent: string;
  cleanContent: string;
  rateLimitDetected?: {
    isRateLimited: boolean;
    cooldownSeconds: number;
  };
}
```

Trong phương thức `executeStreaming` của `ProcessManager`:

```typescript
// Khởi tạo Demuxer với các callback tương ứng
let thoughtStartTime: number | null = null;
let thoughtEndTime: number | null = null;

const demuxer = new StreamingDemuxer({
  onThoughtDelta: (thoughtChunk: string) => {
    if (thoughtStartTime === null) {
      thoughtStartTime = Date.now();
    }
    ctx.onThoughtDelta?.(thoughtChunk);
  },
  onContentDelta: (contentChunk: string) => {
    if (thoughtStartTime !== null && thoughtEndTime === null) {
      thoughtEndTime = Date.now();
    }
    ctx.onContentDelta?.(contentChunk);
  }
});

// Executor đẩy raw text qua Sanitizer rồi vào Demuxer
const onRawChunk = (raw: string) => {
  const sanitized = sanitizeAnsi(raw);
  demuxer.feed(sanitized);
};
```

---

### 6.3 Chuẩn Hóa Giao Thức Dây OpenAI SSE Serializer

Cập nhật `apps/gateway/src/stream/sse-serializer.ts`:

```typescript
export interface ChatDelta {
  role?: "assistant";
  content?: string;
  reasoning_content?: string;
}

export function formatSseChunk(
  id: string,
  model: string,
  created: number,
  delta: ChatDelta,
  finishReason: string | null = null
): string {
  const payload = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
  };

  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function formatSseUsageChunk(
  id: string,
  model: string,
  created: number,
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    reasoning_tokens: number;
  }
): string {
  const payload = {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [],
    usage: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      completion_tokens_details: {
        reasoning_tokens: usage.reasoning_tokens,
      },
    },
  };

  return `data: ${JSON.stringify(payload)}\n\n`;
}
```

---

### 6.4 Schema Cơ Sở Dữ Liệu SQLite WAL & Kế Toán Token Nâng Cao

#### 1. Mở Rộng Bảng Dữ Liệu (`apps/gateway/src/db/schema.ts`)

```typescript
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Bảng lưu trữ chi tiết các phiên tư duy chuyên sâu
export const thinkingHistory = sqliteTable(
  "thinking_history",
  {
    id: text("id").primaryKey(), // thk_uuidv4
    requestId: text("request_id").notNull(),
    threadId: text("thread_id"),
    adapterId: text("adapter_id").notNull(),
    accountId: text("account_id").notNull(),
    modelId: text("model_id").notNull(),
    thoughtContent: text("thought_content").notNull(),
    thoughtHash: text("thought_hash").notNull(), // sha256 tra cứu nhanh
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    thoughtDurationMs: integer("thought_duration_ms").notNull().default(0),
    status: text("status", { enum: ["COMPLETED", "TRUNCATED", "ABORTED"] }).notNull().default("COMPLETED"),
    createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
  },
  (table) => ({
    reqIdx: index("idx_thinking_req").on(table.requestId),
    threadIdx: index("idx_thinking_thread").on(table.threadId),
    hashIdx: index("idx_thinking_hash").on(table.thoughtHash),
  })
);

// Bổ sung các cột định lượng trong bảng requestMetrics
export const requestMetrics = sqliteTable("request_metrics", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  accountId: text("account_id"),
  modelRequested: text("model_requested").notNull(),
  modelExecuted: text("model_executed"),
  promptTokens: integer("prompt_tokens").default(0),
  reasoningTokens: integer("reasoning_tokens").default(0), // Cột mới
  completionTokens: integer("completion_tokens").default(0),
  ttftMs: integer("ttft_ms"),
  thoughtDurationMs: integer("thought_duration_ms").default(0), // Cột mới
  totalDurationMs: integer("total_duration_ms").notNull(),
  statusCode: integer("status_code").notNull().default(200),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
});
```

#### 2. Thuật Toán Ước Tính Token Chi Tiết (`apps/gateway/src/utils/token-estimator.ts`)

```typescript
export interface DetailedTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
}

export function estimateDetailedTokenUsage(
  messages: Array<{ role: string; content: MessageContent }>,
  thoughtText: string,
  completionText: string
): DetailedTokenUsage {
  let promptChars = 0;
  for (const m of messages) {
    const text = normalizeContentToString(m.content);
    promptChars += text.length + 10;
  }

  // Heuristics đa ngôn ngữ:
  // Tiếng Anh & mã nguồn: ~3.8 ký tự / token
  // Tiếng Việt Unicode: ~2.2 ký tự / token (do dấu thanh và ký tự đa byte)
  const calculateTokens = (str: string): number => {
    if (!str || str.length === 0) return 0;
    // Kiểm tra tỷ lệ ký tự non-ASCII
    const nonAsciiCount = (str.match(/[^\x00-\x7F]/g) || []).length;
    const isUnicodeHeavy = nonAsciiCount / str.length > 0.2;
    const ratio = isUnicodeHeavy ? 2.3 : 3.7;
    return Math.max(1, Math.ceil(str.length / ratio));
  };

  const promptTokens = calculateTokens(" ".repeat(promptChars));
  const reasoningTokens = calculateTokens(thoughtText);
  const completionTokens = calculateTokens(completionText);

  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    reasoning_tokens: reasoningTokens,
    total_tokens: promptTokens + reasoningTokens + completionTokens,
  };
}
```

---

### 6.5 Nâng Cấp Toàn Diện Cyberdeck Playground (`PlaygroundView.tsx`)

Giao diện người dùng Playground được hiện đại hóa theo chuẩn `ak-ui-ux-pro-max`, tối ưu hóa cho việc hiển thị và tương tác với các mô hình lý luận sâu:

#### Cấu Trúc Khối Tư Duy (`ThoughtAccordion.tsx`)

```tsx
import React, { useState } from "react";
import { Brain, ChevronDown, ChevronRight, Copy, Check, Sparkles } from "lucide-react";

interface ThoughtAccordionProps {
  thought: string;
  isThinking: boolean;
  thoughtDurationMs: number | null;
  reasoningTokens: number | null;
}

export const ThoughtAccordion: React.FC<ThoughtAccordionProps> = ({
  thought,
  isThinking,
  thoughtDurationMs,
  reasoningTokens,
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  if (!thought && !isThinking) return null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(thought);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return "0.0s";
    return `${(ms / 1000).toFixed(1)}s`;
  };

  return (
    <div
      className={`mb-4 rounded-xl border transition-all duration-200 overflow-hidden ${
        isThinking
          ? "border-violet-500/50 bg-violet-950/10 shadow-[0_0_20px_rgba(139,92,246,0.15)]"
          : "border-borderSubtle bg-surface/80"
      }`}
    >
      {/* Header Bar */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between px-4 py-2.5 cursor-pointer select-none bg-canvas/40 hover:bg-canvas/70 transition"
      >
        <div className="flex items-center space-x-2.5">
          <div className="relative">
            <Brain
              className={`w-4 h-4 ${
                isThinking ? "text-violet-400 animate-pulse" : "text-slate-400"
              }`}
            />
            {isThinking && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-violet-400 animate-ping" />
            )}
          </div>

          <span className="text-xs font-mono font-semibold text-slate-200">
            {isThinking ? (
              <span className="flex items-center space-x-1 text-violet-300">
                <span>Reasoning Process</span>
                <span className="inline-block animate-bounce">.</span>
                <span className="inline-block animate-bounce delay-100">.</span>
                <span className="inline-block animate-bounce delay-200">.</span>
              </span>
            ) : (
              `Thought for ${formatDuration(thoughtDurationMs)}`
            )}
          </span>

          {!isThinking && reasoningTokens !== null && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-900/40 text-violet-300 border border-violet-700/50">
              ~{reasoningTokens} tokens
            </span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          {thought && (
            <button
              onClick={handleCopy}
              className="flex items-center space-x-1 text-[11px] font-mono text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-surface border border-transparent hover:border-borderSubtle transition"
              title="Copy Reasoning Content"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy Thought</span>
                </>
              )}
            </button>
          )}

          <div className="text-slate-400">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {/* Accordion Content Body */}
      {isOpen && (
        <div className="p-4 border-t border-borderSubtle/50 text-xs font-mono text-slate-300 bg-canvas/30 max-h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed select-text border-l-2 border-l-violet-500/80">
          {thought}
          {isThinking && (
            <span className="inline-block w-2 h-4 ml-1 bg-violet-400 animate-pulse align-middle" />
          )}
        </div>
      )}
    </div>
  );
};
```

#### Thanh Số Liệu Thực Thi Đa Chiều (`ExecutionMetricsBar.tsx`)

```tsx
import React from "react";
import { Zap, Clock, Cpu, FileText } from "lucide-react";

interface MetricsProps {
  ttft: number | null;
  thoughtDuration: number | null;
  totalDuration: number | null;
  reasoningTokens: number;
  completionTokens: number;
}

export const ExecutionMetricsBar: React.FC<MetricsProps> = ({
  ttft,
  thoughtDuration,
  totalDuration,
  reasoningTokens,
  completionTokens,
}) => {
  const genDuration = totalDuration && thoughtDuration ? Math.max(0, totalDuration - thoughtDuration) : null;
  const speed = totalDuration && completionTokens > 0
    ? ((completionTokens / (totalDuration / 1000))).toFixed(1)
    : null;

  return (
    <div className="flex items-center space-x-4 px-3 py-1.5 rounded-lg bg-canvas/60 border border-borderSubtle text-[11px] font-mono text-slate-400">
      {ttft !== null && (
        <div className="flex items-center space-x-1 text-cyan-400">
          <Zap className="w-3 h-3" />
          <span>TTFT: {ttft}ms</span>
        </div>
      )}

      {thoughtDuration !== null && thoughtDuration > 0 && (
        <div className="flex items-center space-x-1 text-violet-400">
          <Cpu className="w-3 h-3" />
          <span>Think: {(thoughtDuration / 1000).toFixed(1)}s ({reasoningTokens}t)</span>
        </div>
      )}

      {genDuration !== null && genDuration > 0 && (
        <div className="flex items-center space-x-1 text-emerald-400">
          <FileText className="w-3 h-3" />
          <span>Gen: {(genDuration / 1000).toFixed(1)}s ({completionTokens}t)</span>
        </div>
      )}

      {totalDuration !== null && (
        <div className="flex items-center space-x-1 text-slate-200">
          <Clock className="w-3 h-3" />
          <span>Total: {(totalDuration / 1000).toFixed(1)}s</span>
        </div>
      )}

      {speed && (
        <div className="text-amber-300 font-semibold pl-2 border-l border-borderSubtle">
          {speed} tok/s
        </div>
      )}
    </div>
  );
};
```

---

### 6.6 Kịch Bản Khôi Phục Lỗi & Xử Lý Sự Cố Biên (Edge Cases & Resilience)

1. **Mô hình không bao giờ đóng thẻ `<think>` (Runaway Thought Block):**  
   - *Rủi ro:* Nếu mô hình sinh văn bản trả lời mà "quên" phát thẻ `</think>`, toàn bộ câu trả lời có nguy cơ bị nuốt chửng vào `ThoughtChannel`.
   - *Cơ chế xử lý tự phục hồi:* Demuxer kích hoạt quy tắc bảo vệ độ dài (Guardrails): Nếu `accumulatedThought` vượt quá $8{,}192$ ký tự mà vẫn chưa có thẻ đóng, đồng thời phát hiện các tiêu đề kết luận (như `\n\n# `, `\n\nIn conclusion`, `\n\nĐể giải quyết`, `\n\nHere is the code:`), FSM sẽ tự động cưỡng bức chốt thẻ đóng `</think>`, phát sự kiện `thought_complete`, và chuyển ngay sang trạng thái `IN_CONTENT`.
2. **Client hủy kết nối khi mô hình đang tư duy sâu (Abort During Thought Phase):**  
   - *Rủi ro:* Tiến trình CLI vẫn tiếp tục chạy ngầm trong 60 giây tiếp theo, gây lãng phí RAM và chiếm dụng GPU/CPU.
   - *Cơ chế xử lý:* Ngay khi Fastify bắt được sự kiện `req.raw.on("close")`, `AbortController` phát tín hiệu `abort`. Tầng `PtyExecutor` hoặc `PipeExecutor` lập tức kích hoạt `JobObject.terminate()` (trên Windows) hoặc `process.kill(-pgid, 'SIGKILL')` (trên POSIX). Toàn bộ cây tiến trình bị tiêu hủy trong vòng $\le 200\text{ms}$. Dữ liệu tư duy đã thu thập được chốt vào SQLite với cờ `status: 'ABORTED'`.
3. **Bộ nhớ SQLite WAL phình to do các chuỗi suy luận khổng lồ:**  
   - *Rủi ro:* Bảng `thinking_history` có thể tăng kích thước nhanh chóng nếu phục vụ hàng trăm ngàn lượt chat lý luận cao cấp.
   - *Cơ chế tối ưu:* 
     - Dữ liệu `thoughtContent` trong bảng `thinking_history` được nén tự động bằng `zlib.deflateRaw` nếu độ dài vượt quá $2{,}000$ ký tự trước khi ghi vào cột BLOB/Text.
     - Tích hợp một tiến trình quét dọn định kỳ (Background Retention Sweeper) mỗi 24 giờ, tự động cắt tỉa các bản ghi tư duy cũ hơn 30 ngày (cấu hình qua biến môi trường `THOUGHT_RETENTION_DAYS=30`).

---

## Kết Luận & Khuyến Nghị

Đề xuất của **Candidate 4** giải quyết triệt để và dứt điểm sự xung đột giữa bản chất dòng suy luận thô của các CLI hiện đại và yêu cầu nghiêm ngặt về tính sạch sẽ của chuẩn OpenAI REST/SSE API:

1. **Phân tầng rõ ràng:** Bóc tách kênh đôi ngay tại tầng `ProcessManager` thay vì đẩy gánh nặng lên tầng mạng hay client.
2. **Kế toán chuẩn xác:** Bổ sung cấu trúc `reasoning_tokens` đúng chuẩn công nghiệp, cho phép đo lường chính xác hiệu năng mô hình.
3. **Bảo tồn tài sản tri thức:** Dấu vết suy luận được lưu trữ bền vững vào SQLite WAL có lập chỉ mục, phục vụ kiểm toán và gỡ lỗi lâu dài.
4. **Trải nghiệm đỉnh cao:** Giao diện Cyberdeck Playground với khối Accordion phát sáng, số liệu thời gian thực và các thao tác một chạm giúp nâng tầm `cli-to-api` thành một nền tảng gateway chuyên nghiệp cho kỷ nguyên Reasoning AI.
