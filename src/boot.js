export class BootSequence {
  constructor() {
    this.overlay = document.getElementById('boot-overlay');
    this.fill = document.getElementById('boot-bar-fill');
    this.app = document.getElementById('main-app');
  }

  async run() {
    const steps = [15, 35, 55, 75, 92, 100];
    for (const pct of steps) {
      this.fill.style.width = pct + '%';
      await this.wait(180);
    }
    await this.wait(300);
    this.overlay.classList.add('out');
    this.app.classList.remove('hidden');
    await this.wait(500);
    this.overlay.remove();
  }

  wait(ms) { return new Promise(r => setTimeout(r, ms)); }
}
