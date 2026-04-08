/**
 * Simple sliding-window rate limiter.
 * Tracks timestamps of recent requests and rejects when the window is full.
 */
export class RateLimiter {
  private readonly timestamps: number[] = [];

  public constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number
  ) {}

  /** Returns true if the request is allowed, false if rate-limited. */
  public allow(): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    // Remove expired timestamps from the front
    while (this.timestamps.length > 0 && this.timestamps[0] <= cutoff) {
      this.timestamps.shift();
    }

    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }

    this.timestamps.push(now);
    return true;
  }
}
