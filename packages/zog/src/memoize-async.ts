/**
 * Wrap a zero-argument async factory so it runs at most once and every later
 * call reuses the first in-flight or settled promise. A rejection is *not*
 * cached: the next call retries, so a transient failure (e.g. a dropped
 * connection during the first resolution) does not poison the value forever.
 */
export function memoizeAsync<T>(factory: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;

  return () => {
    if (pending === null) {
      pending = factory().catch((error) => {
        pending = null;
        throw error;
      });
    }

    return pending;
  };
}
