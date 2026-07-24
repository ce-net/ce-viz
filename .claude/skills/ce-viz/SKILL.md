---
name: ce-viz
description: The reusable <ce-mesh-viz> live mesh-traffic web component + demo. Read before embedding it in an app or editing this repo.
---
# ce-viz
One custom element (src/viz.ts, shadow-DOM, framework-free) that renders a node's real
/mesh/messages/stream: topics orbit, messages pulse (rpc solid / event hollow — kind is
inferred from the "/ev/" topic convention of @ce-net/iface). Embed: npm github: dep + side-
effect import + <ce-mesh-viz api=...>; the host supplies node access (same-origin proxy),
the component adds no authority. Keep it ZERO-integration: never require apps to emit
special telemetry; new visuals must derive from what the node already exposes. Bundle stays
small (esbuild); no frameworks, no runtime deps. Demo: npm run dev (port 5180).
