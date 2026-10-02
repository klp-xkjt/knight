/* 统计每个起点的“离心率”（到最远格的步数），以及对称轨道 */
import fs from "node:fs";
const src = fs.readFileSync(new URL("../knight-core.js", import.meta.url), "utf8");
new Function(src)();
const K = globalThis.KnightCore;

const ecc = {};
const byEcc = {};
for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
  const d = K.bfs(f, r);
  let mx = 0;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) mx = Math.max(mx, d[i][j]);
  ecc[K.nameOf(f, r)] = mx;
  (byEcc[mx] ||= []).push(K.nameOf(f, r));
}
console.log("离心率分布（起点 → 到最远格的步数）：");
for (const k of Object.keys(byEcc).sort()) {
  console.log(`  ${k} 步: ${byEcc[k].length} 格  ${byEcc[k].join(" ")}`);
}

/* 用棋盘对称群（8 个元素）把 64 格分成轨道 */
const sym = [
  ([f,r]) => [f, r],            // 恒等
  ([f,r]) => [7-f, r],          // 左右镜像
  ([f,r]) => [f, 7-r],          // 上下镜像
  ([f,r]) => [7-f, 7-r],        // 180°
  ([f,r]) => [r, f],            // 主对角
  ([f,r]) => [7-r, 7-f],        // 副对角
  ([f,r]) => [r, 7-f],          // 旋转 90°
  ([f,r]) => [7-r, f],          // 旋转 270°
];
const seen = new Set(), orbits = [];
for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
  const a = K.nameOf(f, r);
  if (seen.has(a)) continue;
  const orb = new Set();
  for (const s of sym) { const [nf, nr] = s([f, r]); orb.add(K.nameOf(nf, nr)); }
  orb.forEach(x => seen.add(x));
  orbits.push([...orb]);
}
console.log(`\n对称轨道数: ${orbits.length}（离心率在轨道内恒定）`);
for (const o of orbits.sort((a,b) => ecc[a[0]] - ecc[b[0]] || a.length - b.length)) {
  console.log(`  离心率 ${ecc[o[0]]}: ${o.length} 格  ${o.join(" ")}`);
}
