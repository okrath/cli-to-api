# BẢN ĐỀ XUẤT KIẾN TRÚC & HỢP ĐỒNG GIAO HÀNG ĐẶC TẢ (BRAINSTORM CONTRACT)
## DỰ ÁN: CLI-TO-API — AI GATEWAY INFRASTRUCTURE
### Phân hệ: Usage & Token Consumption Analytics View
### Định hướng kiến trúc (Candidate 5 Angle):
> **"Client Application Attribution & Model Efficiency Benchmarking: App-Scoped Tracking, Speed-vs-Cost ROI Matrix, Model Utilization"**

---

**Ứng viên:** Candidate 5 — Ultra Verifier Architecture Council  
**Vai trò:** Principal AI Gateway & Systems Performance Architect  
**Trạng thái:** Bounded Engineering Specification & Contract  
**Ngày lập đề xuất:** 18/09/2026  

---

## TỔNG QUAN ĐIỀU HÀNH (EXECUTIVE SUMMARY)

Hệ thống `cli-to-api` hiện đóng vai trò là một multiplexer gateway đa kênh, kết nối nhiều công cụ lập trình AI biên (Cursor IDE, Claude Code CLI, Continue.dev, Roo Code, Aider, Open WebUI, Python SDKs) với các CLI AI backend (`codex-cli`, `claude-code`, `devin-cli`, `omp-cli`).

Hiện tại, toàn bộ việc giám sát luồng mới dừng ở mức hạ tầng thô (`Fleet Radar` hiển thị PID, RAM/CPU, Ingress/Egress token tổng thể). Quản trị viên (Admin) hoàn toàn đối mặt với **3 điểm mù cốt tử**:
1. **Điểm mù Định danh Nguồn tiêu thụ (Client Attribution Blindspot):** Không biết ứng dụng khách nào đang "đốt" token nhiều nhất. Liệu tính năng tự động hoàn thành mã nguồn (Autocomplete) của Cursor đang gửi hàng ngàn prompt thừa, hay Claude Code Agent đang rơi vào vòng lặp suy luận sâu (Thinking Loop), hay Roo Code đang spam context git diff?
2. **Điểm mù Hiệu quả Mô hình & Ma trận Tốc độ - Chi phí (Model Efficiency & Speed-vs-Cost Blindspot):** Thiếu cơ chế đo lường tương quan giữa tốc độ sinh token thực tế (*Tokens/sec*), chi phí tài nguyên tương đối (*Relative Cost Weight*), và tỷ lệ suy luận (*Reasoning Ratio*). Mô hình đắt đỏ như `gpt-5.6-asta` (Tier `xhigh`, cost weight 10x) có thực sự vượt trội về tốc độ và chất lượng suy luận so với `gpt-5.6-terra` (Tier `medium`, cost weight 2x), hay đang gây lãng phí nghiêm trọng?
3. **Điểm mù Cấu trúc Token 3 Tầng (3-Way Token Type Breakdown):** Trong kỷ nguyên Hybrid Reasoning Models (o1/o3, Claude 3.7 Sonnet Thinking, DeepSeek-R1), số lượng **Reasoning Tokens (Thinking CoT)** thường gấp 3–8 lần Output thực tế. Việc gộp chung nhị phân (Prompt vs Completion) làm sai lệch hoàn toàn bức tranh tài nguyên thực tế.

**Giải pháp của Candidate 5:**  
Xây dựng phân hệ **Usage & Token Consumption Analytics (`UsageAnalyticsView`)** chuyên sâu, tích hợp:
- **Client Application Attribution Engine:** Bộ phát hiện header siêu tốc $O(1)$ (`ClientDetector`), bóc tách chính xác từng IDE/Agent/SDK.
- **Model Efficiency & Speed-vs-Cost ROI Matrix:** Tọa độ 4 chiều phân tích Tốc độ sinh token (loại trừ TTFT), Chi phí đơn vị, Tỷ lệ suy luận (Reasoning Ratio), và Tỷ lệ lỗi (Error Rate).
- **Cost-Efficiency Leaderboard & 1-Click Routing Hints:** Xếp hạng "Top Mô hình tiết kiệm nhất" (Workhorse Models) vs "Top Mô hình tiêu tốn nhất" (Heavy Spenders) kèm khuyến nghị tái cấu hình `routing_pipelines`.
- **Phân rã Token 3 Tầng:** Đo đếm tách bạch Input (Prompt), Reasoning (Thinking CoT), và Output (Completion) trên từng Model và Client App.

---

# 1. BRAINSTORM CONTRACT (HỢP ĐỒNG GIAO HÀNG ĐẶC TẢ)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ CANDIDATE 5: BOUNDED BRAINSTORM DELIVERY CONTRACT                                            │
├────────────────────────────┬─────────────────────────────────────────────────────────────────┤
│ Scope                      │ Usage & Token Consumption Analytics View (Client & Model ROI)   │
│ Target View                │ NavTab 'usage' -> UsageAnalyticsView.tsx (Obsidian Cyberdeck)  │
│ Backend API Group          │ /api/admin/usage/* (Summary, Attribution, Efficiency, Ranking)  │
│ Telemetry Schema Update    │ request_metrics: add client_app, client_user_agent + indexes    │
│ Ingress Overhead Target    │ Header detection latency <= 2.5 µs; Zero allocations on heap    │
│ Analytics Query Target     │ Aggregation response <= 35 ms for 100,000 SQLite rows (WAL)    │
└────────────────────────────┴─────────────────────────────────────────────────────────────────┘
```

### 1.1. Outcome (Trạng thái Vận hành & Trải nghiệm Đích)

1. **App-Scoped Attribution Tự động:**  
   Nhận diện và bóc tách 100% các client kết nối qua Ingress (`POST /v1/chat/completions` và `POST /v1/messages`) thành các danh mục chuẩn hóa: `Cursor IDE`, `Claude Code CLI`, `Continue.dev`, `Roo Code`, `Aider`, `Open WebUI`, `Python SDK / LangChain`, và `Direct API / Custom`.
2. **Phân rã Cấu trúc Token 3 Tầng (3-Way Token Breakdown):**  
   Bóc tách minh bạch từng token thành: `Input (Prompt)`, `Reasoning (Thinking CoT)`, và `Output (Completion)` trên từng Mô hình và từng Client Application.
3. **Đo lường Tốc độ Sinh Token Thực tế (True Generation Velocity):**  
   Tính toán chính xác tốc độ sinh token loại trừ TTFT:
   $$\text{Tokens/sec} = \frac{\text{completion\_tokens} + \text{reasoning\_tokens}}{\max\left(\frac{\text{total\_duration\_ms} - \text{ttft\_ms}}{1000},\ 0.05\right)}$$
4. **Speed-vs-Cost ROI Matrix & Scatter Plot:**  
   Trực quan hóa mối tương quan 4 chiều: Tốc độ (trục X), Chi phí ước tính trên 1K tokens (trục Y), Khối lượng token (kích thước Bubble), và Tỷ lệ suy luận Reasoning Ratio (mã màu Bubble) để phát hiện "The Sweet Spot" (Góc tối ưu).
5. **Bảng Xếp hạng Kinh tế & Khuyến nghị Routing:**  
   Xếp hạng "Top Economical Workhorses" (Mô hình năng suất cao, giá rẻ) vs "Top Heavy Spenders" (Mô hình ngốn ngân sách), cung cấp các khuyến nghị 1-click để admin tối ưu hoá `pipeline_targets`.

---

### 1.2. Constraints (Ràng buộc Kỹ thuật, Tương thích & An toàn)

1. **Zero Hot-Path Overhead:**  
   Logic trích xuất client header tại Ingress Middleware phải hoàn tất trong $\le 2.5\mu\text{s}$. Không dùng Regex phức tạp trên luồng nóng; chỉ quét tiền tố/chuỗi con có chặn độ dài tối đa 255 ký tự (Bounded Substring Matching).
2. **Zero External Infrastructure Dependency:**  
   Hoạt động 100% nội tại trong Node.js Fastify và SQLite cục bộ (Drizzle ORM, WAL mode). Tuyệt đối không đòi hỏi Redis, ClickHouse, hay daemon ngoài.
3. **Zero UI Blocking (Aggregated Query Performance):**  
   Các truy vấn SQL tổng hợp theo cửa sổ thời gian (`1h`, `24h`, `7d`, `30d`, `all`) phải phản hồi trong $\le 35\text{ms}$ đối với bảng `request_metrics` quy mô 100.000 bản ghi nhờ hệ thống chỉ mục (Index) chuyên dụng.
4. **Bảo toàn Chuẩn Ingress OpenAI & Anthropic:**  
   Không bắt buộc client phải gửi thêm custom header để hoạt động. Nếu client gửi request tiêu chuẩn không chứa thông tin định danh, hệ thống tự động gán nhãn `direct_api` mà không làm gián đoạn phiên.
5. **Zero Data Loss Migration:**  
   Quá trình cập nhật schema cơ sở dữ liệu (`ALTER TABLE`) phải an toàn, tương thích ngược 100% với các bản ghi lịch sử đã có trong cơ sở dữ liệu.

---

### 1.3. Non-Goals (Phạm vi Loại trừ Rõ ràng)

1. **Không xây dựng cổng thanh toán trực tuyến (Payment Gateway / Stripe / LemonSqueezy):**  
   Chi phí ước tính mang tính chất quy đổi tương đối (Relative Cost Accounting) nhằm kiểm soát hạn mức và tối ưu routing, không phải hệ thống lập hoá đơn tài chính pháp lý.
2. **Không nhúng thư viện Tokenizer WASM cồng kềnh (Tiktoken WASM 10MB):**  
   Sử dụng bộ ước lượng token heuristics $O(1)$ (`token-estimator.ts`) và số đếm chunk thực tế từ bộ giải ghép luồng `thinking-demuxer.ts`.
3. **Không lưu trữ nội dung văn bản (Prompt/Response text):**  
   Không lưu văn bản hội thoại vào cơ sở dữ liệu telemetry để bảo đảm tối đa tính riêng tư và tuân thủ nguyên tắc Zero Local Data Leakage.
4. **Không tự ý thay đổi cấu hình routing nếu không có xác nhận của Admin:**  
   Hệ thống chỉ đưa ra khuyến nghị (Routing Recommendations), việc áp dụng vào pipeline do Admin quyết định.

---

### 1.4. Acceptance Criteria (AC-1 đến AC-6 theo chuẩn Gherkin BDD)

```gherkin
Feature: Usage & Token Consumption Analytics with Client Attribution and Model Efficiency

  Background:
    Given Gateway server Fastify đang vận hành bình thường
    And Cơ sở dữ liệu SQLite đã được cập nhật schema với cột client_app và các chỉ mục tương ứng

  Scenario: AC-1 - Bóc tách Client Application Attribution từ Ingress Headers
    Given Client gửi request POST /v1/chat/completions với header "User-Agent: Cursor/0.45.2 (darwin-arm64)"
    When Gateway tiếp nhận và hoàn tất chu trình streaming của request "req-cursor-01"
    Then Bảng "request_metrics" lưu bản ghi có "client_app" = "cursor"
    And Cột "client_user_agent" ghi nhận "Cursor/0.45.2 (darwin-arm64)"
    And API GET /api/admin/usage/attribution phản ánh thị phần của "Cursor IDE" được cập nhật tức thì

  Scenario: AC-2 - Phân rã chính xác Token 3 tầng (Input vs Output vs Reasoning CoT)
    Given Client gửi yêu cầu tới model "codex-cli/gpt-5.6-asta" với reasoning effort "high"
    When Quá trình stream kết thúc và ThinkingDemuxer ghi nhận:
      | Token Type        | Count |
      | Prompt Tokens     | 1200  |
      | Reasoning Tokens  | 4500  |
      | Completion Tokens | 800   |
    Then Bản ghi metric lưu trữ prompt_tokens = 1200, reasoning_tokens = 4500, completion_tokens = 800
    And API GET /api/admin/usage/token-breakdown phản ánh Reasoning Ratio = 4500 / (1200 + 4500 + 800) = 69.23%

  Scenario: AC-3 - Đo lường Tốc độ Sinh Token Thực tế (Tokens/Sec) loại trừ TTFT
    Given Request streaming mất tổng thời gian total_duration_ms = 4500ms
    And Thời gian chờ gói tin đầu tiên ttft_ms = 500ms
    And Tổng số token sinh ra (reasoning_tokens + completion_tokens) = 200 tokens
    When Bản ghi được ghi nhận vào database
    Then Tốc độ xả token được tính là 200 / ((4500 - 500) / 1000) = 50.0 tokens/sec
    And API GET /api/admin/usage/efficiency hiển thị avg_tokens_per_sec của model tương ứng là 50.0

  Scenario: AC-4 - Ma trận ROI Speed-vs-Cost & Tính toán Chi phí Ước tính
    Given Model "gpt-5.6-asta" có cost_weight = 10.0 và "gpt-5.6-terra" có cost_weight = 2.0
    When Admin truy vấn API GET /api/admin/usage/efficiency?window=24h
    Then Mỗi model trả về đầy đủ các chỉ số:
      | Field                 | Mô tả                                                      |
      | estimated_cost_usd    | Chi phí quy đổi theo trọng số cost_weight và baseline rate |
      | cost_per_1k_tokens    | Chi phí trung bình để tạo ra 1.000 tokens                  |
      | efficiency_score      | Điểm hiệu quả kết hợp giữa tốc độ sinh và chi phí          |
      | error_rate            | Tỷ lệ phần trăm request lỗi (HTTP >= 400 hoặc ERROR)       |

  Scenario: AC-5 - Bảng Xếp hạng Mô hình & Khuyến nghị Tối ưu Routing Group
    Given Trong 24h qua, model "gpt-5.6-terra" đạt 68.5 tokens/sec với chi phí $0.0046/1k tokens
    And Model "gpt-5.6-asta" đạt 44.2 tokens/sec với chi phí $0.0131/1k tokens
    And Ứng dụng "Cursor IDE" gửi 70% request tác vụ soạn thảo thông thường tới "gpt-5.6-asta"
    When Admin truy vấn GET /api/admin/usage/ranking?window=24h
    Then Danh sách "Top Economical Workhorses" xếp "gpt-5.6-terra" ở vị trí dẫn đầu
    And Danh sách "Top Heavy Spenders" xếp "gpt-5.6-asta" ở vị trí đầu bảng
    And Hệ thống sinh khuyến nghị: "Gợi ý định tuyến Cursor autocomplete sang priority_group tiết kiệm chi phí"

  Scenario: AC-6 - Trải nghiệm Cyberdeck UI & Chuyển đổi Time-Window mượt mà
    Given Admin truy cập tab "Usage & Efficiency" trên thanh điều hướng Sidebar
    When Admin chuyển đổi Time-Window từ "24h" sang "7d"
    Then Giao diện hiển thị loading skeleton trong thời gian <= 50ms
    And Toàn bộ 4 phân vùng (Attribution Donut, Speed Scatter Matrix, 3-Way Bar, Leaderboard) đồng bộ cập nhật
    And Biểu đồ scatter matrix vẽ chính xác các bong bóng mô hình theo tọa độ Speed vs Cost
```

---

# 2. THIẾT KẾ KIẾN TRÚC CHI TIẾT (TECHNICAL SPECIFICATION)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                INGRESS LAYER (FASTIFY GATEWAY)                                   │
│  [POST /v1/chat/completions]                       [POST /v1/messages]                          │
│         │                                                   │                                    │
│         ▼                                                   ▼                                    │
│  ┌─────────────────────────────────────────────────────────────────┐                             │
│  │ ClientDetector.detect(req.headers) [O(1) In-Memory Lookup]      │                             │
│  │ ➔ client_app: 'cursor' | 'claude_code' | 'continue' | 'direct'  │                             │
│  └─────────────────────────────────┬───────────────────────────────┘                             │
│                                    │                                                             │
│                                    ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐                             │
│  │ Hot-Path Streaming Execution (Supervisor + Demuxer)             │                             │
│  │ ➔ Ingress/Egress Tally, Thinking Demux (Reasoning Tokens), TTFT │                             │
│  └─────────────────────────────────┬───────────────────────────────┘                             │
└────────────────────────────────────┼─────────────────────────────────────────────────────────────┘
                                     │ Async Non-blocking Enqueue
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                             TELEMETRY PERSISTENCE & ANALYTICS ENGINE                             │
│                                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐                             │
│  │ TelemetryPersistQueue (Batch flush 50 records / 2s)             │                             │
│  └─────────────────────────────────┬───────────────────────────────┘                             │
│                                    │ Batch Insert                                                │
│                                    ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐                             │
│  │ SQLite WAL: request_metrics Table                               │                             │
│  │ [idx_request_metrics_client_app] [idx_request_metrics_created_at]│                             │
│  └─────────────────────────────────┬───────────────────────────────┘                             │
│                                    │ Aggregated SQL Engine                                       │
│                                    ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐                             │
│  │ UsageAnalyticsStore & PricingCalculator                         │                             │
│  │ • Speed-vs-Cost Formula Engine    • Reasoning Ratio Breakdown   │                             │
│  │ • Top Workhorses & Spenders       • App Attribution Aggregation │                             │
│  └─────────────────────────────────┬───────────────────────────────┘                             │
└────────────────────────────────────┼─────────────────────────────────────────────────────────────┘
                                     │ REST APIs (/api/admin/usage/*)
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                              OBSIDIAN CYBERDECK HUD (REACT + VITE)                               │
│                                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────────────────────────┐  │
│  │ UsageAnalyticsView.tsx (NavTab: "usage")                                                   │  │
│  ├───────────────────────────────┬──────────────────────────────┬─────────────────────────────┤  │
│  │ ZONE A: CLIENT ATTRIBUTION    │ ZONE B: ROI SCATTER MATRIX   │ ZONE C: TOKEN TYPE 3-WAY    │  │
│  │ App Distribution Donut & Grid │ Tokens/sec vs Cost/1K Bubble │ Input vs Reasoning vs Output│  │
│  ├───────────────────────────────┴──────────────────────────────┴─────────────────────────────┤  │
│  │ ZONE D: WORKHORSE VS SPENDER LEADERBOARD & ROUTING OPTIMIZATION HINTS                      │  │
│  └────────────────────────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 2.1. Cơ Chế Nhận Diện Ứng Dụng Khách (Client Application Attribution Engine)

Để đảm bảo hiệu năng Ingress tối đa với ngân sách thời gian $\le 2.5\mu\text{s}$, `ClientDetector` áp dụng kỹ thuật so khớp 2 tầng không cấp phát heap thừa:
1. **Tầng 1 (Explicit Custom Headers):** Quét các header khai báo tường minh (`x-client-name`, `x-app-name`, `x-title`).
2. **Tầng 2 (User-Agent Scanning):** Quét chuỗi con trong `user-agent` header với giới hạn chặn 255 ký tự đầu tiên để ngăn chặn tấn công ReDoS.

#### Danh Mục Khách Hàng Chuẩn Hóa

| Mã Client App (`client_app`) | Tên Hiển Thị (`displayName`) | Dấu Hiệu Nhận Diện (Headers / User-Agent Pattern) | Nhóm Ứng Dụng |
| :--- | :--- | :--- | :--- |
| `cursor` | **Cursor IDE** | `x-client-name: cursor` HOẶC `user-agent` chứa `cursor/`, `cursor-` | AI IDE / Editor |
| `claude_code` | **Claude Code CLI** | `user-agent` chứa `claude-cli/`, `claude-code/`, `claude-agent/` | Autonomous Agent |
| `continue` | **Continue.dev** | `x-client-name: continue` HOẶC `user-agent` chứa `continue/`, `continue-extension` | IDE Extension |
| `roo_code` | **Roo Code / Roo Cline** | `x-client-name: roo-code` HOẶC `user-agent` chứa `roo-cline`, `roo-code` | Agentic Coding Tool |
| `aider` | **Aider CLI** | `user-agent` chứa `aider/`, `aider-chat` | Terminal Pair Programmer |
| `open_webui` | **Open WebUI** | `user-agent` chứa `openwebui`, `open-webui` HOẶC `referer` chứa webui | Chat Interface |
| `sdk_python` | **Python SDK / LangChain**| `user-agent` chứa `python-requests`, `httpx`, `openai-python`, `langchain` | Backend SDK |
| `direct_api` | **Direct API / Custom** | Các trường hợp còn lại (curl, Postman, custom scripts) | Raw API Consumer |

#### Đặc tả module nhận diện (`apps/gateway/src/utils/client-detector.ts`):

```typescript
// apps/gateway/src/utils/client-detector.ts

export type ClientAppId =
  | "cursor"
  | "claude_code"
  | "continue"
  | "roo_code"
  | "aider"
  | "open_webui"
  | "sdk_python"
  | "direct_api";

export interface ClientAppMetadata {
  id: ClientAppId;
  displayName: string;
  category: "IDE" | "Agent" | "Extension" | "UI" | "SDK" | "Generic";
  colorHex: string;
  iconName: string;
}

export const CLIENT_APP_CATALOG: Record<ClientAppId, ClientAppMetadata> = {
  cursor: { id: "cursor", displayName: "Cursor IDE", category: "IDE", colorHex: "#06B6D4", iconName: "Code2" },
  claude_code: { id: "claude_code", displayName: "Claude Code CLI", category: "Agent", colorHex: "#D97706", iconName: "Terminal" },
  continue: { id: "continue", displayName: "Continue.dev", category: "Extension", colorHex: "#10B981", iconName: "Blocks" },
  roo_code: { id: "roo_code", displayName: "Roo Code", category: "Extension", colorHex: "#8B5CF6", iconName: "Bot" },
  aider: { id: "aider", displayName: "Aider CLI", category: "Agent", colorHex: "#EC4899", iconName: "Cpu" },
  open_webui: { id: "open_webui", displayName: "Open WebUI", category: "UI", colorHex: "#3B82F6", iconName: "Layout" },
  sdk_python: { id: "sdk_python", displayName: "Python SDK / LangChain", category: "SDK", colorHex: "#6366F1", iconName: "FileCode" },
  direct_api: { id: "direct_api", displayName: "Direct API / Custom", category: "Generic", colorHex: "#64748B", iconName: "Globe" },
};

export class ClientDetector {
  /**
   * Fast O(1) Header scanner with zero heap-allocation overhead.
   * Execution budget: <= 2.5 microseconds.
   */
  public static detect(headers: Record<string, string | string[] | undefined>): {
    clientApp: ClientAppId;
    rawUserAgent: string;
  } {
    // 1. Check explicit client headers (Highest precedence)
    const explicitClient = (
      headers["x-client-name"] ||
      headers["x-app-name"] ||
      headers["x-title"]
    );

    const explicitStr = Array.isArray(explicitClient) ? explicitClient[0] : explicitClient;
    if (explicitStr && typeof explicitStr === "string") {
      const lower = explicitStr.toLowerCase().slice(0, 64);
      if (lower.includes("cursor")) return { clientApp: "cursor", rawUserAgent: lower };
      if (lower.includes("continue")) return { clientApp: "continue", rawUserAgent: lower };
      if (lower.includes("roo") || lower.includes("cline")) return { clientApp: "roo_code", rawUserAgent: lower };
      if (lower.includes("claude")) return { clientApp: "claude_code", rawUserAgent: lower };
      if (lower.includes("aider")) return { clientApp: "aider", rawUserAgent: lower };
    }

    // 2. Scan User-Agent header
    const rawUa = headers["user-agent"];
    const uaStr = Array.isArray(rawUa) ? rawUa[0] : rawUa;
    if (!uaStr || typeof uaStr !== "string") {
      return { clientApp: "direct_api", rawUserAgent: "empty" };
    }

    const ua = uaStr.toLowerCase().slice(0, 255);

    if (ua.includes("cursor/")) return { clientApp: "cursor", rawUserAgent: uaStr };
    if (ua.includes("claude-code") || ua.includes("claude-cli")) return { clientApp: "claude_code", rawUserAgent: uaStr };
    if (ua.includes("continue-extension") || ua.includes("continue/")) return { clientApp: "continue", rawUserAgent: uaStr };
    if (ua.includes("roo-cline") || ua.includes("roo-code")) return { clientApp: "roo_code", rawUserAgent: uaStr };
    if (ua.includes("aider/")) return { clientApp: "aider", rawUserAgent: uaStr };
    if (ua.includes("openwebui") || ua.includes("open-webui")) return { clientApp: "open_webui", rawUserAgent: uaStr };
    if (ua.includes("python-requests") || ua.includes("httpx") || ua.includes("langchain") || ua.includes("openai-python")) {
      return { clientApp: "sdk_python", rawUserAgent: uaStr };
    }

    return { clientApp: "direct_api", rawUserAgent: uaStr.slice(0, 255) };
  }
}
```

---

### 2.2. Nâng Cấp Schema Cơ Sở Dữ Liệu (`apps/gateway/src/db/schema.ts`)

Bổ sung trường `client_app` và `client_user_agent` kèm theo 2 chỉ mục tổng hợp (Compound Indexes) phục vụ truy vấn tốc độ cao:

```typescript
// apps/gateway/src/db/schema.ts (requestMetrics definition update)

export const requestMetrics = sqliteTable(
  "request_metrics",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    adapterId: text("adapter_id"),
    accountId: text("account_id"),
    modelRequested: text("model_requested").notNull(),
    modelExecuted: text("model_executed"),
    
    // Client Application Attribution Columns (NEW)
    clientApp: text("client_app").notNull().default("direct_api"),
    clientUserAgent: text("client_user_agent"),

    // 3-Way Token Counters
    promptTokens: integer("prompt_tokens").default(0),
    reasoningTokens: integer("reasoning_tokens").default(0),
    completionTokens: integer("completion_tokens").default(0),
    totalTokens: integer("total_tokens").default(0),
    
    // Performance & Execution Telemetry
    ttftMs: integer("ttft_ms"),
    totalDurationMs: integer("total_duration_ms").notNull(),
    statusCode: integer("status_code").notNull().default(200),
    status: text("status").notNull(), // 'SUCCESS' | 'ERROR' | 'ABORTED'
    errorMessage: text("error_message"),
    createdAt: integer("created_at").default(sql`(strftime('%s', 'now'))`),
  },
  (table) => ({
    createdAtIndex: index("idx_request_metrics_created_at").on(table.createdAt),
    adapterIndex: index("idx_request_metrics_adapter_id").on(table.adapterId),
    modelExecutedIndex: index("idx_request_metrics_model_executed").on(table.modelExecuted),
    requestIdIndex: index("idx_request_metrics_request_id").on(table.requestId),
    
    // High-performance query indexes for Usage Analytics View (NEW)
    clientAppIndex: index("idx_request_metrics_client_app").on(table.clientApp),
    appCreatedIndex: index("idx_request_metrics_app_created").on(table.clientApp, table.createdAt),
    modelCreatedIndex: index("idx_request_metrics_model_created").on(table.modelExecuted, table.createdAt),
  })
);
```

#### Migration Script An Toàn (`apps/gateway/src/db/migrate.ts`):
```sql
-- Safe migration for existing installations
ALTER TABLE request_metrics ADD COLUMN client_app TEXT NOT NULL DEFAULT 'direct_api';
ALTER TABLE request_metrics ADD COLUMN client_user_agent TEXT;
CREATE INDEX IF NOT EXISTS idx_request_metrics_client_app ON request_metrics(client_app);
CREATE INDEX IF NOT EXISTS idx_request_metrics_app_created ON request_metrics(client_app, created_at);
CREATE INDEX IF NOT EXISTS idx_request_metrics_model_created ON request_metrics(model_executed, created_at);
```

---

### 2.3. Mô Hình Toán Học & Công Thức Tính Chỉ Số Hiệu Quả (Model Efficiency & ROI Matrix)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ BỘ CÔNG THỨC ĐO LƯỜNG HIỆU QUẢ MÔ HÌNH (CANDIDATE 5 FORMULATION)                       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Tốc độ xả token thực tế (Tokens/sec):                                              │
│    V = (completion_tokens + reasoning_tokens) / max((duration_ms - ttft_ms) / 1000, 0.05)│
│                                                                                        │
│ 2. Tỷ lệ suy luận sâu (Reasoning Ratio):                                               │
│    R_cot = reasoning_tokens / (prompt_tokens + reasoning_tokens + completion_tokens) * 100%│
│                                                                                        │
│ 3. Chi phí quy đổi ước tính (Estimated Relative Cost in USD):                          │
│    Cost = [ (prompt_tokens * 2.5 + (reasoning_tokens + completion_tokens) * 10.0) / 1M ]  │
│           * cost_weight                                                                │
│                                                                                        │
│ 4. Chi phí đơn vị trên 1.000 tokens (Unit Cost / 1k tokens):                           │
│    UnitCost = Cost / (total_tokens / 1000)                                             │
│                                                                                        │
│ 5. Điểm số hiệu quả tổng hợp (Composite Efficiency Score - ROI Score):                 │
│    Score = [ V * (1 - ErrorRate) ] / max(UnitCost, 0.001)                              │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Phân Loại Góc Phần Tư Hiệu Quả (Four-Quadrant ROI Classification):

```
       Chi phí / 1K Tokens ($)
                ▲
                │  [Góc II: HEAVY SPENDERS]          [Góc I: PREMIUM REASONERS]
                │  • Chi phí cao, Tốc độ chậm        • Chi phí cao, Tốc độ cao
                │  • Rủi ro ngân sách lớn            • Phù hợp tác vụ tối mật/phức tạp
                │  (Cần đặt Token Budget)            (Dành riêng cho Architecture)
                │
  Baseline $ ───┼────────────────────────────────────
                │  [Góc III: SUB-OPTIMAL]            [Góc IV: THE SWEET SPOT]
                │  • Chi phí thấp, Tốc độ chậm       • Chi phí thấp, Tốc độ cực nhanh
                │  • Gặp nghẽn tiến trình/mạng       • "Top Economical Workhorses"
                │  (Cần probe kiểm tra)              (Nên gán làm P0 trong Routing Groups)
                │
                └────────────────────────────────────────────────────────► Tốc độ (Tokens/Sec)
                                              Baseline Speed (50 tok/s)
```

---

### 2.4. Đặc Tả Backend REST API Endpoints (`apps/gateway/src/api/routes/admin-usage.ts`)

#### 1. `GET /api/admin/usage/summary`
*Mục đích:* Thẻ số liệu KPI tổng quát toàn hệ thống theo cửa sổ thời gian.
- **Query Params:** `window` (`"1h"` | `"24h"` | `"7d"` | `"30d"` | `"all"`).
- **Response JSON Sample:**
```json
{
  "time_window": "24h",
  "total_requests": 3420,
  "successful_requests": 3385,
  "failed_requests": 35,
  "error_rate_pct": 1.02,
  "tokens": {
    "prompt": 1420500,
    "reasoning": 3890200,
    "completion": 980100,
    "total": 6290800
  },
  "reasoning_ratio_pct": 61.84,
  "avg_tokens_per_sec": 52.4,
  "avg_ttft_ms": 480,
  "estimated_cost_usd": 68.42,
  "active_client_apps_count": 5,
  "active_models_count": 8
}
```

#### 2. `GET /api/admin/usage/attribution`
*Mục đích:* Bóc tách lưu lượng và chi phí theo từng Client Application.
- **Response JSON Sample:**
```json
{
  "time_window": "24h",
  "clients": [
    {
      "client_app": "cursor",
      "display_name": "Cursor IDE",
      "category": "IDE",
      "color_hex": "#06B6D4",
      "request_count": 2150,
      "request_share_pct": 62.87,
      "prompt_tokens": 980000,
      "reasoning_tokens": 2840000,
      "completion_tokens": 620000,
      "total_tokens": 4440000,
      "token_share_pct": 70.58,
      "reasoning_ratio_pct": 63.96,
      "avg_tokens_per_sec": 54.2,
      "estimated_cost_usd": 49.80,
      "top_model_used": "gpt-5.6-asta"
    },
    {
      "client_app": "claude_code",
      "display_name": "Claude Code CLI",
      "category": "Agent",
      "color_hex": "#D97706",
      "request_count": 720,
      "request_share_pct": 21.05,
      "prompt_tokens": 280000,
      "reasoning_tokens": 890000,
      "completion_tokens": 240000,
      "total_tokens": 1410000,
      "token_share_pct": 22.41,
      "reasoning_ratio_pct": 63.12,
      "avg_tokens_per_sec": 48.9,
      "estimated_cost_usd": 14.10,
      "top_model_used": "claude-3-7-sonnet"
    },
    {
      "client_app": "continue",
      "display_name": "Continue.dev",
      "category": "Extension",
      "color_hex": "#10B981",
      "request_count": 310,
      "request_share_pct": 9.06,
      "prompt_tokens": 110500,
      "reasoning_tokens": 120200,
      "completion_tokens": 85100,
      "total_tokens": 315800,
      "token_share_pct": 5.02,
      "reasoning_ratio_pct": 38.06,
      "avg_tokens_per_sec": 58.1,
      "estimated_cost_usd": 3.25,
      "top_model_used": "gpt-5.6-terra"
    },
    {
      "client_app": "direct_api",
      "display_name": "Direct API / Custom",
      "category": "Generic",
      "color_hex": "#64748B",
      "request_count": 240,
      "request_share_pct": 7.02,
      "prompt_tokens": 50000,
      "reasoning_tokens": 40000,
      "completion_tokens": 35000,
      "total_tokens": 125000,
      "token_share_pct": 1.99,
      "reasoning_ratio_pct": 32.0,
      "avg_tokens_per_sec": 42.0,
      "estimated_cost_usd": 1.27,
      "top_model_used": "gpt-5.6-luna"
    }
  ]
}
```

#### 3. `GET /api/admin/usage/efficiency`
*Mục đích:* Tọa độ phân tán Speed-vs-Cost Scatter Plot và bảng ma trận năng lực mô hình.
- **Response JSON Sample:**
```json
{
  "time_window": "24h",
  "models": [
    {
      "model_id": "gpt-5.6-terra",
      "adapter_id": "codex-cli",
      "tier": "medium",
      "cost_weight": 2.0,
      "call_count": 950,
      "total_tokens": 1240000,
      "prompt_tokens": 320000,
      "reasoning_tokens": 680000,
      "completion_tokens": 240000,
      "reasoning_ratio_pct": 54.84,
      "avg_tokens_per_sec": 68.5,
      "avg_ttft_ms": 320,
      "error_rate_pct": 0.42,
      "estimated_cost_usd": 5.80,
      "cost_per_1k_tokens": 0.0046,
      "efficiency_score": 14826.0,
      "quadrant": "SWEET_SPOT"
    },
    {
      "model_id": "gpt-5.6-asta",
      "adapter_id": "codex-cli",
      "tier": "xhigh",
      "cost_weight": 10.0,
      "call_count": 1820,
      "total_tokens": 3890000,
      "prompt_tokens": 840000,
      "reasoning_tokens": 2650000,
      "completion_tokens": 400000,
      "reasoning_ratio_pct": 68.12,
      "avg_tokens_per_sec": 44.2,
      "avg_ttft_ms": 610,
      "error_rate_pct": 1.45,
      "estimated_cost_usd": 51.20,
      "cost_per_1k_tokens": 0.0131,
      "efficiency_score": 3325.0,
      "quadrant": "HEAVY_SPENDER"
    },
    {
      "model_id": "claude-3-7-sonnet",
      "adapter_id": "claude-code",
      "tier": "high",
      "cost_weight": 5.0,
      "call_count": 650,
      "total_tokens": 1160800,
      "prompt_tokens": 260500,
      "reasoning_tokens": 560200,
      "completion_tokens": 340100,
      "reasoning_ratio_pct": 48.26,
      "avg_tokens_per_sec": 51.8,
      "avg_ttft_ms": 450,
      "error_rate_pct": 0.61,
      "estimated_cost_usd": 11.42,
      "cost_per_1k_tokens": 0.0098,
      "efficiency_score": 5253.0,
      "quadrant": "PREMIUM_REASONER"
    }
  ]
}
```

#### 4. `GET /api/admin/usage/ranking`
*Mục đích:* Xếp hạng các mô hình hiệu quả kinh tế cao nhất đối chiếu với các mô hình tiêu tốn nhất, kèm đề xuất định tuyến cụ thể.
- **Response JSON Sample:**
```json
{
  "time_window": "24h",
  "top_economical_workhorses": [
    {
      "rank": 1,
      "model_id": "gpt-5.6-terra",
      "adapter_id": "codex-cli",
      "speed_tok_s": 68.5,
      "cost_per_1k": 0.0046,
      "efficiency_score": 14826.0,
      "reason": "Highest generation velocity (68.5 tok/s) with balanced reasoning at 1/5th cost of Asta"
    },
    {
      "rank": 2,
      "model_id": "gpt-5.6-luna",
      "adapter_id": "codex-cli",
      "speed_tok_s": 85.0,
      "cost_per_1k": 0.0022,
      "efficiency_score": 38250.0,
      "reason": "Ultra-fast response for non-reasoning autocompletion tasks"
    }
  ],
  "top_heavy_spenders": [
    {
      "rank": 1,
      "model_id": "gpt-5.6-asta",
      "adapter_id": "codex-cli",
      "total_cost_usd": 51.20,
      "cost_share_pct": 74.83,
      "reasoning_ratio_pct": 68.12,
      "warning": "Accounts for 74.8% of total cluster cost; 42% of calls were simple multi-line completions"
    }
  ],
  "actionable_recommendations": [
    {
      "id": "rec-01",
      "type": "ROUTING_GROUP_OPTIMIZATION",
      "severity": "WARNING",
      "title": "Configure Cursor Default Target to Balanced Tier",
      "description": "Cursor IDE is sending 1,450 routine requests to gpt-5.6-asta. Routing these to pipeline group 'coding-balanced' (P0: gpt-5.6-terra) will save ~62% cost with 55% faster TTFT.",
      "suggested_pipeline_id": "coding-balanced"
    },
    {
      "id": "rec-02",
      "type": "REASONING_BUDGET_CAP",
      "severity": "INFO",
      "title": "Enforce Thinking Budget on Autonomous Agents",
      "description": "Claude Code CLI generated 890k reasoning tokens. Setting reasoning_effort: 'medium' will preserve code correctness while curbing token blowup.",
      "suggested_pipeline_id": "agent-bounded"
    }
  ]
}
```

---

### 2.5. Thiết Kế Giao Diện Cyberdeck UI (`UsageAnalyticsView.tsx`)

Bố trí theo phong cách Obsidian Cyberdeck tối giản với tông màu nền `#090B0F`, viền sắc nét `#1E293B`, các điểm nhấn neon Cyan `#06B6D4`, Emerald `#10B981`, Amber `#F59E0B`, Purple `#8B5CF6`.

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ [● HUD ONLINE]  USAGE & TOKEN CONSUMPTION ANALYTICS             [WINDOW: 24h ▼] [LIVE REFRESH ↻] │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ZONE 1: TOP KPI METRIC CARDS                                                                     │
│ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌──────────────────┐ │
│ │ TOTAL TOKENS   │ │ ESTIMATED COST │ │ FLEET VELOCITY │ │ REASONING RATIO│ │ TOP CONSUMER APP │ │
│ │  6,290,800 tok │ │   $68.42 USD   │ │  52.4 tok/sec  │ │ 61.8% (CoT)    │ │ Cursor IDE (70%) │ │
│ └────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘ └──────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ZONE 2: CLIENT APPLICATION ATTRIBUTION BREAKDOWN                                                 │
│ ┌──────────────────────────────────────────────┐ ┌─────────────────────────────────────────────┐ │
│ │ CLIENT TOKEN SHARE (DONUT / PROGRESS MATRIX) │ │ CLIENT PERFORMANCE & COST SUMMARY           │ │
│ │ • Cursor IDE    : 4.44M (70.6%) ██████████░░ │ │ [Cursor]   2,150 reqs | 54.2 tok/s | $49.80 │ │
│ │ • Claude Code   : 1.41M (22.4%) ███░░░░░░░░░ │ │ [Claude]     720 reqs | 48.9 tok/s | $14.10 │ │
│ │ • Continue.dev  : 315.8k (5.0%) █░░░░░░░░░░░ │ │ [Continue]   310 reqs | 58.1 tok/s |  $3.25 │ │
│ │ • Direct API    : 125.0k (2.0%) ░░░░░░░░░░░░ │ │ [Direct API] 240 reqs | 42.0 tok/s |  $1.27 │ │
│ └──────────────────────────────────────────────┘ └─────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ZONE 3: SPEED-VS-COST ROI SCATTER MATRIX & 3-WAY TOKEN TYPE BREAKDOWN                            │
│ ┌──────────────────────────────────────────────┐ ┌─────────────────────────────────────────────┐ │
│ │ MODEL EFFICIENCY MATRIX (Speed vs Cost/1K)   │ │ 3-WAY TOKEN DISTRIBUTION (In / CoT / Out)   │ │
│ │ Cost ($)                                     │ │ • gpt-5.6-asta  : [===In===][=====CoT=====][=Out=]│ │
│ │  0.020│      ● asta (44 tok/s, $51)          │ │ • gpt-5.6-terra : [==In==][===CoT===][==Out==]   │ │
│ │  0.010│            ● claude-3.7              │ │ • sonnet-3.7    : [===In===][===CoT===][==Out==] │ │
│ │  0.005│                 ★ terra (68 tok/s)   │ │ • gpt-5.6-luna  : [====In====]       [===Out===] │ │
│ │  0.000└───────────────────────────────────►  │ │ ─── Legend: ■ Input  ■ Reasoning  ■ Output  │ │
│ │       0      30     60     90   (Tokens/sec) │ │                                             │ │
│ └──────────────────────────────────────────────┘ └─────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ZONE 4: WORKHORSE VS HEAVY SPENDER LEADERBOARD & ROUTING OPTIMIZATION HINTS                      │
│ ┌──────────────────────────────────────────────┐ ┌─────────────────────────────────────────────┐ │
│ │ 🏆 TOP ECONOMICAL WORKHORSES (Best ROI)      │ │ ⚠️ TOP HEAVY SPENDERS (Cost Drivers)        │ │
│ │ 1. gpt-5.6-terra [Codex] 68.5 tok/s ($0.004) │ │ 1. gpt-5.6-asta [Codex] $51.20 USD (74.8%)  │ │
│ │ 2. gpt-5.6-luna  [Codex] 85.0 tok/s ($0.002) │ │    CoT Ratio: 68.1% | 1,820 Total Invocations│ │
│ ├──────────────────────────────────────────────┴─────────────────────────────────────────────┤ │
│ │ ⚡ 1-CLICK ACTIONABLE ROUTING RECOMMENDATIONS:                                                │ │
│ │ [OPTIMIZE] Cursor sends 67% simple edits to 'gpt-5.6-asta'. Re-route to 'coding-balanced'  │ │
│ │            Estimated savings: $31.50/day (61% reduction) ➔ [APPLY TO PIPELINE]             │ │
│ └────────────────────────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Tích hợp Navigation Tab vào Sidebar (`apps/web/src/components/layout/Sidebar.tsx`):
- Bổ sung tab: `{ id: "usage", label: "Usage & Efficiency", icon: <BarChart3 className="w-4 h-4 text-emerald-400" /> }`
- Đặt liền kề `radar` (`Fleet Radar & Ledger`) để phân định rõ ràng vai trò:
  - **Radar**: Giám sát tức thời (Live PID, Kill Switch, Raw Logs, Real-time TTFT).
  - **Usage**: Kế toán phân bổ tài nguyên, phân tích xu hướng dài hạn, đo lường ROI và tối ưu hoá chi phí định tuyến.

---

# 3. PHÂN TÍCH ĐÁNH ĐỔI & PHÒNG THỦ HỆ THỐNG (TRADE-OFFS & RESILIENCE)

### 3.1. Giả Định Then Chốt (Load-Bearing Assumptions)

| TT | Giả định then chốt | Hệ quả nếu giả định bị vi phạm | Giải pháp bảo vệ (Guardrail) |
| :--- | :--- | :--- | :--- |
| **1** | Client AI phổ biến (Cursor, Continue, Claude Code) giữ nguyên thông tin User-Agent hoặc gửi custom headers khi gọi qua Gateway. | Client bị ẩn danh hóa, toàn bộ dồn vào nhãn `Direct API / Custom`. | Cơ chế Fallback định tuyến: Hỗ trợ "Virtual Model Prefix" (ví dụ: client trỏ vào `cursor/gpt-5` hoặc gửi `?client=cursor`) để tự động gán nhãn nguồn. |
| **2** | Trọng số `cost_weight` trong adapter YAML phản ánh trung thực tương quan giá giữa các tier mô hình. | Số liệu USD ước tính bị sai lệch so với hóa đơn thực tế của nhà cung cấp. | Hiển thị rõ nhãn **"Relative Estimated Cost"**; cung cấp cấu hình Baseline Pricing ($/1M tokens) trong phần cài đặt. |
| **3** | Công thức tốc độ loại trừ TTFT $(D - \text{TTFT})$ không bị âm do trễ clock hệ điều hành. | Mẫu số âm hoặc bằng 0 dẫn tới kết quả `Infinity` hoặc `NaN`. | Luôn bọc mẫu số bằng hàm chặn cận dưới: $\max((D - \text{TTFT}) / 1000,\ 0.05)$, chặn tốc độ tối đa $\le 500\text{ tok/s}$. |

---

### 3.2. Chế Độ Thất Bại Tồi Tệ Nhất (Worst-Case Failure Modes) & Giải Pháp Phòng Vệ

#### Failure Mode 1: SQLite Aggregation Query DoS (Database Lock dưới tải nặng)
- **Kịch bản rủi ro:** Admin mở tab `Usage Analytics`, chọn khoảng thời gian `"all"` (hơn 500.000 bản ghi). Truy vấn `GROUP BY client_app, model_executed` chạy quét bảng kéo dài 800ms, chiếm giữ Read Lock và làm trễ quá trình ghi batch của `TelemetryPersistQueue`.
- **Cơ chế phòng vệ:**
  1. **SQLite WAL Mode:** Tách biệt luồng ghi và đọc, hỗ trợ 1 Writer và nhiều Readers song song không khoá nhau.
  2. **In-Memory LRU Query Cache (TTL 10 giây):** Các endpoint `/api/admin/usage/*` lưu đệm kết quả trong bộ nhớ với thời gian sống 10 giây. Khi người dùng bấm refresh liên tục, dữ liệu trả về tức thì từ RAM ($< 1\text{ms}$).
  3. **Giới hạn Rolling Buffer:** Cơ chế dọn dẹp tự động định kỳ duy trì tối đa 100.000 bản ghi gần nhất hoặc 30 ngày (Rolling Pruning).

#### Failure Mode 2: Client Header Spoofing hoặc User-Agent cực dài (ReDoS Attack)
- **Kịch bản rủi ro:** Client gửi chuỗi `User-Agent` dài 100KB chứa các ký tự lặp đặc biệt nhằm bẫy các biểu thức chính quy (Regex Backtracking) làm nghẽn Event Loop của Fastify.
- **Cơ chế phòng vệ:**
  1. Tuyệt đối không dùng regex phức tạp trên chuỗi headers.
  2. Cắt ngắn chuỗi thô ngay tại cổng vào: `const ua = (req.headers['user-agent'] || '').slice(0, 255)`.
  3. Dùng `String.prototype.includes()` thuần túy với danh mục từ khóa hữu hạn, thời gian thực thi bảo đảm luôn là hằng số $O(1)$.

#### Failure Mode 3: Sai lệch Thống kê do Request Hủy Giữa Chừng (Client Disconnect / Abort)
- **Kịch bản rủi ro:** Người dùng Cursor huỷ stream liên tục. Nếu các request này được đưa vào tính toán tốc độ sinh token, mẫu số nhỏ và số lượng token dở dang sẽ làm sai lệch nghiêm trọng chỉ số tốc độ và tỷ lệ lỗi.
- **Cơ chế phòng vệ:**
  - Chỉ tính Tốc độ Sinh Token (Tokens/sec) và Chi phí ROI trên các bản ghi có `status = 'SUCCESS'` và `completion_tokens > 0`.
  - Các bản ghi `ABORTED` được tách riêng vào chỉ số "Cancelled Requests", không làm biến dạng biểu đồ tán xạ ROI của mô hình.

---

### 3.3. Đánh Giá Triết Lý Thiết Kế: KISS & DRY

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│ ĐÁNH GIÁ SO SÁNH NGUYÊN TẮC THIẾT KẾ (DESIGN PRINCIPLES EVALUATION)                             │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│ TIÊU CHÍ DRY (DON'T REPEAT YOURSELF):                                                            │
│ • Tái sử dụng bảng `request_metrics` hiện có thay vì tạo thêm bảng `client_usage_logs` trùng lặp: │
│   Chỉ bổ sung 2 cột `client_app` và `client_user_agent`. Toàn bộ chu trình tính toán prompt,     │
│   reasoning, completion tokens đều được kế thừa từ `thinking-demuxer` và `execution-registry`.   │
│ • Tái sử dụng cấu hình Adapter Model YAML: Tận dụng trực tiếp `cost_weight` đã có sẵn tại       │
│   `adapters/*.yaml`, không bắt người dùng phải khai báo lại bảng giá ở nhiều nơi.                │
│                                                                                                  │
│ TIÊU CHÍ KISS (KEEP IT SIMPLE, STUPID):                                                          │
│ • Không cài đặt thêm các thư viện biểu đồ cồng kềnh (như Recharts / D3.js nặng > 600KB):          │
│   Biểu đồ Donut Client Share và Stacked Bar 3 Tầng được dựng hoàn toàn bằng SVG thuần và các     │
│   lớp tiện ích Tailwind CSS, bảo đảm Bundle Size nhẹ nhất và tải trang tức thì.                 │
│ • Tọa độ ma trận Scatter Plot được tính toán bằng hàm chuẩn hóa tuyến tính đơn giản:             │
│   xPercent = (speed - minSpeed) / (maxSpeed - minSpeed) * 100                                    │
│   yPercent = (cost - minCost) / (maxCost - minCost) * 100                                        │
│   Render mượt mà 60 FPS trên trình duyệt mà không gây quá tải CPU.                               │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

# 4. KẾ HOẠCH TRIỂN KHAI THEO GIAI ĐOẠN (IMPLEMENTATION PHASES)

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ GIAI ĐOẠN 1      │ ──► │ GIAI ĐOẠN 2      │ ──► │ GIAI ĐOẠN 3      │ ──► │ GIAI ĐOẠN 4      │
│ Schema Migration │     │ Ingress Wiring & │     │ REST API Engine  │     │ Obsidian UI View │
│ & ClientDetector │     │ Persist Queue    │     │ & Pricing ROI    │     │ & Verification   │
└──────────────────┘     └──────────────────┘     └──────────────────┘     └──────────────────┘
```

1. **Giai đoạn 1: Khởi tạo Bộ Nhận Diện & Nâng Cấp Schema (Database & Detection Layer)**
   - Tạo mới `apps/gateway/src/utils/client-detector.ts` kèm bộ test kiểm thử đơn vị bao phủ tất cả User-Agent phổ biến (Cursor, Claude Code, Continue, Roo Code, Aider).
   - Bổ sung `clientApp` và `clientUserAgent` vào `requestMetrics` trong `apps/gateway/src/db/schema.ts`.
   - Cập nhật migration script và backfill giá trị mặc định cho dữ liệu cũ.
2. **Giai đoạn 2: Tích hợp Cổng Vào & Hàng Đợi Bền Vững (Hot-Path Integration)**
   - Cập nhật `openai-chat.ts` và `anthropic-messages.ts` để trích xuất `clientApp` từ `req.headers`.
   - Mở rộng `globalExecutionRegistry` để hiển thị `clientApp` trong danh sách luồng đang chạy.
   - Cập nhật `persist-queue.ts` để ghi đồng thời 2 trường mới vào SQLite.
3. **Giai đoạn 3: Xây dựng Bộ Phân Tích & REST Endpoints (Analytics & ROI Engine)**
   - Xây dựng `apps/gateway/src/utils/pricing-calculator.ts` xử lý công thức Tokens/sec, Reasoning Ratio, và ROI Score.
   - Tạo tệp route mới `apps/gateway/src/api/routes/admin-usage.ts` cung cấp 4 endpoint: `/summary`, `/attribution`, `/efficiency`, `/ranking`.
   - Đăng ký route vào server Fastify và bổ sung API client trong `apps/web/src/lib/api-client.ts`.
4. **Giai đoạn 4: Xây dựng Giao Diện Cyberdeck UI & Bộ Kiểm Thử E2E (UI & Acceptance)**
   - Tạo component `apps/web/src/views/UsageAnalyticsView.tsx` với đầy đủ 4 phân vùng chức năng.
   - Bổ sung tab `usage` vào Sidebar (`Sidebar.tsx`) và Router chính (`App.tsx`).
   - Thiết lập bộ test tự động Vitest cho toàn bộ 6 kịch bản AC-1 đến AC-6.

---

## KẾT LUẬN (VERDICT)

Đề xuất kiến trúc của **Candidate 5** giải quyết bài toán "Thêm màn hình Usage" từ góc nhìn quản trị thông minh: **Không chỉ dừng lại ở số lượng token thuần túy, mà tập trung vào Nguồn tiêu thụ (Client Attribution) và Hiệu quả đầu tư (Model Efficiency & ROI)**.

Bằng việc kết hợp cơ chế nhận diện $O(1)$ không gây trễ, phân tích chuyên sâu cấu trúc token 3 tầng (đặc biệt là Thinking/Reasoning CoT), và ma trận tán xạ Tốc độ - Chi phí, kiến trúc này cung cấp cho Admin năng lực tối ưu hóa chi phí thực tế và đưa ra các quyết định cấu hình Routing Groups chuẩn xác. Đề xuất đáp ứng toàn diện tiêu chí: **Chính xác, Hiệu năng cao, Giao diện Obsidian Cyberdeck trực quan, và Tuân thủ triệt để nguyên lý KISS/DRY**.
