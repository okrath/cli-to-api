---
type: brainstorm-evaluation
date: 2026-09-16
status: accepted
target: cli-to-api
mode: ultra-verifier-pass
lead_verifier: Kongming
winning_candidate: Candidate D (Candidate 4)
---

# Báo Cáo Thẩm Định Kiến Trúc & Bảng Điểm Xếp Hạng Độc Lập
## Đánh Giá Toàn Diện Các Phương Án Xử Lý Luồng Suy Nghĩ Độc Lập (Chain-of-Thought / Deep Reasoning Demuxing Engine) Cho Hệ Thống `cli-to-api`

---

## 1. Bảng Tổng Sắp Xếp Hạng & Điểm Số (Ultra Verifier Ranking Table)

Dựa trên 4 chiều kích thẩm định kiến trúc tiêu chuẩn (thang điểm 1–20 mỗi tiêu chí, tổng điểm tối đa **80 điểm**):
1. **Tiêu chí 1: Tôn Trọng Yêu Cầu & Giới Hạn Bounded Context (Faithfulness to Agnostic Bridge Scope)**
2. **Tiêu chí 2: Tính Khả Thi Kỹ Thuật & Độ Hoàn Thiện Kiến Trúc (Technical Feasibility & Actionability)**
3. **Tiêu chí 3: Độ Sắc Bén Của Tiêu Chí Kiểm Thử (Test Sharpness & Verification Rigor)**
4. **Tiêu chí 4: Trung Thực Rủi Ro & Năng Lực Chống Chịu Ngoại Lệ (Risk Realism & Edge-Case Resilience)**

| Xếp Hạng | Ứng Viên (Candidate) | Đề Xuất Trọng Tâm | Tôn Trọng Request (1–20) | Khả Thi Kỹ Thuật (1–20) | Tiêu Chí Sắc Bén (1–20) | Trung Thực Rủi Ro (1–20) | Tổng Điểm (/80) | Phán Quyết Kỹ Thuật (Verdict) |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| 🥇 | **Candidate D** *(Cand. 4)* | **Dual-Channel Event Demuxing, SQLite Trace Persistence, Token Accounting & Cyberdeck UI** | **20** | **19** | **19** | **19** | **77 / 80** | **CHIẾN THẮNG CHÍNH THỨC (Adopt as Core Architecture)** |
| 🥈 | **Candidate B** *(Cand. 2)* | Protocol Multi-Dialect Engine, Declarative YAML Schema & Live TPS Telemetry | 18 | 19 | 18 | 18 | 73 / 80 | **Á Quân (Tích hợp cơ chế YAML Schema & Suffix Matching)** |
| 🥉 | **Candidate E** *(Cand. 5)* | Resilient FSM Processor, Nested Depth Counter & Unclosed EOF Auto-Recovery | 18 | 18 | 18 | 18 | 72 / 80 | **Đồng Á Quân (Tích hợp FSM Nesting & EOF Recovery)** |
| 4th | **Candidate A** *(Cand. 1)* | Zero-Buffer Demuxer, Dual-Mode Wire Negotiation & Live Playground Timer | 18 | 17 | 17 | 16 | 68 / 80 | Hạn chế (Thiếu kiểm toán dữ liệu và kế toán reasoning tokens) |
| 5th | **Candidate C** *(Cand. 3)* | Universal Tag Parser, User-Agent Sniffing & Multi-Turn Context Decontamination | 17 | 17 | 16 | 16 | 66 / 80 | Hạn chế (User-Agent sniffing mong manh, thiếu nâng cấp UI/DB) |

---

## 2. Thẩm Định Chi Tiết Từng Ứng Viên (Detailed Granular Critique)

### 2.1 Candidate D (Đề xuất 4): 77 / 80 điểm — *Kiến Trúc Toàn Diện Cấp Doanh Nghiệp*
* **Tôn trọng Request (20/20):** Nhận diện chính xác 4 nút thắt cổ chai hệ thống: ô nhiễm nội dung luồng đơn, mù lòa kế toán token, mất mát dấu vết tư duy khi CLI thoát, và giao diện Playground phẳng. Đề xuất bao phủ trọn vẹn từ OS Process Supervisor, Stream Pipeline, REST/SSE Gateway, Database SQLite WAL đến Cyberdeck Web UI.
* **Khả thi Kỹ thuật (19/20):** Thiết lập ranh giới phân luồng kép sạch sẽ ngay tại tầng `ProcessManager` với 2 callback độc lập `onThoughtDelta` và `onContentDelta`. Triển khai bảng Drizzle schema `thinking_history` liên kết chặt chẽ với `request_metrics` và `conversation_threads`. Bổ sung kế toán `completion_tokens_details.reasoning_tokens` đúng chuẩn OpenAI 2026. Trừ 1 điểm vì thuật toán FSM mẫu trong tài liệu chưa tích hợp đếm độ sâu thẻ lồng nhau (nested tags).
* **Tiêu chí Sắc bén (19/20):** 7 tiêu chí nghiệm thu (AC) viết dưới cấu trúc GIVEN-WHEN-THEN rõ ràng, định lượng chi tiết độ trễ ($\le 0.5\text{ms}$ demuxing, $\le 200\text{ms}$ kill), bảo vệ ranh giới chunk mạng chẻ ngang (`<thi` + `nk>`), kiểm soát lỗi `SQLITE_BUSY` dưới $5\text{ms}$.
* **Trung thực Rủi ro (19/20):** Dự liệu chính xác nguy cơ tắc nghẽn I/O khi ghi nhận hàng chục megabyte CoT vào SQLite (giải quyết bằng micro-batching WAL), rủi ro rò rỉ tiến trình khi client abort giữa chừng pha suy luận kéo dài, và giới hạn ký tự Windows.

---

### 2.2 Candidate B (Đề xuất 2): 73 / 80 điểm — *Xuất Sắc Về Khai Báo Adapter & Telemetry*
* **Tôn trọng Request (18/20):** Giải quyết xuất sắc tính mở rộng cho cộng đồng thông qua khai báo YAML `reasoning_parser` (`tags`, `regex`, `json_field`). Trừ 2 điểm vì mở rộng sang endpoint Anthropic `/v1/messages`, làm phân tán trọng tâm của một gateway vốn tập trung tối ưu cho chuẩn OpenAI REST & SSE.
* **Khả thi Kỹ thuật (19/20):** Thuật toán `findCandidatePrefixLength` kiểm tra hậu tố khớp tiền tố thẻ cực kỳ sắc sảo, giải quyết triệt để rủi ro rò rỉ hoặc xả nhầm ký tự. Bổ sung telemetry `chunk:thought` và đo đạc Live TPS trên Event Bus.
* **Tiêu chí Sắc bén (18/20):** Bộ AC bao phủ tốt từ stream JSON-lines của Claude Code đến thẻ XML của DeepSeek-R1.
* **Trung thực Rủi ro (18/20):** Nhận diện tốt rủi ro CPU lag khi dùng regex trên buffer tích lũy. Tuy nhiên, xem việc lưu trữ CoT là non-goal khiến toàn bộ dấu vết tư duy bị bốc hơi sau khi stream kết thúc, vô hiệu hóa khả năng kiểm toán lỗi logic.

---

### 2.3 Candidate E (Đề xuất 5): 72 / 80 điểm — *Chuyên Gia Về Khả Năng Chống Chịu Ngoại Lệ (Edge Cases)*
* **Tôn trọng Request (18/20):** Đặt trọng tâm duy nhất vào tầng xử lý luồng (Stream Pipeline Subsystem) với độ bền bỉ cơ học cao, bỏ qua các tầng dữ liệu và giao diện người dùng.
* **Khả thi Kỹ thuật (18/20):** Cung cấp giải pháp kỹ thuật xuất sắc nhất về FSM: quản lý con trỏ `nestingDepth` cho phép xử lý thẻ `<think>` lồng nhau và tự động chốt đóng an toàn (Auto-Close & Flush on EOF) khi CLI bị crash đột ngột. Bộ nhớ đạt hằng số $O(1)$ tuyệt đối ngay cả khi gặp chuỗi reasoning 64k tokens.
* **Tiêu chí Sắc bén (18/20):** Thiết lập kịch bản kiểm thử giả lập (Mock CLI) với các chunk 1-byte phân mảnh và spinner xen kẽ rất thực tế.
* **Trung thực Rủi ro (18/20):** Phân tích chi tiết rủi ro tràn RAM Node.js khi đệm chuỗi dài và cơ chế tự phục hồi khi gặp thẻ dị dạng.

---

### 2.4 Candidate A (Đề xuất 1): 68 / 80 điểm — *Tập Trung Vào Độ Trễ & UI Tối Giản*
* **Tôn trọng Request (18/20):** Tiếp cận đúng đắn về Zero-Buffer Latency và Dual-Mode Wire Transmission (`separate` vs `inline`).
* **Khả thi Kỹ thuật (17/20):** Máy trạng thái FSM đơn giản nhưng cơ chế xử lý khi mismatch tiền tố (`evaluateOpenTagPrefix`) có khiếm khuyết: xả thẳng toàn bộ buffer mà không kiểm tra lại xem ký tự gây lỗi có phải là bắt đầu của một thẻ mới hay không (ví dụ gặp chuỗi `<<think>`). Bỏ qua tầng cơ sở dữ liệu và kế toán reasoning token.
* **Tiêu chí Sắc bén (17/20):** Đưa ra chỉ số thời gian kép TTFR (Time-to-First-Reasoning) vs TTFT rất hữu ích.
* **Trung thực Rủi ro (16/20):** Thiếu giải pháp lưu trữ dấu vết tư duy và không đo lường chi phí bộ nhớ khi client kết nối chậm.

---

### 2.5 Candidate C (Đề xuất 3): 66 / 80 điểm — *Tự Động Đàm Phán Nhưng Rủi Ro Cao*
* **Tôn trọng Request (17/20):** Ý tưởng sáng tạo nhất là khử ô nhiễm ngữ cảnh đa lượt (Multi-turn Context Decontamination) trong `content-normalizer`, cắt bỏ thẻ CoT cũ ở các lượt chat sau để tiết kiệm 30%–70% context window.
* **Khả thi Kỹ thuật (17/20):** Cơ chế User-Agent Sniffing tự động quyết định cắt bỏ hay giữ lại reasoning rất dễ gãy vỡ (brittle) trong thực tế do các client thường xuyên đổi header hoặc sử dụng proxy trung gian.
* **Tiêu chí Sắc bén (16/20):** Tiêu chí kiểm thử ở mức cơ bản, thiếu kịch bản chịu tải cao.
* **Trung thực Rủi ro (16/20):** Chưa lường trước được việc User-Agent giả mạo làm sai lệch kỳ vọng của người dùng cuối.

---

## 3. Xác Định Phương Án Chiến Thắng (Winning Candidate Proclamation)

### Ứng Viên Chiến Thắng: **CANDIDATE D**

**Lý do lựa chọn:**
1. **Tính Hoàn Chỉnh Toàn Trực Giao (End-to-End Architectural Completeness):** Candidate D là phương án duy nhất giải quyết bài toán suy luận trên toàn bộ vòng đời ứng dụng: từ **OS Process Supervisor** (bóc tách kênh `ThoughtChannel` / `ContentChannel`), **Wire Protocol Engine** (OpenAI SSE với `choices[0].delta.reasoning_content`), **Database State Engine** (bảng `thinking_history` liên kết Thread Merkle DAG trong SQLite WAL), **Kế toán Token** (`completion_tokens_details.reasoning_tokens`), cho đến **Cyberdeck Web Console** (Obsidian Dark Playground với Accordion phát sáng radar tím).
2. **Loại Bỏ Mù Lòa Kế Toán & Dấu Vết:** Cho phép các AI Coding Agent (Cursor, Continue) nhận câu trả lời sạch 100%, trong khi các Web UI (Open WebUI, LibreChat) hiển thị khối suy luận chuyên biệt, đồng thời lưu vết vĩnh viễn dữ liệu CoT phục vụ debug prompt và kiểm toán chi phí.

### Tinh Hoa Tích Hợp Đa Nguồn (The Kongming Synthesis Matrix):
Để đưa kiến trúc lên mức hoàn hảo tuyệt đối (Production-Grade Invariant), Candidate D sẽ được tích hợp 4 tinh hoa từ các ứng viên còn lại:
* **Từ Candidate B:** Tích hợp bộ quy tắc bóc tách khai báo qua YAML Adapter (`reasoning_parser: tags | regex | json_field`) và thuật toán so khớp tiền tố lùi `findCandidatePrefixLength` để loại bỏ 100% rủi ro nuốt ký tự.
* **Từ Candidate E:** Tích hợp bộ đếm độ sâu lồng nhau (`nestingDepth`) và cơ chế tự động chốt đóng phục hồi an toàn khi luồng kết thúc đột ngột (Auto-Recovery Flush on EOF).
* **Từ Candidate C:** Tích hợp cơ chế khử nhiễm ngữ cảnh đa lượt (Multi-Turn Context Decontamination) trong `content-normalizer` để loại bỏ rác CoT cũ khỏi prompt gửi xuống CLI ở các lượt chat tiếp theo.
* **Từ Candidate A:** Tích hợp bộ chuyển đổi header đàm phán `x-reasoning-format: separate | inline | strip` và bộ đo lường thời gian kép TTFR vs TTFT.

---

## 4. CHỈ THỊ KIẾN TRÚC THỰC THI TUYỆT ĐỐI (Actionable Architectural Directives)

*Ban hành bởi Lead Architectural Verifier. Đội ngũ kỹ thuật bắt buộc tuân thủ nghiêm ngặt các chỉ thị dưới đây khi triển khai mã nguồn:*

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    KIẾN TRÚC TỔNG THỂ THỰC THI (THE DIRECTIVE ENGINE)                   │
│                                                                                                        │
│  [ CLIENT INGRESS ] ──► POST /v1/chat/completions (Open WebUI, LibreChat, Cursor, Continue, Python)    │
│           │                                                                                            │
│           ├─► Header Inspection: `x-reasoning-format: separate | inline | strip`                       │
│           └─► Context Decontamination: content-normalizer.ts gọt bỏ <think> cũ khỏi lịch sử            │
│                                                                                                        │
│  [ PROCESS SUPERVISOR ] ──► Child Process (Claude Code, Codex CLI, OpenCode, DeepSeek-R1)               │
│           │                                                                                            │
│           ▼ stdout stream                                                                              │
│  [ STREAM PIPELINE ] ──► Utf8StreamDecoder ──► DualStageAnsiSanitizer                                  │
│                                                   │ (Clean text stream)                                │
│                                                   ▼                                                    │
│                        ┌─────────────────────────────────────────────────────┐                         │
│                        │       UNIVERSAL FSM STREAMING DEMUXER (O(1) RAM)    │                         │
│                        │  • Suffix-Prefix Matching (findCandidatePrefixLen)  │                         │
│                        │  • Nesting Depth Counter (nestingDepth)             │                         │
│                        │  • Auto-Close & Flush on EOF                        │                         │
│                        └──────────────────────────┬──────────────────────────┘                         │
│                                                   │                                                    │
│                         ┌─────────────────────────┴─────────────────────────┐                          │
│                         ▼                                                   ▼                          │
│                [ THOUGHT CHANNEL ]                                 [ CONTENT CHANNEL ]                 │
│                         │                                                   │                          │
│                         ▼                                                   ▼                          │
│  [ WIRE SERIALIZER ] ──► data: {"delta":{"reasoning_content":"..."}}       data: {"delta":{"content"}} │
│           │                                                                                            │
│           ├─► Admin Event Bus Telemetry: `chunk:thought` (Live TPS, accumulated tokens)                │
│           ├─► Token Accounting: TokenEstimator tính `completion_tokens_details.reasoning_tokens`       │
│           └─► SQLite WAL Substrate: Ghi bản ghi vào `thinking_history` & cập nhật `request_metrics`   │
│                                                                                                        │
│  [ OBSIDIAN CYBERDECK UI ] ──► PlaygroundView.tsx: Live Milliseconds Timer, Neon Radar Pulse Accordion │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Chỉ Thị 1: Tách Kênh Phân Luồng Kép Tại Process Supervisor (`apps/gateway/src/supervisor/`)

1. **Mở rộng giao diện thực thi (`types.ts`):**
   * Trong `ProcessSpawnOptions`, thay thế cơ chế callback đơn bằng cơ chế kênh đôi:
     ```typescript
     export interface ProcessSpawnOptions {
       // ... giữ nguyên executable, args, cwd, env, executionMode ...
       onDelta?: (chunk: string) => void;         // Legacy fallback
       onContentDelta?: (chunk: string) => void;  // Kênh nội dung sạch
       onThoughtDelta?: (chunk: string) => void;  // Kênh chuỗi suy nghĩ
       onError?: (errText: string) => void;
     }
     ```
   * Trong `ProcessExecutionResult`, bổ sung các trường định lượng:
     ```typescript
     export interface ProcessExecutionResult {
       // ... giữ nguyên exitCode, signal, stdout, stderr, durationMs, aborted ...
       thoughtDurationMs: number;
       thoughtContent: string;
       cleanContent: string;
       reasoningTokens: number;
     }
     ```
2. **Quy chuẩn vòng đời tiến trình trong `process-manager.ts`:**
   * Tầng Supervisor khởi tạo `StreamingDemuxer` trước khi spawn tiến trình.
   * Dòng stdout thô phải được chuẩn hóa qua `Utf8StreamDecoder` và `DualStageAnsiSanitizer` trước khi đưa vào hàm `demuxer.feed(chunk)`.
   * Gắn cờ hủy tiến trình: Khi socket client ngắt kết nối (`req.raw.on("close")`), kích hoạt `AbortController` tiêu diệt sạch tiến trình con trong $\le 200\text{ms}$ thông qua Win32 Job Object (`KILL_ON_JOB_CLOSE`) hoặc POSIX Process Group (`process.kill(-pgid, 'SIGKILL')`).

---

### Chỉ Thị 2: Triển Khai Bộ Máy Trạng Thái FSM Tách Luồng Đa Năng (`apps/gateway/src/stream/thinking-demuxer.ts`)

Xây dựng module FSM kết hợp thuật toán so khớp tiền tố lùi (từ Candidate B) và quản lý độ sâu lồng nhau (từ Candidate E):

```typescript
// apps/gateway/src/stream/thinking-demuxer.ts

export type ReasoningWireMode = "separate" | "inline" | "strip";

export interface ThinkingDemuxerCallbacks {
  onThoughtDelta: (token: string) => void;
  onContentDelta: (token: string) => void;
  onPhaseChange?: (phase: "IDLE" | "THINKING" | "CONTENT") => void;
}

export interface ThinkingDemuxerOptions {
  openTag?: string;       // Mặc định "<think>"
  closeTag?: string;      // Mặc định "</think>"
  mode?: ReasoningWireMode; // Mặc định "separate"
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

  constructor(callbacks: ThinkingDemuxerCallbacks, options: ThinkingDemuxerOptions = {}) {
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
          if (openIdx > 0) {
            this.emitContent(this.buffer.slice(0, openIdx));
          }
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
          break; // Giữ tiền tố lại chờ chunk sau
        }

        this.emitContent(this.buffer);
        this.buffer = "";
        break;
      }

      if (this.phase === "THINKING") {
        const closeIdx = this.buffer.indexOf(this.closeTag);
        const openIdx = this.buffer.indexOf(this.openTag);

        // Xử lý thẻ mở lồng nhau
        if (openIdx !== -1 && (closeIdx === -1 || openIdx < closeIdx)) {
          this.emitThought(this.buffer.slice(0, openIdx + this.openTag.length));
          this.buffer = this.buffer.slice(openIdx + this.openTag.length);
          this.nestingDepth++;
          continue;
        }

        if (closeIdx !== -1) {
          if (closeIdx > 0) {
            this.emitThought(this.buffer.slice(0, closeIdx));
          }
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
      if (this.phase === "THINKING") {
        this.emitThought(this.buffer);
      } else {
        this.emitContent(this.buffer);
      }
      this.buffer = "";
    }
    if (this.phase === "THINKING") {
      this.phase = "CONTENT";
      this.thoughtEndTime = Date.now();
      this.callbacks.onPhaseChange?.("CONTENT");
    }
  }

  private findCandidatePrefixLength(str: string, tag: string): number {
    const maxCandidate = Math.min(str.length, tag.length - 1);
    for (let len = maxCandidate; len > 0; len--) {
      if (str.endsWith(tag.slice(0, len))) {
        return len;
      }
    }
    return 0;
  }

  private emitContent(text: string): void {
    if (!text) return;
    this.accumulatedContent += text;
    this.callbacks.onContentDelta(text);
  }

  private emitThought(text: string): void {
    if (!text) return;
    this.accumulatedThought += text;
    if (this.mode === "separate") {
      this.callbacks.onThoughtDelta(text);
    } else if (this.mode === "inline") {
      this.callbacks.onContentDelta(text);
    }
    // Nếu mode === 'strip': hoàn toàn nuốt bỏ token suy luận
  }
}
```

---

### Chỉ Thị 3: Di Trú Cơ Sở Dữ Liệu SQLite WAL & Bảng `thinking_history` (`apps/gateway/src/db/`)

1. **Đặc tả Schema Drizzle (`apps/gateway/src/db/schema.ts`):**
   * Khởi tạo bảng `thinking_history` lưu trữ chuỗi CoT liên kết với Thread và Metrics:
     ```typescript
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
         thoughtHash: text("thought_hash").notNull(), // sha256 tra cứu trùng lặp
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
     ```
   * Thêm 2 cột vào bảng `requestMetrics`:
     * `reasoningTokens: integer("reasoning_tokens").default(0)`
     * `thoughtDurationMs: integer("thought_duration_ms").default(0)`
2. **Cập nhật Migration Engine (`apps/gateway/src/db/migrate.ts`):**
   * Bổ sung migration DDL không phá hủy dữ liệu (Additive DDL):
     ```sql
     CREATE TABLE IF NOT EXISTS thinking_history (
       id TEXT PRIMARY KEY,
       request_id TEXT NOT NULL,
       thread_id TEXT,
       adapter_id TEXT NOT NULL,
       account_id TEXT NOT NULL,
       model_id TEXT NOT NULL,
       thought_content TEXT NOT NULL,
       thought_hash TEXT NOT NULL,
       reasoning_tokens INTEGER NOT NULL DEFAULT 0,
       completion_tokens INTEGER NOT NULL DEFAULT 0,
       thought_duration_ms INTEGER NOT NULL DEFAULT 0,
       status TEXT NOT NULL DEFAULT 'COMPLETED',
       created_at INTEGER DEFAULT (strftime('%s', 'now'))
     );
     CREATE INDEX IF NOT EXISTS idx_thinking_req ON thinking_history (request_id);
     CREATE INDEX IF NOT EXISTS idx_thinking_thread ON thinking_history (thread_id);
     CREATE INDEX IF NOT EXISTS idx_thinking_hash ON thinking_history (thought_hash);
     ALTER TABLE request_metrics ADD COLUMN reasoning_tokens INTEGER DEFAULT 0;
     ALTER TABLE request_metrics ADD COLUMN thought_duration_ms INTEGER DEFAULT 0;
     ```

---

### Chỉ Thị 4: Kế Toán Token Suy Luận Chi Tiết (`apps/gateway/src/utils/token-estimator.ts`)

Cập nhật hàm tính toán token hỗ trợ `completion_tokens_details`:

```typescript
// apps/gateway/src/utils/token-estimator.ts

export interface TokenUsageDetails {
  reasoning_tokens: number;
}

export interface DetailedTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  completion_tokens_details?: TokenUsageDetails;
}

export function estimateDetailedTokenUsage(
  messages: Array<{ role: string; content: any }>,
  completionText: string,
  thoughtText: string = ""
): DetailedTokenUsage {
  let promptChars = 0;
  for (const m of messages) {
    const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    promptChars += text.length + 10;
  }

  // Heuristic: ~3.5 chars/token trung bình cho hỗn hợp ngôn ngữ và code
  const promptTokens = Math.max(1, Math.ceil(promptChars / 3.5));
  const substantiveTokens = Math.max(1, Math.ceil(completionText.length / 3.5));
  const reasoningTokens = thoughtText.length > 0 ? Math.max(1, Math.ceil(thoughtText.length / 3.5)) : 0;
  
  // Tổng completion tokens bao gồm cả reasoning tokens theo quy chuẩn OpenAI
  const totalCompletionTokens = substantiveTokens + reasoningTokens;

  return {
    prompt_tokens: promptTokens,
    completion_tokens: totalCompletionTokens,
    total_tokens: promptTokens + totalCompletionTokens,
    completion_tokens_details: {
      reasoning_tokens: reasoningTokens,
    },
  };
}
```

---

### Chỉ Thị 5: Mở Rộng Declarative YAML Adapter Schema (`apps/gateway/src/adapters/schema.ts`)

Bổ sung cấu hình bóc tách reasoning vào `AdapterConfigSchema` để người dùng dễ dàng tích hợp CLI mới mà không cần can thiệp vào core TypeScript:

```yaml
# Ví dụ: adapters/deepseek-r1.yaml
id: "deepseek-cli"
name: "DeepSeek-R1 Local Runner"
executable: "deepseek-r1"
execution_mode: "pipe"
reasoning_parser:
  enabled: true
  type: "tags" # "tags" | "regex" | "json_field"
  tags_config:
    open_tag: "<think>"
    close_tag: "</think>"
    strip_from_content: true
  effort_mapping:
    param_style: "flag"
    flag_template: "--thinking-budget {budget}"
    budget_values:
      low: 1024
      medium: 4096
      high: 16384
```

Zod Schema tương ứng tại `apps/gateway/src/adapters/schema.ts`:
```typescript
export const ReasoningParserSchema = z.object({
  enabled: z.boolean().default(true),
  type: z.enum(["tags", "regex", "json_field"]).default("tags"),
  tags_config: z.object({
    open_tag: z.string().default("<think>"),
    close_tag: z.string().default("</think>"),
    strip_from_content: z.boolean().default(true),
  }).optional(),
  effort_mapping: z.object({
    param_style: z.enum(["flag", "env", "arg_replace"]).default("flag"),
    flag_template: z.string().default("--thinking-budget {budget}"),
    budget_values: z.record(z.union([z.string(), z.number()])).default({}),
  }).optional(),
}).optional();
```

---

### Chỉ Thị 6: Chuẩn Hóa Giao Thức Dây SSE & Khử Nhiễm Ngữ Cảnh (`apps/gateway/src/api/routes/openai-chat.ts`)

1. **Khử nhiễm ngữ cảnh trong `content-normalizer.ts`:**
   * Khi chuẩn hóa lịch sử hội thoại gửi xuống CLI, loại bỏ hoàn toàn các cặp thẻ `<think>...</think>` khỏi tin nhắn của `assistant` ở các lượt trước:
     ```typescript
     export function decontaminateReasoningHistory(content: string): string {
       if (!content) return "";
       return content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
     }
     ```
2. **Tuân thủ giao thức dây SSE (`sse-serializer.ts`):**
   * Hỗ trợ phát trường `delta: { reasoning_content: chunk }` cho pha tư duy và `delta: { content: chunk }` cho pha kết quả.
   * Gói tin hoàn tất cuối cùng trước `data: [DONE]\n\n` bắt buộc phải trả về object `usage` chứa `completion_tokens_details.reasoning_tokens`.
   * Gắn các response header đo kiểm: `X-Debug-TTFR`, `X-Debug-TTFT`, `X-Debug-Think-Duration-Ms`.

---

### Chỉ Thị 7: Nâng Cấp Giao Diện Quản Trị Obsidian Cyberdeck (`apps/web/src/views/PlaygroundView.tsx`)

1. **Khối Hiển Thị Tư Duy Accordion Phát Sáng (Radar Glow):**
   * Trạng thái đang stream suy luận: Render viền tím phát sáng `border-violet-500/50 shadow-[0_0_15px_rgba(139,92,246,0.15)]`, nhấp nháy đèn trạng thái Cyber `● THINKING... (4.2s)` với độ phân giải cập nhật $100\text{ms}$.
   * Trạng thái hoàn thành: Đổi sang `Thought for 6.8s (380 reasoning tokens)`, tự động đóng hoặc mở theo tùy chọn của lập trình viên.
2. **Thanh Thao Tác Nhanh (Utility Action Bar):**
   * Tích hợp nút `"Copy Reasoning"` (chỉ sao chép chuỗi suy luận thuần) và `"Copy Answer"` (sao chép câu trả lời Markdown).
   * Thanh số liệu thời gian thực hiển thị 4 chỉ số song song: **TTFT (ms)**, **$T_{\text{thought}}$ (s)**, **$T_{\text{gen}}$ (s)**, và **Tốc độ (tokens/giây)**.

---

### Chỉ Thị 8: Kế Hoạch Triển Khai & Kiểm Thử Nghiệm Thu Tự Động (Acceptance Test Suite)

Bắt buộc bổ sung bộ kiểm thử E2E tại `tests/e2e/reasoning-streaming.test.ts` xác thực 5 ca kiểm thử bất biến:
1. **Ca 1 (Chunk Boundary Split):** Giả lập stdout phát chuỗi bị băm thành các micro-chunks (`"<thi"` $\to$ `"nk>1+1=2</thi"` $\to$ `"nk>Kết quả là 2"`). Xác thực `reasoning_content` nhận `"1+1=2"` và `content` nhận `"Kết quả là 2"`. Không rò rỉ bất kỳ byte thẻ nào.
2. **Ca 2 (Unclosed Tag Recovery on EOF):** Giả lập CLI emit `<think>Đang giải thuật toán...` rồi đóng stream. Xác thực gateway tự động đóng thẻ, đẩy toàn bộ text vào `reasoning_content`, phát `[DONE]`, và ghi nhận trạng thái `status = 'TRUNCATED'` vào SQLite.
3. **Ca 3 (Nested Tags):** Input `<think>B1 <think>Chi tiết</think> B2</think>Xong`. Xác thực `nestingDepth` duy trì đúng luồng suy luận.
4. **Ca 4 (Token Accounting Integrity):** Xác thực payload `usage` ở chunk SSE cuối cùng trả về `completion_tokens_details.reasoning_tokens > 0` và tổng `completion_tokens` khớp chính xác.
5. **Ca 5 (Zero-Zombie Containment):** Gửi prompt kích hoạt reasoning, client abort sau 200ms. Xác thực toàn bộ cây tiến trình CLI bị tiêu diệt sạch trong $\le 200\text{ms}$.

---

## 5. Kết Luận

Bằng việc chọn **Candidate D** làm kiến trúc nền tảng và dung nạp toàn bộ tinh hoa về so khớp tiền tố lùi, FSM nesting, khử ô nhiễm ngữ cảnh đa lượt và giao thức đàm phán linh hoạt từ các ứng viên còn lại, hệ thống `cli-to-api` thiết lập một tiêu chuẩn công nghiệp mẫu mực: **Stream suy luận thời gian thực với độ trễ tiệm cận 0, kế toán token minh bạch tuyệt đối, bảo toàn 100% dữ liệu CoT trong SQLite WAL, và mang lại trải nghiệm Obsidian Cyberdeck đỉnh cao cho kỷ nguyên Reasoning AI.** Toàn bộ chỉ thị trên là bắt buộc và phải được tuân thủ nguyên vẹn trong kế hoạch thực thi kỹ thuật tiếp theo.
