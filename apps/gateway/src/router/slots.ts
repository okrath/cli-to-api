const activeCounts = new Map<string, number>();
const waitQueues = new Map<string, Array<{ resolve: () => void; reject: (err: Error) => void }>>();

export function getActiveCount(accountId: string): number {
  return activeCounts.get(accountId) ?? 0;
}

export function getAllActiveCounts(): Map<string, number> {
  return new Map(activeCounts);
}

export function resetSlots(): void {
  activeCounts.clear();
  for (const queue of waitQueues.values()) {
    for (const waiter of queue) {
      waiter.reject(new Error("slots reset"));
    }
  }
  waitQueues.clear();
}

function dequeueNext(accountId: string): void {
  const queue = waitQueues.get(accountId);
  if (!queue || queue.length === 0) {
    return;
  }
  const next = queue.shift();
  next?.resolve();
}

export async function acquireSlot(
  accountId: string,
  maxConcurrent: number,
  timeoutSec: number,
): Promise<boolean> {
  const active = getActiveCount(accountId);
  if (active < maxConcurrent) {
    activeCounts.set(accountId, active + 1);
    return true;
  }

  return new Promise<boolean>((resolve) => {
    const entry = {
      resolve: () => {
        clearTimeout(timer);
        activeCounts.set(accountId, getActiveCount(accountId) + 1);
        resolve(true);
      },
      reject: () => {
        clearTimeout(timer);
        resolve(false);
      },
    };

    const queue = waitQueues.get(accountId) ?? [];
    queue.push(entry);
    waitQueues.set(accountId, queue);

    const timer = setTimeout(() => {
      const current = waitQueues.get(accountId);
      if (!current) {
        resolve(false);
        return;
      }
      const index = current.indexOf(entry);
      if (index >= 0) {
        current.splice(index, 1);
      }
      resolve(false);
    }, timeoutSec * 1000);
  });
}

export function releaseSlot(accountId: string): void {
  const active = getActiveCount(accountId);
  if (active <= 1) {
    activeCounts.delete(accountId);
  } else {
    activeCounts.set(accountId, active - 1);
  }
  dequeueNext(accountId);
}
