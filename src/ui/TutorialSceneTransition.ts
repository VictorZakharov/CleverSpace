/** Crossfade staged training relocations without moving the camera through obstacles. */
export class TutorialSceneTransition {
  private readonly canvas = document.createElement('canvas');
  private readonly pending = document.createElement('canvas');
  private animation: Animation | null = null;

  constructor(parent: HTMLElement) {
    this.canvas.className = 'tutorial-scene-transition';
    this.canvas.setAttribute('aria-hidden', 'true');
    parent.before(this.canvas);
  }

  capture(source: HTMLCanvasElement): void {
    // Bound the temporary copy independently of the renderer's adaptive resolution.
    const scale = Math.min(1, 1920 / source.width);
    this.pending.width = Math.max(1, Math.round(source.width * scale));
    this.pending.height = Math.max(1, Math.round(source.height * scale));
    const context = this.pending.getContext('2d');
    if (!context) return;
    context.drawImage(source, 0, 0, this.pending.width, this.pending.height);
    // Rapid lesson browsing starts from the current blend, avoiding a second cut.
    context.globalAlpha = Number(getComputedStyle(this.canvas).opacity);
    context.drawImage(this.canvas, 0, 0, this.pending.width, this.pending.height);
  }

  reveal(): void {
    this.animation?.cancel();
    this.canvas.width = this.pending.width;
    this.canvas.height = this.pending.height;
    this.canvas.getContext('2d')?.drawImage(this.pending, 0, 0);
    this.animation = this.canvas.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 500, easing: 'ease-in-out' },
    );
    this.animation.onfinish = () => this.clear();
  }

  clear(): void {
    this.animation?.cancel();
    this.animation = null;
    this.canvas.width = this.canvas.height = 1;
    this.pending.width = this.pending.height = 1;
  }
}
