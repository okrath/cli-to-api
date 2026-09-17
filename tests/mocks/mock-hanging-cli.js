// Mock CLI that stays alive until terminated by killProcessTree or SIGTERM
import process from "node:process";

process.stdout.write("Hanging mock CLI started...\n");

const timer = setInterval(() => {
  process.stdout.write("working...\n");
}, 1000);

process.on("SIGTERM", () => {
  clearInterval(timer);
  process.exit(0);
});

process.on("SIGINT", () => {
  clearInterval(timer);
  process.exit(0);
});
