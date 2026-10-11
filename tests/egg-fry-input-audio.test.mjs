import test from 'node:test';
import assert from 'node:assert/strict';
import { fryKeyAction } from '../src/features/EggFry/controls.ts';
import { FryAudio } from '../src/features/EggFry/audio.ts';

const key = (code, extra = {}) => ({ code, repeat: false, defaultPrevented: false, ctrlKey: false, metaKey: false, altKey: false, target: null, ...extra });

test('Fry uses physical A/D/E/F/P/S controls with Russian and Latin layouts', () => {
  for (const [code, ru, expected] of [['KeyA', 'ф', 'steer'], ['KeyD', 'в', 'steer'], ['KeyE', 'у', 'cancel'], ['KeyF', 'а', 'brake'], ['KeyP', 'з', 'pause'], ['KeyS', 'ы', 'center']]) {
    assert.equal(fryKeyAction(key(code, { key: ru })), expected);
    assert.equal(fryKeyAction(key(code, { key: ru.toUpperCase(), shiftKey: true })), expected);
  }
  assert.equal(fryKeyAction(key('ArrowLeft')), 'steer');
  assert.equal(fryKeyAction(key('ArrowRight')), 'steer');
  assert.equal(fryKeyAction(key('ArrowDown')), 'center');
});

test('browser shortcuts, text fields and held one-shot keys do not trigger Fry actions', () => {
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'defaultPrevented']) {
    for (const code of ['KeyA', 'KeyD', 'KeyF', 'KeyP', 'ArrowLeft']) assert.equal(fryKeyAction(key(code, { [modifier]: true })), null);
  }
  assert.equal(fryKeyAction(key('KeyP', { target: { closest: () => ({ tagName: 'INPUT' }) } })), null);
  for (const code of ['KeyE', 'KeyF', 'KeyP']) assert.equal(fryKeyAction(key(code, { repeat: true })), null);
  assert.equal(fryKeyAction(key('KeyA', { repeat: true })), 'steer');
  assert.equal(fryKeyAction(key('Tab')), null);
});

class AudioParamStub {
  value = 0;
  setTargetAtTime(value) { this.value = value; }
  setValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
}
class NodeStub {
  gain = new AudioParamStub(); frequency = new AudioParamStub(); Q = new AudioParamStub();
  stops = 0; starts = 0; disconnected = false;
  connect(node) { return node; }
  disconnect() { this.disconnected = true; }
  start() { this.starts++; }
  stop() { this.stops++; }
}
class AudioContextStub {
  static instances = [];
  state = 'running'; currentTime = 0; sampleRate = 100; destination = new NodeStub(); resumes = 0;
  sources = []; oscillators = [];
  constructor() { AudioContextStub.instances.push(this); }
  createGain() { return new NodeStub(); }
  createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() { const source = new NodeStub(); this.sources.push(source); return source; }
  createOscillator() { const source = new NodeStub(); this.oscillators.push(source); return source; }
  createBiquadFilter() { return new NodeStub(); }
  async resume() { this.resumes++; this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}

test('unmuting while paused cannot resume sound; countdown resumes without stale sizzle or tones', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: AudioContextStub });
  const audio = new FryAudio();
  try {
    audio.setMuted(false); audio.fry(0.5); audio.tone(440, 0.2, 0.1);
    const context = AudioContextStub.instances.at(-1), source = context.sources[0], tone = context.oscillators[0];
    assert.equal(source.starts, 1);
    const resumes = context.resumes;
    audio.pause();
    assert.equal(context.state, 'suspended');
    assert.equal(source.stops, 1);
    assert.equal(source.disconnected, true);
    assert.equal(tone.stops, 2, 'cancel the previously scheduled tone end with an immediate stop');
    audio.setMuted(true); audio.setMuted(false); audio.unlock(); audio.fry(0.5); audio.tone(440, 0.2);
    assert.equal(context.resumes, resumes);
    assert.equal(context.state, 'suspended');
    assert.equal(context.sources.length, 1);
    assert.equal(context.oscillators.length, 1);
    audio.resume();
    assert.equal(context.state, 'running');
    assert.equal(context.sources.length, 1, 'resume/countdown cannot revive an old loop');
    audio.fry(0.5);
    assert.equal(context.sources.length, 2, 'frying creates a fresh loop after countdown');
  } finally {
    audio.dispose();
    if (original) Object.defineProperty(globalThis, 'AudioContext', original); else delete globalThis.AudioContext;
  }
});
