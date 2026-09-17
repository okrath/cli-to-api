import fs from "node:fs";

/**
 * Attaches debounced filesystem watchers to adapter directories.
 * Invokes onReload callback when any .yaml or .yml file is created, modified, or deleted.
 */
export function initAdapterWatcher(
  dirs: string[],
  onReload: () => Promise<void>,
  debounceMs = 300
): () => void {
  const watchers: fs.FSWatcher[] = [];
  let debounceTimer: NodeJS.Timeout | null = null;

  const triggerReload = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        await onReload();
      } catch (err) {
        console.error("Error during adapter hot-reload:", err);
      }
    }, debounceMs);
  };

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;

    try {
      const watcher = fs.watch(dir, { persistent: false }, (_eventType, filename) => {
        if (filename && (filename.endsWith(".yaml") || filename.endsWith(".yml"))) {
          triggerReload();
        }
      });
      watchers.push(watcher);
    } catch {
      // Ignore watch setup error on restricted directories
    }
  }

  // Return unwatch cleanup handle
  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    for (const w of watchers) {
      try {
        w.close();
      } catch {
        // Ignore close error
      }
    }
  };
}
