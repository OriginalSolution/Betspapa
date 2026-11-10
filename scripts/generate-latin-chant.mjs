/**
 * Writes public/sounds/goal-chant.wav.
 * Original synthesis of a short festive "gol" / olé crowd chant.
 * Not a stadium recording, club song, or sampled commercial track.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 32000;
const DURATION = 2.15;

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

function syllable(time, start, length, pitch) {
  const local = time - start;
  if (local < 0 || local > length) return 0;
  const env = Math.sin((Math.PI * local) / length) ** 1.15;
  const vibrato = pitch * (1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * time));
  const voice =
    Math.sin(2 * Math.PI * vibrato * time) * 0.7 +
    Math.sin(2 * Math.PI * vibrato * 2 * time) * 0.22 +
    Math.sin(2 * Math.PI * vibrato * 3 * time) * 0.08;
  return voice * env;
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

function synthesize() {
  const count = Math.floor(SAMPLE_RATE * DURATION);
  const noise = mulberry32(0xc0ffee);
  const filter = makeFilter(SAMPLE_RATE);
  const samples = new Float32Array(count);
  const hits = [
    { start: 0.02, length: 0.42, pitch: 196 },
    { start: 0.52, length: 0.28, pitch: 262 },
    { start: 0.84, length: 0.3, pitch: 330 },
    { start: 1.2, length: 0.28, pitch: 262 },
    { start: 1.52, length: 0.42, pitch: 392 },
  ];
  for (let index = 0; index < count; index += 1) {
    const time = index / SAMPLE_RATE;
    let voice = 0;
    for (const hit of hits) voice += syllable(time, hit.start, hit.length, hit.pitch);
    const white = noise() * 2 - 1;
    const crowd = filter(white, 680 + 80 * Math.sin(2 * Math.PI * 2 * time), 0.7);
    const pulse = hits.reduce((sum, hit) => sum + (time >= hit.start && time < hit.start + hit.length ? 1 : 0), 0);
    samples[index] = voice * 0.85 + (crowd.band * 0.55 + crowd.low * 0.35) * (0.25 + pulse * 0.75);
  }
  // Peak 0.42 (−7.5 dBFS). The previous pass used tanh(sample * gain * 1.35) and peaked at 0.874.
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  const gain = peak > 0.0001 ? 0.42 / peak : 1;
  for (let index = 0; index < samples.length; index += 1) samples[index] *= gain;
  return samples;
}

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sounds', 'goal-chant.wav');
const samples = synthesize();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, encodeWav(samples, SAMPLE_RATE));
let peak = 0;
for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
console.log(`Wrote ${out} (${(samples.length / SAMPLE_RATE).toFixed(2)}s, peak ${peak.toFixed(2)})`);
