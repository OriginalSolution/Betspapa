/**
 * Disk writes that must not take the process down.
 * A full data disk throws ENOSPC. Writing straight onto the real file
 * truncates it first, which is how a device list or a booked board disappears.
 * Write a temp file, then rename. On failure the previous file stays put.
 */
import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function safeWriteFile(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, file);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      /* the temp file was never created, or the disk could not even unlink it */
    }
    throw error;
  }
}

/** Log a full-disk error and keep running. Any other uncaught error still exits. */
export function installDiskGuard() {
  if (globalThis.__betspapaDiskGuard) return;
  globalThis.__betspapaDiskGuard = true;
  process.on('uncaughtException', (error) => {
    const code = error && typeof error === 'object' ? error.code : '';
    const message = error instanceof Error ? error.message : String(error || '');
    if (code === 'ENOSPC' || /no space left on device/i.test(message)) {
      console.error(`[disk] A write failed because the data disk is full. The process stays up. ${message}`);
      return;
    }
    console.error(error);
    process.exit(1);
  });
}
