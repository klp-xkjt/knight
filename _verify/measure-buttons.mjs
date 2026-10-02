/* 在真实手机视口下测量：选择器是否并排、控制按钮每行几个 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const width = Number(process.argv[2] || 390);
const port = 9950 + (process.pid % 40);
const profile = path.join(os.tmpdir(), "cdpq-" + randomBytes(4).toString("hex"));
const url = "file:///" + path.resolve(new URL("../", import.meta.url).pathname.replace(/^\//, ""),
  process.argv[3] || "index.html").replace(/\\/g, "/");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJson = async p => (await fetch(`http://127.0.0.1:${port}${p}`)).json();
async function ready(t = 15000){ const t0 = Date.now();
  while(Date.now() - t0 < t){ try { return await getJson("/json/version"); } catch { await sleep(150); } } throw new Error("no devtools"); }

function ws(wsUrl){
  const u = new URL(wsUrl);
  return new Promise((resolve, reject) => {
    const key = randomBytes(16).toString("base64");
    const sock = net.connect(Number(u.port), u.hostname, () => sock.write(
      `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
      `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
    sock.on("error", reject);
    let buf = Buffer.alloc(0), hs = false; const hs2 = new Set();
    sock.on("data", c => {
      buf = Buffer.concat([buf, c]);
      if(!hs){ const i = buf.indexOf("\r\n\r\n"); if(i < 0) return; hs = true; buf = buf.slice(i + 4); resolve(api); }
      while(buf.length >= 2){
        const op = buf[0] & 0x0f; let len = buf[1] & 0x7f, off = 2;
        if(len === 126){ if(buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
        else if(len === 127){ if(buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if(buf.length < off + len) break;
        const pl = buf.slice(off, off + len); buf = buf.slice(off + len);
        if(op === 0x8){ sock.end(); return; }
        if(op === 0x1) hs2.forEach(h => h(JSON.parse(pl.toString("utf8"))));
      }
    });
    let id = 0; const pending = new Map();
    const api = { send(m, p){
      const mid = ++id, data = Buffer.from(JSON.stringify({ id: mid, method: m, params: p || {} }), "utf8");
      const mask = randomBytes(4); let h;
      if(data.length < 126) h = Buffer.from([0x81, 0x80 | data.length]);
      else { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 0x80 | 126; h.writeUInt16BE(data.length, 2); }
      const mk = Buffer.alloc(data.length);
      for(let i = 0; i < data.length; i++) mk[i] = data[i] ^ mask[i % 4];
      sock.write(Buffer.concat([h, mask, mk]));
      return new Promise((res, rej) => pending.set(mid, { res, rej }));
    }, close(){ try { sock.end(); } catch {} } };
    hs2.add(m => { if(m.id && pending.has(m.id)){ const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result); } });
  });
}

let chrome = null;
try {
  chrome = spawn(CHROME, ["--headless=new","--disable-gpu","--no-sandbox","--no-first-run",
    "--remote-debugging-port=" + port, "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore" });
  await ready();
  const list = await getJson("/json/list");
  const conn = await ws((list.find(x => x.type === "page") || list[0]).webSocketDebuggerUrl);
  await conn.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 2, mobile: true,
    screenOrientation: { type: "portraitPrimary", angle: 0 } });
  await conn.send("Page.enable");
  await conn.send("Page.navigate", { url });
  await sleep(2500);
  const r = await conn.send("Runtime.evaluate", { returnByValue: true, expression: `
    (function(){
      var out = [], vw = document.documentElement.clientWidth;
      // 选择器是否并排
      var boxes = [].slice.call(document.querySelectorAll(".picker-box"));
      var ys = boxes.map(function(b){ return Math.round(b.getBoundingClientRect().top); });
      out.push("视口 " + vw + "px | 选择器 " + boxes.length + " 个 → " +
        (new Set(ys).size === 1 ? "并排（同一行）" : "上下堆叠") +
        " | 每个宽 " + boxes.map(function(b){ return Math.round(b.getBoundingClientRect().width); }).join("/"));
      // 按钮每行几个
      document.querySelectorAll(".controls").forEach(function(row, ri){
        var byRow = {};
        [].slice.call(row.querySelectorAll("button")).forEach(function(b){
          var r = b.getBoundingClientRect();
          (byRow[Math.round(r.top)] = byRow[Math.round(r.top)] || []).push(Math.round(r.width) + "x" + Math.round(r.height));
        });
        var counts = Object.keys(byRow).map(function(y){ return byRow[y].length; });
        out.push("  controls" + ri + " 每行按钮数: " + counts.join(",") + "  尺寸: " +
          byRow[Object.keys(byRow)[0]].join(" "));
      });
      out.push("  横向溢出: " + (document.documentElement.scrollWidth > vw + 1 ? "有" : "无"));
      return out.join("\\n");
    })()
  ` });
  console.log(r.result.value);
  conn.close();
} catch(e){ console.error("失败:", e.message); process.exitCode = 1; }
finally { if(chrome) chrome.kill(); setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }, 300); }
