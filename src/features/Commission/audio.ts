let context: AudioContext | null = null;
export function sound(kind: "stamp" | "paper" | "measure", enabled: boolean) {
  if (!enabled) return;
  try {
    context ??= new AudioContext(); void context.resume();
    const at = context.currentTime, length = kind === "stamp" ? .17 : .08;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * length), context.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / data.length * 8);
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = buffer; filter.type = "lowpass"; filter.frequency.value = kind === "stamp" ? 600 : kind === "paper" ? 2200 : 1400;
    gain.gain.value = kind === "stamp" ? .3 : .09; source.connect(filter).connect(gain).connect(context.destination); source.start(at);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    if (kind === "measure") { const tone = context.createOscillator(), level = context.createGain(); tone.type = "sine"; tone.frequency.value = 780; level.gain.setValueAtTime(.035, at); level.gain.exponentialRampToValueAtTime(.001, at + .18); tone.connect(level).connect(context.destination); tone.start(); tone.stop(at + .18); tone.onended = () => { tone.disconnect(); level.disconnect(); }; }
  } catch { /* Sound never blocks an action or a saved result. */ }
}
