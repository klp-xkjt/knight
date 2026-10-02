/* cdp-measure.mjs —— 用 Chrome DevTools Protocol 真正模拟手机视口并量布局
   原理：Emulation.setDeviceMetricsOverride 会把布局视口精确设成指定宽高
   （无头 Chrome 的窗口最小宽度是 485px，靠 --window-size / meta viewport 都绕不过去）。
   只用 Node 内置模块，无第三方依赖。

   用法：node _verify/cdp-measure.mjs <页面> <宽> [高]
   例：  node _verify/cdp-measure.mjs index.html 390 844                     */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const CHROME = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const page = process.argv[2] || "index.html";
const width = Number(process.argv[3] || 390);
const height = Number(process.argv[4] || 844);
const port = 9200 + (process.pid % 300);
const profile = path.join(os.tmpdir(), "cdp-" + randomBytes(4).toString("hex"));
const url = "file:///" + path.resolve(new URL("../", import.meta.url).pathname.replace(/^\//, ""), page).replace(/\\/g, "/");

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(pathname){
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`);
  return res.json();
}
async function waitForDevTools(timeoutMs = 15000){
  const t0 = Date.now();
  while(Date.now() - t0 < timeoutMs){
    try { return await getJson("/json/version"); } catch { await sleep(150); }
  }
  throw new Error("Chrome DevTools endpoint 未就绪");
}

/* 极简 WebSocket 客户端（文本帧足够用） */
function connectWs(wsUrl){
  const u = new URL(wsUrl);
  return new Promise((resolve, reject) => {
    const key = randomBytes(16).toString("base64");   // 握手 key 需要在回调里也能访问
    const sock = net.connect(Number(u.port), u.hostname, () => {
      sock.write(
        `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
        `Host: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    sock.on("error", reject);

    let buf = Buffer.alloc(0), handshaken = false;
    const handlers = new Set();
    const emit = msg => handlers.forEach(h => h(msg));

    sock.on("data", chunk => {
      buf = Buffer.concat([buf, chunk]);
      if(!handshaken){
        const i = buf.indexOf("\r\n\r\n");
        if(i < 0) return;
        const head = buf.slice(0, i).toString("latin1");
        if(!/101/.test(head.split("\r\n")[0])) return reject(new Error("WebSocket 握手失败: " + head.split("\r\n")[0]));
        const accept = createHash("sha1")
          .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
        if(!head.includes(accept)) return reject(new Error("WebSocket 校验失败"));
        handshaken = true;
        buf = buf.slice(i + 4);
        resolve(api);
      }
      // 解析帧
      while(buf.length >= 2){
        const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f;
        let len = buf[1] & 0x7f, off = 2;
        if(len === 126){ if(buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; }
        else if(len === 127){ if(buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if(buf.length < off + len) break;
        const payload = buf.slice(off, off + len);
        buf = buf.slice(off + len);
        if(op === 0x8){ sock.end(); return; }
        if(op === 0x1) emit(JSON.parse(payload.toString("utf8")));
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
        return new Promise((res, rej) => pending.set(mid, {res, rej}));
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

const MEASURE_JS = `
(function(){
  var de = document.documentElement, vw = de.clientWidth;
  var over = [];
  document.querySelectorAll("body *").forEach(function(el){
    var r = el.getBoundingClientRect();
    if(r.width === 0 && r.height === 0) return;
    if(el.closest && el.closest(".rank-wrap")) return;      // 允许横向滚动的内容不算溢出
    if(r.right > vw + 1 || r.left < -1){
      over.push(el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") +
        (typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\\s+/).join(".") : "") +
        "[L" + Math.round(r.left) + " R" + Math.round(r.right) + "]");
    }
  });
  var box = function(sel){ var el = document.querySelector(sel); if(!el) return "n/a";
    var r = el.getBoundingClientRect(); return Math.round(r.width*10)/10 + "x" + Math.round(r.height*10)/10; };
  var cs = getComputedStyle(de);
  return [
    "VIEWPORT=" + vw + "x" + de.clientHeight + "  DPR=" + window.devicePixelRatio,
    "DOC_SCROLL_W=" + de.scrollWidth + "  overflow-x=" + (de.scrollWidth > vw + 1 ? "YES" : "no"),
    "--cell=" + cs.getPropertyValue("--cell").trim() + "  CELL=" + box(".cell"),
    "BOARD=" + box("#board") + "  PICKER_CELL=" + box(".kc-cell"),
    "STAGE=" + (document.querySelector(".stage") ? getComputedStyle(document.querySelector(".stage")).flexDirection : "n/a") +
      "  SIDE=" + box(".side"),
    "CONTROLS_BTN=" + box(".controls button"),
    "FOOTER=" + box(".site-footer") + "  MADE_BY=" + (document.querySelector(".madeby") ? document.querySelector(".madeby").textContent.trim() : "缺失"),
    "JSERR=" + (window.__errs ? window.__errs.length : "n/a"),
    "OVERFLOW_ELEMS=" + over.length + (over.length ? " :: " + over.slice(0, 10).join(" | ") : "")
  ].join("\\n");
})()
`;

let chrome = null;
try {
  chrome = spawn(CHROME, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
    "--remote-debugging-port=" + port, "--user-data-dir=" + profile, "about:blank"
  ], { stdio: "ignore" });
  await waitForDevTools();
  const targets = await getJson("/json/list");
  const pageTarget = targets.find(t => t.type === "page") || targets[0];
  const ws = await connectWs(pageTarget.webSocketDebuggerUrl);

  await ws.send("Emulation.setDeviceMetricsOverride", {
    width, height, deviceScaleFactor: 2, mobile: true,
    screenOrientation: { type: "portraitPrimary", angle: 0 }
  });
  await ws.send("Page.enable");
  await ws.send("Page.navigate", { url });
  await sleep(2500);                                   // 等脚本跑完（含巡游搜索）
  const r = await ws.send("Runtime.evaluate", { expression: MEASURE_JS, returnByValue: true });
  console.log(r.result.value);
  ws.close();
} catch (e) {
  console.error("测量失败:", e.message);
  process.exitCode = 1;
} finally {
  if (chrome) chrome.kill();
  setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }, 300);
}
