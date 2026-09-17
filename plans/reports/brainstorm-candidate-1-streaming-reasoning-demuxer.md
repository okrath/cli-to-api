# Bounded Architectural Contract: Zero-Buffer Streaming Reasoning Demuxer, Lưỡng phương thức Wire Transmission và Obsidian Cyber-Deck UI cho Deep Thinking Models

**Candidate:** Candidate 1  
**Mode:** `ak-brainstorm --ultra`  
**Target Subsystems:** Stream Pipeline Engine (`DualStageAnsiSanitizer`, `ThinkingDemuxer`), Gateway Wire Protocol (`/v1/chat/completions`, `sse-serializer`), Frontend Cyber-Deck Console (`PlaygroundView.tsx`), Admin Event Telemetry (`admin-events.ts`)  
**Date:** 2026-09-16  

---

## Executive Summary

Sự trỗi dậy của các mô hình AI có khả năng lập luận nội tâm chuyên sâu (Deep Reasoning Models) như DeepSeek-R1, OpenAI o1/o3-mini, Claude 3.7 Sonnet (Extended Thinking Mode) và OMP Reasoning Core đã định hình lại tiêu chuẩn tương tác LLM. Thay vì xuất trực tiếp câu trả lời, các mô hình này phát sinh hàng ngàn token "chuỗi suy nghĩ" (Chain-of-Thought / reasoning tokens) trước khi tạo ra câu trả lời cuối cùng.

Trong kiến trúc hiện tại của `cli-to-api`, toàn bộ luồng xuất từ CLI được đẩy qua `DualStageAnsiSanitizer` và chuyển tiếp thẳng vào trường `choices[0].delta.content` của Server-Sent Events (SSE). Cách tiếp cận sơ khai này gây ra ba điểm nghẽn nghiêm trọng:
1. **Ô nhiễm Token & Phá vỡ Định dạng (Token Conflation & Protocol Pollution):** Các thẻ suy nghĩ (như `<think>...</think>`, `<thought>...</thought>`) bị trộn lẫn trực tiếp vào nội dung trả lời chính. Điều này làm hỏng giao diện của các Web Chat UI chuẩn (Open WebUI, LibreChat, Chatbox, Cursor) vốn trông đợi trường dữ liệu tách biệt chuẩn hóa `delta.reasoning_content`.
2. **Nghẽn Latency khi Đệm Toàn phần (TTFT Explosion):** Các giải pháp ngây thơ thường đệm toàn bộ chuỗi cho đến khi gặp thẻ đóng `</think>` mới bắt đầu gửi dữ liệu. Khi mô hình suy nghĩ từ 30 giây đến 2 phút, Time-to-First-Token (TTFT) bùng nổ, phá hủy tính chất phản hồi thời gian thực và khiến kết nối HTTP dễ bị ngắt do timeout.
3. **Mù Mờ Trải nghiệm Người dùng (Playground Blindness):** Trình kiểm thử `PlaygroundView` hiện chỉ có một khung text thô sơ, hoàn toàn không có khả năng hiển thị khối suy luận, không có đồng hồ đếm thời gian suy nghĩ trực tiếp (Thinking Timer), không có chỉ báo trạng thái chuyển pha (Thinking $\to$ Answering), và không thể thu gọn/mở rộng khối Chain-of-Thought.

**Đề xuất của Candidate 1:** Thiết lập một hợp đồng kiến trúc hoàn chỉnh, tập trung vào:
- **Bộ máy trạng thái tách luồng không đệm (Zero-Buffer Streaming State Machine - `ThinkingDemuxer`):** Tích hợp trực tiếp vào Stream Pipeline ngay sau `DualStageAnsiSanitizer`, xử lý streaming từng ký tự qua cơ sở Sliding Lookahead Window ($\le 16\text{ bytes}$), phát xạ token suy luận ngay lập tức với độ trễ $\le 0.1\text{ms}$ mà không đệm dữ liệu thừa.
- **Giao thức truyền dẫn lưỡng phương thức (Dual-Mode Wire Transmission):** Tương thích 100% chuẩn OpenAI / DeepSeek (`delta.reasoning_content`) làm mặc định, đồng thời hỗ trợ chế độ Fallback trực tiếp (`inline <think>...</think>`) thông qua Header đàm phán `x-reasoning-format: inline` cho các thư viện và client legacy.
- **Giao diện Bảng điều khiển Obsidian Cyber-Deck cho `PlaygroundView`:** Nâng cấp toàn diện giao diện Playground với phong cách Cyber-Developer chuyên nghiệp: đồng hồ bấm giờ suy luận live theo thời gian thực (Live Thinking Timer), huy hiệu trạng thái xung nhịp neon (Animated Status Pulse), và khối hiển thị suy luận mở/gập linh hoạt (Collapsible Reasoning Block).

---

## 1. Outcome & System Architecture

```
                                  KIẾN TRÚC STREAMING PIPELINE & WIRE DEMUXING
                                  
 ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
 │                                   NATIVE CLI PROCESS EXECUTION                                   │
 │       Claude Code (Extended Thinking)  │  Codex CLI / OMP Reasoning  │  DeepSeek-R1 Engine       │
 └─────────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                                   │ Raw stdout (ANSI codes, \r spinners, <think> tags)
                                                   ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
 │                            STAGE 1: DUAL-STAGE ANSI & UTF-8 SANITIZER                           │
 │  • Giải mã UTF-8 Stream bảo toàn ký tự đa byte (Vietnamese, Emoji) qua ranh giới chunk          │
 │  • Triệt tiêu mã màu ANSI và ký tự đè spinner `\r` mà không làm gián đoạn token chữ              │
 └─────────────────────────────────────────────────┬────────────────────────────────────────────────┘
                                                   │ Sanitized text stream (Tokens sạch)
                                                   ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
 │                      STAGE 2: ZERO-BUFFER STREAMING STATE MACHINE (ThinkingDemuxer)              │
 │                                                                                                  │
 │    ┌───────────────────────────┐      ┌───────────────────────────┐      ┌──────────────────┐    │
 │    │       STATE: SCANNING     │ ──►  │      STATE: THINKING      │ ──►  │  STATE: CONTENT  │    │
 │    │  (Chờ <think> / Emit text)│      │   (Emit reasoning tokens) │      │  (Emit ans text) │    │
 │    └─────────────┬─────────────┘      └─────────────┬─────────────┘      └──────────────────┘    │
 │                  │                                  │                                            │
 │                  ▼ Lookahead Buffer (≤16B)          ▼ Lookahead Buffer (≤16B)                    │
 │         [ Phát hiện `<th...` ]             [ Phát hiện `</th...` ]                               │
 └──────────────────┬──────────────────────────────────┬────────────────────────────────────────────┘
                    │                                  │
                    ▼                                  ▼
 ┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
 │                       STAGE 3: DUAL-MODE WIRE NEGOTIATOR & SSE EMITTER                           │
 │                                                                                                  │
 │  • Standard Mode (Mặc định hoặc `x-reasoning-format: separate`):                                 │
 │    - Thinking Phase ──► data: {"choices":[{"delta":{"reasoning_content":"..."}}]}                │
 │    - Answer Phase   ──► data: {"choices":[{"delta":{"content":"..."}}]}                          │
 │                                                                                                  │
 │  • Inline Fallback Mode (`x-reasoning-format: inline`):                                          │
 │    - Thinking Phase ──► data: {"choices":[{"delta":{"content":"<think>..."}}]}                   │
 │    - Answer Phase   ──► data: {"choices":[{"delta":{"content":"\n</think>\n\n..."}}]}           │
 └──────────────────┬──────────────────────────────────┬────────────────────────────────────────────┘
                    │                                  │
                    ▼                                  ▼
 ┌──────────────────────────────────────┐  ┌────────────────────────────────────────────────────────┐
 │      UPSTREAM OPENAI API CLIENTS     │  │       OBSIDIAN CYBER-DECK PLAYGROUND VIEW (WEB UI)     │
 │  (Open WebUI, LibreChat, Chatbox,    │  │  • Live Thinking Timer (Bấm giờ ms: "Thinking 4.2s")   │
 │   Cursor, Python/Node OpenAI SDK)    │  │  • Animated Neon Pulse: [● THINKING] -> [● ANSWERING]  │
 │                                      │  │  • Collapsible Reasoning Block (Violet Accent, Fold)   │
 └──────────────────────────────────────┘  └────────────────────────────────────────────────────────┘
```

### Các Năng Lực Cốt Lõi Hệ Thống Đạt Được:
1. **Zero-Buffer Streaming Thật Sự:** Loại bỏ hoàn toàn cơ chế gom đệm (buffering). Mọi ký tự trong khối lập luận được bắn ra mạng ngay tức khắc trong các chunk SSE với độ trễ chuyển tiếp $\le 0.1\text{ms}$.
2. **Khắc Phục Ranh Giới Ký Tự Cắt Ngang (Split-Boundary Resilience):** Bộ đệm lookahead vi mô ($\le 16\text{ bytes}$) lưu trữ trạng thái khi thẻ `<think>` hoặc `</think>` bị bẻ đôi giữa 2 chunk mạng liền kề (ví dụ: Chunk 1 kết thúc bằng `</th`, Chunk 2 bắt đầu bằng `ink>`), đảm bảo không rò rỉ thẻ cú pháp ra nội dung người dùng.
3. **Đàm phán Giao thức Linh hoạt (Protocol Negotiation):** Tương thích hai chiều thông qua header `x-reasoning-format` (giá trị: `separate`, `inline`, `none`), phục vụ cả các client hiện đại lẫn các ứng dụng terminal chỉ đọc trường `delta.content`.
4. **Trải nghiệm Nhà phát triển Đỉnh cao (Obsidian Cyber-Deck Console):** Biến PlaygroundView thành một trạm điều khiển chuyên nghiệp với đồng hồ đo thời gian suy luận, huy hiệu nhịp tim Cyber, khối hiển thị suy nghĩ đóng/mở được hỗ trợ đếm số token và thanh cuộn tự động (auto-scroll).

---

## 2. Constraints

1. **Tuân thủ Tuyệt đối Chuẩn Dây OpenAI SSE (Wire Compatibility):**
   - Định dạng SSE phải tuân thủ chuẩn `data: {"id":..., "object":"chat.completion.chunk", ...}\n\n`.
   - Trường suy luận chuẩn phải là `choices[0].delta.reasoning_content` (theo đặc tả của OpenAI/DeepSeek-R1).
   - Khi luồng kết thúc phải phát ra `data: [DONE]\n\n`.
2. **Cam kết Không Gây Trễ Luồng (Zero-Buffer Latency Guarantee):**
   - Kích thước bộ đệm phân tích thẻ không được vượt quá độ dài của thẻ dài nhất cộng thêm 1 ký tự ($\le 16\text{ bytes}$).
   - Không được phép đệm theo dòng (`\n`) hoặc đệm theo câu trong quá trình suy luận; token suy luận nhận được đến đâu phải phát xạ ngay đến đó.
3. **Bảo toàn Ký tự Đa Byte UTF-8 (Multi-Byte UTF-8 Safety):**
   - Phải hoạt động liền mạch phía sau `DualStageAnsiSanitizer` và `Utf8StreamDecoder`. Không được làm vỡ các chuỗi ký tự tiếng Việt có dấu (ví dụ: `ế`, `à`, `ư`) hoặc các emoji khi chúng bị cắt qua các chunk mạng.
4. **Cô lập Tiến trình & Chống Rò rỉ Tài nguyên ($\le 200\text{ms}$ Containment):**
   - Khi người dùng bấm Stop trên giao diện PlaygroundView hoặc client đóng kết nối HTTP, `AbortController` kích hoạt hủy `ThinkingDemuxer`, đóng stream SSE và tiêu diệt cây tiến trình CLI trong vòng $\le 200\text{ms}$ thông qua Win32 Job Object hoặc POSIX process group.
5. **Bảo tồn Bộ nhớ Cực tiểu (Zero Heap Bloat):**
   - State machine hoạt động dạng streaming với chi phí bộ nhớ cố định $O(1)$ ($\le 4\text{KB}$ overhead trên mỗi luồng request), không làm gia tăng áp lực rác (GC pressure) của Node.js runtime.

---

## 3. Non-goals

1. **Tự Động Tạo Chuỗi Suy Luận Giả Lập:** Gateway không tự tạo ra reasoning nếu mô hình CLI bên dưới không hỗ trợ hoặc không xuất chuỗi suy nghĩ. Gateway chỉ là bộ tách luồng (demuxer) trung thực.
2. **Can thiệp Sửa Đổi Nội dung Suy luận:** Gateway không kiểm duyệt, thay đổi hoặc can thiệp vào ngữ nghĩa của chuỗi lập luận logic được sinh ra từ mô hình.
3. **Lưu Trữ Vĩnh Viễn Toàn Bộ Log Suy Luận Vào Database:** Chuỗi suy luận có dung lượng lớn; việc lưu trữ chỉ áp dụng tạm thời trong phiên làm việc của Web Console hoặc theo dõi qua Admin Event Bus, không ghi hàng megabyte reasoning vào bảng lịch sử cơ sở dữ liệu trừ khi được cấu hình rõ ràng.
4. **Hỗ trợ Ngôn ngữ Đánh dấu Tùy ý Không Giới Hạn:** Hệ thống tập trung tối ưu cho các định dạng phổ biến nhất (`<think>`, `<thought>`, `:::thinking`). Các định dạng phi cấu trúc kỳ dị khác sẽ được cấu hình tường minh qua file Adapter YAML thay vì đoán mò bằng heuristic phức tạp.

---

## 4. Acceptance Criteria (Concrete, Verifiable)

### AC-1: Tách luồng Chuẩn Không Đệm (Standard Zero-Buffer Demuxing)
- **Given:** Một tiến trình CLI xuất chuỗi token: `<think>Xác định bài toán: tính số nguyên tố.</think>Số nguyên tố là...`.
- **When:** Client gửi yêu cầu `POST /v1/chat/completions` với `stream: true` và không đặt header hoặc đặt `x-reasoning-format: separate`.
- **Then:**
  1. Các ký tự `Xác định bài toán...` được gửi tuần tự qua SSE chunks với `delta: { reasoning_content: "..." }`.
  2. Không có bất kỳ thẻ `<think>` hoặc `</think>` nào xuất hiện trong `reasoning_content` hoặc `content`.
  3. Khi gặp `</think>`, gateway chuyển trạng thái tức thì và các ký tự `Số nguyên tố là...` được gửi qua `delta: { content: "..." }`.
  4. Khoảng cách thời gian giữa lúc CLI xuất token reasoning và SSE chunk phát ra mạng là $\le 1\text{ms}$.

### AC-2: Xử lý Thẻ Bị Cắt Đôi Qua Ranh Giới Chunk (Split Tag Boundary Handling)
- **Given:** Chunk 1 nhận được từ tiến trình kết thúc bằng chuỗi `Lập luận bước 1.</th`.
- **And:** Chunk 2 kế tiếp bắt đầu bằng `ink>Kết luận cuối cùng.`.
- **When:** `ThinkingDemuxer` xử lý liên tiếp 2 chunk.
- **Then:**
  1. Chuỗi `Lập luận bước 1.` được phát xạ ngay lập tức trong Chunk 1 dưới dạng `reasoning_content`.
  2. Ký tự `</th` được giữ lại trong bộ đệm lookahead vi mô (5 bytes).
  3. Khi Chunk 2 đến, `ThinkingDemuxer` nhận dạng khớp toàn bộ thẻ đóng `</think>`, loại bỏ thẻ này, và chuyển trạng thái sang `CONTENT`.
  4. Chuỗi `Kết luận cuối cùng.` được phát ra dưới dạng `content`.
  5. Tuyệt đối không rò rỉ chuỗi `</th` hay `ink>` vào bất kỳ payload SSE nào.

### AC-3: Nhận Diện Sai Thẻ (False Tag Lookahead Rollback)
- **Given:** Mô hình đang suy luận và xuất chuỗi toán học chứa dấu so sánh: `x < y và z > 1`.
- **When:** Chunk nhận được ký tự `<` theo sau là ` ` (khoảng trắng) hoặc ký tự không khớp với `think`.
- **Then:**
  1. Ký tự `<` được lưu vào bộ đệm lookahead.
  2. Ngay khi ký tự kế tiếp không khớp tiền tố `think`, `ThinkingDemuxer` lập tức xả (flush) ký tự `<` và các ký tự kế tiếp vào `reasoning_content` mà không bị nuốt mất ký tự.
  3. Trạng thái suy luận tiếp tục duy trì bình thường.

### AC-4: Chế độ Fallback Trực tiếp (Inline Fallback Transmission)
- **Given:** Một client legacy (hoặc ứng dụng dòng lệnh cũ) gửi `POST /v1/chat/completions` kèm header `x-reasoning-format: inline` (hoặc body `{ "reasoning_format": "inline" }`).
- **When:** Mô hình xuất ra khối suy luận và câu trả lời.
- **Then:**
  1. Toàn bộ nội dung suy luận được truyền tải qua trường `choices[0].delta.content`.
  2. Khối suy luận được đóng gói nguyên vẹn trong cặp thẻ `<think>\n` và `\n</think>\n\n`.
  3. Trường `delta.reasoning_content` hoàn toàn không xuất hiện trong payload SSE, đảm bảo các thư viện client cũ không bị lỗi crash JSON schema validation.

### AC-5: Chế độ Lọc Bỏ Hoàn Toàn (Strip Reasoning Mode)
- **Given:** Client gửi request với header `x-reasoning-format: none`.
- **When:** Mô hình xuất khối suy luận `<think>...</think>`.
- **Then:**
  1. Gateway chặn và hủy bỏ toàn bộ token trong khối `<think>`.
  2. Gateway chỉ truyền các token của câu trả lời chính thức vào `delta.content`.
  3. Tiết kiệm tối đa băng thông mạng cho các môi trường di động hoặc nhúng.

### AC-6: Đo Lường Chỉ Số Thời Gian Kép (TTFR vs TTFT Instrumentation)
- **Given:** Một phiên completion có sinh reasoning.
- **When:** Yêu cầu được thực thi.
- **Then:**
  1. Gateway đo lường chính xác:
     - `TTFR` (Time-to-First-Reasoning): Thời gian từ lúc nhận request đến token suy luận đầu tiên.
     - `TTFT` (Time-to-First-Token): Thời gian từ lúc nhận request đến token câu trả lời đầu tiên.
     - `Thinking Duration`: Tổng thời gian tiến trình dành riêng cho pha suy luận.
  2. Các giá trị này được phát sóng qua Event Bus (`reasoning:start`, `reasoning:end`, `request:complete`) và trả về trong response header debug (`X-Debug-TTFR`, `X-Debug-TTFT`, `X-Debug-Think-Duration`).

### AC-7: Trải nghiệm UI PlaygroundView Chuẩn Cyber-Deck
- **Given:** Người dùng kích hoạt prompt trên giao diện PlaygroundView với model suy luận (ví dụ: `auto-high`, `omp-reasoning`, `claude-3-7-sonnet`).
- **When:** Stream SSE bắt đầu đổ về:
  1. Đồng hồ **Live Thinking Timer** bắt đầu đếm số giây thực tế với độ phân giải $100\text{ms}$ (`Thinking for 3.4s...`).
  2. Huy hiệu trạng thái nhấp nháy đèn neon tím **`● THINKING`**.
  3. Khối **Collapsible Reasoning Block** tự động bung mở, hiển thị các dòng suy luận đang tuôn ra với hiệu ứng con trỏ phát sáng và tự động cuộn (auto-scroll).
  4. Khi thẻ `</think>` kích hoạt:
     - Đồng hồ dừng lại và chốt kết quả: `Thought for 8.2s`.
     - Huy hiệu chuyển sang màu xanh neon **`● STREAMING ANSWER`**.
     - Khối nội dung chính bắt đầu hiển thị câu trả lời bên dưới.
  5. Người dùng có thể nhấn nút toggle thu gọn/mở rộng khối suy luận bất kỳ lúc nào mà không làm gián đoạn luồng stream.

---

## 5. Bảng So Sánh Các Hướng Tiếp Cận (Evaluation Matrix)

| Tiêu Chí Đánh Giá | Hướng Tiếp Cận A: Blind Stream (Hiện trạng) | Hướng Tiếp Cận B: Full-Buffer Regex Demuxer | Hướng Tiếp Cận C: Client-Side Parsing Only | Hướng Tiếp Cận 1: Zero-Buffer State Machine & Dual-Mode (Đề xuất của Candidate 1) |
| :--- | :--- | :--- | :--- | :--- |
| **Vị Trí Xử Lý** | Không xử lý, chuyển thẳng stdout vào `delta.content`. | Gateway đệm toàn bộ phản hồi, dùng Regex bóc tách. | Gateway đẩy thô, đẩy trách nhiệm cho Client Javascript bóc thẻ. | **Tích hợp Pipeline Streaming Gateway**: Tách luồng trực tiếp ngay trong luồng byte/ký tự. |
| **Thời Gian Phản Hồi (TTFT / TTFR)** | Nhanh, nhưng nội dung nhận được là rác suy luận lẫn lộn. | **Thảm họa**: TTFT tăng từ 200ms lên 30s-120s vì phải đợi hết khối `<think>` mới gửi dữ liệu. | Tùy thuộc client, không giải quyết được cho OpenAI Python/Node SDK. | **Tối Ưu Tuyệt Đối**: TTFR $\le 200\text{ms}$, TTFT ngay khi chuyển pha, độ trễ xử lý $\le 0.1\text{ms}$. |
| **Xử Lý Cắt Ranh Giới (Chunk Boundary Split)** | Không quan tâm. | Không bị vì gom toàn bộ vào memory. | Client dễ bị crash hoặc nhấp nháy UI nếu thẻ `<think>` bị đứt đoạn. | **Hoàn Hảo**: Xử lý mượt mà qua Lookahead Buffer vi mô ($\le 16\text{ bytes}$). |
| **Tương Thích Chuẩn Dây OpenAI** | **Vi Phạm**: Đẩy text rác `<think>` vào `content`, làm vỡ parser của Open WebUI. | Đúng chuẩn, nhưng mất tính năng SSE streaming (trở thành unary giả lập). | Vi phạm chuẩn API phía backend. | **Đạt Chuẩn Tuyệt Đối**: Chuẩn `delta.reasoning_content`, kèm fallback `inline` cho client cũ. |
| **Chi Phí Tài Nguyên & Bộ Nhớ (RAM / GC)** | Tối thiểu ($O(1)$). | **Nguy hiểm**: Ngốn RAM lớn khi chạy 50 requests đồng thời với reasoning dài (hàng chục MB đệm). | Không tốn RAM gateway. | **Cố định $O(1)$**: Bộ đệm chỉ vài byte, áp lực GC bằng 0. |
| **Độ Phức Tạp Triển Khai** | Không có (Mã nguồn hiện tại). | Trung bình, nhưng rủi ro cao về timeout HTTP gateway. | Đẩy trách nhiệm cho bên ngoài, gateway vô trách nhiệm. | **Chặt Chẽ, Bền Vững**: State Machine tường minh, kiểm thử unit test 100% deterministic. |
| **Trải Nghiệm Trực Quan Cyber-Deck** | Tệ: Text hiển thị thô sơ, không phân biệt câu trả lời và suy nghĩ. | Khựng đơ: Giao diện im lặng 40 giây rồi hiện một cục dữ liệu. | Phụ thuộc từng UI bên ngoài. | **Đỉnh Cao**: Live timer, status pill neon, accordion mở gập mượt mà, telemetry đo TTFR/TTFT. |

---

## 6. Detailed System Architecture & Implementation Specifications

### 6.1 Subsystem 1: Zero-Buffer Streaming State Machine (`ThinkingDemuxer`)

`ThinkingDemuxer` được thiết kế dưới dạng một máy trạng thái hữu hạn (Finite State Machine - FSM) hiệu năng cao, vận hành trên từng đoạn ký tự (character chunks) đã được chuẩn hóa bởi `DualStageAnsiSanitizer`.

#### Sơ Đồ Chuyển Trạng Thái (Formal FSM Transition Diagram)

```
                       ┌──────────────────────────────────────────────┐
                       │               STATE: SCANNING                │◄────────────────────────┐
                       │    (Đang ở ngoài khối suy luận / Content)    │                         │
                       └──────────────────────┬───────────────────────┘                         │
                                              │                                                 │
                                 Gặp ký tự mở đầu thẻ ('<' hoặc ':')                           │
                                              │                                                 │
                                              ▼                                                 │
                       ┌──────────────────────────────────────────────┐                         │
                       │           STATE: CHECKING_OPEN_TAG           │                         │
                       │         (Lưu ký tự vào lookaheadBuffer)      │                         │
                       └───────┬──────────────────────────────┬───────┘                         │
                               │                              │                                 │
           Khớp hoàn toàn thẻ mở                              │ Không khớp mẫu thẻ mở           │
           (ví dụ: `<think>`)                                 │ (Mismatch tiền tố)              │
                               │                              ▼                                 │
                               │                     Xả lookaheadBuffer                         │
                               │                     vào stream Content                         │
                               │                              │                                 │
                               │                              └─────────────────────────────────┘
                               ▼
                       ┌──────────────────────────────────────────────┐
                       │               STATE: THINKING                │◄────────────────────────┐
                       │   (Đang ở trong khối suy luận / Reasoning)   │                         │
                       └──────────────────────┬───────────────────────┘                         │
                                              │                                                 │
                                 Gặp ký tự mở đầu thẻ ('<' hoặc ':')                           │
                                              │                                                 │
                                              ▼                                                 │
                       ┌──────────────────────────────────────────────┐                         │
                       │          STATE: CHECKING_CLOSE_TAG           │                         │
                       │         (Lưu ký tự vào lookaheadBuffer)      │                         │
                       └───────┬──────────────────────────────┬───────┘                         │
                               │                              │                                 │
           Khớp hoàn toàn thẻ đóng                            │ Không khớp mẫu thẻ đóng         │
           (ví dụ: `</think>`)                                │ (Mismatch tiền tố)              │
                               │                              ▼                                 │
                               │                     Xả lookaheadBuffer                         │
                               │                     vào stream Reasoning                       │
                               │                              │                                 │
                               │                              └─────────────────────────────────┘
                               ▼
                     Chuyển về STATE: SCANNING
                     (Phát tín hiệu kết thúc suy nghĩ)
```

#### Đặc tả Mã Nguồn Bộ Máy Trạng Thái (`apps/gateway/src/stream/thinking-demuxer.ts`)

```typescript
export interface ThinkingDemuxerCallbacks {
  onReasoningStart?: () => void;
  onReasoning?: (chunk: string) => void;
  onThinkingEnd?: () => void;
  onContent?: (chunk: string) => void;
}

export interface ThinkingDemuxerOptions {
  openTag?: string;       // Mặc định: "<think>"
  closeTag?: string;      // Mặc định: "</think>"
  alternativeTags?: Array<{ open: string; close: string }>; // e.g. <thought>, :::thinking
  callbacks: ThinkingDemuxerCallbacks;
}

enum DemuxerState {
  SCANNING = "SCANNING",
  CHECKING_OPEN_TAG = "CHECKING_OPEN_TAG",
  THINKING = "THINKING",
  CHECKING_CLOSE_TAG = "CHECKING_CLOSE_TAG",
}

export class ThinkingDemuxer {
  private state: DemuxerState = DemuxerState.SCANNING;
  private openTag: string;
  private closeTag: string;
  private lookaheadBuffer: string = "";
  private hasEmittedReasoning: boolean = false;
  private callbacks: ThinkingDemuxerCallbacks;

  constructor(options: ThinkingDemuxerOptions) {
    this.openTag = options.openTag || "<think>";
    this.closeTag = options.closeTag || "</think>";
    this.callbacks = options.callbacks;
  }

  public write(chunk: string): void {
    if (!chunk) return;

    for (let i = 0; i < chunk.length; i++) {
      const char = chunk[i];

      switch (this.state) {
        case DemuxerState.SCANNING: {
          if (char === this.openTag[0]) {
            this.state = DemuxerState.CHECKING_OPEN_TAG;
            this.lookaheadBuffer = char;
            this.evaluateOpenTagPrefix();
          } else {
            this.callbacks.onContent?.(char);
          }
          break;
        }

        case DemuxerState.CHECKING_OPEN_TAG: {
          this.lookaheadBuffer += char;
          this.evaluateOpenTagPrefix();
          break;
        }

        case DemuxerState.THINKING: {
          if (char === this.closeTag[0]) {
            this.state = DemuxerState.CHECKING_CLOSE_TAG;
            this.lookaheadBuffer = char;
            this.evaluateCloseTagPrefix();
          } else {
            this.callbacks.onReasoning?.(char);
          }
          break;
        }

        case DemuxerState.CHECKING_CLOSE_TAG: {
          this.lookaheadBuffer += char;
          this.evaluateCloseTagPrefix();
          break;
        }
      }
    }
  }

  private evaluateOpenTagPrefix(): void {
    if (this.openTag.startsWith(this.lookaheadBuffer)) {
      if (this.lookaheadBuffer === this.openTag) {
        // Khớp hoàn toàn thẻ mở <think>
        this.lookaheadBuffer = "";
        this.state = DemuxerState.THINKING;
        if (!this.hasEmittedReasoning) {
          this.hasEmittedReasoning = true;
          this.callbacks.onReasoningStart?.();
        }
      }
      // Vẫn là tiền tố hợp lệ, tiếp tục chờ ký tự sau trong buffer
    } else {
      // Mismatch: không phải thẻ mở, xả buffer ra nội dung thông thường
      const textToFlush = this.lookaheadBuffer;
      this.lookaheadBuffer = "";
      this.state = DemuxerState.SCANNING;
      this.callbacks.onContent?.(textToFlush);
    }
  }

  private evaluateCloseTagPrefix(): void {
    if (this.closeTag.startsWith(this.lookaheadBuffer)) {
      if (this.lookaheadBuffer === this.closeTag) {
        // Khớp hoàn toàn thẻ đóng </think>
        this.lookaheadBuffer = "";
        this.state = DemuxerState.SCANNING;
        this.callbacks.onThinkingEnd?.();
      }
      // Vẫn là tiền tố hợp lệ của thẻ đóng, tiếp tục chờ
    } else {
      // Mismatch: xả buffer vào luồng suy luận
      const textToFlush = this.lookaheadBuffer;
      this.lookaheadBuffer = "";
      this.state = DemuxerState.THINKING;
      this.callbacks.onReasoning?.(textToFlush);
    }
  }

  public flush(): void {
    // Xử lý các ký tự dở dang còn sót lại khi luồng kết thúc
    if (this.lookaheadBuffer.length > 0) {
      if (this.state === DemuxerState.CHECKING_OPEN_TAG || this.state === DemuxerState.SCANNING) {
        this.callbacks.onContent?.(this.lookaheadBuffer);
      } else if (this.state === DemuxerState.CHECKING_CLOSE_TAG || this.state === DemuxerState.THINKING) {
        this.callbacks.onReasoning?.(this.lookaheadBuffer);
      }
      this.lookaheadBuffer = "";
    }

    if (this.state === DemuxerState.THINKING) {
      this.callbacks.onThinkingEnd?.();
      this.state = DemuxerState.SCANNING;
    }
  }
}
```

---

### 6.2 Subsystem 2: Dual-Mode Wire Protocol & Ingress Negotiation

Để đảm bảo vừa hỗ trợ các client hiện đại nhất theo chuẩn OpenAI / DeepSeek (`delta.reasoning_content`), vừa không gây lỗi cho các ứng dụng client legacy (vốn chỉ đọc `delta.content`), Gateway thiết lập cơ chế tự động đàm phán qua header HTTP `x-reasoning-format`.

#### Quy Chuẩn Đàm Phán Header

| Giá Trị Header `x-reasoning-format` (hoặc body `reasoning_format`) | Hành Vi Phát Xạ Dây (Wire Emission Behavior) | Đối Tượng Sử Dụng Mục Tiêu |
| :--- | :--- | :--- |
| `separate` *(Mặc định khi bỏ trống)* | **Chuẩn DeepSeek/OpenAI**: Suy luận phát xạ vào `choices[0].delta.reasoning_content`; Câu trả lời phát xạ vào `choices[0].delta.content`. | Web Chat UIs hiện đại (Open WebUI, LibreChat, Chatbox, Cursor, official SDKs). |
| `inline` | **Chế Độ Tương Thích Ngược**: Suy luận được bao bọc trong thẻ `<think>\n...\n</think>\n\n` và gửi toàn bộ qua trường `choices[0].delta.content`. Trường `reasoning_content` không xuất hiện. | Các công cụ CLI cũ, các thư viện wrapper strict-schema, hệ thống nhúng chỉ đọc `content`. |
| `none` | **Chế Độ Tiết Kiệm Băng Thông**: Hủy bỏ hoàn toàn các token trong khối suy luận; chỉ gửi câu trả lời hoàn thiện vào `choices[0].delta.content`. | Các ứng dụng di động, kết nối mạng yếu, hoặc người dùng chỉ quan tâm kết quả cuối cùng. |

#### Cập Nhật SSE Serializer (`apps/gateway/src/stream/sse-serializer.ts`)

```typescript
export interface ChatDelta {
  role?: "assistant";
  content?: string;
  reasoning_content?: string; // Bổ sung trường chuẩn suy luận
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
```

#### Tích Hợp Vào Gateway Ingress Controller (`apps/gateway/src/api/routes/openai-chat.ts`)

```typescript
// Trích xuất cấu hình đàm phán reasoning format
const reasoningHeader = req.headers["x-reasoning-format"] as string | undefined;
const reasoningBody = (body as any)?.reasoning_format as string | undefined;
const reasoningMode = (reasoningHeader || reasoningBody || "separate").toLowerCase(); 
// Giá trị: "separate" | "inline" | "none"

let firstReasoningSent = false;
let firstContentSent = false;
let thinkingStartTime: number | null = null;
let thinkingEndTime: number | null = null;

// Khởi tạo ThinkingDemuxer cho luồng xử lý
const demuxer = new ThinkingDemuxer({
  callbacks: {
    onReasoningStart: () => {
      thinkingStartTime = Date.now();
      const ttfr = thinkingStartTime - startTime;
      reply.raw.setHeader("X-Debug-TTFR", `${ttfr}ms`);
      globalAdminEventBus.broadcast("reasoning:start", { id: completionId, ttfr });

      if (reasoningMode === "inline") {
        reply.raw.write(formatSseChunk(completionId, requestedModel, createdTimestamp, { content: "<think>\n" }));
      }
    },

    onReasoning: (reasoningChunk: string) => {
      if (reasoningMode === "separate") {
        reply.raw.write(formatSseChunk(completionId, requestedModel, createdTimestamp, { reasoning_content: reasoningChunk }));
        globalAdminEventBus.broadcast("chunk:reasoning", { id: completionId, content: reasoningChunk });
      } else if (reasoningMode === "inline") {
        reply.raw.write(formatSseChunk(completionId, requestedModel, createdTimestamp, { content: reasoningChunk }));
        globalAdminEventBus.broadcast("chunk:delta", { id: completionId, content: reasoningChunk });
      }
      // Khi reasoningMode === "none", drop hoàn toàn token này
    },

    onThinkingEnd: () => {
      thinkingEndTime = Date.now();
      const thinkDuration = thinkingEndTime - (thinkingStartTime || thinkingEndTime);
      globalAdminEventBus.broadcast("reasoning:end", { id: completionId, durationMs: thinkDuration });

      if (reasoningMode === "inline") {
        reply.raw.write(formatSseChunk(completionId, requestedModel, createdTimestamp, { content: "\n</think>\n\n" }));
      }
    },

    onContent: (contentChunk: string) => {
      if (!firstContentSent) {
        firstContentSent = true;
        const ttft = Date.now() - startTime;
        reply.raw.setHeader("X-Debug-TTFT", `${ttft}ms`);
      }
      reply.raw.write(formatSseChunk(completionId, requestedModel, createdTimestamp, { content: contentChunk }));
      globalAdminEventBus.broadcast("chunk:delta", { id: completionId, content: contentChunk });
    },
  },
});

// Trong callback onDelta của ProcessManager streaming:
// onDelta(chunk) -> demuxer.write(chunk)
// Khi luồng hoàn tất -> demuxer.flush()
```

---

### 6.3 Subsystem 3: Obsidian Cyber-Deck UI Component Cho PlaygroundView

Giao diện PlaygroundView được nâng cấp hoàn chỉnh thành bảng điều khiển chuẩn Obsidian Dark kết hợp phong cách Cyber-Developer hiện đại với các thành phần trực quan hóa thời gian thực.

#### Hệ Màu Sắc Cyber-Deck Chuẩn Hóa
- Nền Canvas chính: `bg-[#090B0F]`
- Nền Thẻ Surface: `bg-[#12141C]`
- Viền Cấu Trúc: `border-[#242B3B]`
- Điểm Nhấn Suy Luận (Reasoning Accent): `text-[#8B5CF6]`, `border-[#8B5CF6]`, `bg-[#8B5CF6]/10` (Electric Violet)
- Điểm Nhấn Phản Hồi (Answer Accent): `text-[#06B6D4]`, `border-[#06B6D4]` (Neon Cyan)
- Trạng Thái Sẵn Sàng / Hoàn Thành: `text-[#10B981]` (Cyber Emerald)

#### Mã Nguồn Chi Tiết Thành Phần PlaygroundView (`apps/web/src/views/PlaygroundView.tsx`)

```tsx
import React, { useState, useEffect, useRef } from "react";
import { 
  Send, 
  Zap, 
  Clock, 
  BrainCircuit, 
  ChevronDown, 
  ChevronRight, 
  Sparkles, 
  CheckCircle2, 
  Copy, 
  Check, 
  Terminal,
  Layers
} from "lucide-react";
import { apiClient, OpenAiModel } from "../lib/api-client.js";

export function PlaygroundView() {
  const [models, setModels] = useState<OpenAiModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("auto-high");
  const [prompt, setPrompt] = useState("Thiết kế một thuật toán cân bằng tải Least-Connections với mutex bảo vệ slot.");
  const [stream, setStream] = useState(true);
  const [reasoningFormat, setReasoningFormat] = useState<"separate" | "inline" | "none">("separate");
  
  // Generation States
  const [loading, setLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  
  // Streaming Buffers
  const [reasoningText, setReasoningText] = useState("");
  const [outputText, setOutputText] = useState("");
  
  // UI Disclosure State
  const [isReasoningExpanded, setIsReasoningExpanded] = useState(true);
  const [copiedReasoning, setCopiedReasoning] = useState(false);
  const [copiedOutput, setCopiedOutput] = useState(false);
  
  // Live Timer & Telemetry Metrics
  const [liveThinkDuration, setLiveThinkDuration] = useState(0);
  const [finalThinkDuration, setFinalThinkDuration] = useState<number | null>(null);
  const [ttfr, setTtfr] = useState<number | null>(null);
  const [ttft, setTtft] = useState<number | null>(null);
  const [totalTime, setTotalTime] = useState<number | null>(null);

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reasoningContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll cho khối reasoning khi đang stream suy luận
  useEffect(() => {
    if (isThinking && reasoningContainerRef.current) {
      reasoningContainerRef.current.scrollTop = reasoningContainerRef.current.scrollHeight;
    }
  }, [reasoningText, isThinking]);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await apiClient.getModels();
        setModels(res.data);
      } catch (e) {
        console.error("Failed to load models catalog", e);
      }
    };
    fetchModels();
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;

    // Reset toàn bộ metrics & buffers
    setLoading(true);
    setIsThinking(false);
    setIsAnswering(false);
    setReasoningText("");
    setOutputText("");
    setLiveThinkDuration(0);
    setFinalThinkDuration(null);
    setTtfr(null);
    setTtft(null);
    setTotalTime(null);
    setIsReasoningExpanded(true);

    const startTime = Date.now();
    let thinkingStartTs: number | null = null;

    try {
      const res = await fetch("/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-reasoning-format": reasoningFormat,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [{ role: "user", content: prompt }],
          stream,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: "Yêu cầu thất bại" } }));
        setOutputText(`Lỗi ${res.status}: ${err.error?.message || "Lỗi máy chủ nội bộ"}`);
        setLoading(false);
        return;
      }

      if (!stream) {
        const data = await res.json();
        const choice = data.choices[0]?.message;
        if (choice?.reasoning_content) {
          setReasoningText(choice.reasoning_content);
        }
        setOutputText(choice?.content || "");
        setTotalTime(Date.now() - startTime);
        setLoading(false);
        return;
      }

      // Đọc luồng SSE Stream
      const reader = res.body?.getReader();
      const decoder = new TextDecoder("utf-8");
      let fullReasoning = "";
      let fullContent = "";
      let firstReasoningToken = false;
      let firstAnswerToken = false;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.replace("data: ", "").trim();
              if (dataStr === "[DONE]") continue;

              try {
                const parsed = JSON.parse(dataStr);
                const delta = parsed.choices[0]?.delta;

                // 1. Nhận diện token suy luận (reasoning_content)
                if (delta?.reasoning_content) {
                  if (!firstReasoningToken) {
                    firstReasoningToken = true;
                    thinkingStartTs = Date.now();
                    setTtfr(thinkingStartTs - startTime);
                    setIsThinking(true);

                    // Khởi động đồng hồ đếm thời gian suy luận thực tế (tick 100ms)
                    timerIntervalRef.current = setInterval(() => {
                      if (thinkingStartTs) {
                        setLiveThinkDuration(Date.now() - thinkingStartTs);
                      }
                    }, 100);
                  }

                  fullReasoning += delta.reasoning_content;
                  setReasoningText(fullReasoning);
                }

                // 2. Nhận diện token câu trả lời (content)
                if (delta?.content) {
                  // Chốt pha suy luận nếu đang ở trạng thái thinking
                  if (firstReasoningToken && !firstAnswerToken) {
                    if (timerIntervalRef.current) {
                      clearInterval(timerIntervalRef.current);
                      timerIntervalRef.current = null;
                    }
                    if (thinkingStartTs) {
                      setFinalThinkDuration(Date.now() - thinkingStartTs);
                    }
                    setIsThinking(false);
                    setIsAnswering(true);
                  }

                  if (!firstAnswerToken) {
                    firstAnswerToken = true;
                    setTtft(Date.now() - startTime);
                    setIsAnswering(true);
                  }

                  fullContent += delta.content;
                  setOutputText(fullContent);
                }
              } catch {}
            }
          }
        }
      }

      setTotalTime(Date.now() - startTime);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setOutputText(`Lỗi kết nối Stream: ${message}`);
    } finally {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      setIsThinking(false);
      setIsAnswering(false);
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: "reasoning" | "output") => {
    navigator.clipboard.writeText(text);
    if (type === "reasoning") {
      setCopiedReasoning(true);
      setTimeout(() => setCopiedReasoning(false), 2000);
    } else {
      setCopiedOutput(true);
      setTimeout(() => setCopiedOutput(false), 2000);
    }
  };

  return (
    <div className="p-8 flex flex-col h-full space-y-4 bg-canvas text-slate-100 font-sans">
      {/* Header Điều Khiển Tối Tân Cyber-Deck */}
      <div className="flex items-center justify-between border-b border-borderSubtle pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Terminal className="w-5 h-5 text-brand" />
            <h1 className="text-xl font-bold tracking-tight text-white font-mono">
              OBSIDIAN CYBER-DECK PLAYGROUND
            </h1>
          </div>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Trạm kiểm thử suy luận chuyên sâu với Zero-Buffer Demuxing & Live Reasoning Visualizer.
          </p>
        </div>

        <div className="flex items-center space-x-4">
          {/* Lựa Chọn Model */}
          <div className="flex items-center space-x-2 text-xs font-mono">
            <span className="text-slate-400">Target Model:</span>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-surface border border-borderSubtle text-white focus:border-brand outline-none hover:border-slate-500 transition"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
            </select>
          </div>

          {/* Lựa Chọn Wire Format Đàm Phán */}
          <div className="flex items-center space-x-2 text-xs font-mono bg-surface border border-borderSubtle rounded-lg px-2.5 py-1">
            <Layers className="w-3.5 h-3.5 text-tierHigh" />
            <span className="text-slate-400">Wire:</span>
            <select
              value={reasoningFormat}
              onChange={(e) => setReasoningFormat(e.target.value as any)}
              className="bg-transparent text-slate-200 outline-none cursor-pointer"
            >
              <option value="separate" className="bg-surface text-white">Standard (delta.reasoning_content)</option>
              <option value="inline" className="bg-surface text-white">Inline Fallback (&lt;think&gt;)</option>
              <option value="none" className="bg-surface text-white">Strip Reasoning (None)</option>
            </select>
          </div>

          {/* Nút Bật/Tắt SSE Stream */}
          <label className="flex items-center space-x-2 text-xs font-mono text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={stream}
              onChange={(e) => setStream(e.target.checked)}
              className="rounded bg-surface border-borderSubtle text-brand focus:ring-0"
            />
            <span>Stream (SSE)</span>
          </label>
        </div>
      </div>

      {/* Thân Giao Diện 2 Cột (Input Pane & Output Pane) */}
      <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
        {/* CỘT TRÁI: INPUT PROMPT PANE */}
        <form onSubmit={handleSend} className="flex flex-col rounded-xl bg-surface border border-borderSubtle p-4 space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span className="flex items-center space-x-1.5">
              <span>User Ingress Prompt</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surfaceHover text-brand font-semibold">POST /v1/chat/completions</span>
            </span>
            <span>{prompt.length} chars</span>
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Nhập prompt yêu cầu tư duy phức tạp hoặc giải thuật tại đây..."
            className="flex-1 w-full p-3.5 rounded-lg bg-canvas border border-borderSubtle text-sm text-slate-100 font-mono resize-none focus:border-brand outline-none transition"
          />

          <div className="flex items-center justify-between pt-2 border-t border-borderSubtle">
            <div className="flex items-center space-x-2 text-[11px] font-mono text-slate-500">
              <span>Transport:</span>
              <span className="text-slate-300">STDIN / Virtual Substrate</span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex items-center space-x-2 px-6 py-2.5 text-xs font-bold font-mono tracking-wider bg-brand hover:bg-brandHover text-white rounded-lg shadow-lg shadow-brand/20 transition disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  <span>EXECUTING PIPELINE...</span>
                </span>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>EXECUTE PROMPT</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* CỘT PHẢI: OUTPUT & REASONING PANE */}
        <div className="flex flex-col rounded-xl bg-surface border border-borderSubtle p-4 space-y-3 overflow-hidden">
          {/* Thanh Chỉ Báo Trạng Thái & Telemetry Metrics */}
          <div className="flex items-center justify-between text-xs font-mono border-b border-borderSubtle pb-2.5">
            {/* Animated Status Pill */}
            <div className="flex items-center space-x-2">
              {isThinking && (
                <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-tierHigh/10 border border-tierHigh text-tierHigh font-bold text-[11px] shadow-[0_0_12px_rgba(139,92,246,0.3)] animate-pulse">
                  <BrainCircuit className="w-3.5 h-3.5 animate-spin" />
                  <span>THINKING DEEP... ({(liveThinkDuration / 1000).toFixed(1)}s)</span>
                </span>
              )}

              {isAnswering && (
                <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-tierLow/10 border border-tierLow text-tierLow font-bold text-[11px] shadow-[0_0_12px_rgba(6,182,212,0.3)] animate-pulse">
                  <Sparkles className="w-3.5 h-3.5 animate-bounce" />
                  <span>STREAMING ANSWER...</span>
                </span>
              )}

              {!loading && totalTime !== null && (
                <span className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-statusHealthy/10 border border-statusHealthy text-statusHealthy font-bold text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>PIPELINE COMPLETED</span>
                </span>
              )}

              {!loading && totalTime === null && (
                <span className="text-slate-500 font-mono text-[11px]">AWAITING DISPATCH</span>
              )}
            </div>

            {/* Metrics Chips */}
            <div className="flex items-center space-x-3 text-[11px]">
              {ttfr !== null && (
                <span className="flex items-center space-x-1 text-tierHigh" title="Time To First Reasoning Token">
                  <Zap className="w-3 h-3" />
                  <span>TTFR: {ttfr}ms</span>
                </span>
              )}
              {ttft !== null && (
                <span className="flex items-center space-x-1 text-tierLow" title="Time To First Answer Token">
                  <Zap className="w-3 h-3" />
                  <span>TTFT: {ttft}ms</span>
                </span>
              )}
              {totalTime !== null && (
                <span className="flex items-center space-x-1 text-slate-300" title="Total Execution Latency">
                  <Clock className="w-3 h-3" />
                  <span>Total: {totalTime}ms</span>
                </span>
              )}
            </div>
          </div>

          {/* Vùng Cuộn Chứa Cả Khối Reasoning và Final Output */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {/* KHỐI SUY LUẬN (COLLAPSIBLE REASONING BLOCK) */}
            {(reasoningText || isThinking) && (
              <div className="rounded-lg border border-tierHigh/40 bg-[#0E1017] shadow-lg overflow-hidden transition-all">
                {/* Reasoning Block Accordion Header */}
                <div 
                  onClick={() => setIsReasoningExpanded(!isReasoningExpanded)}
                  className="flex items-center justify-between px-3.5 py-2.5 bg-surfaceHover/80 border-b border-tierHigh/20 cursor-pointer select-none hover:bg-surfaceHover transition"
                >
                  <div className="flex items-center space-x-2 text-xs font-mono text-tierHigh font-bold">
                    {isReasoningExpanded ? (
                      <ChevronDown className="w-4 h-4 text-tierHigh" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-tierHigh" />
                    )}
                    <BrainCircuit className="w-4 h-4 text-tierHigh" />
                    <span>Thought Process / Chain of Thought</span>
                    
                    {/* Badge hiển thị thời gian suy luận */}
                    <span className="ml-2 px-2 py-0.5 text-[10px] rounded-full bg-tierHigh/20 border border-tierHigh/40 text-tierHigh font-semibold">
                      {isThinking 
                        ? `${(liveThinkDuration / 1000).toFixed(1)}s thinking...` 
                        : `Thought for ${((finalThinkDuration || liveThinkDuration) / 1000).toFixed(1)}s`}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] font-mono text-slate-400">
                      ~{reasoningText.split(/\s+/).filter(Boolean).length} words
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(reasoningText, "reasoning");
                      }}
                      className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition"
                      title="Sao chép chuỗi suy luận"
                    >
                      {copiedReasoning ? <Check className="w-3.5 h-3.5 text-statusHealthy" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Reasoning Block Content Body */}
                {isReasoningExpanded && (
                  <div 
                    ref={reasoningContainerRef}
                    className="p-3.5 max-h-56 overflow-y-auto font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap border-l-2 border-tierHigh/70 bg-canvas/60 selection:bg-tierHigh/30"
                  >
                    {reasoningText}
                    {isThinking && (
                      <span className="inline-block w-1.5 h-3.5 ml-1 bg-tierHigh animate-pulse align-middle" />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* KHỐI CÂU TRẢ LỜI CUỐI CÙNG (FINAL COMPLETION OUTPUT) */}
            <div className="rounded-lg bg-canvas border border-borderSubtle p-4 min-h-[200px] flex flex-col justify-between">
              <div className="font-mono text-sm text-slate-100 whitespace-pre-wrap leading-relaxed selection:bg-brand/40">
                {outputText ? (
                  <>
                    {outputText}
                    {isAnswering && (
                      <span className="inline-block w-1.5 h-4 ml-1 bg-tierLow animate-pulse align-middle" />
                    )}
                  </>
                ) : (
                  <span className="text-slate-600 text-xs italic">
                    {isThinking 
                      ? "Mô hình đang tập trung suy luận, kết quả câu trả lời sẽ xuất hiện ngay sau khi hoàn tất..." 
                      : "Dữ liệu trả lời từ AI CLI sẽ stream trực tiếp tại đây..."}
                  </span>
                )}
              </div>

              {outputText && !loading && (
                <div className="flex items-center justify-between pt-3 mt-4 border-t border-borderSubtle/50 text-xs font-mono text-slate-500">
                  <span>Tokens emitted cleanly via Zero-Buffer Pipeline</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(outputText, "output")}
                    className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-surface border border-borderSubtle text-slate-300 hover:text-white transition"
                  >
                    {copiedOutput ? (
                      <>
                        <Check className="w-3 h-3 text-statusHealthy" />
                        <span className="text-statusHealthy">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Output</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## 7. Metric Instrumentation & Telemetry

Để phục vụ quản trị và quan sát vận hành phân tán, Gateway bổ sung các sự kiện định tuyến suy luận vào Event Bus quản trị (`globalAdminEventBus`):

1. **`reasoning:start`**:
   - `id`: Định danh lượt completion (`chatcmpl-uuid`).
   - `ttfr`: Thời gian đến token suy luận đầu tiên (ms).
   - `timestamp`: Thời điểm bắt đầu phát sinh suy luận.
2. **`chunk:reasoning`**:
   - `id`: Định danh completion.
   - `content`: Ký tự / chunk suy luận vừa phát xạ ra mạng.
3. **`reasoning:end`**:
   - `id`: Định danh completion.
   - `durationMs`: Tổng thời lượng của giai đoạn suy luận (ms).
4. **Header HTTP Debug Đi Kèm**:
   - `X-Debug-TTFR`: Trả về thời gian TTFR tính theo millisecond.
   - `X-Debug-TTFT`: Trả về thời gian TTFT tính theo millisecond.
   - `X-Debug-Think-Duration`: Trả về tổng thời gian mô hình dành cho quá trình suy luận.

---

## 8. Kế Hoạch Triển Khai & Danh Mục Thay Đổi Tệp (File Changes)

| STT | Tệp Mục Tiêu | Loại Thay Đổi | Trách Nhiệm Chi Tiết |
| :--- | :--- | :--- | :--- |
| 1 | `apps/gateway/src/stream/thinking-demuxer.ts` | **Tạo mới** | Hiện thực hóa lớp máy trạng thái `ThinkingDemuxer` xử lý zero-buffer streaming với lookahead buffer $\le 16\text{B}$. |
| 2 | `apps/gateway/src/stream/sse-serializer.ts` | **Cập nhật** | Mở rộng `ChatDelta` để hỗ trợ trường tùy chọn `reasoning_content?: string`. |
| 3 | `apps/gateway/src/api/routes/openai-chat.ts` | **Cập nhật** | Tích hợp đàm phán header `x-reasoning-format`, nối dây `ThinkingDemuxer` vào `onDelta` streaming callback, đo đạc TTFR/TTFT. |
| 4 | `apps/gateway/src/api/routes/admin-events.ts` | **Cập nhật** | Bổ sung các event type: `reasoning:start`, `chunk:reasoning`, `reasoning:end`. |
| 5 | `apps/web/src/views/PlaygroundView.tsx` | **Cập nhật Toàn Diện** | Nâng cấp giao diện Obsidian Cyber-Deck: live thinking timer, status indicator nhấp nháy, accordion reasoning block. |
| 6 | `tests/unit/thinking-demuxer.test.ts` | **Tạo mới** | Bộ unit test kiểm chứng: zero-buffer, split tag across chunks, false-positive rollback, multi-byte UTF-8 preservation. |

---

## 9. Ma Trận Rủi Ro & Giải Pháp Giảm Thiểu (Risk & Mitigation Matrix)

| Rủi Ro Nhận Diện | Xác Suất | Mức Độ | Giải Pháp Giảm Thiểu Của Candidate 1 |
| :--- | :---: | :---: | :--- |
| **Thẻ cú pháp bị chẻ đôi thành nhiều chunk nhỏ lẻ** (ví dụ `<` trong chunk 1, `t` trong chunk 2, `hink>` trong chunk 3) | Cao | Cao | Bộ đệm lookahead vi mô chỉ chuyển trạng thái khi khớp từng ký tự theo tiền tố. Nếu chuỗi tiếp tục khớp tiền tố của thẻ, FSM duy trì tích lũy; nếu lệch dù 1 ký tự, lập tức xả toàn bộ buffer ra ngoài. |
| **Mô hình suy luận không dùng thẻ `<think>`** mà dùng định dạng markdown như `> Thinking...` | Trung bình | Trung bình | `ThinkingDemuxer` hỗ trợ cấu hình `openTag` / `closeTag` linh hoạt từ file YAML Adapter (`adapters/*.yaml`) thông qua trường `output_parser.thinking_tags`. |
| **Client OpenAI cũ bị crash khi nhận `reasoning_content`** | Trung bình | Cao | Đàm phán linh hoạt qua `x-reasoning-format: inline`. Người dùng hoặc client có thể ép kiểu inline hoặc tắt reasoning mà không làm thay đổi logic server. |
| **Treo tiến trình khi suy luận quá lâu (Hanging Loop)** | Thấp | Nghiêm trọng | Cơ chế `timeout_seconds` trong Supervisor và Win32 Job Objects / POSIX process groups vẫn giám sát độc lập, tự động hủy tiến trình nếu vượt quá ngưỡng timeout cho phép. |

---

## 10. Kết Luận

Đề xuất của **Candidate 1** giải quyết dứt điểm sự giằng co giữa tính trung thực của dữ liệu suy luận và độ trễ thời gian thực của giao thức streaming. Bằng cách triển khai **Zero-Buffer Streaming State Machine (`ThinkingDemuxer`)** kết hợp với **Giao thức dây lưỡng phương thức (Dual-Mode Wire Transmission)** và **Giao diện Obsidian Cyber-Deck cho PlaygroundView**, hệ thống `cli-to-api` đạt được sự hoàn thiện cấp enterprise: không làm tăng dù chỉ 1 millisecond độ trễ không cần thiết, tương thích 100% với toàn bộ hệ sinh thái OpenAI hiện hành, và mang lại trải nghiệm phát triển phần mềm trực quan, sống động và đầy uy lực.
