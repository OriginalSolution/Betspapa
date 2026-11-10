import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('bundled goal cheer is a short, moderate wav', () => {
  const buffer = readFileSync(new URL('../public/sounds/goal-cheer.wav', import.meta.url));
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WAVE');
  const sampleRate = buffer.readUInt32LE(24);
  const dataSize = buffer.readUInt32LE(40);
  const seconds = dataSize / 2 / sampleRate;
  assert.ok(seconds >= 1 && seconds <= 2, `duration ${seconds}`);
  let peak = 0;
  for (let offset = 44; offset < buffer.length; offset += 2) {
    peak = Math.max(peak, Math.abs(buffer.readInt16LE(offset)) / 32767);
  }
  assert.ok(peak > 0.2 && peak < 0.55, `peak ${peak}`);
});
