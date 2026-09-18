import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>cli-to-api</title>
</head>
<body>
  <p>Admin console placeholder — full UI arrives in a later phase.</p>
</body>
</html>
`;

await mkdir(distDir, { recursive: true });
await writeFile(join(distDir, "index.html"), html, "utf8");
console.log("Built apps/web/dist/index.html");
