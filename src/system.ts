/**
 * <ce-system-map> — a data-driven, self-explaining architecture graph.
 *
 * Feed it a SystemSpec (JSON via `src` attribute or an inline
 * <script type="application/json"> child) and it renders an interactive graph: typed nodes
 * (service / frontend / contract / sdk / substrate / peer), labeled edges, a legend, a
 * click-for-detail panel, and named FLOWS — step-through animated walkthroughs with
 * captions, so a viewer can watch "a typed call" travel the system.
 *
 * It renders WHATEVER spec it is given — this is the modular piece a fleet/agent-work
 * monitor can feed one spec per workstream. (Nesting/recursion: a node may carry a `map`
 * URL to another spec; rendering that drill-down is deliberately left to the host app.)
 */

export interface SpecNode {
  id: string;
  label: string;
  kind: "service" | "frontend" | "contract" | "sdk" | "substrate" | "peer";
  /** 0-100 layout coordinates (viewBox-relative). */
  x: number;
  y: number;
  detail?: string;
  repo?: string;
  /** Optional pointer to a nested SystemSpec (drill-down is the HOST app's job). */
  map?: string;
}

export interface SpecEdge {
  id?: string;
  from: string;
  to: string;
  kind: "call" | "event" | "contract" | "embed";
  label?: string;
}

export interface FlowStep {
  /** Edge id (animates a dot along it) or node id (rings it). */
  at: string;
  text: string;
}

export interface SpecFlow {
  id: string;
  title: string;
  steps: FlowStep[];
}

export interface SystemSpec {
  title: string;
  subtitle?: string;
  nodes: SpecNode[];
  edges: SpecEdge[];
  flows?: SpecFlow[];
}

const W = 1000;
const H = 560;
const KIND_SHAPE: Record<SpecNode["kind"], { rx: number; dash?: string }> = {
  service: { rx: 10 },
  frontend: { rx: 26 },
  contract: { rx: 4 },
  sdk: { rx: 16 },
  substrate: { rx: 8 },
  peer: { rx: 26, dash: "4 3" },
};

export class CeSystemMap extends HTMLElement {
  private spec: SystemSpec | null = null;
  private flow: SpecFlow | null = null;
  private step = -1;
  private playTimer = 0;
  private root!: ShadowRoot;

  async connectedCallback(): Promise<void> {
    this.root = this.attachShadow({ mode: "open" });
    const src = this.getAttribute("src");
    const inline = this.querySelector('script[type="application/json"]');
    try {
      this.spec = src
        ? ((await (await fetch(src)).json()) as SystemSpec)
        : (JSON.parse(inline?.textContent ?? "null") as SystemSpec);
    } catch {
      this.spec = null;
    }
    if (!this.spec) {
      this.root.innerHTML = `<p style="opacity:.6">ce-system-map: no spec (set src= or an inline JSON script)</p>`;
      return;
    }
    this.render();
  }

  disconnectedCallback(): void {
    clearInterval(this.playTimer);
  }

  private n(id: string): SpecNode | undefined {
    return this.spec!.nodes.find((n) => n.id === id);
  }

  private edgeId(e: SpecEdge): string {
    return e.id ?? `${e.from}->${e.to}`;
  }

  private render(): void {
    const s = this.spec!;
    const flows = s.flows ?? [];
    this.root.innerHTML = `
      <style>
        :host { display: block; font-family: system-ui, sans-serif; }
        .wrap { border: 1px solid color-mix(in srgb, currentColor 15%, transparent); border-radius: 12px; padding: 0.8rem; }
        header { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
        h3 { margin: 0; } .sub { opacity: 0.65; font-size: 0.85em; }
        svg { width: 100%; height: auto; display: block; }
        .node rect { fill: color-mix(in srgb, currentColor 6%, transparent); stroke: currentColor; stroke-width: 1.2; cursor: pointer; }
        .node.contract rect { fill: color-mix(in srgb, #ffb84d 18%, transparent); stroke: #b97f1f; }
        .node.substrate rect { fill: color-mix(in srgb, #4da3ff 12%, transparent); stroke: #2f6fb4; }
        .node.frontend rect { fill: color-mix(in srgb, #6fd08c 14%, transparent); stroke: #3d8f57; }
        .node.sdk rect { fill: color-mix(in srgb, currentColor 12%, transparent); }
        .node text { fill: currentColor; font-size: 13px; pointer-events: none; }
        .node .kind { font-size: 9.5px; opacity: 0.55; text-transform: uppercase; letter-spacing: 0.06em; }
        .edge { stroke: color-mix(in srgb, currentColor 35%, transparent); stroke-width: 1.4; fill: none; }
        .edge.event { stroke-dasharray: 5 4; }
        .edge.contract { stroke: #b97f1f; stroke-dasharray: 2 3; }
        .edge.embed { stroke: #3d8f57; }
        .elabel { font-size: 10px; fill: currentColor; opacity: 0.6; }
        .dim { opacity: 0.18; transition: opacity 0.3s; }
        .hot { opacity: 1; }
        .hot-edge { stroke: #e5484d; stroke-width: 2.4; }
        .ring { fill: none; stroke: #e5484d; stroke-width: 2.5; }
        .runner { fill: #e5484d; }
        .caption { min-height: 2.6em; padding: 0.5rem 0.2rem 0; font-size: 0.95em; }
        .caption b { color: #e5484d; }
        nav { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; }
        button { font: inherit; font-size: 0.8em; padding: 0.25rem 0.7rem; border-radius: 999px; border: 1px solid color-mix(in srgb, currentColor 30%, transparent); background: none; color: inherit; cursor: pointer; }
        button.active { background: #e5484d; border-color: #e5484d; color: white; }
        .detail { font-size: 0.85em; opacity: 0.85; padding: 0.4rem 0.2rem 0; }
        .detail a { color: inherit; }
        .legend { display: flex; gap: 1rem; font-size: 0.75em; opacity: 0.6; padding-top: 0.4rem; flex-wrap: wrap; }
      </style>
      <div class="wrap">
        <header>
          <div><h3>${esc(s.title)}</h3><span class="sub">${esc(s.subtitle ?? "")}</span></div>
          <nav>
            ${flows.map((f) => `<button data-flow="${esc(f.id)}">${esc(f.title)}</button>`).join("")}
            ${flows.length ? `<button data-step>step</button><button data-play>play</button>` : ""}
          </nav>
        </header>
        <svg viewBox="0 0 ${W} ${H}">${this.svgBody()}</svg>
        <div class="caption"></div>
        <div class="detail">click a box for details — <b>flows above animate how it works</b></div>
        <div class="legend">
          <span>rounded green = frontend</span><span>square = service</span>
          <span>amber = typed contract</span><span>blue = substrate</span>
          <span>dashed outline = any peer (incl. AI)</span><span>dashed edge = typed event</span>
        </div>
      </div>`;
    this.root.querySelectorAll<HTMLButtonElement>("button[data-flow]").forEach((b) =>
      b.addEventListener("click", () => this.selectFlow(b.dataset.flow!)),
    );
    this.root.querySelector("[data-step]")?.addEventListener("click", () => this.advance());
    this.root.querySelector("[data-play]")?.addEventListener("click", () => this.play());
    this.root.querySelectorAll<SVGGElement>("g.node").forEach((g) =>
      g.addEventListener("click", () => this.showDetail(g.dataset.id!)),
    );
  }

  private svgBody(): string {
    const s = this.spec!;
    const parts: string[] = [];
    for (const e of s.edges) {
      const a = this.n(e.from);
      const b = this.n(e.to);
      if (!a || !b) continue;
      const [x1, y1, x2, y2] = seg(a, b);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      parts.push(
        `<g class="edgeg" data-id="${esc(this.edgeId(e))}">` +
          `<path class="edge ${e.kind}" d="M ${x1} ${y1} L ${x2} ${y2}" marker-end="url(#arr)"/>` +
          (e.label ? `<text class="elabel" x="${mx}" y="${my - 6}" text-anchor="middle">${esc(e.label)}</text>` : "") +
          `</g>`,
      );
    }
    for (const n of s.nodes) {
      const { x, y, w, h } = box(n);
      const shape = KIND_SHAPE[n.kind];
      parts.push(
        `<g class="node ${n.kind}" data-id="${esc(n.id)}">` +
          `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${shape.rx}"${shape.dash ? ` stroke-dasharray="${shape.dash}"` : ""}/>` +
          `<text x="${x + w / 2}" y="${y + h / 2 + 1}" text-anchor="middle">${esc(n.label)}</text>` +
          `<text class="kind" x="${x + w / 2}" y="${y + h - 7}" text-anchor="middle">${esc(n.kind)}</text>` +
          `</g>`,
      );
    }
    return `<defs><marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="color-mix(in srgb, currentColor 45%, transparent)"/></marker></defs>${parts.join("")}`;
  }

  private selectFlow(id: string): void {
    clearInterval(this.playTimer);
    this.flow = (this.spec!.flows ?? []).find((f) => f.id === id) ?? null;
    this.step = -1;
    this.root.querySelectorAll("button[data-flow]").forEach((b) =>
      b.classList.toggle("active", (b as HTMLElement).dataset.flow === id),
    );
    this.advance();
  }

  private play(): void {
    if (!this.flow) this.selectFlow(this.spec!.flows?.[0]?.id ?? "");
    clearInterval(this.playTimer);
    this.playTimer = window.setInterval(() => {
      this.advance();
      if (this.flow && this.step === this.flow.steps.length - 1) clearInterval(this.playTimer);
    }, 1800);
  }

  private advance(): void {
    if (!this.flow) return;
    this.step = (this.step + 1) % this.flow.steps.length;
    const st = this.flow.steps[this.step]!;
    const caption = this.root.querySelector(".caption")!;
    caption.innerHTML = `<b>${this.step + 1}/${this.flow.steps.length}</b> ${esc(st.text)}`;
    // Dim everything, then light the active element (and keep prior steps half-lit).
    const active = new Set(this.flow.steps.slice(0, this.step + 1).map((x) => x.at));
    this.root.querySelectorAll<SVGGElement>("g.node, g.edgeg").forEach((g) => {
      g.classList.toggle("dim", !active.has(g.dataset.id!));
      g.classList.toggle("hot", g.dataset.id === st.at);
    });
    this.root.querySelectorAll(".hot-edge").forEach((p) => p.classList.remove("hot-edge"));
    this.root.querySelectorAll(".ring, .runner").forEach((el) => el.remove());
    const g = this.root.querySelector<SVGGElement>(`g[data-id="${cssEsc(st.at)}"]`);
    if (!g) return;
    const path = g.querySelector<SVGPathElement>("path.edge");
    const svg = this.root.querySelector("svg")!;
    if (path) {
      path.classList.add("hot-edge");
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("class", "runner");
      dot.setAttribute("r", "6");
      svg.append(dot);
      const t0 = performance.now();
      const run = (t: number) => {
        const k = Math.min(1, (t - t0) / 1200);
        const p = path.getPointAtLength(k * path.getTotalLength());
        dot.setAttribute("cx", String(p.x));
        dot.setAttribute("cy", String(p.y));
        if (k < 1 && dot.isConnected) requestAnimationFrame(run);
      };
      requestAnimationFrame(run);
    } else {
      const rect = g.querySelector("rect")!;
      const ring = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      for (const a of ["x", "y", "width", "height", "rx"]) ring.setAttribute(a, rect.getAttribute(a)!);
      ring.setAttribute("class", "ring");
      svg.append(ring);
    }
  }

  private showDetail(id: string): void {
    const n = this.n(id);
    if (!n) return;
    const d = this.root.querySelector(".detail")!;
    d.innerHTML = `<b>${esc(n.label)}</b> (${n.kind}) — ${esc(n.detail ?? "")}${
      n.repo ? ` <a href="https://github.com/${esc(n.repo)}" target="_blank">${esc(n.repo)}</a>` : ""
    }`;
  }
}

function box(n: SpecNode): { x: number; y: number; w: number; h: number } {
  const w = Math.max(120, n.label.length * 8 + 30);
  const h = 52;
  return { x: (n.x / 100) * W - w / 2, y: (n.y / 100) * H - h / 2, w, h };
}

/** Edge endpoints clipped to node box borders so arrows land on the boxes. */
function seg(a: SpecNode, b: SpecNode): [number, number, number, number] {
  const A = box(a);
  const B = box(b);
  const ax = A.x + A.w / 2, ay = A.y + A.h / 2;
  const bx = B.x + B.w / 2, by = B.y + B.h / 2;
  const clip = (cx: number, cy: number, w: number, h: number, tx: number, ty: number) => {
    const dx = tx - cx, dy = ty - cy;
    const k = Math.min(
      Math.abs(dx) > 0.01 ? w / 2 / Math.abs(dx) : Infinity,
      Math.abs(dy) > 0.01 ? h / 2 / Math.abs(dy) : Infinity,
    );
    return [cx + dx * Math.min(1, k), cy + dy * Math.min(1, k)] as const;
  };
  const [x1, y1] = clip(ax, ay, A.w + 8, A.h + 8, bx, by);
  const [x2, y2] = clip(bx, by, B.w + 8, B.h + 8, ax, ay);
  return [x1, y1, x2, y2];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

function cssEsc(s: string): string {
  return s.replace(/["\\]/g, "\\$&");
}

if (!customElements.get("ce-system-map")) customElements.define("ce-system-map", CeSystemMap);
