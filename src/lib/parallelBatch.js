/**
 * Runs batch operations in parallel with a configurable concurrency level.
 * Each batch is processed by `processBatch(batch)`. Retries on failure.
 *
 * @param {Array} items - All items to process
 * @param {number} batchSize - Items per batch
 * @param {number} concurrency - Number of parallel workers
 * @param {Function} processBatch - async fn(batch) => void
 * @param {Function} onProgress - optional callback(completedBatches, totalBatches, processedItems)
 * @param {number} maxRetries - retries per batch before throwing
 * @returns {Promise<{totalBatches: number, processed: number}>}
 */
export async function runBatchesInParallel(items, batchSize, concurrency, processBatch, onProgress, maxRetries = 3) {
  const batches = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  const totalBatches = batches.length;
  let completedBatches = 0;
  let processedItems = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function worker() {
    while (batches.length > 0) {
      const batch = batches.shift();
      if (!batch) break;

      let attempt = 0;
      let success = false;
      while (attempt < maxRetries && !success) {
        try {
          const result = await processBatch(batch);
          // supabase-js resolves rather than rejects on a failed write, so a
          // rejected insert would otherwise be counted as a success and the
          // import would report rows it never wrote. Surface it as a throw.
          if (result && result.error) throw result.error;
          success = true;
        } catch (err) {
          attempt++;
          if (attempt >= maxRetries) throw err;
          await sleep(800 * attempt);
        }
      }

      completedBatches++;
      processedItems += batch.length;
      if (onProgress) onProgress(completedBatches, totalBatches, processedItems);
    }
  }

  const numWorkers = Math.min(concurrency, totalBatches);
  if (numWorkers === 0) return { totalBatches: 0, processed: 0 };

  await Promise.all(Array.from({ length: numWorkers }, () => worker()));
  return { totalBatches, processed: processedItems };
}