export class AudioEngine {
  private ctx: AudioContext;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private startTime: number = 0;
  private startOffset: number = 0;
  private _isPlaying: boolean = false;

  constructor() {
    this.ctx = new AudioContext();
  }

  async loadWav(pcmData: Float32Array<ArrayBuffer>, sampleRate: number): Promise<void> {
    this.buffer = this.ctx.createBuffer(1, pcmData.length, sampleRate);
    this.buffer.copyToChannel(pcmData, 0);
  }

  loadBuffer(buffer: AudioBuffer): void {
    this.stop();
    this.buffer = buffer;
    this.startOffset = 0;
  }

  play(fromTime: number = 0): void {
    if (!this.buffer) return;
    this.stop();
    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.connect(this.ctx.destination);
    this.startOffset = fromTime;
    this.startTime = this.ctx.currentTime;
    this.source.start(0, fromTime);
    this._isPlaying = true;
    this.source.onended = () => { this._isPlaying = false; };
  }

  stop(): void {
    if (this.source) {
      try { this.source.stop(); } catch { /* already stopped */ }
      this.source.disconnect();
      this.source = null;
    }
    this._isPlaying = false;
  }

  getCurrentTime(): number {
    if (!this._isPlaying) return this.startOffset;
    return this.startOffset + (this.ctx.currentTime - this.startTime);
  }

  get isPlaying(): boolean { return this._isPlaying; }
  get duration(): number { return this.buffer?.duration ?? 0; }
  get audioContext(): AudioContext { return this.ctx; }

  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }
}
