import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function assertLoudWav(name, minSeconds, maxSeconds) {
  const buffer = readFileSync(new URL(`../public/sounds/${name}`, import.meta.url));
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WAVE');
  const sampleRate = buffer.readUInt32LE(24);
  const dataSize = buffer.readUInt32LE(40);
  const seconds = dataSize / 2 / sampleRate;
  assert.ok(seconds >= minSeconds && seconds <= maxSeconds, `${name} duration ${seconds}`);
  let peak = 0;
  for (let offset = 44; offset < buffer.length; offset += 2) {
    peak = Math.max(peak, Math.abs(buffer.readInt16LE(offset)) / 32767);
  }
  assert.ok(peak >= 0.75 && peak <= 0.95, `${name} peak ${peak}`);
}

test('bundled goal sounds are short and loud', () => {
  assertLoudWav('goal-cheer.wav', 1, 2);
  assertLoudWav('goal-chant.wav', 1.5, 2.6);
});
