/**
 * Fixed-step simulation with an interpolated render (TechnicalDesign §2.4).
 *
 * The sim runs at SIM_HZ; rendering runs at display refresh and interpolates
 * between the last two sim states using `alpha`. A 30 Hz sim therefore looks
 * like 60 fps motion at half the CPU — the single largest mobile win available.
 */

export const SIM_HZ = 30;
export const SIM_STEP_MS = 1000 / SIM_HZ;
const MAX_CATCHUP_STEPS = 5; // beyond this we drop time rather than spiral

export interface LoopStats {
  fps: number;
  simMs: number;
  renderMs: number;
  steps: number;
}

export class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  private rafHandle = 0;
  private running = false;
  private frameTimes: number[] = [];

  readonly stats: LoopStats = { fps: 0, simMs: 0, renderMs: 0, steps: 0 };

  constructor(
    private readonly step: (dtSeconds: number) => void,
    private readonly render: (alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.rafHandle = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafHandle);
  }

  /** Call when the app is backgrounded/foregrounded so we don't fast-forward. */
  resetClock(): void {
    this.lastTime = performance.now();
    this.accumulator = 0;
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.rafHandle = requestAnimationFrame(this.frame);

    let frameMs = now - this.lastTime;
    this.lastTime = now;
    // A tab restored after minutes must not run 10,000 sim steps.
    if (frameMs > 250) frameMs = 250;
    this.accumulator += frameMs;

    const simStart = performance.now();
    let steps = 0;
    while (this.accumulator >= SIM_STEP_MS && steps < MAX_CATCHUP_STEPS) {
      this.step(SIM_STEP_MS / 1000);
      this.accumulator -= SIM_STEP_MS;
      steps++;
    }
    if (steps === MAX_CATCHUP_STEPS) this.accumulator = 0; // give up on the backlog
    const simEnd = performance.now();

    this.render(this.accumulator / SIM_STEP_MS);
    const renderEnd = performance.now();

    this.stats.simMs = simEnd - simStart;
    this.stats.renderMs = renderEnd - simEnd;
    this.stats.steps = steps;

    this.frameTimes.push(frameMs);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    let total = 0;
    for (const t of this.frameTimes) total += t;
    this.stats.fps = total > 0 ? Math.round(1000 / (total / this.frameTimes.length)) : 0;
  };
}
