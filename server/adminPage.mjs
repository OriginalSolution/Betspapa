import { readFileSync } from 'node:fs';

const consolePage = readFileSync(new URL('./admin/console.html', import.meta.url), 'utf8');

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

const frame = (body) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="robots" content="noindex">
  <meta name="theme-color" content="#07080c">
  <meta name="color-scheme" content="dark">
  <title>Command centre · Betspapa</title>
  <style>
    :root { color-scheme: dark; --bg:#07080c; --text:#f4f6fb; --muted:#949bab; --red:#e11d2e; --line:rgba(255,255,255,.08); }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; background: var(--bg); color: var(--text); font-family: "Avenir Next", "Segoe UI", sans-serif; }
    body::before { content: ""; position: fixed; inset: 0 0 auto 0; height: 2px; background: linear-gradient(90deg, transparent, var(--red) 20%, #ffb703 50%, var(--red) 80%, transparent); }
    main { width: min(440px, calc(100% - 32px)); margin: 12vh auto 40px; }
    .logo { width: 52px; height: 52px; display: block; }
    h1 { margin: 14px 0 0; font-size: 28px; letter-spacing: -.04em; }
    p, label { color: var(--muted); }
    label { display: block; font-size: 13px; }
    form { display: flex; flex-direction: column; gap: 12px; margin-top: 22px; }
    input, button { font: inherit; border-radius: 14px; min-height: 48px; }
    input { border: 1px solid var(--line); background: #12151c; color: var(--text); padding: 0 14px; }
    button { border: 0; background: var(--red); color: white; font-weight: 700; }
    .error { color: #ff8b95; margin: 16px 0 0; }
  </style>
</head>
<body>
  <main>
    <svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#E11D2E"/><path fill="#fff" d="M9 7.2h8.1c3.3 0 5.4 1.6 5.4 4.1 0 1.7-1 3-2.6 3.6 2 .6 3.2 2.1 3.2 4.1 0 2.8-2.4 4.8-6.1 4.8H9V7.2zm3.1 6.4h4.2c1.4 0 2.3-.7 2.3-1.7s-.9-1.7-2.3-1.7h-4.2v3.4zm0 6.8h4.8c1.6 0 2.6-.8 2.6-2s-1-2-2.6-2h-4.8V20.4z"/></svg>
    ${body}
  </main>
</body>
</html>`;

export function loginHtml(message = '') {
  const error = message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : '';
  return frame(`<h1>Command centre</h1>
    <p>Betspapa operations - Africa/Accra</p>
    ${error}
    <form method="post" action="/admin/login">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
      <button type="submit">Enter</button>
    </form>`);
}

export function unavailableHtml() {
  return frame(`<h1>Command centre</h1><p>The operator page is unavailable.</p>`);
}

export function consoleHtml() {
  return consolePage;
}
