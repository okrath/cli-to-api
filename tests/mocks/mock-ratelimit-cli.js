// Mock CLI emitting 429 rate limit error message
import process from "node:process";

process.stderr.write("Error: You have exceeded your rate limit. resets in 45m\n");
process.exit(1);
