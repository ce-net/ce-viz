/**
 * <ce-mesh-viz> — a reusable, zero-integration visualization of live mesh traffic.
 *
 * Point it at a node API (same-origin proxy or the node itself) and it renders what is
 * actually happening: the local node in the center, every topic it sees as an orbiting
 * service dot, and each message as a pulse — solid for typed requests/replies, hollow for
 * events. No instrumentation: it reads GET /status once and the /mesh/messages/stream SSE.
 *
 *   <script type="module" src=".../viz.bundle.js"></script>
 *   <ce-mesh-viz api="/api" caption="loppis on the mesh"></ce-mesh-viz>
 *
 * Attributes: api (base URL, default "/api"), caption, max-topics (default 12).
 * Framework-free custom element; light/dark aware; safe to embed in any page.
 */

interface WireMessage {
  from: string;
  topic: string;
  payload_hex?: string;
  reply_token?: string | null;
}

interface TopicNode {
  topic: string;
  label: string;
  kind: "rpc" | "event";
  count: number;
  angle: number;
  lastAt: number;
}

interface Pulse {
  topic: string;
  kind: "rpc" | "event";
  born: number;
}

const W = 560;
const H = 340;
const CX = W / 2;
const CY = H / 2;
const R = 118;

export class CeMeshViz extends HTMLElement {
  private topics = new Map<string, TopicNode>();
  private pulses: Pulse[] = [];
  private selfId = "";
  private es: EventSource | null = null;
  private raf = 0;
  private svg!: SVGSVGElement;
  private live!: HTMLElement;

  connectedCallback(): void {
    const caption = this.getAttribute("caption") ?? "live mesh traffic";
    this.attachShadow({ mode: "open" }).innerHTML = `
      <style>
        :host { display: block; font-family: system-ui, sans-serif; }
        figure { margin: 0; }
        svg { width: 100%; height: auto; display: block; }
        figcaption { font-size: 0.8em; opacity: 0.7; display: flex; justify-content: space-between; padding: 0.3em 0.2em; }
        .self { fill: color-mix(in srgb, currentColor 12%, transparent); stroke: currentColor; }
        text { fill: currentColor; font-size: 10px; }
        .t-rpc circle { fill: currentColor; }
        .t-event circle { fill: none; stroke: currentColor; stroke-width: 1.5; }
        .edge { stroke: color-mix(in srgb, currentColor 22%, transparent); stroke-width: 1; }
        .pulse-rpc { fill: #4da3ff; }
        .pulse-event { fill: none; stroke: #ffb84d; stroke-width: 2; }
        .count { opacity: 0.6; font-size: 9px; }
      </style>
      <figure>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${caption}"></svg>
        <figcaption><span>${caption}</span><span class="live">connecting…</span></figcaption>
      </figure>`;
    this.svg = this.shadowRoot!.querySelector("svg")!;
    this.live = this.shadowRoot!.querySelector(".live")!;
    void this.start();
  }

  disconnectedCallback(): void {
    this.es?.close();
    cancelAnimationFrame(this.raf);
  }

  private api(): string {
    return this.getAttribute("api") ?? "/api";
  }

  private async start(): Promise<void> {
    try {
      const r = await fetch(`${this.api()}/status`);
      this.selfId = ((await r.json()) as { node_id?: string }).node_id ?? "";
    } catch {
      /* status is cosmetic; the stream is the show */
    }
    this.subscribe();
    const tick = () => {
      this.render();
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  private subscribe(): void {
    this.es?.close();
    const es = new EventSource(`${this.api()}/mesh/messages/stream`);
    this.es = es;
    es.onopen = () => (this.live.textContent = `node ${this.selfId.slice(0, 8)}… live`);
    es.onerror = () => {
      this.live.textContent = "reconnecting…";
      es.close();
      setTimeout(() => this.subscribe(), 1500);
    };
    es.onmessage = (ev) => {
      try {
        this.observe(JSON.parse(ev.data as string) as WireMessage);
      } catch {
        /* ignore malformed frames */
      }
    };
  }

  private observe(m: WireMessage): void {
    if (!m.topic) return;
    const kind: TopicNode["kind"] = m.topic.includes("/ev/") ? "event" : "rpc";
    let node = this.topics.get(m.topic);
    if (!node) {
      const max = Number(this.getAttribute("max-topics") ?? 12);
      if (this.topics.size >= max) {
        // Evict the stalest topic so long-running dashboards don't clutter.
        const stalest = [...this.topics.values()].sort((a, b) => a.lastAt - b.lastAt)[0];
        if (stalest) this.topics.delete(stalest.topic);
      }
      node = { topic: m.topic, label: shortTopic(m.topic), kind, count: 0, angle: 0, lastAt: 0 };
      this.topics.set(m.topic, node);
      this.layout();
    }
    node.count += 1;
    node.lastAt = performance.now();
    this.pulses.push({ topic: m.topic, kind, born: performance.now() });
    if (this.pulses.length > 60) this.pulses.splice(0, this.pulses.length - 60);
  }

  private layout(): void {
    const all = [...this.topics.values()];
    all.forEach((n, i) => (n.angle = (i / all.length) * Math.PI * 2 - Math.PI / 2));
  }

  private render(): void {
    const now = performance.now();
    this.pulses = this.pulses.filter((p) => now - p.born < 900);
    const parts: string[] = [];
    for (const n of this.topics.values()) {
      const [x, y] = pos(n.angle);
      parts.push(`<line class="edge" x1="${CX}" y1="${CY}" x2="${x}" y2="${y}"/>`);
    }
    for (const p of this.pulses) {
      const n = this.topics.get(p.topic);
      if (!n) continue;
      const t = (now - p.born) / 900;
      const [tx, ty] = pos(n.angle);
      const x = tx + (CX - tx) * t; // inbound: topic -> node
      const y = ty + (CY - ty) * t;
      const r = 4 - 2 * t;
      parts.push(`<circle class="pulse-${p.kind}" cx="${x}" cy="${y}" r="${r}"/>`);
    }
    for (const n of this.topics.values()) {
      const [x, y] = pos(n.angle);
      const glow = Math.max(0, 1 - (now - n.lastAt) / 600);
      parts.push(
        `<g class="t-${n.kind}"><circle cx="${x}" cy="${y}" r="${5 + glow * 3}"/>` +
          `<text x="${x}" y="${y + (y > CY ? 20 : -12)}" text-anchor="middle">${esc(n.label)}</text>` +
          `<text class="count" x="${x}" y="${y + (y > CY ? 32 : -24)}" text-anchor="middle">${n.count}</text></g>`,
      );
    }
    parts.push(
      `<circle class="self" cx="${CX}" cy="${CY}" r="22"/>` +
        `<text x="${CX}" y="${CY + 3}" text-anchor="middle">${this.selfId ? esc(this.selfId.slice(0, 6)) : "node"}</text>`,
    );
    this.svg.innerHTML = parts.join("");
  }
}

function pos(angle: number): [number, number] {
  return [CX + Math.cos(angle) * R, CY + Math.sin(angle) * R * 0.78];
}

function shortTopic(t: string): string {
  return t.length > 26 ? `${t.slice(0, 24)}…` : t;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

if (!customElements.get("ce-mesh-viz")) customElements.define("ce-mesh-viz", CeMeshViz);
