export class PianoSampler {
  private ctx: AudioContext;
  private buffers: Map<number, AudioBuffer> = new Map();
  private activeSource: AudioBufferSourceNode | null = null;
  private activeGain: GainNode | null = null;
  private loaded: boolean = false;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  async loadSamples(basePath: string): Promise<void> {
    const noteNames = ['C', 'Cs', 'D', 'Ds', 'E', 'F', 'Fs', 'G', 'Gs', 'A', 'As', 'B'];
    for (let octave = 2; octave <= 6; octave++) {
      for (let i = 0; i < noteNames.length; i++) {
        if (octave === 6 && i > 0) break; // Only up to C6
        const midi = (octave + 1) * 12 + i;
        const name = `piano_${noteNames[i]}${octave}`;
        try {
          const response = await fetch(`${basePath}/${name}.ogg`);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.buffers.set(midi, audioBuffer);
          }
        } catch {
          // Sample not available, skip
        }
      }
    }
    this.loaded = this.buffers.size > 0;
  }

  playNote(midiPitch: number): void {
    this.stopNote();

    const buffer = this.findClosestBuffer(midiPitch);
    if (!buffer) {
      this.playSineFallback(midiPitch);
      return;
    }

    this.activeGain = this.ctx.createGain();
    this.activeGain.gain.value = 0.5;
    this.activeGain.connect(this.ctx.destination);

    this.activeSource = this.ctx.createBufferSource();
    this.activeSource.buffer = buffer.audioBuffer;
    const semitoneDiff = midiPitch - buffer.midi;
    if (semitoneDiff !== 0) {
      this.activeSource.playbackRate.value = Math.pow(2, semitoneDiff / 12);
    }
    this.activeSource.connect(this.activeGain);
    this.activeSource.start();
  }

  stopNote(): void {
    if (this.activeGain) {
      const now = this.ctx.currentTime;
      this.activeGain.gain.setValueAtTime(this.activeGain.gain.value, now);
      this.activeGain.gain.linearRampToValueAtTime(0, now + 0.05);
      const src = this.activeSource;
      const gain = this.activeGain;
      setTimeout(() => {
        try { src?.stop(); } catch { /* already stopped */ }
        src?.disconnect();
        gain?.disconnect();
      }, 80);
      this.activeSource = null;
      this.activeGain = null;
    }
  }

  private findClosestBuffer(midi: number): { midi: number; audioBuffer: AudioBuffer } | null {
    if (this.buffers.has(midi)) {
      return { midi, audioBuffer: this.buffers.get(midi)! };
    }
    let closest: number | null = null;
    let minDist = Infinity;
    for (const key of this.buffers.keys()) {
      const dist = Math.abs(key - midi);
      if (dist < minDist) {
        minDist = dist;
        closest = key;
      }
    }
    if (closest !== null && minDist <= 12) {
      return { midi: closest, audioBuffer: this.buffers.get(closest)! };
    }
    return null;
  }

  private playSineFallback(midi: number): void {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime + 0.4);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
    osc.stop(this.ctx.currentTime + 0.55);
  }

  get isLoaded(): boolean { return this.loaded; }
}
