import fs from "node:fs";
import process from "node:process";

const args = process.argv.slice(2);
const fileIdx = args.indexOf("--file");

if (fileIdx !== -1 && args[fileIdx + 1]) {
  const filePath = args[fileIdx + 1];
  const content = fs.readFileSync(filePath, "utf8");
  process.stdout.write(`Received file prompt length: ${content.length}\n`);
} else {
  const lastArg = args[args.length - 1] || "";
  process.stdout.write(`Received argv prompt length: ${lastArg.length}\n`);
}
