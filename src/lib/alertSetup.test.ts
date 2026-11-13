import { describe, expect, it } from 'vitest';
import {
  ALERT_SETUP_VERSION,
  OEM_INSTRUCTION,
  bannerNeeded,
  emptyDeviceStatus,
  failingStep,
  fixSteps,
  introSteps,
  nativeSetupIsCurrent,
  nextUnsatisfiedIndex,
  parseDeviceStatus,
  parseSetupRecord,
  pollIsStale,
  retrySteps,
  sentCopy,
  setupIsCurrent,
  shouldShowIntro,
  stepCopy,
  stepsFrom,
  type AlertDeviceStatus,
} from './alertSetup';

function device(patch: Partial<AlertDeviceStatus> = {}): AlertDeviceStatus {
  return { ...emptyDeviceStatus(), ...patch };
}

describe('alert setup version', () => {
  it('treats a 0.3.1 install with no record as not done', () => {
    expect(parseSetupRecord(null)).toBeNull();
    expect(setupIsCurrent(null)).toBe(false);
    expect(shouldShowIntro(null, false)).toBe(true);
    expect(ALERT_SETUP_VERSION).toBe(1);
  });

  it('accepts only a finished record at this version or newer', () => {
    expect(setupIsCurrent({ version: 1, finished: false })).toBe(false);
    expect(setupIsCurrent({ version: 0, finished: true })).toBe(false);
    expect(setupIsCurrent({ version: 1, finished: true })).toBe(true);
    expect(setupIsCurrent({ version: 2, finished: true })).toBe(true);
    expect(parseSetupRecord('{"version":1,"finished":true}')).toEqual({ version: 1, finished: true });
    expect(parseSetupRecord('nope')).toBeNull();
    expect(nativeSetupIsCurrent(device({ setupVersion: 1, setupFinished: true }))).toBe(true);
    expect(parseDeviceStatus({ notificationSound: 'on', soundBlocked: true }).notificationSound).toBe('on');
    expect(parseDeviceStatus({ notificationSound: 'on', soundBlocked: true }).soundBlocked).toBe(true);
    expect(parseDeviceStatus({}).notificationSound).toBe('off');
    expect(emptyDeviceStatus().soundBlocked).toBe(false);
    expect(shouldShowIntro({ version: 1, finished: true }, false)).toBe(false);
    expect(shouldShowIntro(null, true)).toBe(false);
  });
});

describe('alert setup steps', () => {
  it('asks for every missing check, then the test', () => {
    const status = device({ notifications: 'prompt', batteryUnrestricted: false, exactAlarms: 'denied', oem: 'transsion' });
    expect(introSteps(status)).toEqual(['notifications', 'battery', 'exact', 'autostart', 'test']);
    expect(stepCopy('autostart', 'transsion', 'ask').body).toContain('Phone Master');
    expect(pollIsStale(Date.now() - 11 * 60 * 1000)).toBe(true);
    expect(pollIsStale(Date.now() - 2 * 60 * 1000)).toBe(false);
    expect(pollIsStale(0)).toBe(false);
  });

  it('skips checks that are already granted and skips exact alarms before Android 12', () => {
    const status = device({ notifications: 'granted', batteryUnrestricted: true, exactAlarms: 'unsupported', oem: null });
    expect(introSteps(status)).toEqual(['test']);
    expect(failingStep(status)).toBeNull();
  });

  it('keeps exact alarms only when Android reports them denied', () => {
    expect(introSteps(device({ notifications: 'granted', batteryUnrestricted: true, exactAlarms: 'denied' }))).toEqual(['exact', 'test']);
    expect(introSteps(device({ notifications: 'granted', batteryUnrestricted: true, exactAlarms: 'granted', oem: 'samsung' }))).toEqual(['autostart', 'test']);
  });

  it('auto-advances past a step once the real status is granted', () => {
    const steps = ['notifications', 'battery', 'exact', 'test'] as const;
    const granted = device({ notifications: 'granted', batteryUnrestricted: false, exactAlarms: 'denied' });
    expect(nextUnsatisfiedIndex([...steps], 0, granted)).toBe(1);
    const both = device({ notifications: 'granted', batteryUnrestricted: true, exactAlarms: 'denied' });
    expect(nextUnsatisfiedIndex([...steps], 0, both)).toBe(2);
    expect(nextUnsatisfiedIndex(['autostart', 'test'], 0, both)).toBe(0);
  });

  it('opens the banner fix at the failing step', () => {
    const status = device({ notifications: 'denied', batteryUnrestricted: false, exactAlarms: 'denied', oem: 'xiaomi' });
    expect(fixSteps(status)).toEqual(['notifications', 'battery', 'exact', 'test']);
    expect(bannerNeeded(true, false, status)).toBe(true);
    expect(bannerNeeded(false, false, status)).toBe(false);
    expect(bannerNeeded(true, true, status)).toBe(false);
    expect(bannerNeeded(true, false, device({ notifications: 'granted', batteryUnrestricted: true, exactAlarms: 'granted' }))).toBe(false);
  });

  it('sends a failed test back to the blocking step, or Autostart when the checks pass', () => {
    expect(retrySteps(device({ notifications: 'granted', batteryUnrestricted: false, exactAlarms: 'granted', oem: 'samsung' }))).toEqual(['battery', 'autostart', 'test']);
    expect(retrySteps(device({ notifications: 'granted', batteryUnrestricted: true, exactAlarms: 'granted', oem: 'oppo' }))).toEqual(['autostart', 'test']);
    expect(retrySteps(device({ notifications: 'granted', batteryUnrestricted: true, exactAlarms: 'granted' }))).toEqual(['test']);
    expect(stepsFrom(device({ oem: 'vivo' }), 'autostart', true)).toEqual(['autostart', 'test']);
  });

  it('uses one brand line and the return question', () => {
    expect(stepCopy('notifications', null, 'ask').action).toBe('Allow notifications');
    expect(stepCopy('battery', null, 'ask').action).toBe('Allow background activity');
    expect(stepCopy('exact', null, 'ask').action).toBe('Allow exact alarms');
    expect(stepCopy('autostart', 'huawei', 'opened').action).toBe("I've turned it on");
    expect(stepCopy('test', null, 'confirm').title).toBe('Did you get it?');
    expect(sentCopy()).toContain('Leave Betspapa');
    expect(OEM_INSTRUCTION.vivo).toContain('iQOO');
    expect(parseDeviceStatus({ notifications: 'granted', oem: 'samsung', exactAlarms: 'denied', setupFinished: true, setupVersion: 1 })).toMatchObject({
      notifications: 'granted',
      oem: 'samsung',
      exactAlarms: 'denied',
      setupFinished: true,
    });
    expect(parseDeviceStatus(null).notifications).toBe('prompt');
  });
});
