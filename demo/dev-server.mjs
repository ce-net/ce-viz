/**
 * Localhost dev server: serves the page + bundle and PROXIES /api/* to the local ce node
 * with the operator's api.token injected server-side. Same-origin (no CORS dependency),
 * and the token never reaches the page. Dev only — the mesh-bridge/public path is the
 * production story.
 */

import { createServer, request as httpRequest } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PORT = Number(process.env.PORT ?? 5180);
const NODE = process.env.CE_API ?? "http://127.0.0.1:8844";

function token() {
  const candidates = [
    join(homedir(), "Library", "Application Support", "ce", "api.token"),
    join(homedir(), ".local", "share", "ce", "api.token"),
  ];
  for (const p of candidates) {
    try {
      return readFileSync(p, "utf8").trim();
    } catch {}
  }
  return "";
}
const TOKEN = token();
if (!TOKEN) console.warn("no api.token found — mutating node calls will 401");

const files = {
  "/": ["index.html", "text/html"],
  "/viz.bundle.js": ["../dist/viz.bundle.js", "text/javascript"],
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (url.pathname.startsWith("/api/")) {
    const target = new URL(NODE);
    const proxied = httpRequest(
      {
        host: target.hostname,
        port: target.port,
        path: url.pathname.slice(4) + url.search,
        method: req.method,
        headers: { ...req.headers, host: target.host, authorization: `Bearer ${TOKEN}` },
      },
      (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      },
    );
    proxied.on("error", (e) => {
      res.writeHead(502);
      res.end(String(e));
    });
    req.pipe(proxied);
    return;
  }
  const entry = files[url.pathname];
  if (!entry) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  try {
    const body = await readFile(new URL(entry[0], import.meta.url));
    res.writeHead(200, { "content-type": entry[1] });
    res.end(body);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
}).listen(PORT, () => console.log(`ce-viz demo server: http://localhost:${PORT} (node: ${NODE})`));
