import { StringDecoder } from "node:string_decoder";

export class Utf8StreamDecoder {
  private decoder = new StringDecoder("utf8");

  public write(chunk: Buffer | Uint8Array): string {
    return this.decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  public end(): string {
    return this.decoder.end();
  }
}
