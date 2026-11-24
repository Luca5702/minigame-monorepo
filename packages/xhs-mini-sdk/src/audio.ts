/**
 * Pure offline tactile Foley & harmonic sound synthesizer.
 * Uses Web Audio API with pre-baked noise buffers — zero external audio files or network requests.
 */
export class TactileAudio {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private enabled = true;

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(next: boolean): void {
    this.enabled = next;
    if (next) {
      this.unlock();
      this.playTap();
    }
  }

  public toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.buildNoiseBuffer();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private buildNoiseBuffer(): void {
    if (!this.ctx) return;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * 0.6);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      // Gently pinked crisp paper texture noise
      last = 0.62 * last + 0.38 * white;
      data[i] = last * 1.35;
    }
    this.noiseBuffer = buffer;
  }

  private ensureReady(): AudioContext | null {
    if (!this.enabled) return null;
    this.unlock();
    return this.ctx;
  }

  /** Soft UI button tap */
  public playTap(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(240, now + 0.045);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.055);
  }

  /** Crisp craft-blade slicing through thick photo cardstock */
  public playSlice(cutIndex = 0, totalCuts = 6): void {
    const ctx = this.ensureReady();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const ratio = totalCuts > 1 ? cutIndex / (totalCuts - 1) : 0;

    // 1. Paper shear bandpass sweep
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    const startFreq = 1650 + ratio * 550;
    filter.frequency.setValueAtTime(startFreq, now);
    filter.frequency.exponentialRampToValueAtTime(startFreq * 2.15, now + 0.19);
    filter.Q.setValueAtTime(2.8, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.002, now + 0.21);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.22);

    // 2. Subtle metallic blade sheen ping
    const ping = ctx.createOscillator();
    const pingGain = ctx.createGain();
    ping.type = 'triangle';
    ping.frequency.setValueAtTime(2200 + ratio * 650, now);
    ping.frequency.exponentialRampToValueAtTime(1250 + ratio * 300, now + 0.07);
    pingGain.gain.setValueAtTime(0.045, now);
    pingGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.075);

    ping.connect(pingGain);
    pingGain.connect(ctx.destination);
    ping.start(now);
    ping.stop(now + 0.08);
  }

  /** Satisfying die-cut pop & scatter when pieces separate */
  public playScatter(pieceCount = 9): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const pops = Math.min(pieceCount, 10);

    for (let i = 0; i < pops; i++) {
      const t = now + i * 0.024;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const base = 300 + i * 38 + (Math.random() * 25 - 12);
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 1.45, t + 0.045);

      gain.gain.setValueAtTime(0.065, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.06);
    }
  }

  /** Gentle tactile lift when picking up a puzzle piece */
  public playPickup(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.055);

    gain.gain.setValueAtTime(0.085, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  /** Soft shuffle sound when placing/swapping a piece without locking */
  public playSoftPlace(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(290, now);
    osc.frequency.exponentialRampToValueAtTime(185, now + 0.05);

    gain.gain.setValueAtTime(0.075, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  /** Crisp "咔哒" magnetic snap + warm ascending harmonic note when piece locks */
  public playSnap(lockedCount = 1, totalPieces = 9): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Crisp cardboard/wood click ("咔")
    if (this.noiseBuffer) {
      const clickSrc = ctx.createBufferSource();
      clickSrc.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(2400, now);
      bp.Q.setValueAtTime(3.2, now);

      const clickGain = ctx.createGain();
      clickGain.gain.setValueAtTime(0.24, now);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);

      clickSrc.connect(bp);
      bp.connect(clickGain);
      clickGain.connect(ctx.destination);
      clickSrc.start(now);
      clickSrc.stop(now + 0.026);
    }

    // 2. Resonant wooden lock ("哒") + ascending pentatonic bell
    const pentatonic = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.5];
    const progress = Math.max(0, Math.min(1, (lockedCount - 1) / Math.max(1, totalPieces - 1)));
    const noteIdx = Math.min(
      pentatonic.length - 1,
      Math.floor(progress * (pentatonic.length - 1))
    );
    const freq = pentatonic[noteIdx];

    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(195, now + 0.012);
    bodyOsc.frequency.exponentialRampToValueAtTime(115, now + 0.065);
    bodyGain.gain.setValueAtTime(0.16, now + 0.012);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    bodyOsc.connect(bodyGain);
    bodyGain.connect(ctx.destination);
    bodyOsc.start(now + 0.012);
    bodyOsc.stop(now + 0.075);

    const chime = ctx.createOscillator();
    const chimeGain = ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(freq, now + 0.015);
    chimeGain.gain.setValueAtTime(0.12, now + 0.015);
    chimeGain.gain.exponentialRampToValueAtTime(0.0008, now + 0.24);
    chime.connect(chimeGain);
    chimeGain.connect(ctx.destination);
    chime.start(now + 0.015);
    chime.stop(now + 0.25);
  }

  /** Postcard 3D flip paper whoosh */
  public playFlip(): void {
    const ctx = this.ensureReady();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(1850, now + 0.11);
    filter.frequency.exponentialRampToValueAtTime(520, now + 0.24);
    filter.Q.setValueAtTime(1.6, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.13, now + 0.09);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.26);
  }

  /** Warm luminous completion chord arpeggio */
  public playCelebrate(): void {
    const ctx = this.ensureReady();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98];

    notes.forEach((freq, idx) => {
      const start = now + idx * 0.068;
      const osc = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      sub.type = 'triangle';
      sub.frequency.setValueAtTime(freq * 0.5, start);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.11, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.72);

      osc.connect(gain);
      sub.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      sub.start(start);
      osc.stop(start + 0.75);
      sub.stop(start + 0.75);
    });
  }
}
