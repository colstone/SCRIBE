export class SineWaveFeedback {
  private ctx: AudioContext;
  private activeNodes: { osc: OscillatorNode; gain: GainNode }[] = [];

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  pluck(midiPitch: number, centsOffset: number = 0, duration: number = 0.5): void {
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = this.midiToFreq(midiPitch, centsOffset);
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    const attack = 0.008;
    const decay = 0.08;
    const sustain = 0.08;
    const release = duration - attack - decay;

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + attack);
    gain.gain.linearRampToValueAtTime(sustain, now + attack + decay);
    gain.gain.linearRampToValueAtTime(0, now + duration);

    osc.start(now);
    osc.stop(now + duration + 0.05);

    const entry = { osc, gain };
    this.activeNodes.push(entry);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      this.activeNodes = this.activeNodes.filter((e) => e !== entry);
    };
  }

  stop(): void {
    const now = this.ctx.currentTime;
    for (const { osc, gain } of this.activeNodes) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 0.02);
      try { osc.stop(now + 0.03); } catch { /* already stopped */ }
    }
    this.activeNodes = [];
  }

  private midiToFreq(midi: number, cents: number): number {
    return 440 * Math.pow(2, (midi + cents / 100 - 69) / 12);
  }
}
