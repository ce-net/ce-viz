# DEPRECATED — do not use

Built 2026-07-24 in parallel-invention error: the fleet already had the visualization core —
the per-app VIZ-CELL pattern (recursive-frontend v1: <app>-viz repos with cecomponents.toml,
transmitted by ce-comp) and ce-topo (<ce-topo-map>, the aggregator map). This repo duplicated
both with different names and is retired the same day.

Use instead:
- Per-app visualization: the <app>-viz cell pattern (reference: github.com/ce-net/rdev-viz);
  the loppis stack's cell is github.com/ce-net/loppis-viz.
- Fleet-wide live map: github.com/ce-net/ce-topo.

Nothing depends on this repo (loppis-web was moved off it the same day). Safe to delete.
# ce-viz — watch the mesh work

A reusable, zero-integration visualization of live CE mesh traffic, shipped as a single web
component. Drop it into any page — an app UI, a demo, a fleet dashboard — and it shows what
is actually happening on a node: the node in the center, every topic it sees orbiting, and
each real message as a pulse (solid blue = typed request/reply, hollow amber = typed event),
with per-topic counters and activity glow.

```html
<script type="module" src=".../viz.bundle.js"></script>
<ce-mesh-viz api="/api" caption="loppis on the mesh"></ce-mesh-viz>
```

No instrumentation: it reads `GET /status` once and the node's `/mesh/messages/stream` SSE.
Any app's traffic appears the moment the app speaks. Attributes: `api` (node API base or a
same-origin proxy to it; default `/api`), `caption`, `max-topics` (default 12, stalest
evicted). Reconnects automatically; light/dark aware; shadow-DOM isolated; 5 KB bundled.

## Demo

```
npm install && npm run dev     # http://127.0.0.1:5180 (needs a local ce node)
```
The demo server proxies `/api` to the local node with the operator token injected
server-side (dev only). Run any ce app — e.g. the loppis marketplace
(github.com/ce-net/loppis-web) — and watch its typed calls and events flow.

## Embedding from another app

```
npm i github:ce-net/ce-viz
```
```ts
import "@ce-net/viz";   // registers <ce-mesh-viz>
```
The element talks to whatever `api` endpoint the HOST page provides — it inherits the host's
node access and adds no authority of its own (embedded UI never escalates).
