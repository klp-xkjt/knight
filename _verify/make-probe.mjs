/* make-probe.mjs —— 为无头 Chrome --dump-dom 诊断生成副本
   注入：① window.onerror 捕获  ② 自动点击冒烟测试  ③ 布局溢出检测
   用法：node _verify/make-probe.mjs index.html [宽 高]                */
import fs from "node:fs";
import path from "node:path";

const page = process.argv[2] || "index.html";
const root = new URL("../", import.meta.url);
const src = fs.readFileSync(new URL(page, root), "utf8");

const probe = `
<script>
window.__errs = [];
window.addEventListener("error", function(e){
  window.__errs.push((e.message||"?") + " @" + (e.lineno||"?") + ":" + (e.colno||"?"));
});
</script>
`;
let out = src.replace(/<script src=/, probe + "<script src=");
if(!out.includes("__errs")) throw new Error("injection failed");

/* ---------- 布局溢出检测 ---------- */
const layout = `
(function layoutProbe(){
  var de = document.documentElement;
  var vw = de.clientWidth;
  var over = [];
  document.querySelectorAll("body *").forEach(function(el){
    var r = el.getBoundingClientRect();
    if(r.width === 0 && r.height === 0) return;
    if(r.right > vw + 1 || r.left < -1){
      over.push((el.tagName.toLowerCase()) + (el.id ? "#" + el.id : "") +
        (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\\s+/).join(".") : "") +
        " [left " + Math.round(r.left) + " right " + Math.round(r.right) + "]");
    }
  });
  var board = document.getElementById("board");
  var br = board ? board.getBoundingClientRect() : null;
  var cell = document.querySelector(".cell");
  var cr = cell ? cell.getBoundingClientRect() : null;
  var btn = document.querySelector(".controls button");
  var btr = btn ? btn.getBoundingClientRect() : null;
  var parts = [
    "VIEWPORT=" + vw + "x" + de.clientHeight,
    "DOC_SCROLL_W=" + de.scrollWidth + " (overflow-x: " + (de.scrollWidth > vw + 1 ? "YES" : "no") + ")",
    "BOARD=" + (br ? Math.round(br.width) + "x" + Math.round(br.height) + " left " + Math.round(br.left) + " right " + Math.round(br.right) : "n/a"),
    "CELL=" + (cr ? (Math.round(cr.width * 10) / 10) + "px" : "n/a"),
    "BTN_H=" + (btr ? Math.round(btr.height) + "px w " + Math.round(btr.width) : "n/a"),
    "OVERFLOW_ELEMS=" + over.length + (over.length ? " :: " + over.slice(0, 8).join(" | ") : "")
  ];
  var d = document.createElement("pre");
  d.id = "layout-log";
  d.textContent = parts.join("\\n");
  document.body.appendChild(d);
})();
`;

/* ---------- 自动点击冒烟测试 ---------- */
const smoke = `
(function smoke(){
  var log = [], errs = [];
  var $ = function(id){ return document.getElementById(id); };
  function t(label, fn){
    try {
      fn();
      var a = $("roBig") ? ($("roBig").textContent || "") : "";
      var b = $("roTitle") ? ($("roTitle").textContent || "") : "";
      log.push("OK   " + label + " | " + a + " | " + b);
    } catch(e){ errs.push("FAIL " + label + " -> " + (e && e.message)); }
  }
  if($("btnDist")){                            // 第一页
    t("dist",     function(){ $("btnDist").click(); });
    t("path",     function(){ $("btnPath").click(); });
    t("next",     function(){ $("btnNext").click(); });
    t("prev",     function(){ $("btnPrev").click(); });
    t("reset",    function(){ $("btnReset").click(); });
    t("farthest", function(){ $("btnFarthest").click(); });
    t("tour",     function(){ $("btnTour").click(); });
    t("close",    function(){ $("btnClose").click(); });
    t("tour2",    function(){ $("btnTour").click(); });
    t("cell",     function(){ document.querySelectorAll("#board .cell")[40].click(); });
    t("pickStart",function(){ document.querySelectorAll("#pickStart .kc-cell")[27].click(); });
    t("pickTarget",function(){ document.querySelectorAll("#pickTarget .kc-cell")[0].click(); });
    t("default",  function(){ $("btnDefault").click(); });
    t("dist2",    function(){ $("btnDist").click(); });
  } else if($("patDirect")){                   // 第二页
    t("pc-a",   function(){ document.querySelectorAll("#pickA .kc-cell")[0].click(); });
    t("pc-b",   function(){ document.querySelectorAll("#pickB .kc-cell")[63].click(); });
    t("direct", function(){ $("patDirect").click(); });
    t("common", function(){ $("patCommon").click(); });
    t("guard",  function(){ $("patGuard").click(); });
    t("play",   function(){ $("btnPlay").click(); });
    t("next",   function(){ $("btnNext").click(); });
    t("prev",   function(){ $("btnPrev").click(); });
    t("reset",  function(){ $("btnReset").click(); });
    t("demo",   function(){ $("btnDemo").click(); });
  }
  var d = document.createElement("pre");
  d.id = "smoke-log";
  d.textContent = "JSERR=" + window.__errs.length + "\\n" + window.__errs.join("\\n") +
    "\\nSMOKE_ERRORS=" + errs.length + "\\n" + errs.join("\\n") + "\\n--- steps ---\\n" + log.join("\\n");
  document.body.appendChild(d);
})();
`;

const last = out.lastIndexOf("</script>");
out = out.slice(0, last) + layout + smoke + out.slice(last);

const outName = path.basename(page, ".html") + ".probe.html";
fs.writeFileSync(new URL(outName, root), out, "utf8");
console.log(outName + " written, size " + out.length);
