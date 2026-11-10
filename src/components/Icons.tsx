import type { ReactNode } from 'react';

type IconProps = { filled?: boolean };

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#E11D2E" />
      <path
        fill="#fff"
        d="M9 7.2h8.1c3.3 0 5.4 1.6 5.4 4.1 0 1.7-1 3-2.6 3.6 2 .6 3.2 2.1 3.2 4.1 0 2.8-2.4 4.8-6.1 4.8H9V7.2zm3.1 6.4h4.2c1.4 0 2.3-.7 2.3-1.7s-.9-1.7-2.3-1.7h-4.2v3.4zm0 6.8h4.8c1.6 0 2.6-.8 2.6-2s-1-2-2.6-2h-4.8V20.4z"
      />
    </svg>
  );
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

export function IconToday() {
  return (
    <Svg>
      <rect x="3.5" y="4.5" width="17" height="16" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 9.5h17M8 3v3M16 3v3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

export function IconLive() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <path d="M7.2 7.2a6.8 6.8 0 0 0 0 9.6M16.8 7.2a6.8 6.8 0 0 1 0 9.6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

export function IconStar({ filled = false }: IconProps) {
  return (
    <Svg>
      <path
        d="M12 3.4 14.4 8.7l5.8.6-4.4 3.8 1.3 5.6L12 16.2 6.9 18.7 8.2 13.1 3.8 9.3l5.8-.6L12 3.4Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconBell() {
  return (
    <Svg>
      <path d="M6 16.5h12l-1.2-2V10a4.8 4.8 0 0 0-9.6 0v4.5L6 16.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M10 16.6a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

export function IconSettings() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function IconBall() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 4.2 14.2 8.4 12 10.2 9.8 8.4 12 4.2ZM8.2 14.6 6.2 11.2 9.2 10.2 10.4 13.2 8.2 14.6ZM15.8 14.6 13.6 13.2 14.8 10.2 17.8 11.2 15.8 14.6ZM12 19.8 9.4 16.2h5.2L12 19.8Z" fill="currentColor" />
    </Svg>
  );
}

export function IconCard({ tone }: { tone: 'yellow' | 'red' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={tone === 'red' ? 'card-red' : 'card-yellow'}>
      <rect x="7" y="3" width="10" height="18" rx="1.4" fill="currentColor" />
    </svg>
  );
}

export function IconPicks() {
  return (
    <Svg>
      <path d="M6 7h12M6 12h12M6 17h8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

export function IconTrends() {
  return (
    <Svg>
      <path d="M4 16l5-5 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconSlip() {
  return (
    <Svg>
      <path d="M7 4h10v16l-2.2-1.4L12 20l-2.8-1.4L7 20V4Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconRank() {
  return (
    <Svg>
      <path d="M5 18V11M12 18V6M19 18v-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </Svg>
  );
}

export function IconRefresh() {
  return (
    <Svg>
      <path d="M19 12a7 7 0 0 1-12 4.9M5 12a7 7 0 0 1 12-4.9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M16 4.5h2.5V7M8 19.5H5.5V17" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
