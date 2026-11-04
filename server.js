import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(DIR, "public");

const TOKEN = process.env.ADMIN_TOKEN || "cambia-este-token";
const PORT = process.env.PORT || 3000;
const FILE = path.join(DIR, "state.json");

let S = { status: "stopped", pos: 0, t: 0, url: "", title: "", channel: "", chapters: [], v: 0 };
try { S = { ...S, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch {}
const save = () => fs.writeFile(FILE, JSON.stringify(S), () => {});

function apply(m) {
  const now = Date.now();
  const cur = S.status === "playing" ? S.pos + (now - S.t) / 1000 : S.pos;
  switch (m.action) {
    case "channel": S.channel = String(m.channel || "").replace(/\W/g, ""); break;
    case "load": S = { ...S, url: String(m.url), title: String(m.title || ""), status: "playing", pos: 0, t: now }; break;
    case "pause": if (S.status === "playing") S = { ...S, status: "paused", pos: cur, t: now }; break;
    case "resume": if (S.status === "paused") S = { ...S, status: "playing", t: now }; break;
    case "seek": S = { ...S, pos: Math.max(0, Number(m.pos) || 0), t: now }; break;
    case "stop": S = { ...S, status: "stopped", url: "", title: "", pos: 0, t: now }; break;
    case "add": S.chapters = [...S.chapters, { title: String(m.title || "Capítulo " + (S.chapters.length + 1)), url: String(m.url) }]; break;
    case "remove": S.chapters = S.chapters.filter((_, i) => i !== m.index); break;
    default: return;
  }
  S.v++;
  save();
}

const app = express();
if (!fs.existsSync(path.join(PUBLIC, "index.html")))
  console.error("AVISO: no existe " + path.join(PUBLIC, "index.html") + ". Mueve index.html, admin.html y style.css a la carpeta public.");
app.use(express.static(PUBLIC));
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

const pub = () => { const { chapters, ...rest } = S; return rest; };
function send(ws) {
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: "state", s: ws.admin ? S : pub(), now: Date.now(), viewers: wss.clients.size }));
}
const all = () => wss.clients.forEach(send);

wss.on("connection", ws => {
  ws.on("message", raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === "ping") return ws.send(JSON.stringify({ type: "pong", c: m.c, now: Date.now() }));
    if (m.type === "auth") { ws.admin = m.token === TOKEN; ws.send(JSON.stringify({ type: "auth", ok: ws.admin })); return send(ws); }
    if (m.type === "cmd" && ws.admin) { apply(m); all(); }
  });
  ws.on("close", all);
  send(ws); all();
});
setInterval(all, 5000);

server.listen(PORT, () => console.log("Radio en http://localhost:" + PORT + "  (admin: /admin.html)"));