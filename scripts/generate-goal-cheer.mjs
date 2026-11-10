/**
 * Writes public/sounds/goal-cheer.wav.
 * This is an original synthesis (filtered noise and a low roar), not a stadium recording.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 32000;
const DURATION = 1.55;

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeFilter(sampleRate) {
  let low = 0;
  let band = 0;
  return (input, freq, q) => {
    const f = 2 * Math.sin((Math.PI * Math.min(freq, sampleRate * 0.45)) / sampleRate);
    low += f * band;
    const high = input - low - band / q;
    band += f * high;
    return { low, band, high };
  };
}

function envelope(time) {
  const attack = 0.09;
  if (time < attack) return (time / attack) ** 1.6;
  const decay = (time - attack) / (DURATION - attack);
  const pulses = 0.78 + 0.22 * Math.sin(2 * Math.PI * 5.2 * time) * Math.exp(-1.8 * decay);
  return Math.exp(-2.35 * decay) * pulses;
}

export function synthesizeGoalCheer() {
  const count = Math.floor(SAMPLE_RATE * DURATION);
  const noiseA = mulberry32(0x9e3779b9);
  const noiseB = mulberry32(0x85ebca6b);
  const filterA = makeFilter(SAMPLE_RATE);
  const filterB = makeFilter(SAMPLE_RATE);
  const samples = new Float32Array(count);
  let roar = 0;

  for (let index = 0; index < count; index += 1) {
    const time = index / SAMPLE_RATE;
    const env = envelope(time);
    const white = noiseA() * 2 - 1;
    const whiteB = noiseB() * 2 - 1;
    const bodyFreq = 420 + 180 * Math.sin(2 * Math.PI * 1.3 * time);
    const airFreq = 1100 + 220 * Math.sin(2 * Math.PI * 0.7 * time + 0.4);
    const a = filterA(white, bodyFreq, 0.85);
    const b = filterB(whiteB, airFreq, 1.35);
    const pitch = 148 + 16 * Math.sin(2 * Math.PI * 2.1 * time);
    roar += 0.18 * (Math.sin(2 * Math.PI * pitch * time) - roar);
    const mixed = a.low * 0.72 + a.band * 0.95 + b.band * 0.42 + b.high * 0.05 + roar * 0.22;
    const shaped = Math.tanh(mixed * 1.35) * env * 0.42;
    samples[index] = shaped;
  }
  return { samples, sampleRate: SAMPLE_RATE };
}

function encodeWav(samples, sampleRate) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + index * 2);
  }
  return buffer;
}

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sounds', 'goal-cheer.wav');
const { samples, sampleRate } = synthesizeGoalCheer();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, encodeWav(samples, sampleRate));
let peak = 0;
for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
console.log(`Wrote ${out} (${(samples.length / sampleRate).toFixed(2)}s, peak ${peak.toFixed(2)})`);
