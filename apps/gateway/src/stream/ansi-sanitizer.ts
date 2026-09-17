import { Utf8StreamDecoder } from "./utf8-decoder.js";

const ANSI_REGEX = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-ntqry=><~]))/g;
const SPINNER_GLYPH_REGEX = /^[\-\|\/\\◐◓◑◒⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]$/;

export class DualStageAnsiSanitizer {
  private decoder = new Utf8StreamDecoder();
  private pendingLine = "";
  private hasPendingCarriageReturn = false;

  public processChunk(chunk: Buffer | Uint8Array | string): string {
    const text = typeof chunk === "string" ? chunk : this.decoder.write(chunk);
    if (!text) return "";

    const clean = text.replace(ANSI_REGEX, "");
    let output = "";

    for (let i = 0; i < clean.length; i++) {
      const char = clean[i];

      if (char === "\r") {
        // Spinner overwrite: reset the pending line
        this.pendingLine = "";
        this.hasPendingCarriageReturn = true;
      } else if (char === "\n") {
        // Line finalized
        output += this.pendingLine + "\n";
        this.pendingLine = "";
        this.hasPendingCarriageReturn = false;
      } else {
        if (this.hasPendingCarriageReturn) {
          this.pendingLine = char;
          this.hasPendingCarriageReturn = false;
        } else {
          this.pendingLine += char;
        }
      }
    }

    // Streaming Preservation Rule:
    // When text is not followed by \r and is not a lone spinner glyph, emit immediately!
    if (!this.hasPendingCarriageReturn && this.pendingLine.length > 0) {
      const trimmed = this.pendingLine.trim();
      const isSpinner = SPINNER_GLYPH_REGEX.test(trimmed);
      if (!isSpinner) {
        output += this.pendingLine;
        this.pendingLine = "";
      }
    }

    return output;
  }

  public flush(): string {
    const remaining = this.decoder.end();
    const finalClean = (remaining + this.pendingLine).replace(ANSI_REGEX, "");
    this.pendingLine = "";
    this.hasPendingCarriageReturn = false;
    return finalClean;
  }
}
