/**
 * Runs async tasks with a bounded concurrency, draining a queue rather than
 * firing everything at once. This is the mitigation called out in the design
 * doc for Groq's 30 RPM cap — without it, uploading 50 resumes would fire 50
 * simultaneous /api/score calls and trip the rate limit almost immediately.
 */
export async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onItemSettled?: (item: T, index: number, result: R | null, error: unknown) => void,
): Promise<void> {
  let cursor = 0;

  async function runNext(): Promise<void> {
    const index = cursor++;
    if (index >= items.length) return;

    const item = items[index];
    try {
      const result = await worker(item, index);
      onItemSettled?.(item, index, result, null);
    } catch (error) {
      onItemSettled?.(item, index, null, error);
    }
    return runNext();
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, runNext);
  await Promise.all(workers);
}