// Mock CLI emitting \r spinner progress overwrites and UTF-8 multi-byte characters
import process from "node:process";

async function run() {
  process.stdout.write("\rThinking... ⠋");
  await new Promise(r => setTimeout(r, 20));
  process.stdout.write("\rThinking... ⠙");
  await new Promise(r => setTimeout(r, 20));
  process.stdout.write("\rThinking... ⠹");
  await new Promise(r => setTimeout(r, 20));

  // Actual substantive response
  process.stdout.write("Xin chào thế giới 🚀\n");
  process.stdout.write("Hoàn thành tác vụ.");
  process.exit(0);
}

run();
