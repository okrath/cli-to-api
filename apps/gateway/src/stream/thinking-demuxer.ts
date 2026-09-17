export interface ThinkingDemuxerCallbacks {
  onThoughtDelta: (token: string) => void;
  onContentDelta: (token: string) => void;
  onPhaseChange?: (phase: "IDLE" | "THINKING" | "CONTENT") => void;
}

export interface TagPair {
  open: string;
  close: string;
}

export const DEFAULT_TAG_PAIRS: TagPair[] = [
  { open: "<think>", close: "</think>" },
  { open: "<thought>", close: "</thought>" },
  { open: "<reasoning>", close: "</reasoning>" },
];

export interface ThinkingDemuxerOptions {
  tagPairs?: TagPair[];
  openTag?: string;
  closeTag?: string;
}

export class ThinkingDemuxer {
  public phase: "IDLE" | "THINKING" | "CONTENT" = "IDLE";
  private buffer = "";
  private nestingDepth = 0;
  private readonly tagPairs: TagPair[];
  private activeCloseTag = "</think>";
  private readonly callbacks: ThinkingDemuxerCallbacks;

  public accumulatedThought = "";
  public accumulatedContent = "";
  public thoughtStartTime: number | null = null;
  public thoughtEndTime: number | null = null;

  constructor(callbacks: ThinkingDemuxerCallbacks, options: ThinkingDemuxerOptions = {}) {
    this.callbacks = callbacks;
    if (options.openTag && options.closeTag) {
      this.tagPairs = [{ open: options.openTag, close: options.closeTag }];
    } else {
      this.tagPairs = options.tagPairs || DEFAULT_TAG_PAIRS;
    }
  }

  public feed(chunk: string): void {
    if (!chunk) return;
    this.buffer += chunk;

    while (this.buffer.length > 0) {
      if (this.phase === "IDLE") {
        let earliestOpenIdx = -1;
        let matchedPair = this.tagPairs[0];

        for (const pair of this.tagPairs) {
          const idx = this.buffer.indexOf(pair.open);
          if (idx !== -1 && (earliestOpenIdx === -1 || idx < earliestOpenIdx)) {
            earliestOpenIdx = idx;
            matchedPair = pair;
          }
        }

        if (earliestOpenIdx !== -1) {
          if (earliestOpenIdx > 0) {
            this.emitContent(this.buffer.slice(0, earliestOpenIdx));
          }
          this.buffer = this.buffer.slice(earliestOpenIdx + matchedPair.open.length);
          this.activeCloseTag = matchedPair.close;
          this.phase = "THINKING";
          this.nestingDepth = 1;
          this.thoughtStartTime = this.thoughtStartTime || Date.now();
          this.callbacks.onPhaseChange?.("THINKING");
          continue;
        }

        // Check if buffer ends with a prefix of any open tag
        let maxMatchLen = 0;
        for (const pair of this.tagPairs) {
          const matchLen = this.findCandidatePrefixLength(this.buffer, pair.open);
          if (matchLen > maxMatchLen) {
            maxMatchLen = matchLen;
          }
        }

        if (maxMatchLen > 0) {
          const safeLen = this.buffer.length - maxMatchLen;
          if (safeLen > 0) {
            this.emitContent(this.buffer.slice(0, safeLen));
            this.buffer = this.buffer.slice(safeLen);
          }
          break; // Keep candidate prefix in buffer awaiting next chunk
        }

        this.emitContent(this.buffer);
        this.buffer = "";
        break;
      }

      if (this.phase === "THINKING") {
        const closeIdx = this.buffer.indexOf(this.activeCloseTag);

        // Check for any nested open tag before the close tag
        let earliestNestedOpenIdx = -1;
        let matchedNestedOpenTagLen = 0;
        for (const pair of this.tagPairs) {
          const idx = this.buffer.indexOf(pair.open);
          if (idx !== -1 && (earliestNestedOpenIdx === -1 || idx < earliestNestedOpenIdx)) {
            earliestNestedOpenIdx = idx;
            matchedNestedOpenTagLen = pair.open.length;
          }
        }

        if (earliestNestedOpenIdx !== -1 && (closeIdx === -1 || earliestNestedOpenIdx < closeIdx)) {
          if (earliestNestedOpenIdx > 0) {
            this.emitThought(this.buffer.slice(0, earliestNestedOpenIdx));
          }
          this.buffer = this.buffer.slice(earliestNestedOpenIdx + matchedNestedOpenTagLen);
          this.nestingDepth++;
          continue;
        }

        if (closeIdx !== -1) {
          if (closeIdx > 0) {
            this.emitThought(this.buffer.slice(0, closeIdx));
          }
          this.buffer = this.buffer.slice(closeIdx + this.activeCloseTag.length);
          this.nestingDepth--;
          if (this.nestingDepth <= 0) {
            this.phase = "CONTENT";
            this.thoughtEndTime = Date.now();
            this.callbacks.onPhaseChange?.("CONTENT");
          }
          continue;
        }

        const matchLen = this.findCandidatePrefixLength(this.buffer, this.activeCloseTag);
        if (matchLen > 0) {
          const safeLen = this.buffer.length - matchLen;
          if (safeLen > 0) {
            this.emitThought(this.buffer.slice(0, safeLen));
            this.buffer = this.buffer.slice(safeLen);
          }
          break; // Keep candidate prefix in buffer awaiting next chunk
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
      this.thoughtEndTime = this.thoughtEndTime || Date.now();
      this.callbacks.onPhaseChange?.("CONTENT");
    }
  }

  public getThoughtDurationMs(): number {
    if (!this.thoughtStartTime) return 0;
    const end = this.thoughtEndTime || Date.now();
    return Math.max(0, end - this.thoughtStartTime);
  }

  private findCandidatePrefixLength(str: string, targetTag: string): number {
    const maxMatch = Math.min(str.length, targetTag.length - 1);
    for (let len = maxMatch; len > 0; len--) {
      if (str.endsWith(targetTag.slice(0, len))) {
        return len;
      }
    }
    return 0;
  }

  private emitThought(text: string): void {
    if (!text) return;
    this.accumulatedThought += text;
    this.callbacks.onThoughtDelta(text);
  }

  private emitContent(text: string): void {
    if (!text) return;
    this.accumulatedContent += text;
    this.callbacks.onContentDelta(text);
  }
}
