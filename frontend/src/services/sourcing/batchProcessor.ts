/**
 * ConcurrencyQueue
 * Procesa colecciones grandes de tareas (ej. 100+ URLs de Research Packs)
 * con concurrencia acotada, retardo entre llamadas y backoff exponencial ante HTTP 429.
 */
export interface BatchProcessingOptions {
  concurrency?: number; // default 5
  delayBetweenMs?: number; // default 50ms
  maxRetries?: number; // default 3
  onProgress?: (completed: number, total: number, currentItem?: any) => void;
}

export async function processBatchInQueue<T, R>(
  items: T[],
  workerFn: (item: T, index: number) => Promise<R>,
  options: BatchProcessingOptions = {}
): Promise<{
  results: R[];
  errors: { index: number; item: T; error: any }[];
}> {
  const {
    concurrency = 5,
    delayBetweenMs = 30,
    maxRetries = 2,
    onProgress
  } = options;

  const total = items.length;
  let completed = 0;
  const results: R[] = new Array(total);
  const errors: { index: number; item: T; error: any }[] = [];

  let nextIndex = 0;

  async function executeWorker(): Promise<void> {
    while (nextIndex < total) {
      const currentIndex = nextIndex++;
      const item = items[currentIndex];

      let attempts = 0;
      let success = false;

      while (attempts <= maxRetries && !success) {
        attempts++;
        try {
          const res = await workerFn(item, currentIndex);
          results[currentIndex] = res;
          success = true;
        } catch (err: any) {
          // Si es rate limit (429), aplicar backoff exponencial
          const isRateLimit = err?.status === 429 || (err?.message && err.message.includes('429'));
          if (isRateLimit && attempts <= maxRetries) {
            const backoffMs = Math.pow(2, attempts) * 500;
            await new Promise(r => setTimeout(r, backoffMs));
          } else if (attempts > maxRetries) {
            errors.push({ index: currentIndex, item, error: err });
          }
        }
      }

      completed++;
      if (onProgress) {
        onProgress(completed, total, item);
      }

      if (delayBetweenMs > 0) {
        await new Promise(r => setTimeout(r, delayBetweenMs));
      }
    }
  }

  // Lanzar workers concurrentes hasta el límite
  const workers = Array.from(
    { length: Math.min(concurrency, total) }, 
    () => executeWorker()
  );

  await Promise.all(workers);

  return { results, errors };
}
