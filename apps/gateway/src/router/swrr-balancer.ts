export interface WeightedItem {
  id: string;
  weight: number;
}

export class SwrrBalancer {
  private currentWeights = new Map<string, number>();

  /**
   * Selects an item from candidates using NGINX Smooth Weighted Round-Robin.
   * Guarantees smooth, non-bursty interleaving matching the weight proportions.
   */
  public select<T extends WeightedItem>(candidates: T[]): T | null {
    if (!candidates || candidates.length === 0) {
      return null;
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    // Filter out candidates with <= 0 weight
    const active = candidates.filter((c) => c.weight > 0);
    if (active.length === 0) {
      return candidates[0];
    }

    // Calculate total effective weight
    let totalWeight = 0;
    for (const item of active) {
      totalWeight += item.weight;
      const current = this.currentWeights.get(item.id) ?? 0;
      this.currentWeights.set(item.id, current + item.weight);
    }

    // Find candidate with the highest current weight
    let bestItem: T = active[0];
    let maxWeight = -Infinity;

    for (const item of active) {
      const current = this.currentWeights.get(item.id) ?? 0;
      if (current > maxWeight) {
        maxWeight = current;
        bestItem = item;
      }
    }

    // Deduct totalWeight from the winning item's current weight
    const winnerCurrent = this.currentWeights.get(bestItem.id) ?? 0;
    this.currentWeights.set(bestItem.id, winnerCurrent - totalWeight);

    return bestItem;
  }

  /**
   * Reset tracking state (useful for tests or reloads)
   */
  public reset(): void {
    this.currentWeights.clear();
  }
}

export const globalSwrrBalancer = new SwrrBalancer();
