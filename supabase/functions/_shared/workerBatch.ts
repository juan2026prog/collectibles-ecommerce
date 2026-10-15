// Bound database/provider fan-out and leave unstarted items for the caller's
// ownership-aware release. Stop checks happen between fully settled chunks.
export async function runWorkerBatch<T>(items: T[], action: (item: T) => Promise<unknown>, shouldStop: () => boolean) {
  for (let offset = 0; offset < items.length && !shouldStop(); offset += 2) {
    await Promise.all(items.slice(offset, offset + 2).map(action));
  }
}
