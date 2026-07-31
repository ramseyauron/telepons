import { http, type Transport } from "viem";

class RequestScheduler {
  private nextAvailableAt = 0;

  constructor(private readonly intervalMs: number) {}

  async schedule<T>(request: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const scheduledAt = Math.max(now, this.nextAvailableAt);
    this.nextAvailableAt = scheduledAt + this.intervalMs;
    const delay = scheduledAt - now;

    if (delay > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delay);
      });
    }

    return request();
  }
}

/**
 * Spaces requests evenly instead of allowing a burst at once. All
 * clients created from the same transport share one scheduler.
 */
export function rateLimitedHttp(
  url: string,
  requestsPerSecond = 5,
): Transport {
  if (!Number.isInteger(requestsPerSecond) || requestsPerSecond < 1) {
    throw new Error("requestsPerSecond must be a positive integer");
  }

  const scheduler = new RequestScheduler(
    Math.ceil(1_000 / requestsPerSecond),
  );
  const baseTransport = http(url);

  return (config) => {
    const transport = baseTransport(config);
    return {
      ...transport,
      request: (args) =>
        scheduler.schedule(() => transport.request(args)),
    };
  };
}
