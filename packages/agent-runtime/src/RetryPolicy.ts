export class RetryPolicy {
  constructor(
    readonly maximumRetries: number,
    readonly delayMilliseconds: number,
  ) {}
  async wait(attempt: number): Promise<void> {
    if (this.delayMilliseconds <= 0) return;
    await new Promise<void>((resolve) =>
      setTimeout(resolve, this.delayMilliseconds * (attempt + 1)),
    );
  }
}
