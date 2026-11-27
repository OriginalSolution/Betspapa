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
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="BP Admin">
  <link rel="manifest" href="/admin/manifest.webmanifest">
  <link rel="apple-touch-icon" href="/admin/icons/apple-touch-icon.png">
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
    .keep { display: flex; align-items: center; gap: 10px; min-height: 44px; }
    .keep input { width: 22px; height: 22px; min-height: 22px; margin: 0; padding: 0; accent-color: var(--red); }
    .keep label { margin: 0; color: var(--text); }
    button { border: 0; background: var(--red); color: white; font-weight: 700; }
    .error { color: #ff8b95; margin: 16px 0 0; }
  </style>
</head>
<body>
  <main>
    <svg class="logo" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="22" fill="#E11D2E"/><rect x="30" y="22" width="36" height="25" fill="#fff"/><rect x="30" y="22" width="10" height="56" fill="#fff"/><rect x="30" y="50" width="40" height="28" fill="#fff"/><rect x="50" y="32" width="8" height="8" fill="#E11D2E"/><rect x="51" y="60" width="9" height="9" fill="#E11D2E"/></svg>
    ${body}
  </main>
  <script>
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin' });
  </script>
</body>
</html>`;

export function loginHtml(message = '') {
  const error = message ? `<p class="error" role="alert">${escapeHtml(message)}</p>` : '';
  return frame(`<h1>Command centre</h1>
    <p>Betspapa operations - Africa/Accra</p>
    ${error}
    <form method="post" action="/admin/login">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" autocomplete="username" required autofocus>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <div class="keep">
        <input id="remember" name="remember" type="checkbox" value="1" checked>
        <label for="remember">Keep me signed in</label>
      </div>
      <button type="submit">Enter</button>
    </form>`);
}

export function unavailableHtml() {
  return frame(`<h1>Command centre</h1><p>The operator page is unavailable.</p>`);
}

export function consoleHtml() {
  return consolePage;
}
