/**
 * The first thing a visitor sees. It renders as the `<ClientOnly>` fallback in
 * the root document, so TanStack Start's SPA prerender bakes it into the static
 * `index.html` that Cloudflare's edge serves in ~40ms — the branded animation
 * paints immediately instead of the browser staring at a blank page while a
 * cold Worker isolate spends ~4.5s initialising. It is swapped for the real app
 * the instant the client mounts.
 *
 * Everything here is self-contained: inline styles plus one <style> block, no
 * hooks, no imports, no dependency on the app CSS or JS having loaded yet. The
 * theme (light/dark) is already set on <html data-theme> by the inline theme
 * script in <head> before this paints, so the colours key off that and never
 * flash the wrong background.
 */
export function LoadingShell() {
  return (
    <div
      role="status"
      aria-label="Loading FlyRocketSEO"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.25rem",
        // Fallbacks first, then the app's theme variable once its CSS lands.
        background: "var(--frs-shell-bg)",
      }}
    >
      <style>{loadingShellCss}</style>

      <div className="frs-rocket-wrap">
        {/* Rocket mark, kept simple so it renders crisply at any DPR. */}
        <svg
          width="52"
          height="52"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--frs-shell-fg)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="frs-rocket"
          aria-hidden="true"
        >
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
          <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
          <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
        </svg>
        <span className="frs-rocket-glow" aria-hidden="true" />
      </div>

      <div className="frs-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

const loadingShellCss = `
:root {
  --frs-shell-bg: #ffffff;
  --frs-shell-fg: #7c5cff;
  --frs-shell-dot: #c9bdff;
}
:root[data-theme="flyrocketseo-dark"] {
  --frs-shell-bg: #0f1117;
  --frs-shell-fg: #a996ff;
  --frs-shell-dot: #4b3f7a;
}
.frs-rocket-wrap {
  position: relative;
  display: grid;
  place-items: center;
}
.frs-rocket {
  animation: frs-rise 1.6s ease-in-out infinite;
}
.frs-rocket-glow {
  position: absolute;
  width: 84px;
  height: 84px;
  border-radius: 9999px;
  background: radial-gradient(closest-side, var(--frs-shell-fg), transparent);
  opacity: 0.14;
  animation: frs-pulse 1.6s ease-in-out infinite;
}
.frs-dots {
  display: flex;
  gap: 0.4rem;
}
.frs-dots span {
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  background: var(--frs-shell-dot);
  animation: frs-bounce 1.2s ease-in-out infinite;
}
.frs-dots span:nth-child(2) { animation-delay: 0.15s; }
.frs-dots span:nth-child(3) { animation-delay: 0.3s; }
@keyframes frs-rise {
  0%, 100% { transform: translateY(3px) rotate(-2deg); }
  50%      { transform: translateY(-3px) rotate(2deg); }
}
@keyframes frs-pulse {
  0%, 100% { opacity: 0.08; transform: scale(0.9); }
  50%      { opacity: 0.20; transform: scale(1.08); }
}
@keyframes frs-bounce {
  0%, 100% { transform: translateY(0); opacity: 0.5; }
  50%      { transform: translateY(-5px); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .frs-rocket, .frs-rocket-glow, .frs-dots span { animation: none; }
}
`;
