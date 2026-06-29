// Concurrency control — limits simultaneous async operations

export class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrency: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrency) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  /**
   * Run an array of async tasks with concurrency control.
   * Returns results in the same order as tasks.
   */
  async runAll<T>(tasks: Array<() => Promise<T>>): Promise<Array<{ status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown }>> {
    const results: Array<{ status: 'fulfilled'; value: T } | { status: 'rejected'; reason: unknown }> = new Array(tasks.length);

    let nextIndex = 0;

    const worker = async (): Promise<void> => {
      while (nextIndex < tasks.length) {
        const index = nextIndex++;
        try {
          const value = await tasks[index]();
          results[index] = { status: 'fulfilled', value };
        } catch (reason) {
          results[index] = { status: 'rejected', reason };
        }
      }
    };

    const workers = Array.from({ length: Math.min(this.maxConcurrency, tasks.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }
}
