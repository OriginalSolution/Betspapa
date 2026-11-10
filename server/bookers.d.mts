export type DeviceBookResult = {
  parts: Array<{ code: string; link: string; totalOdds: number | null; legs: number }>;
  error: string | null;
};

export function bookAll(
  legs: unknown[],
  request: (
    method: string,
    url: string,
    opts?: { body?: unknown; headers?: Record<string, string>; timeout?: number },
  ) => Promise<unknown>,
  onBook?: (name: string, result: DeviceBookResult) => void,
): Promise<Record<string, DeviceBookResult>>;

export function publicError(value: unknown): string;
export function resetBookerCache(): void;
