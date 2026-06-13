const locks = new Map<string, Promise<void>>();

/**
 * Runs a function sequentially per bookId to avoid concurrent file conflicts.
 */
export async function withBookLock<T>(bookId: string, fn: () => Promise<T>): Promise<T> {
  if (!bookId) {
    return fn();
  }

  // Get the existing promise chain for this book (or resolved promise if none)
  const existingPromise = locks.get(bookId) || Promise.resolve();

  // Create a new promise that resolves when the user function completes
  let resolveLock: () => void = () => {};
  const lockReleasedPromise = new Promise<void>((resolve) => {
    resolveLock = resolve;
  });

  // Enqueue this lock release in the map
  locks.set(bookId, lockReleasedPromise);

  try {
    // Wait for the previous lock in the chain to finish
    await existingPromise;
    return await fn();
  } finally {
    // Release the current lock and clean up if we are the last one
    resolveLock();
    // After releasing, if this is still the active promise in the locks map, delete it
    if (locks.get(bookId) === lockReleasedPromise) {
      locks.delete(bookId);
    }
  }
}
