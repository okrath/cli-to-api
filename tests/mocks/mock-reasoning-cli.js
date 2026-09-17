// Mock CLI emitting split <think> tags and final answer
import process from "node:process";

async function run() {
  const args = process.argv.slice(2);
  const isUnclosed = args.includes("--unclosed");

  // Chunk 1: prefix text with split open tag
  process.stdout.write("Bắt đầu thực thi: <thi");
  await new Promise((r) => setTimeout(r, 10));

  if (isUnclosed) {
    process.stdout.write("nk>\nĐang suy nghĩ dở dang thì bị ngắt...");
    process.exit(0);
  }

  // Chunk 2: close open tag and emit reasoning body with split close tag
  process.stdout.write("nk>\nBước 1: Phân tích yêu cầu.\nBước 2: Tìm lời giải tối ưu.\n</thi");
  await new Promise((r) => setTimeout(r, 10));

  // Chunk 3: close tag and emit clean answer
  process.stdout.write("nk>\nĐây là câu trả lời đã suy luận xong 🚀");
  process.exit(0);
}

run();
