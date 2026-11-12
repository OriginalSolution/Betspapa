import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const sounds = [
  { file: 'cheer-crowd.mp3', min: 5.0, max: 5.5 },
  { file: 'cheer-afro.mp3', min: 4.7, max: 5.2 },
  { file: 'cheer-chant.mp3', min: 4.0, max: 4.5 },
  { file: 'cheer-papa.mp3', min: 2.7, max: 3.3 },
];

function measure(name) {
  const file = new URL(`../public/sounds/${name}`, import.meta.url);
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {
    encoding: 'utf8',
  });
  assert.equal(probe.status, 0, probe.stderr);
  const duration = Number(String(probe.stdout).trim());
  const detect = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], {
    encoding: 'utf8',
  });
  const log = `${detect.stdout}\n${detect.stderr}`;
  const match = log.match(/max_volume:\s*(-?\d+(?:\.\d+)?) dB/);
  assert.ok(match, log);
  return { duration, peak: Number(match[1]) };
}

test('bundled goal cheers peak near -8 dBFS and are not the old files', () => {
  assert.equal(existsSync(new URL('../public/sounds/goal-cheer.wav', import.meta.url)), false);
  assert.equal(existsSync(new URL('../public/sounds/goal-chant.wav', import.meta.url)), false);
  const credits = readFileSync(new URL('../public/sounds/SOURCES.txt', import.meta.url), 'utf8');
  assert.match(credits, /cheer-crowd/);
  assert.match(credits, /cheer-afro/);
  assert.match(credits, /eSpeak NG/);
  assert.match(credits, /Papa Shout recorded by the Betspapa owner, used with permission/);

  const gain = 60 / 100;
  assert.equal(gain, 0.6);
  for (const sound of sounds) {
    const measured = measure(sound.file);
    assert.ok(measured.duration >= sound.min && measured.duration <= sound.max, `${sound.file} duration ${measured.duration}`);
    assert.ok(measured.peak <= -7.8 && measured.peak >= -9.2, `${sound.file} peak ${measured.peak} dBFS`);
    const heard = measured.peak + 20 * Math.log10(gain);
    assert.ok(heard < -12, `${sound.file} heard peak ${heard}`);
    console.info(
      `${sound.file} peak ${measured.peak.toFixed(1)} dBFS, duration ${measured.duration.toFixed(3)}s, playback gain ${gain.toFixed(2)}, heard peak ${heard.toFixed(1)} dBFS`,
    );
  }
});
