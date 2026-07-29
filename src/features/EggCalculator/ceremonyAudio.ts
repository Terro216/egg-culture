// Звуковой слой Церемонии: всё синтезируется на лету через Web Audio API,
// без аудиофайлов. Вода — фильтрованный шум + случайные «пузыри»,
// колокол — пара затухающих синусоидальных партиалов.

export class CeremonyAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private simmerGain: GainNode | null = null;
  private bubbleTimer: number | null = null;
  private running = false;

  private ensureContext() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  // Тихий гул томящейся воды: коричневый шум через низкочастотный фильтр
  // с медленной модуляцией среза — вода «дышит».
  private startSimmer() {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    filter.Q.value = 0.7;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 3);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master!);
    source.start();
    this.noiseSource = source;
    this.simmerGain = gain;
  }

  // Одиночный пузырь: короткий синус со скольжением частоты вниз.
  private bubble() {
    const ctx = this.ctx;
    if (!ctx || !this.running) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const freq = 220 + Math.random() * 420;
    const dur = 0.08 + Math.random() * 0.18;

    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.4, now + dur);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.02 + Math.random() * 0.025, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(this.master!);
    osc.start(now);
    osc.stop(now + dur + 0.05);
  }

  private scheduleBubbles() {
    const tick = () => {
      if (!this.running) return;
      this.bubble();
      if (Math.random() < 0.3) this.bubble();
      this.bubbleTimer = window.setTimeout(tick, 180 + Math.random() * 520);
    };
    tick();
  }

  // Мягкий удар колокола: основной тон + слегка расстроенный партиал.
  chime(baseFreq = 660, strength = 0.12) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const partials = [
      { freq: baseFreq, gain: strength },
      { freq: baseFreq * 2.02, gain: strength * 0.4 },
      { freq: baseFreq * 2.94, gain: strength * 0.15 },
    ];
    for (const p of partials) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = p.freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(p.gain, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.2);
      osc.connect(gain);
      gain.connect(this.master!);
      osc.start(now);
      osc.stop(now + 3.4);
    }
  }

  // Финал церемонии: три нисходящих удара.
  finale() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const notes = [880, 660, 440];
    notes.forEach((freq, i) => {
      window.setTimeout(() => this.chime(freq, 0.14), i * 900);
    });
  }

  start() {
    const ctx = this.ensureContext();
    if (!ctx || this.running) return;
    if (ctx.state === "suspended") void ctx.resume();
    this.running = true;
    this.startSimmer();
    this.scheduleBubbles();
  }

  suspend() {
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  stop() {
    this.running = false;
    if (this.bubbleTimer) {
      window.clearTimeout(this.bubbleTimer);
      this.bubbleTimer = null;
    }
    if (this.noiseSource && this.ctx) {
      const now = this.ctx.currentTime;
      // Плавно глушим только воду, не трогая master — колокола финала дозвучат.
      this.simmerGain?.gain.cancelScheduledValues(now);
      this.simmerGain?.gain.setValueAtTime(this.simmerGain.gain.value, now);
      this.simmerGain?.gain.linearRampToValueAtTime(0.0001, now + 1.2);
      try {
        this.noiseSource.stop(now + 1.5);
      } catch {
        // источник мог быть уже остановлен
      }
      this.noiseSource = null;
      this.simmerGain = null;
    }
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  dispose() {
    this.stop();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.master = null;
    }
  }
}
