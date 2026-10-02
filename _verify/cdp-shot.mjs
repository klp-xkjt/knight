/* cdp-shot.mjs —— 用 CDP 模拟手机视口并截图（真机尺寸的整页截图）
   用法：node _verify/cdp-shot.mjs <页面> <宽> <高> <输出png> [deviceScaleFactor]
   例：  node _verify/cdp-shot.mjs index.html 390 844 mobile-p1.png 2        */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const page = process.argv[2] || "index.html";
const width = Number(process.argv[3] || 390);
const height = Number(process.argv[4] || 844);
const outFile = process.argv[5] || "shot.png";
const dsf = Number(process.argv[6] || 2);
const port = 9600 + (process.pid % 300);
const profile = path.join(os.tmpdir(), "cdps-" + randomBytes(4).toString("hex"));
const url = "file:///" + path.resolve(new URL("../", import.meta.url).pathname.replace(/^\//, ""), page).replace(/\\/g, "/");

const sleep = ms => new Promise(r => setTimeout(r, ms));
const getJson = async p => (await fetch(`http://127.0.0.1:${port}${p}`)).json();
async function waitDevTools(t = 15000){
  const t0 = Date.now();
  while(Date.now() - t0 < t){ try { return await getJson("/json/version"); } catch { await sleep(150); } }
  throw new Error("DevTools 未就绪");
}

/* 与 cdp-measure.mjs 相同的极简 WebSocket 客户端 */
function connectWs(wsUrl){
  const u = new URL(wsUrl);
  return new Promise((resolve, reject) => {
    const key = randomBytes(16).toString("base64");
    const sock = net.connect(Number(u.port), u.hostname, () => {
      sock.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\n` +
        `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    sock.on("error", reject);
    let buf = Buffer.alloc(0), handshaken = false;
    const handlers = new Set();
    sock.on("data", chunk => {
      buf = Buffer.concat([buf, chunk]);
      if(!handshaken){
        const i = buf.indexOf("\r\n\r\n");
        if(i < 0) return;
        handshaken = true;
        buf = buf.slice(i + 4);
        resolve(api);
      }
      while(buf.length >= 2){
        const op = buf[0] & 0x0f;
        let len = buf[1] & 0x7f, off = 2;
        if(len === 126){ if(buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
        else if(len === 127){ if(buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if(buf.length < off + len) break;
        const payload = buf.slice(off, off + len);
        buf = buf.slice(off + len);
        if(op === 0x8){ sock.end(); return; }
        if(op === 0x1) handlers.forEach(h => h(JSON.parse(payload.toString("utf8"))));
      }
    });
    let id = 0;
    const pending = new Map();
    const api = {
      send(method, params){
        const mid = ++id;
        const data = Buffer.from(JSON.stringify({ id: mid, method, params: params || {} }), "utf8");
        const mask = randomBytes(4);
        let header;
        if(data.length < 126) header = Buffer.from([0x81, 0x80 | data.length]);
        else if(data.length < 65536){ header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(data.length, 2); }
        else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(data.length), 2); }
        const masked = Buffer.alloc(data.length);
        for(let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];
        sock.write(Buffer.concat([header, mask, masked]));
        return new Promise((res, rej) => pending.set(mid, { res, rej }));
      },
      close(){ try { sock.end(); } catch {} }
    };
    handlers.add(msg => {
      if(msg.id && pending.has(msg.id)){
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      }
    });
  });
}

let chrome = null;
try {
  chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
    "--remote-debugging-port=" + port, "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore" });
  await waitDevTools();
  const targets = await getJson("/json/list");
  const t = targets.find(x => x.type === "page") || targets[0];
  const ws = await connectWs(t.webSocketDebuggerUrl);

  await ws.send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: dsf, mobile: true,
    screenOrientation: { type: "portraitPrimary", angle: 0 }
  });
  await ws.send("Page.enable");
  await ws.send("Page.navigate", { url });
  await sleep(2800);

  /* 整页截图：先量文档高度，再按该高度抓图 */
  const m = await ws.send("Runtime.evaluate", {
    expression: "Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)",
    returnByValue: true
  });
  const full = Math.min(Math.ceil(m.result.value) || height, 12000);
  await ws.send("Emulation.setDeviceMetricsOverride", {
    width, height: full, deviceScaleFactor: dsf, mobile: true,
    screenOrientation: { type: "portraitPrimary", angle: 0 }
  });
  await sleep(600);
  const shot = await ws.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  fs.writeFileSync(outFile, Buffer.from(shot.data, "base64"));
  console.log(`已保存 ${outFile}（视口 ${width}x${height}，整页高 ${full}，DPR ${dsf}）`);
  ws.close();
} catch (e) {
  console.error("截图失败:", e.message);
  process.exitCode = 1;
} finally {
  if (chrome) chrome.kill();
  setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }, 300);
}
