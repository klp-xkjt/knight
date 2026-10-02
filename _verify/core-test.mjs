import fs from "node:fs";
const src = fs.readFileSync(new URL("../knight-core.js", import.meta.url), "utf8");
new Function(src)();                       // 挂到 globalThis
const K = globalThis.KnightCore;
const {nameOf, pathOf} = K;

const A = "a1", B = "h8";
const [af, ar] = K.parseAlg(A), [bf, br] = K.parseAlg(B);

console.log("=== 两马起点 ===", A, B, "| 颜色:", K.isDark(af,ar) ? "深" : "浅", K.isDark(bf,br) ? "深" : "浅");

for (const pattern of ["direct", "common", "guard"]) {
  const R = K.mutualProtection(af, ar, bf, br, pattern, {maxRound: 6});
  console.log(`\n=== ${pattern}：${K.PATTERN_LABEL[pattern]} ===`);
  console.log("候选数:", R.candidates.length);
  if (!R.best) { console.log("  无解"); continue; }
  const b = R.best;
  console.log("  最优: 总步数", b.total, "| 轮数", b.rounds, "| 马1", b.m1, "步 →", nameOf(...b.q1),
              "| 马2", b.m2, "步 →", nameOf(...b.q2), "|", b.note);
  console.log("  马1路径:", b.p1.map(p => nameOf(...p)).join(" → "));
  console.log("  马2路径:", b.p2.map(p => nameOf(...p)).join(" → "));
  // 按总步数分布看看
  const byTotal = {};
  for (const c of R.candidates) byTotal[c.total] = (byTotal[c.total] || 0) + 1;
  console.log("  总步数分布:", JSON.stringify(byTotal));
  // 检查最优解是否真的满足定义
  const [q1f,q1r] = b.q1, [q2f,q2r] = b.q2;
  if (pattern === "direct") console.log("  校验互相攻击:", K.isKnight(q1f,q1r,q2f,q2r));
  if (pattern === "common") {
    const s = K.neighbors(q1f,q1r).filter(([f,r]) => K.isKnight(f,r,q2f,q2r));
    console.log("  校验共同保护点:", s.map(n => nameOf(...n)).join(","));
  }
  if (pattern === "guard") console.log("  校验 A 被 B 攻击:", K.isKnight(q1f,q1r,q2f,q2r));
}

// 一回合（1 轮 = 两马各走一步）就能互保的可能：两马各 1 步的落点两两判定
console.log("\n=== 只走 1 轮的可能（各 1 步）===");
const n1 = K.neighbors(af,ar), n2 = K.neighbors(bf,br);
let found1 = [];
for (const p of n1) for (const q of n2) {
  if (p[0]===q[0] && p[1]===q[1]) continue;
  if (K.isKnight(p[0],p[1],q[0],q[1])) found1.push(["direct", nameOf(...p), nameOf(...q)].join(" "));
  const shared = K.neighbors(p[0],p[1]).filter(([f,r]) => K.isKnight(f,r,q[0],q[1]));
  if (shared.length) found1.push(["common@" + shared.map(s=>nameOf(...s)).join("/"), nameOf(...p), nameOf(...q)].join(" "));
  if (K.isKnight(p[0],p[1],q[0],q[1])) found1.push(["guard", nameOf(...p), nameOf(...q)].join(" "));
}
console.log("1 轮内互保的方案数:", found1.length, found1.slice(0,6));

// 顺带：a1 → 任意格的最远距离，以及 h8 的最远距离
const d1 = K.bfs(af,ar), d2 = K.bfs(bf,br);
const stat = d => { const b={}; for(let f=0;f<8;f++)for(let r=0;r<8;r++) b[d[f][r]]=(b[d[f][r]]||0)+1; return b; };
console.log("\na1 的步数分布:", JSON.stringify(stat(d1)));
console.log("h8 的步数分布:", JSON.stringify(stat(d2)));
console.log("a1→h8 最短:", pathOf(af,ar,bf,br).map(p=>nameOf(...p)).join(" → "));
