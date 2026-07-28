# 0019 — Instant edge-served loading shell

The app shows a blank white page for ~4.5s on load. That time is server-side:
the SSR document's first byte doesn't arrive until a cold Worker isolate has
initialised, and on the free plan nearly every visit is cold. Shrinking the
startup bundle 30% (specs/0018 sibling work) did not move it — the cost is
per-cold-isolate module initialisation, not parse size, and the biggest
init contributors (the chat-agent frameworks) are pinned to startup by
Cloudflare's Durable-Object export contract.

Rather than keep fighting the 4.5s, make the wait stop looking broken: paint a
branded loading animation instantly, so real content fills in when the Worker
responds.

## Why a normal spinner can't do this

The blank is _before the first byte_. A React spinner lives in the client JS,
which only loads after the HTML arrives — i.e. after the 4.5s. Even streaming
SSR can't flush a shell early, because the delay is before the request handler
produces anything (a 4-byte `get-session` call also takes ~4s).

The one thing that paints during the 0–4.5s window is a response Cloudflare
serves **without waking the Worker**. Workers Assets (`assets.directory:
../client` in the deploy config) already does this: a request matching a static
file is served from the edge in ~40ms (that is why the logo is fast while `/`
is slow — `/` matches no file and falls through to the Worker).

## The change

Serve the initial document as a **static shell** from Workers Assets, with an
inline-CSS loading animation baked into `<body>`. The edge returns it in ~40ms;
the client JS then boots TanStack Router and renders the real app in place of
the animation. `/api/*`, `/agents/*`, server functions, MCP and the Autumn
webhook continue to hit the Worker — they are just no longer on the
initial-paint path.

**Low functional risk.** `__root.tsx`'s `<body>` is already `<ClientOnly>`, so
SSR renders no page content today; a static shell loses nothing. The one real
shift: the 7 server-side `beforeLoad` redirects become client-side — but the
app already redirects client-side via `useHostedAuthRouteGuard`, so this matches
existing behaviour.

## Mechanism — resolved by a local spike, not guessed

TanStack Start exposes `shellComponent` (already set to `RootDocument`) and a
per-route `ssr` flag (`false` / `"data-only"` / `true`); it does not expose a
`spa`/`prerender` key in this version (1.168). Whether a static shell is best
produced by the framework (global `ssr: false` + shell prerender) or by a
manual Workers-Assets `index.html` + `run_worker_first` is settled in the
plan's first task, **verified in local `wrangler`** (which serves assets + the
Worker the way production does) before the animation is built or anything is
deployed. The prior bundle work looked right but didn't move production, so
nothing here is trusted until it is measured locally and then on a deploy.

The make-or-break checks for either mechanism, all runnable locally:

1. The shell is served for `/` from the asset layer, not the Worker (fast, and
   present even when the Worker path is slow).
2. The client boots from the shell and renders the app (hydration/CSR works).
3. `/api/*`, `/agents/*`, and **server-function calls** still reach the Worker
   and return data — the highest-risk item, since a misrouted server function
   would break every data fetch.

## The animation

A small branded CSS keyframe (the rocket mark + a pulse), inlined in the shell
so it needs zero JS and zero network. It shows instantly and is replaced the
moment the app mounts. No new dependency.

## Success criteria

- Cold `/` shows the animation in well under a second (target ~40–100ms first
  paint), instead of ~4.5s blank.
- App boots and renders; data, auth, chat and MCP all still work.
- Verified locally, then measured on a deploy (first-paint before/after).

## Out of scope

Reducing the 4.5s itself (paid-plan test, deferring the chat frameworks) is the
real cure and stays a separate track. This spec only removes the _blank_ — the
animation masks the wait; it does not shorten it.
