/* 对全部 64 个起点：验证 ① 最远距离 ② 开放巡游 ③ 闭合巡游 是否存在且合法 */
import fs from "node:fs";
const src = fs.readFileSync(new URL("../knight-core.js", import.meta.url), "utf8");
new Function(src)();
const K = globalThis.KnightCore;

let closedFail = [], openFail = [], maxStat = {};
const t0 = Date.now();
for (let r = 0; r < 8; r++) {
  for (let f = 0; f < 8; f++) {
    const alg = K.nameOf(f, r);
    const d = K.bfs(f, r);
    let mx = 0;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) mx = Math.max(mx, d[i][j]);
    maxStat[mx] = (maxStat[mx] || 0) + 1;

    const op = K.warnsdorffTour(f, r);
    if (!K.verifyTour(op, f, r).ok) openFail.push(alg);

    const cl = K.closedKnightTour(f, r);
    const vc = cl.tour ? K.verifyTour(cl.tour, f, r) : {ok: false};
    if (!(vc.ok && vc.closed)) closedFail.push(alg + (cl.tour ? "(不闭合)" : "(未找到)"));
  }
}
console.log("耗时:", ((Date.now() - t0) / 1000).toFixed(1) + "s");
console.log("每个起点“到最远格”的步数分布:", JSON.stringify(maxStat));
console.log("开放巡游失败:", openFail.length ? openFail.join(",") : "无");
console.log("闭合巡游失败:", closedFail.length ? closedFail.join(",") : "无（64 个起点全部存在闭合巡游）");

// 抽查几个起点的最远格
for (const a of ["a1", "d4", "h8", "a4", "e5"]) {
  const [f, r] = K.parseAlg(a);
  const d = K.bfs(f, r);
  let mx = 0, far = [];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) mx = Math.max(mx, d[i][j]);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (d[i][j] === mx) far.push(K.nameOf(i, j));
  console.log(`  起点 ${a}: 最远 ${mx} 步 → ${far.join(",")}`);
}
