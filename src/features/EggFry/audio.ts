import type { FryNotice } from "./simulation.ts";

/** Airy broadband hiss with very small bubbles; no bass rumble or tonal crack bursts. */
export function sizzleSamples(length: number, sampleRate: number, random = Math.random): Float32Array {
  const samples = new Float32Array(length);
  let bubble = 0;
  for (let i = 0; i < length; i++) {
    if (random() < 18 / sampleRate) bubble = 0.12;
    bubble *= 0.995;
    const breath = 0.78 + 0.12 * Math.sin(i / sampleRate * Math.PI * 1.4);
    samples[i] = (random() * 2 - 1) * (0.55 * breath + bubble);
  }
  return samples;
}

export class FryAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sizzle: AudioBufferSourceNode | null = null;
  private sizzleGain: GainNode | null = null;
  private sizzleFilters: BiquadFilterNode[] = [];
  private tones = new Set<{ source: OscillatorNode; gain: GainNode }>();
  private paused = false;
  muted = true;

  unlock() {
    if (this.muted || this.paused) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.45;
        this.master.connect(this.context.destination);
      }
      void this.context.resume().catch(() => {});
    } catch { /* Optional sound. */ }
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.context) this.master.gain.setTargetAtTime(muted ? 0 : 0.45, this.context.currentTime, 0.03);
    if (!muted) this.unlock();
  }
  tone(frequency: number, duration: number, delay = 0, type: OscillatorType = "sine") {
    const ctx = this.context;
    if (this.muted || this.paused || !ctx || !this.master || ctx.state !== "running") return;
    const tone = ctx.createOscillator(), gain = ctx.createGain(), at = ctx.currentTime + delay;
    tone.type = type;
    tone.frequency.setValueAtTime(frequency, at);
    tone.frequency.exponentialRampToValueAtTime(frequency * 0.75, at + duration);
    gain.gain.setValueAtTime(0.12, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    tone.connect(gain).connect(this.master);
    const active = { source: tone, gain }; this.tones.add(active);
    tone.start(at); tone.stop(at + duration);
    tone.onended = () => { tone.disconnect(); gain.disconnect(); this.tones.delete(active); };
  }
  notice(notice: FryNotice) {
    if (notice.kind === "loss") this.tone(95, 0.18, 0, "triangle");
    else if (notice.kind === "protected") { this.tone(160, 0.08); this.tone(230, 0.07, 0.05); }
    else if (notice.kind === "jackpot") [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.18, i * 0.065));
    else if (notice.kind === "shield") [420, 630].forEach((f, i) => this.tone(f, 0.13, i * 0.07));
    else if (notice.kind === "mystery") [330, 495, notice.amount < 0n ? 247 : 660].forEach((f, i) => this.tone(f, 0.13, i * 0.07));
    else { this.tone(480, 0.075); this.tone(720, 0.1, 0.04); }
  }
  fry(intensity: number) {
    const ctx = this.context;
    if (!ctx || !this.master || this.muted || this.paused || ctx.state !== "running") return;
    if (!this.sizzle) {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      samples.set(sizzleSamples(samples.length, ctx.sampleRate));
      const source = ctx.createBufferSource(), gain = ctx.createGain();
      const high = ctx.createBiquadFilter(), low = ctx.createBiquadFilter();
      high.type = "highpass"; high.frequency.value = 750; high.Q.value = 0.5;
      low.type = "lowpass"; low.frequency.value = 5200; low.Q.value = 0.5;
      source.buffer = buffer; source.loop = true;
      source.connect(high).connect(low).connect(gain).connect(this.master); gain.gain.value = 0;
      this.sizzleFilters = [high, low];
      source.start(); this.sizzle = source; this.sizzleGain = gain;
    }
    this.sizzleGain?.gain.setTargetAtTime(0.025 + Math.max(0, Math.min(1, intensity)) * 0.095, ctx.currentTime, 0.25);
  }
  stopFry() {
    if (this.sizzle) { this.sizzle.stop(); this.sizzle.disconnect(); this.sizzle = null; }
    this.sizzleGain?.disconnect(); this.sizzleGain = null;
    for (const filter of this.sizzleFilters) filter.disconnect(); this.sizzleFilters = [];
  }
  private stopTones() {
    for (const { source, gain } of this.tones) { source.stop(); source.disconnect(); gain.disconnect(); }
    this.tones.clear();
  }
  pause() { this.paused = true; this.stopFry(); this.stopTones(); if (this.context) void this.context.suspend().catch(() => {}); }
  resume() { this.paused = false; this.unlock(); }
  dispose() { this.stopFry(); this.stopTones(); if (this.context) void this.context.close().catch(() => {}); }
}
