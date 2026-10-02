/* ============================================================================
   knight-core.js —— 马步问题共用内核（第一页 / 第二页 共用）
   纯计算 + 一个方形棋盘选择器，不依赖任何库。
   用法：<script src="knight-core.js"></script>  →  window.KnightCore
   ========================================================================== */
(function(global){
"use strict";

const N = 8;
const FILES = "abcdefgh".split("");
const OFF = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];

const inB   = (f,r) => f >= 0 && f < N && r >= 0 && r < N;
const nameOf = (f,r) => FILES[f] + (r + 1);
const parseAlg = s => {
  if(typeof s !== "string" || s.length < 2) return null;
  const f = FILES.indexOf(s[0].toLowerCase());
  const r = parseInt(s.slice(1), 10) - 1;
  return (f >= 0 && inB(f,r)) ? [f,r] : null;
};
const isKnight = (af,ar,bf,br) => {
  const df = Math.abs(af-bf), dr = Math.abs(ar-br);
  return (df === 1 && dr === 2) || (df === 2 && dr === 1);
};
/* a1 = (0,0) 记为“深色”。马每跳换色：步数奇偶 ⇔ 格子颜色 */
const isDark = (f,r) => (f + r) % 2 === 0;
const cellColor = (f,r) => isDark(f,r) ? "dark" : "light";

const ALL = [];
for(let r = 0; r < N; r++) for(let f = 0; f < N; f++) ALL.push({f, r, alg: nameOf(f,r)});

const neighbors = (f,r) => OFF
  .map(([df,dr]) => [f+df, r+dr])
  .filter(([a,b]) => inB(a,b));

/* ---------------------------------------------------------------------------
   BFS：单马从 (sf,sr) 到每一格的最短步数
   skip：可选，禁入格（用于“两匹马不能互撞”的情形）
--------------------------------------------------------------------------- */
function bfs(sf, sr, skip){
  const blocked = skip || null;
  const dist = Array.from({length:N}, () => new Array(N).fill(-1));
  dist[sf][sr] = 0;
  let frontier = [[sf,sr]];
  while(frontier.length){
    const next = [];
    for(const [f,r] of frontier){
      for(const [df,dr] of OFF){
        const nf = f + df, nr = r + dr;
        if(!inB(nf,nr) || dist[nf][nr] !== -1) continue;
        if(blocked && blocked[0] === nf && blocked[1] === nr) continue;
        dist[nf][nr] = dist[f][r] + 1;
        next.push([nf,nr]);
      }
    }
    frontier = next;
  }
  return dist;
}

/* 最短路径回溯：每步取 dist 恰好减 1 的合法马步邻居 */
function bfsPath(dist, sf, sr, tf, tr){
  if(dist[tf][tr] < 0) return null;
  const path = [[tf,tr]];
  let f = tf, r = tr;
  while(!(f === sf && r === sr)){
    let found = false;
    for(const [df,dr] of OFF){
      const pf = f + df, pr = r + dr;
      if(inB(pf,pr) && dist[pf][pr] === dist[f][r] - 1){
        f = pf; r = pr; path.push([f,r]); found = true; break;
      }
    }
    if(!found) return null;
  }
  return path.reverse();
}
const pathOf = (sf, sr, tf, tr) => bfsPath(bfs(sf, sr), sf, sr, tf, tr);

/* ---------------------------------------------------------------------------
   单马骑士巡游
   closed 版本：63 步走遍 64 格后还能跳回起点
   策略：Warnsdorff 排序 + 回溯 + 多次重启 + 少量随机扰动
   （注意：不要一上来就彻底打乱同分候选，那样回溯会扎进坏分支）
--------------------------------------------------------------------------- */
function degree(f, r, visited){
  let n = 0;
  for(const [df,dr] of OFF){
    const nf = f + df, nr = r + dr;
    if(inB(nf,nr) && !visited[nf][nr]) n++;
  }
  return n;
}

function warnsdorffTour(sf, sr){
  const visited = Array.from({length:N}, () => new Array(N).fill(false));
  const tour = [[sf,sr]];
  visited[sf][sr] = true;
  let f = sf, r = sr;
  while(tour.length < N*N){
    const cands = [];
    for(const [df,dr] of OFF){
      const nf = f + df, nr = r + dr;
      if(inB(nf,nr) && !visited[nf][nr]) cands.push([nf,nr]);
    }
    if(!cands.length) return null;
    cands.sort((a,b) => {
      const da = degree(a[0],a[1],visited), db = degree(b[0],b[1],visited);
      if(da !== db) return da - db;
      const ca = Math.abs(a[0]-3.5) + Math.abs(a[1]-3.5);
      const cb = Math.abs(b[0]-3.5) + Math.abs(b[1]-3.5);
      return ca - cb;
    });
    const [nf,nr] = cands[0];
    visited[nf][nr] = true; tour.push([nf,nr]); f = nf; r = nr;
  }
  return tour;
}

function closedKnightTour(sf, sr, attempts, nodesPerTry){
  attempts = attempts || 24;
  nodesPerTry = nodesPerTry || 120000;
  const N2 = N * N;
  const visited = Array.from({length:N}, () => new Array(N).fill(false));
  const path = [[sf,sr]];
  let nodes = 0, cap = 0, jitter = 0, rng = 12345;
  function rnd(){
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  }
  const canReturn = (f,r) => isKnight(f, r, sf, sr);
  function dfs(f, r, depth){
    if(nodes++ > cap) return false;
    if(depth === N2) return canReturn(f, r);
    const cands = [];
    for(const [df,dr] of OFF){
      const nf = f + df, nr = r + dr;
      if(inB(nf,nr) && !visited[nf][nr]) cands.push([nf,nr,degree(nf,nr,visited)]);
    }
    cands.sort((a,b) => (a[2] - b[2]) + (rnd() - 0.5) * jitter);
    for(const [nf,nr] of cands){
      visited[nf][nr] = true; path.push([nf,nr]);
      if(dfs(nf,nr,depth+1)) return true;
      path.pop(); visited[nf][nr] = false;
      if(nodes > cap) return false;
    }
    return false;
  }
  for(let a = 0; a < attempts; a++){
    jitter = a < 3 ? 0 : Math.min(3, (a - 2) * 0.35);
    cap = nodes + nodesPerTry;
    for(let f = 0; f < N; f++) visited[f].fill(false);
    visited[sf][sr] = true;
    path.length = 0; path.push([sf,sr]);
    if(dfs(sf, sr, 1)) return {tour: path.slice(), closed: true, nodes, attempts: a + 1};
  }
  return {tour: null, closed: false, nodes, attempts};
}

/* 校验一条巡游：是否 64 格不重复、每步合法、能否闭合 */
function verifyTour(tour, sf, sr){
  if(!tour || tour.length !== 64) return {ok:false, reason:"长度不是 64"};
  const seen = new Set();
  let legal = true;
  for(let i = 0; i < tour.length; i++){
    const [f,r] = tour[i];
    if(seen.has(nameOf(f,r))) legal = false;
    seen.add(nameOf(f,r));
    if(i > 0 && !isKnight(tour[i-1][0], tour[i-1][1], f, r)) legal = false;
  }
  const back = isKnight(tour[63][0], tour[63][1], sf, sr);
  return {ok: legal && seen.size === 64, unique: seen.size === 64, legal, closed: back,
          end: nameOf(tour[63][0], tour[63][1])};
}

/* ---------------------------------------------------------------------------
   两匹马「互保」分析
   定义（三种 pattern）：
     direct   两匹马互相攻击（彼此都是对方的合法马步落点）
     common   两匹马共同保护同一个空点（该点各是二者的合法落点）
     guard    马 A 停在马 B 能攻击的点上（B 保护 A；反向由对称性覆盖）
   代价：两个骑士各走各自的步数，总步数 = 两者之和；同一步内两马同时移动，
         所以“轮数” = max(两者步数)。两马不能互撞（不进入对方的落点格）。
--------------------------------------------------------------------------- */
const PATTERN_LABEL = {
  direct: "两马互相攻击（互为“马步”关系）",
  common: "两马共同保护同一个空点",
  guard:  "一马停在另一马能攻击的点上"
};

function mutualProtection(sf1, sr1, sf2, sr2, pattern, opts){
  opts = opts || {};
  const maxRound = opts.maxRound || 6;
  const d1 = bfs(sf1, sr1, [sf2, sr2]);   // 马 1 不能踩到马 2 的出发格
  const d2 = bfs(sf2, sr2, [sf1, sr1]);   // 马 2 不能踩到马 1 的出发格
  const cells = [];
  for(let f = 0; f < N; f++) for(let r = 0; r < N; r++) cells.push([f,r]);

  const line = (a, b) => nameOf(a[0],a[1]) + "→" + nameOf(b[0],b[1]);
  const cand = [];
  const push = (q1, q2, note) => {
    const m1 = d1[q1[0]][q1[1]], m2 = d2[q2[0]][q2[1]];
    if(m1 < 0 || m2 < 0) return;
    if(q1[0] === q2[0] && q1[1] === q2[1]) return;      // 不能同格
    if(m1 > maxRound || m2 > maxRound) return;
    cand.push({
      q1, q2, m1, m2, total: m1 + m2, rounds: Math.max(m1, m2),
      p1: bfsPath(d1, sf1, sr1, q1[0], q1[1]),
      p2: bfsPath(d2, sf2, sr2, q2[0], q2[1]),
      note
    });
  };

  if(pattern === "direct"){
    for(const [f,r] of cells){
      for(const [nf,nr] of neighbors(f,r)) push([f,r],[nf,nr], line([f,r],[nf,nr]));
    }
  } else if(pattern === "common"){
    // 枚举被保护的中心点 s，及两个攻击者
    for(const [f,r] of cells){
      const nbs = neighbors(f,r);
      for(let i = 0; i < nbs.length; i++){
        for(let j = i+1; j < nbs.length; j++){
          push(nbs[i], nbs[j], "共同保护 " + nameOf(f,r));
        }
      }
    }
  } else if(pattern === "guard"){
    for(const [f,r] of cells){
      for(const [nf,nr] of neighbors(f,r)){
        push([nf,nr], [f,r], nameOf(f,r) + " 保护 " + nameOf(nf,nr));  // B 在 (f,r)，A 在它的邻居
      }
    }
  }

  cand.sort((a,b) => (a.total - b.total) || (a.rounds - b.rounds));
  return {candidates: cand, best: cand[0] || null, distA: d1, distB: d2};
}

/* ---------------------------------------------------------------------------
   方形棋盘选择器（在小棋盘上点格子选位置）
--------------------------------------------------------------------------- */
const PICK_PIECES = {
  knight: "🐴",
  target: "◎",
  dot:    "·"
};

function createPicker(host, initial, onChange, opts){
  opts = opts || {};
  const pieceMap = opts.pieces || {};      // "a1" -> "knight"
  const cellPx = opts.cell || 18;
  const grid = document.createElement("div");
  grid.className = "kc-picker";
  grid.style.setProperty("--kc", cellPx + "px");

  const cells = new Map();
  for(let r = N - 1; r >= 0; r--){
    for(let f = 0; f < N; f++){
      const alg = nameOf(f, r);
      const el = document.createElement("div");
      el.className = "kc-cell " + cellColor(f, r);
      el.dataset.alg = alg;
      const inner = document.createElement("div");
      inner.className = "kc-inner";
      el.appendChild(inner);
      const banner = document.createElement("div");
      banner.className = "kc-banner";
      el.appendChild(banner);
      if(opts.markDark !== false && isDark(f, r)) el.classList.add("kc-darkcell");
      grid.appendChild(el);
      cells.set(alg, {el, inner, banner});
    }
  }
  host.appendChild(grid);

  let value = initial;
  let bannerValue = null;

  function paint(){
    for(const [alg, c] of cells){
      c.el.classList.toggle("kc-selected", alg === value);
      c.inner.textContent = pieceMap[alg] || (alg === value ? "●" : "");
      // 角标只画在选中的那一格上（不要给每格都打同一个标签）
      c.banner.textContent = (bannerValue !== null && alg === value) ? bannerValue : "";
    }
  }
  function select(alg){
    if(!cells.has(alg)) return;
    value = alg;
    paint();
    if(onChange) onChange(alg);
  }
  grid.addEventListener("click", e => {
    const cell = e.target.closest(".kc-cell");
    if(cell) select(cell.dataset.alg);
  });

  paint();
  return {
    get value(){ return value; },
    set(alg, silent){
      if(!cells.has(alg)) return;
      value = alg; paint();
      if(!silent && onChange) onChange(alg);
    },
    /* 让某格显示角标（例如“目标格”），或清空 */
    setPieces(map){ for(const k in map){ pieceMap[k] = map[k]; } paint(); },
    setBanner(text){ bannerValue = text; paint(); },
    highlight(alg, cls){
      for(const [a, c] of cells){
        if(cls) c.el.classList.toggle(cls, a === alg);
      }
    },
    clearHighlight(cls){ for(const c of cells.values()) c.el.classList.remove(cls); },
    select,
    el: grid
  };
}

global.KnightCore = {
  N, FILES, OFF, ALL,
  inB, nameOf, parseAlg, isKnight, isDark, cellColor, neighbors,
  bfs, bfsPath, pathOf,
  degree, warnsdorffTour, closedKnightTour, verifyTour,
  mutualProtection, PATTERN_LABEL,
  createPicker
};

})(typeof window !== "undefined" ? window : globalThis);
