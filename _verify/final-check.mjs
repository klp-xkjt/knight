/* final-check.mjs —— 独立复核第一页的数学结论
   现在算法都在 knight-core.js 里，直接加载内核核对。 */
import fs from "node:fs";
const src = fs.readFileSync(new URL("../knight-core.js", import.meta.url), "utf8");
new Function(src)();
const K = globalThis.KnightCore;
const {nameOf, parseAlg, bfs, bfsPath, isKnight, pathOf} = K;

const START = "a1";
const [sf, sr] = parseAlg(START);
const D = bfs(sf, sr);

let maxDist = 0, farthest = [];
const buckets = {};
for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
  const d = D[f][r];
  maxDist = Math.max(maxDist, d);
  buckets[d] = (buckets[d] || 0) + 1;
}
for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) if (D[f][r] === maxDist) farthest.push(nameOf(f, r));
farthest.sort();

console.log("Q1 最难到达的格子:", farthest.join(","), " 步数:", maxDist);
console.log("   最短路径:", pathOf(sf, sr, ...parseAlg(farthest[0])).map(p => nameOf(...p)).join(" -> "),
            "(" + D[parseAlg(farthest[0])[0]][parseAlg(farthest[0])[1]] + " 步)");
console.log("   直方图:", JSON.stringify(buckets));
console.log("   d5 =", D[3][4], " e4 =", D[4][3], " a8 =", D[0][7], " h1 =", D[7][0], " h8 =", D[7][7]);

const closed = K.closedKnightTour(sf, sr);
const vt = closed.tour ? K.verifyTour(closed.tour, sf, sr) : {ok: false};
console.log("Q2 跳遍全盘: 63 步 | 闭合:", !!closed.tour, "| 搜索节点:", closed.nodes);
if (closed.tour) {
  const [ef, er] = closed.tour[63];
  console.log("   唯一访问 64 格:", vt.unique, "| 每步合法:", vt.legal,
              "| 第 64 跳回到 a1:", isKnight(ef, er, sf, sr), "| 终点:", nameOf(ef, er));
  console.log("   序列:", closed.tour.map(p => nameOf(...p)).join(" "));
}
const open = K.warnsdorffTour(sf, sr);
console.log("开放巡游:", open ? (open.length - 1) + " 步，终点 " + nameOf(...open[63]) : "失败");
