// 64x64 高清写实风程序化贴图：全部逐像素生成，不使用任何外部图片素材。
// 图集为 512x512（4x4 个 128px 单元，每单元中央 64px 内容 + 32px 环绕 gutter），
// gutter 采用平铺环绕填充，配合 mipmap 三线性过滤消除远处闪烁且无渗色。

import * as THREE from 'three';
import { TILE } from './blocks.js';
import { rng } from './noise.js';

const T = 64;            // tile 内容尺寸
const CELL = 128;        // 图集单元（含 gutter）
const PAD = 32;
const COLS = 8;
const ROWS = 8;          // 8x8 = 64 格容量
const ATLAS_W = CELL * COLS;  // 1024
const ATLAS_H = CELL * ROWS;  // 1024

// ---------- 基础工具 ----------

function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

// 多段色带插值，t in [0,1]
function ramp(stops, t) {
  t = Math.max(0, Math.min(0.9999, t));
  const f = t * (stops.length - 1);
  const i = f | 0, k = f - i;
  const A = stops[i], B = stops[i + 1];
  return [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k];
}

// 可平铺值噪声（周期 wrap），u,v in [0,1)
function tileNoise(rand, period) {
  const N = period;
  const g = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) g[i] = rand();
  return (u, v) => {
    const x = u * N, y = v * N;
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % N) + N) % N, x1 = (x0 + 1) % N;
    const y0 = ((yi % N) + N) % N, y1 = (y0 + 1) % N;
    const a = g[y0 * N + x0], b = g[y0 * N + x1];
    const c = g[y1 * N + x0], d = g[y1 * N + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function fbmTile(rand, period = 8, octaves = 3, gain = 0.5) {
  const layers = [];
  let p = period;
  for (let o = 0; o < octaves; o++) {
    layers.push(tileNoise(rand, Math.min(64, p)));
    p *= 2;
  }
  return (u, v) => {
    let amp = 1, sum = 0, norm = 0;
    for (let o = 0; o < layers.length; o++) {
      sum += layers[o](u, v) * amp;
      norm += amp;
      amp *= gain;
    }
    return sum / norm;
  };
}

// 64x64 RGBA 画布（坐标自动 wrap，保证可平铺）
class Img {
  constructor() {
    this.data = new Uint8ClampedArray(T * T * 4);
  }
  idx(x, y) {
    x = ((x % T) + T) % T;
    y = ((y % T) + T) % T;
    return ((y | 0) * T + (x | 0)) * 4;
  }
  set(x, y, r, g, b, a = 255) {
    const o = this.idx(x, y);
    this.data[o] = r; this.data[o + 1] = g; this.data[o + 2] = b; this.data[o + 3] = a;
  }
  add(x, y, d) {
    const o = this.idx(x, y);
    this.data[o] += d; this.data[o + 1] += d; this.data[o + 2] += d;
  }
  tint(x, y, dr, dg, db) {
    const o = this.idx(x, y);
    this.data[o] += dr; this.data[o + 1] += dg; this.data[o + 2] += db;
  }
}

function grain(img, rand, amt) {
  for (let i = 0; i < T * T; i++) {
    const d = (rand() - 0.5) * amt * 2;
    img.data[i * 4] += d; img.data[i * 4 + 1] += d; img.data[i * 4 + 2] += d;
  }
}

// 基础色带 + fbm 填充
function fillRamp(img, rand, stops, { period = 8, octaves = 3, contrast = 1 } = {}) {
  const n = fbmTile(rand, period, octaves);
  const rgb = stops.map(hex);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      let t = n(x / T, y / T);
      t = 0.5 + (t - 0.5) * contrast;
      const c = ramp(rgb, t);
      img.set(x, y, c[0], c[1], c[2]);
    }
  return n;
}

// 裂缝/矿脉：带惯性的随机游走，主色 + 侧向高光
function vein(img, rand, color, hiColor, steps, thick = 1) {
  const c = hex(color), h = hiColor ? hex(hiColor) : null;
  let x = rand() * T, y = rand() * T;
  let ang = rand() * Math.PI * 2;
  for (let i = 0; i < steps; i++) {
    for (let t = 0; t < thick; t++) img.set(x + t, y, c[0], c[1], c[2]);
    if (h && rand() < 0.6) img.set(x + thick, y + 1, h[0], h[1], h[2]);
    ang += (rand() - 0.5) * 0.8;
    x += Math.cos(ang);
    y += Math.sin(ang);
  }
}

// ---------- 各方块画笔 ----------

const GRASS_STOPS = ['#3e6b26', '#4e8a30', '#5da23c', '#6fb54a'];

function paintGrassTop(img, rand) {
  fillRamp(img, rand, GRASS_STOPS, { period: 8, octaves: 3 });
  const clump = tileNoise(rand, 4);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const cl = clump(x / T, y / T);
      if (cl > 0.72) img.add(x, y, 14);
      else if (cl < 0.3) img.add(x, y, -10);
    }
  // 草叶短笔触
  const blades = ['#7cc456', '#548f30', '#68b040'].map(hex);
  for (let i = 0; i < 130; i++) {
    const x = (rand() * T) | 0, y = (rand() * T) | 0;
    const len = 2 + (rand() * 3) | 0;
    const c = blades[(rand() * blades.length) | 0];
    for (let j = 0; j < len; j++) img.set(x, y + j, c[0], c[1], c[2]);
    img.add(x, y, 22); // 叶尖高光
  }
  grain(img, rand, 7);
}

function paintDirt(img, rand) {
  fillRamp(img, rand, ['#4f3826', '#6b4c32', '#7d5a3c', '#8f6a47'], { period: 8, octaves: 3 });
  // 小石粒：左上受光、右下阴影
  for (let i = 0; i < 22; i++) {
    const cx = (rand() * T) | 0, cy = (rand() * T) | 0;
    const rr = 1 + (rand() * 2) | 0;
    const base = 90 + rand() * 60;
    for (let dy = -rr; dy <= rr; dy++)
      for (let dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dy * dy > rr * rr) continue;
        const light = base + (dx + dy < 0 ? 25 : -18);
        img.set(cx + dx, cy + dy, light, light * 0.88, light * 0.72);
      }
    img.add(cx + rr, cy + rr + 1, -30); // 落影
  }
  for (let i = 0; i < 30; i++) img.add((rand() * T) | 0, (rand() * T) | 0, -35);
  grain(img, rand, 9);
}

function paintGrassSide(img, rand) {
  paintDirt(img, rand);
  // 顶部草皮带：噪声锯齿下缘 + 垂落草须
  const edge = tileNoise(rand, 8);
  const gRamp = GRASS_STOPS.map(hex);
  const gNoise = fbmTile(rand, 8, 2);
  for (let x = 0; x < T; x++) {
    const bh = 9 + edge(x / T, 0.5) * 9;
    for (let y = 0; y < bh; y++) {
      const c = ramp(gRamp, gNoise(x / T, y / T));
      img.set(x, y, c[0], c[1], c[2]);
      if (y < 2) img.add(x, y, 16); // 上缘受光
    }
    img.add(x, bh | 0, -22);        // 交界阴影
    if (rand() < 0.2) {             // 草须
      const len = 2 + (rand() * 4) | 0;
      const c = ramp(gRamp, 0.35);
      for (let j = 0; j < len; j++) img.set(x, (bh | 0) + j, c[0], c[1], c[2]);
    }
  }
}

function paintStone(img, rand) {
  fillRamp(img, rand, ['#5c5c5c', '#757575', '#8a8a8a', '#9a9a9a'], { period: 8, octaves: 4 });
  const patch = tileNoise(rand, 4);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const p = patch(x / T, y / T);
      if (p > 0.66) img.tint(x, y, -6, -4, 2);   // 偏冷斑块
      else if (p < 0.3) img.tint(x, y, 8, 5, -2); // 偏暖斑块
    }
  for (let i = 0; i < 6; i++) vein(img, rand, '#3d3d3d', '#a5a5a5', 10 + rand() * 16, 1);
  // 小凹坑
  for (let i = 0; i < 10; i++) {
    const x = (rand() * T) | 0, y = (rand() * T) | 0;
    img.add(x, y, -40);
    img.add(x, y + 1, 20);
  }
  grain(img, rand, 6);
}

function paintSand(img, rand) {
  const n = fillRamp(img, rand, ['#b8a878', '#cbbd8d', '#d9cc9d', '#e6dcae'], { period: 8, octaves: 2 });
  // 风纹涟漪
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const s = Math.sin((y + n(x / T, y / T) * 10) * 0.5);
      img.add(x, y, s * 8);
    }
  for (let i = 0; i < 40; i++) img.add((rand() * T) | 0, (rand() * T) | 0, rand() < 0.5 ? -20 : 22);
  grain(img, rand, 8);
}

function paintLogSide(img, rand) {
  // 竖向树皮纹：1D 主纹 + 低幅 2D 细节
  const strip = tileNoise(rand, 16);
  const detail = fbmTile(rand, 8, 2);
  const stops = ['#3f2e1a', '#54402a', '#6b5433', '#7d6540'].map(hex);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const t = strip(x / T, 0.5) * 0.75 + detail(x / T, y / T) * 0.25;
      const c = ramp(stops, t);
      img.set(x, y, c[0], c[1], c[2]);
    }
  // 深沟 + 侧缘高光（波浪竖线）
  for (let i = 0; i < 6; i++) {
    const x0 = rand() * T, phase = rand() * 6.28, amp = 1 + rand() * 1.5;
    for (let y = 0; y < T; y++) {
      const x = x0 + Math.sin(y * 0.15 + phase) * amp;
      img.set(x, y, 46, 34, 18);
      img.add(x + 1, y, 20);
    }
  }
  grain(img, rand, 6);
}

function paintLogTop(img, rand) {
  const warp = fbmTile(rand, 8, 2);
  const barkStops = ['#3f2e1a', '#54402a', '#66502f'].map(hex);
  const woodStops = ['#8a7244', '#a08753', '#b59a67', '#c8ad79'].map(hex);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const dx = x - 31.5, dy = y - 31.5;
      const r = Math.sqrt(dx * dx + dy * dy) + warp(x / T, y / T) * 4;
      if (r > 28) {
        const c = ramp(barkStops, warp(y / T, x / T));
        img.set(x, y, c[0], c[1], c[2]);
      } else {
        const band = (Math.sin(r * 0.9) + 1) / 2;
        const c = ramp(woodStops, band);
        img.set(x, y, c[0], c[1], c[2]);
        if (Math.sin(r * 0.9) > 0.92) img.add(x, y, -26); // 年轮细线
      }
    }
  grain(img, rand, 5);
}

function paintLeaves(img, rand) {
  fillRamp(img, rand, ['#16300f', '#1e3d14', '#26491a'], { period: 8, octaves: 2 });
  // 叶簇：小椭圆 + 顶部受光 / 底部阴影
  const leafStops = ['#2c5a1c', '#3a7326', '#468833', '#57a03f'].map(hex);
  for (let i = 0; i < 110; i++) {
    const cx = rand() * T, cy = rand() * T;
    const w = 2 + rand() * 2, h = 1.5 + rand() * 1.5;
    const t = rand();
    const c = ramp(leafStops, t);
    for (let dy = -h; dy <= h; dy++)
      for (let dx = -w; dx <= w; dx++) {
        if ((dx * dx) / (w * w) + (dy * dy) / (h * h) > 1) continue;
        img.set(cx + dx, cy + dy, c[0], c[1], c[2]);
      }
    img.add(cx - w * 0.4, cy - h * 0.6, 20);
    img.add(cx + w * 0.4, cy + h + 1, -24);
  }
  for (let i = 0; i < 8; i++) {
    const x = (rand() * T) | 0, y = (rand() * T) | 0;
    img.set(x, y, 18, 42, 12); img.set(x + 1, y, 18, 42, 12);
  }
  grain(img, rand, 7);
}

function paintPlanks(img, rand) {
  const warp = fbmTile(rand, 8, 2);
  const stops = ['#6b4f2a', '#84643a', '#9a7847', '#ac8a54'].map(hex);
  const boardTint = [];
  for (let b = 0; b < 4; b++) boardTint.push((rand() - 0.5) * 26);
  for (let y = 0; y < T; y++) {
    const board = (y / 16) | 0;
    for (let x = 0; x < T; x++) {
      // 木纹：横向流动条纹 + 扰动
      const g = Math.sin(x * 0.32 + warp(x / T, y / T) * 5 + board * 2.3) * 0.5 + 0.5;
      const c = ramp(stops, g * 0.7 + 0.15);
      img.set(x, y, c[0] + boardTint[board], c[1] + boardTint[board], c[2] + boardTint[board]);
    }
  }
  // 板缝（暗槽 + 下缘高光）与错位竖缝
  for (let b = 0; b < 4; b++) {
    const yS = b * 16 + 14;
    for (let x = 0; x < T; x++) {
      img.set(x, yS, 52, 38, 20);
      img.set(x, yS + 1, 40, 29, 15);
      img.add(x, yS + 2, 14);
    }
    const joint = ((b * 23 + 11) % T) | 0;
    for (let y = b * 16; y < b * 16 + 14; y++) {
      img.set(joint, y, 46, 34, 18);
      img.add(joint + 1, y, 12);
    }
    // 钉痕
    img.set(joint + 4, b * 16 + 3, 60, 47, 28);
    img.set(joint - 4, b * 16 + 10, 60, 47, 28);
  }
  grain(img, rand, 6);
}

function paintGlass(img, rand) {
  // 全透明主体（alphaTest 剔除）+ 边框 + 高光斜纹
  for (let i = 0; i < T * T * 4; i += 4) {
    img.data[i] = 210; img.data[i + 1] = 235; img.data[i + 2] = 244; img.data[i + 3] = 12;
  }
  for (let i = 0; i < T; i++) {
    for (const [p, br] of [[0, 30], [1, 0], [2, -20]]) {
      img.set(i, p, 216 + br, 240 + br, 248 + br);
      img.set(i, T - 1 - p, 216 + br, 240 + br, 248 + br);
      img.set(p, i, 216 + br, 240 + br, 248 + br);
      img.set(T - 1 - p, i, 216 + br, 240 + br, 248 + br);
    }
  }
  // 两道斜向反光
  for (let d = 0; d < T * 2; d++) {
    for (let w = 0; w < 4; w++) {
      const x = d - 20 + w, y = T - d;
      if (x > 3 && x < 60 && y > 3 && y < 60) img.set(x, y, 255, 255, 255, 170);
    }
    for (let w = 0; w < 2; w++) {
      const x = d + 8 + w, y = T - d;
      if (x > 3 && x < 60 && y > 3 && y < 60) img.set(x, y, 255, 255, 255, 130);
    }
  }
}

// 通用砖墙：16px 砖排 + 灰浆凹槽倒角 + 每块砖独立色差
function paintBricks(img, rand, bodyStops, mortarStops) {
  const bodyRgb = bodyStops.map(hex);
  const mortarRgb = mortarStops.map(hex);
  const n = fbmTile(rand, 8, 3);
  const tintOf = {};
  for (let y = 0; y < T; y++) {
    const row = (y / 16) | 0;
    const inMortarY = y % 16 >= 13;
    for (let x = 0; x < T; x++) {
      const stag = (row % 2) * 16;
      const col = (((x + stag) / 32) | 0) % 2 + row * 7 + (((x + stag) / 32) | 0);
      const jointX = (x + stag) % 32 >= 29;
      if (inMortarY || jointX) {
        const c = ramp(mortarRgb, n(x / T, y / T));
        let d = 0;
        if (y % 16 === 13 || (x + stag) % 32 === 29) d = -22; // 槽顶阴影
        if (y % 16 === 15 || (x + stag) % 32 === 31) d = 14;  // 槽底受光
        img.set(x, y, c[0] + d, c[1] + d, c[2] + d);
      } else {
        const key = row + ':' + col;
        if (!(key in tintOf)) tintOf[key] = (rand() - 0.5) * 30;
        const tint = tintOf[key];
        const c = ramp(bodyRgb, n(x / T, y / T));
        let d = tint;
        if (y % 16 === 0) d += 16;             // 砖顶受光
        if (y % 16 === 12) d -= 14;            // 砖底阴影
        if ((x + stag) % 32 === 0) d += 10;
        if ((x + stag) % 32 === 28) d -= 8;
        img.set(x, y, c[0] + d, c[1] + d, c[2] + d);
      }
    }
  }
  grain(img, rand, 7);
}

function paintBrick(img, rand) {
  paintBricks(img, rand, ['#7e352b', '#93453a', '#a35547', '#b06050'], ['#8f887c', '#a29a8c', '#b1a99a']);
}

function paintBedrock(img, rand) {
  const n = fbmTile(rand, 4, 3);
  const stops = ['#1f1f1f', '#3a3a3a', '#5c5c5c', '#787878'].map(hex);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      // 色阶硬切，得到粗粝斑块
      const t = Math.floor(n(x / T, y / T) * 4) / 3;
      const c = ramp(stops, t);
      img.set(x, y, c[0], c[1], c[2]);
    }
  for (let i = 0; i < 5; i++) vein(img, rand, '#101010', null, 12 + rand() * 14, 1);
  grain(img, rand, 8);
}

function paintSulfur(img, rand) {
  fillRamp(img, rand, ['#8f7a1e', '#bfa42c', '#d9be3a', '#ecd75b'], { period: 8, octaves: 3 });
  const sinter = tileNoise(rand, 4);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      if (sinter(x / T, y / T) > 0.72) img.tint(x, y, 18, 16, 40); // 泛白结晶壳
    }
  // 晶体闪点
  for (let i = 0; i < 16; i++) {
    const x = (rand() * T) | 0, y = (rand() * T) | 0;
    img.set(x, y, 255, 247, 176);
    img.set(x + 1, y, 236, 215, 91);
    img.add(x, y + 1, -30);
  }
  for (let i = 0; i < 10; i++) img.add((rand() * T) | 0, (rand() * T) | 0, -36);
  grain(img, rand, 7);
}

function paintCinnabar(img, rand) {
  fillRamp(img, rand, ['#5f1f18', '#7e2c21', '#98392b', '#ad4736'], { period: 8, octaves: 3 });
  for (let i = 0; i < 6; i++) vein(img, rand, '#43140f', '#c65a45', 12 + rand() * 16, 1);
  for (let i = 0; i < 8; i++) {
    const x = (rand() * T) | 0, y = (rand() * T) | 0;
    img.set(x, y, 217, 122, 94); // 晶体亮斑
  }
  grain(img, rand, 6);
}

function paintCinnabarBricks(img, rand) {
  paintBricks(img, rand, ['#7e2c21', '#98392b', '#ad4736', '#b95240'], ['#5a4a44', '#6b5a52', '#7a685e']);
}

function paintSulfurBricks(img, rand) {
  paintBricks(img, rand, ['#bfa42c', '#d0b334', '#d9be3a', '#e5cd4e'], ['#8a7a2e', '#9a8936', '#a8963e']);
}

function paintIronOre(img, rand) {
  paintStone(img, rand);
  // 锈橙色矿粒簇：亮面 + 暗缘
  for (let i = 0; i < 9; i++) {
    const cx = 6 + ((rand() * 52) | 0), cy = 6 + ((rand() * 52) | 0);
    const rr = 2 + ((rand() * 3) | 0);
    for (let dy = -rr; dy <= rr; dy++)
      for (let dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dy * dy > rr * rr) continue;
        const light = dx + dy < 0;
        img.set(cx + dx, cy + dy, light ? 216 : 178, light ? 140 : 106, light ? 92 : 64);
      }
    img.add(cx + rr, cy + rr + 1, -34);
    img.set(cx - 1, cy - 1, 236, 176, 128);
  }
}

function paintWool(img, rand) {
  fillRamp(img, rand, ['#cfc9bc', '#e2ddd2', '#efeae0', '#f7f3ea'], { period: 8, octaves: 3 });
  // 卷曲绒毛：高频噪声阈值出旋涡状阴影
  const curl = tileNoise(rand, 16);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const c = curl(x / T, y / T);
      if (c > 0.68) img.add(x, y, 12);
      else if (c < 0.34) img.add(x, y, -16);
    }
  grain(img, rand, 6);
}

// 通用矿石：石底 + 矿粒簇（亮面/暗面双色）
function orePatches(img, rand, count, light, dark, spark) {
  for (let i = 0; i < count; i++) {
    const cx = 6 + ((rand() * 52) | 0), cy = 6 + ((rand() * 52) | 0);
    const rr = 2 + ((rand() * 3) | 0);
    for (let dy = -rr; dy <= rr; dy++)
      for (let dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dy * dy > rr * rr) continue;
        const c = dx + dy < 0 ? light : dark;
        img.set(cx + dx, cy + dy, c[0], c[1], c[2]);
      }
    img.add(cx + rr, cy + rr + 1, -30);
    if (spark) img.set(cx - 1, cy - 1, spark[0], spark[1], spark[2]);
  }
}

function paintCobble(img, rand) {
  // 暗缝底 + 一颗颗鹅卵石块（左上受光/右下阴影）
  fillRamp(img, rand, ['#3f3f3f', '#4a4a4a', '#555555'], { period: 8, octaves: 2 });
  for (let i = 0; i < 16; i++) {
    const cx = rand() * T, cy = rand() * T;
    const rw = 4 + rand() * 5, rh = 3 + rand() * 4;
    const base = 105 + rand() * 45;
    for (let dy = -rh; dy <= rh; dy++)
      for (let dx = -rw; dx <= rw; dx++) {
        if ((dx * dx) / (rw * rw) + (dy * dy) / (rh * rh) > 1) continue;
        const light = base + (dx + dy < 0 ? 18 : -14) + (rand() - 0.5) * 10;
        img.set(cx + dx, cy + dy, light, light, light);
      }
  }
  grain(img, rand, 7);
}

function paintMossyCobble(img, rand) {
  paintCobble(img, rand);
  const moss = tileNoise(rand, 4);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const m = moss(x / T, y / T);
      if (m > 0.60) img.tint(x, y, -34, 12, -34);
      else if (m > 0.52) img.tint(x, y, -16, 4, -16);
    }
}

function paintGravel(img, rand) {
  fillRamp(img, rand, ['#5f5a52', '#6e6960', '#7d786e'], { period: 8, octaves: 2 });
  const cols = [[142, 136, 126], [104, 98, 90], [124, 112, 96], [88, 84, 80], [150, 146, 140]];
  for (let i = 0; i < 90; i++) {
    const cx = (rand() * T) | 0, cy = (rand() * T) | 0;
    const rr = 1 + ((rand() * 2) | 0);
    const c = cols[(rand() * cols.length) | 0];
    for (let dy = -rr; dy <= rr; dy++)
      for (let dx = -rr; dx <= rr; dx++) {
        if (dx * dx + dy * dy > rr * rr) continue;
        img.set(cx + dx, cy + dy, c[0] + (dx + dy < 0 ? 12 : -10), c[1], c[2]);
      }
  }
  grain(img, rand, 8);
}

function paintSnow(img, rand) {
  fillRamp(img, rand, ['#dbe4ec', '#e9f0f5', '#f6fafc', '#ffffff'], { period: 8, octaves: 2 });
  for (let i = 0; i < 14; i++) img.set((rand() * T) | 0, (rand() * T) | 0, 255, 255, 255);
  for (let i = 0; i < 10; i++) img.tint((rand() * T) | 0, (rand() * T) | 0, -14, -8, 0);
  grain(img, rand, 4);
}

function paintIce(img, rand) {
  fillRamp(img, rand, ['#9cc8e8', '#b0d6f0', '#c4e4f6', '#d6eefa'], { period: 8, octaves: 2 });
  // 斜向冰裂细纹 + 高光
  for (let i = 0; i < 5; i++) {
    let x = rand() * T, y = rand() * T;
    const len = 10 + rand() * 14;
    for (let j = 0; j < len; j++) {
      img.set(x, y, 235, 248, 255);
      x += 1; y += rand() < 0.7 ? 1 : 0;
    }
  }
  for (let i = 0; i < 6; i++) {
    const x = (rand() * T) | 0, y = (rand() * T) | 0;
    img.set(x, y, 255, 255, 255); img.set(x + 1, y, 255, 255, 255);
  }
  grain(img, rand, 4);
}

function paintSandstone(img, rand) {
  fillRamp(img, rand, ['#cbb98a', '#d9c898', '#e2d3a4'], { period: 8, octaves: 2 });
  // 水平沉积条带
  for (let y = 0; y < T; y++) {
    const band = Math.sin(y * 0.5) * 5 + (y % 11 === 0 ? -14 : 0);
    for (let x = 0; x < T; x++) img.add(x, y, band);
  }
  for (let i = 0; i < 20; i++) img.add((rand() * T) | 0, (rand() * T) | 0, -18);
  grain(img, rand, 6);
}

function paintCoalOre(img, rand) {
  paintStone(img, rand);
  orePatches(img, rand, 9, [58, 58, 60], [34, 34, 36], [96, 96, 100]);
}

function paintGoldOre(img, rand) {
  paintStone(img, rand);
  orePatches(img, rand, 8, [238, 200, 92], [186, 146, 44], [255, 236, 150]);
}

function paintGemOre(img, rand) {
  paintStone(img, rand);
  orePatches(img, rand, 7, [126, 230, 230], [58, 168, 178], [222, 255, 255]);
}

function paintObsidian(img, rand) {
  fillRamp(img, rand, ['#100c16', '#1c1424', '#281c34', '#161020'], { period: 8, octaves: 3 });
  for (let i = 0; i < 5; i++) vein(img, rand, '#3c2a52', '#5a4078', 10 + rand() * 12, 1);
  for (let i = 0; i < 5; i++) {
    const x = (rand() * T) | 0, y = (rand() * T) | 0;
    img.set(x, y, 150, 130, 190); // 紫色光泽点
  }
  grain(img, rand, 5);
}

function paintStoneBricks(img, rand) {
  paintBricks(img, rand, ['#6f6f6f', '#7d7d7d', '#8a8a8a', '#767676'], ['#4a4a4a', '#555555', '#5f5f5f']);
}

// 金属/宝石块：斜面倒角 + 高光
function paintShinyBlock(img, rand, stops, edgeLight, edgeDark) {
  fillRamp(img, rand, stops, { period: 8, octaves: 2 });
  for (let i = 0; i < T; i++) {
    for (let e = 0; e < 4; e++) {
      img.tint(i, e, edgeLight[0], edgeLight[1], edgeLight[2]);
      img.tint(e, i, edgeLight[0], edgeLight[1], edgeLight[2]);
      img.tint(i, T - 1 - e, edgeDark[0], edgeDark[1], edgeDark[2]);
      img.tint(T - 1 - e, i, edgeDark[0], edgeDark[1], edgeDark[2]);
    }
  }
  // 斜向高光
  for (let d = 10; d < 30; d++) {
    img.add(d, 40 - d, 26);
    img.add(d + 1, 40 - d, 18);
  }
  grain(img, rand, 5);
}

function paintGoldBlock(img, rand) {
  paintShinyBlock(img, rand, ['#c89b30', '#e0b83e', '#f0cc5a', '#e0b83e'], [24, 20, 8], [-26, -22, -10]);
}

function paintGemBlock(img, rand) {
  paintShinyBlock(img, rand, ['#3aa8b8', '#5ecfd6', '#8ae4e6', '#5ecfd6'], [26, 26, 26], [-28, -24, -20]);
}

function paintBookshelfSide(img, rand) {
  paintPlanks(img, rand);
  // 两层书架：彩色书脊 + 顶部页缘
  const spines = [[150, 60, 50], [70, 100, 150], [90, 130, 70], [140, 110, 60], [110, 70, 130], [160, 130, 90]];
  for (const shelfY of [8, 36]) {
    // 架格阴影底
    for (let y = shelfY; y < shelfY + 20; y++)
      for (let x = 4; x < 60; x++) img.set(x, y, 38, 28, 16);
    let x = 5;
    while (x < 58) {
      const w = 4 + ((rand() * 4) | 0);
      const c = spines[(rand() * spines.length) | 0];
      const hgt = 16 + ((rand() * 3) | 0);
      for (let dy = 0; dy < hgt; dy++)
        for (let dx = 0; dx < w && x + dx < 58; dx++) {
          const edge = dx === 0 || dx === w - 1;
          img.set(x + dx, shelfY + 20 - hgt + dy, c[0] - (edge ? 30 : 0), c[1] - (edge ? 30 : 0), c[2] - (edge ? 30 : 0));
        }
      if (rand() < 0.5) for (let dx = 1; dx < w - 1 && x + dx < 58; dx++)
        img.set(x + dx, shelfY + 20 - hgt, 226, 220, 200); // 页缘
      x += w + (rand() < 0.25 ? 2 : 0);
    }
  }
}

const PAINTERS = {
  [TILE.GRASS_TOP]: paintGrassTop,
  [TILE.GRASS_SIDE]: paintGrassSide,
  [TILE.DIRT]: paintDirt,
  [TILE.STONE]: paintStone,
  [TILE.LOG_TOP]: paintLogTop,
  [TILE.LOG_SIDE]: paintLogSide,
  [TILE.LEAVES]: paintLeaves,
  [TILE.SAND]: paintSand,
  [TILE.PLANKS]: paintPlanks,
  [TILE.GLASS]: paintGlass,
  [TILE.BRICK]: paintBrick,
  [TILE.BEDROCK]: paintBedrock,
  [TILE.SULFUR]: paintSulfur,
  [TILE.CINNABAR]: paintCinnabar,
  [TILE.CINNABAR_BRICKS]: paintCinnabarBricks,
  [TILE.SULFUR_BRICKS]: paintSulfurBricks,
  [TILE.WOOL]: paintWool,
  [TILE.IRON_ORE]: paintIronOre,
  [TILE.COBBLE]: paintCobble,
  [TILE.GRAVEL]: paintGravel,
  [TILE.SNOW]: paintSnow,
  [TILE.ICE]: paintIce,
  [TILE.SANDSTONE]: paintSandstone,
  [TILE.COAL_ORE]: paintCoalOre,
  [TILE.GOLD_ORE]: paintGoldOre,
  [TILE.GEM_ORE]: paintGemOre,
  [TILE.OBSIDIAN]: paintObsidian,
  [TILE.MOSSY_COBBLE]: paintMossyCobble,
  [TILE.STONE_BRICKS]: paintStoneBricks,
  [TILE.GOLD_BLOCK]: paintGoldBlock,
  [TILE.GEM_BLOCK]: paintGemBlock,
  [TILE.BOOKSHELF_SIDE]: paintBookshelfSide,
};

// ---------- 纹理装配 ----------

function imgToCanvas(img) {
  const c = document.createElement('canvas');
  c.width = c.height = T;
  c.getContext('2d').putImageData(new ImageData(img.data, T, T), 0, 0);
  return c;
}

// 近处像素锐利（Nearest 放大）+ 远处三线性 mipmap（不闪烁）
function configAtlasLike(tex) {
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function configSimple(tex) {
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// tile 内 uv -> 图集 uv（内容区居中 + 半像素内缩；flipY 默认 true）
export function tileUV(tile, u, v) {
  const c = tile % COLS, r = (tile / COLS) | 0;
  const E = 0.5;
  const px = c * CELL + PAD + E + u * (T - 2 * E);
  const py = r * CELL + PAD + E + (1 - v) * (T - 2 * E);
  return [px / ATLAS_W, 1 - py / ATLAS_H];
}

export function createTextures() {
  // ---- 图集（wrap gutter：每单元把内容平铺画 9 次再裁剪）----
  const atlas = document.createElement('canvas');
  atlas.width = ATLAS_W;
  atlas.height = ATLAS_H;
  const ctx = atlas.getContext('2d');
  for (const [tileStr, painter] of Object.entries(PAINTERS)) {
    const tile = +tileStr;
    const img = new Img();
    painter(img, rng(0x9e3779b9 ^ (tile * 2654435761)));
    const tc = imgToCanvas(img);
    const cx = (tile % COLS) * CELL, cy = ((tile / COLS) | 0) * CELL;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, cy, CELL, CELL);
    ctx.clip();
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        ctx.drawImage(tc, cx + PAD + dx * T, cy + PAD + dy * T);
    ctx.restore();
  }
  const atlasTexture = configAtlasLike(new THREE.CanvasTexture(atlas));

  // ---- 水（64px 独立贴图，滚动动画）----
  const wimg = new Img();
  const wrand = rng(0x1234abcd);
  const wn = fbmTile(wrand, 8, 3);
  const wStops = ['#2a4fb8', '#3564d8', '#3f74e6', '#4d86ee'].map(hex);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const c = ramp(wStops, wn(x / T, y / T));
      const s = Math.sin((x + wn(x / T, y / T) * 9 + y * 1.8) * 0.32);
      img_setWater(wimg, x, y, c, s);
    }
  function img_setWater(im, x, y, c, s) {
    im.set(x, y, c[0] + s * 16, c[1] + s * 18, c[2] + s * 20);
  }
  for (let i = 0; i < 14; i++) {
    const x = (wrand() * T) | 0, y = (wrand() * T) | 0;
    wimg.set(x, y, 157, 194, 255);
  }
  const waterCanvas = imgToCanvas(wimg);
  const waterTexture = configAtlasLike(new THREE.CanvasTexture(waterCanvas));
  waterTexture.wrapS = waterTexture.wrapT = THREE.RepeatWrapping;

  // ---- 挖掘裂纹（4 阶段，64px 透明底）----
  const crackTextures = [];
  for (let stage = 0; stage < 4; stage++) {
    const img = new Img(); // 默认全透明
    const crand = rng(0xc0ffee + stage * 7919);
    const lines = 4 + stage * 3;
    for (let i = 0; i < lines; i++) {
      let x = 32 + (crand() - 0.5) * 10, y = 32 + (crand() - 0.5) * 10;
      let ang = crand() * Math.PI * 2;
      const steps = 14 + stage * 14;
      for (let j = 0; j < steps; j++) {
        img.set(x, y, 12, 12, 12, 225);
        img.set(x + 1, y, 12, 12, 12, 160);
        if (crand() < 0.12) { // 分叉
          let bx = x, by = y, bang = ang + (crand() < 0.5 ? 1 : -1) * 1.2;
          for (let k = 0; k < 6; k++) {
            img.set(bx, by, 12, 12, 12, 190);
            bang += (crand() - 0.5) * 0.6;
            bx += Math.cos(bang); by += Math.sin(bang);
          }
        }
        ang += (crand() - 0.5) * 0.9;
        x += Math.cos(ang);
        y += Math.sin(ang);
      }
    }
    const tex = new THREE.CanvasTexture(imgToCanvas(img));
    crackTextures.push(configSimple(tex));
  }

  // ---- 云层（噪声阈值块状云）----
  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = cloudCanvas.height = 64;
  const cl = cloudCanvas.getContext('2d');
  const crand2 = rng(0x5eed);
  const cn = tileNoise(crand2, 8);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      if (cn(x / 64, y / 64) > 0.62) {
        cl.fillStyle = 'rgba(255,255,255,0.92)';
        cl.fillRect(x, y, 1, 1);
      }
    }
  const cloudTexture = configSimple(new THREE.CanvasTexture(cloudCanvas));
  cloudTexture.wrapS = cloudTexture.wrapT = THREE.RepeatWrapping;
  cloudTexture.repeat.set(4, 4);

  return { atlas, atlasTexture, waterTexture, crackTextures, cloudTexture };
}

// ---------- 生物皮肤（全部原创立方风设计）----------

function skinTexture(img) {
  const tex = new THREE.CanvasTexture(imgToCanvas(img));
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// 方框眼睛 + 高光
function drawEyes(img, exs, ey, size, rgb, hiRgb) {
  for (const ex of exs) {
    for (let dy = 0; dy < size; dy++)
      for (let dx = 0; dx < size; dx++) {
        const edge = dx === 0 || dy === 0 || dx === size - 1 || dy === size - 1;
        const c = edge ? rgb.map((v) => v + 26) : rgb;
        img.set(ex + dx, ey + dy, c[0], c[1], c[2]);
      }
    const hs = Math.max(2, (size / 3) | 0);
    for (let dy = 0; dy < hs; dy++)
      for (let dx = 0; dx < hs; dx++) img.set(ex + 2 + dx, ey + 2 + dy, hiRgb[0], hiRgb[1], hiRgb[2]);
  }
}

function mkSkin(seed, stops, decorate, faceFn) {
  const mk = (withFace, s) => {
    const img = new Img();
    const rand = rng(s);
    fillRamp(img, rand, stops, { period: 8, octaves: 3 });
    if (decorate) decorate(img, rand);
    grain(img, rand, 8);
    if (withFace && faceFn) faceFn(img, rand);
    return skinTexture(img);
  };
  return { bodyTex: mk(false, seed), faceTex: mk(true, seed ^ 0x5f5f5f) };
}

export function createMobSkins() {
  // 硫磺立方：黄色晶体 + 大眼微笑
  const sulfurcube = mkSkin(
    0xbeef01,
    ['#9c841f', '#c9ab2b', '#e0c945', '#eddb5f'],
    (img, rand) => {
      for (let i = 0; i < 12; i++) {
        const x = (rand() * T) | 0, y = (rand() * T) | 0;
        img.set(x, y, 255, 247, 176);
        img.add(x, y + 1, -26);
      }
    },
    (img) => {
      drawEyes(img, [14, 40], 22, 10, [46, 37, 12], [240, 240, 235]);
      for (let dx = 0; dx < 12; dx++) {
        const y = 44 + Math.round(Math.sin((dx / 11) * Math.PI) * 2);
        img.set(26 + dx, y, 46, 37, 12);
        img.set(26 + dx, y + 1, 46, 37, 12);
      }
    }
  );

  // 野猪：棕褐皮毛 + 粉鼻吻
  const boar = mkSkin(
    0xb0a401,
    ['#4a3322', '#6a4a30', '#7d583a', '#8d6644'],
    (img, rand) => {
      // 鬃毛短纹
      for (let i = 0; i < 60; i++) {
        const x = (rand() * T) | 0, y = (rand() * T) | 0;
        for (let j = 0; j < 3; j++) img.add(x, y + j, -18);
      }
    },
    (img) => {
      drawEyes(img, [12, 44], 18, 8, [30, 22, 14], [235, 230, 220]);
      // 猪鼻：粉色方吻 + 鼻孔
      for (let dy = 0; dy < 12; dy++)
        for (let dx = 0; dx < 18; dx++) {
          const edge = dx === 0 || dy === 0 || dx === 17 || dy === 11;
          img.set(23 + dx, 34 + dy, edge ? 150 : 197, edge ? 92 : 128, edge ? 90 : 124);
        }
      for (const nx of [28, 36]) {
        img.set(nx, 39, 110, 60, 60); img.set(nx + 1, 39, 110, 60, 60);
        img.set(nx, 40, 110, 60, 60); img.set(nx + 1, 40, 110, 60, 60);
      }
    }
  );

  // 绒球羊：奶白卷毛 + 温和脸
  const fluff = mkSkin(
    0xf1eece,
    ['#cfc9bc', '#e2ddd2', '#efeae0', '#f7f3ea'],
    (img, rand) => {
      const curl = tileNoise(rand, 16);
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          const c = curl(x / T, y / T);
          if (c > 0.68) img.add(x, y, 10);
          else if (c < 0.34) img.add(x, y, -14);
        }
    },
    (img) => {
      // 浅褐面部块
      for (let dy = 0; dy < 26; dy++)
        for (let dx = 0; dx < 30; dx++) img.set(17 + dx, 20 + dy, 214, 190, 166);
      drawEyes(img, [20, 38], 26, 7, [40, 32, 26], [240, 238, 232]);
      for (let dx = 0; dx < 8; dx++) img.set(28 + dx, 40, 120, 90, 72);
    }
  );

  // 夜噬怪：灰绿腐坏色 + 发光竖眼
  const ghoul = mkSkin(
    0x6e0511,
    ['#2c3a2e', '#3c4f3c', '#4a614a', '#586f54'],
    (img, rand) => {
      for (let i = 0; i < 26; i++) {
        const x = (rand() * T) | 0, y = (rand() * T) | 0;
        img.add(x, y, -28);
        img.add(x + 1, y, -20);
      }
    },
    (img) => {
      // 发光黄眼（窄高）
      for (const ex of [18, 38]) {
        for (let dy = 0; dy < 9; dy++)
          for (let dx = 0; dx < 7; dx++) img.set(ex + dx, 12 + dy, 214, 224, 120);
        img.set(ex + 3, 15, 90, 100, 40); img.set(ex + 3, 16, 90, 100, 40);
      }
      // 咧开的暗嘴
      for (let dx = 0; dx < 22; dx++) {
        img.set(21 + dx, 30, 24, 28, 20);
        if (dx % 4 < 2) img.set(21 + dx, 31, 24, 28, 20);
      }
    }
  );

  // 硫磺爆虫：暗橄榄警戒色 + 红怒目锯齿嘴
  const burster = mkSkin(
    0xacdc99,
    ['#5a5518', '#6f6a1e', '#837b22', '#968d2a'],
    (img, rand) => {
      const blotch = tileNoise(rand, 4);
      for (let y = 0; y < T; y++)
        for (let x = 0; x < T; x++) {
          if (blotch(x / T, y / T) > 0.68) img.tint(x, y, 24, 8, -6);
        }
    },
    (img) => {
      // 斜怒眼（红）
      for (const [ex, flip] of [[14, 1], [40, -1]]) {
        for (let dy = 0; dy < 7; dy++)
          for (let dx = 0; dx < 9; dx++) {
            if (flip * (dx - dy) < -3) continue; // 斜切
            img.set(ex + dx, 20 + dy, 190, 44, 34);
          }
      }
      // 锯齿嘴
      for (let dx = 0; dx < 24; dx++) {
        const y = 40 + (dx % 6 < 3 ? 0 : 3);
        img.set(20 + dx, y, 30, 26, 10);
        img.set(20 + dx, y + 1, 30, 26, 10);
      }
    }
  );

  return { sulfurcube, boar, fluff, ghoul, burster };
}

// ---------- 食物物品：平面像素图标 + 掉落物贴图 ----------

function paintMeat(img) {
  // 椭圆牛排：深棕焦边 + 浅色油花
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const dx = (x - 32) / 26, dy = (y - 34) / 18;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      let c = d > 0.72 ? [94, 44, 28] : [158, 74, 46];
      if (((x * 7 + y * 13) % 29) < 4 && d < 0.6) c = [214, 160, 120]; // 油花
      img.set(x, y, c[0], c[1], c[2]);
    }
  // 骨头柄
  for (let i = 0; i < 10; i++) {
    img.set(50 + i * 0.6, 18 - i * 0.8, 232, 226, 208);
    img.set(51 + i * 0.6, 18 - i * 0.8, 232, 226, 208);
  }
}

function paintApple(img) {
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const dx = (x - 32) / 20, dy = (y - 36) / 20;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      let c = d > 0.78 ? [138, 26, 22] : [196, 44, 36];
      if (dx < -0.25 && dy < -0.15 && d < 0.6) c = [238, 120, 104]; // 高光
      img.set(x, y, c[0], c[1], c[2]);
    }
  for (let i = 0; i < 8; i++) img.set(32, 8 + i, 92, 62, 30);   // 果柄
  for (let dy = 0; dy < 5; dy++)                                 // 叶子
    for (let dx = 0; dx < 9; dx++)
      if (dx + dy < 9) img.set(35 + dx, 8 + dy, 74, 128, 52);
}

function paintRotten(img) {
  const rand = rng(0x707707);
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const dx = (x - 32) / 24, dy = (y - 34) / 17;
      const warp = Math.sin(x * 0.4) * 0.12 + Math.cos(y * 0.5) * 0.1;
      if (dx * dx + dy * dy + warp > 1) continue;
      let c = [110, 96, 48];
      if (rand() < 0.18) c = [76, 88, 40];
      if (rand() < 0.06) c = [140, 118, 70];
      img.set(x, y, c[0], c[1], c[2]);
    }
}

// ---------- 工具像素图标（原创设计）----------

// 方头刷子画粗线段
function thickLine(img, x0, y0, x1, y1, w, rgb, edgeRgb) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) + 1;
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = y0 + ((y1 - y0) * i) / steps;
    for (let dy = 0; dy < w; dy++)
      for (let dx = 0; dx < w; dx++) {
        const edge = dx === 0 || dy === 0 || dx === w - 1 || dy === w - 1;
        const c = edge && edgeRgb ? edgeRgb : rgb;
        img.set(x + dx - w / 2, y + dy - w / 2, c[0], c[1], c[2]);
      }
  }
}

const HANDLE = [125, 90, 50];
const HANDLE_DARK = [93, 66, 36];
const MATERIALS = {
  wood: { main: [168, 133, 90], dark: [125, 97, 52] },
  stone: { main: [154, 154, 154], dark: [111, 111, 111] },
  iron: { main: [226, 228, 234], dark: [159, 163, 173] },
  gold: { main: [244, 208, 88], dark: [190, 148, 40] },
  gem: { main: [138, 228, 230], dark: [58, 168, 178] },
};

function paintTool(cls, mat) {
  const M = MATERIALS[mat];
  return (img) => {
    if (cls === 'sword') {
      // 长刃 + 护手 + 短柄
      thickLine(img, 14, 50, 10, 56, 7, HANDLE, HANDLE_DARK);
      thickLine(img, 24, 44, 18, 50, 8, [70, 50, 28], null);
      thickLine(img, 20, 38, 30, 48, 6, M.dark, null); // 护手斜杠
      thickLine(img, 46, 12, 24, 34, 9, M.main, M.dark);
      thickLine(img, 52, 8, 44, 16, 7, M.main, M.dark); // 剑尖
      return;
    }
    // 共用斜柄
    thickLine(img, 40, 24, 14, 52, 7, HANDLE, HANDLE_DARK);
    if (cls === 'pickaxe') {
      // 弧形双尖镐头
      thickLine(img, 10, 30, 30, 12, 7, M.main, M.dark);
      thickLine(img, 30, 12, 52, 22, 7, M.main, M.dark);
      thickLine(img, 8, 36, 12, 28, 6, M.dark, null);
      thickLine(img, 52, 22, 55, 30, 6, M.dark, null);
    } else if (cls === 'axe') {
      // 单侧宽刃
      for (let dy = 0; dy < 20; dy++)
        for (let dx = 0; dx < 15 - (dy > 13 ? (dy - 13) * 2 : 0); dx++) {
          const edge = dx < 2 || dy < 2 || dy > 17;
          const c = edge ? M.dark : M.main;
          img.set(30 + dx, 8 + dy, c[0], c[1], c[2]);
        }
      thickLine(img, 34, 24, 42, 16, 6, M.dark, null);
    } else {
      // 锹：圆角铲头
      for (let dy = 0; dy < 18; dy++)
        for (let dx = 0; dx < 14; dx++) {
          if (dy > 13 && (dx < dy - 13 || dx > 13 - (dy - 13))) continue; // 收尖
          const edge = dx < 2 || dx > 11 || dy < 2;
          const c = edge ? M.dark : M.main;
          img.set(40 + dx - 8, 6 + dy, c[0], c[1], c[2]);
        }
    }
  };
}

function paintStick(img) {
  thickLine(img, 44, 16, 18, 46, 7, HANDLE, HANDLE_DARK);
}

// 锭：梯形锭体 + 亮顶面（铁/金共用）
function paintIngot(top, body, edge) {
  return (img) => {
    for (let dy = 0; dy < 18; dy++) {
      const inset = 6 - ((dy / 3) | 0);
      for (let dx = inset; dx < 44 - inset; dx++) {
        const isTop = dy < 5;
        const isEdge = dy === 0 || dy === 17 || dx === inset || dx === 43 - inset;
        let c = isTop ? top : body;
        if (isEdge) c = edge;
        img.set(10 + dx, 26 + dy, c[0], c[1], c[2]);
      }
    }
  };
}

function paintCoal(img) {
  // 不规则煤块：多边形黑团 + 灰高光棱
  const rnd = rng(0xc0a1);
  for (let y = 14; y < 52; y++)
    for (let x = 12; x < 52; x++) {
      const dx = (x - 32) / 19, dy = (y - 33) / 17;
      const warp = Math.sin(x * 0.5) * 0.14 + Math.cos(y * 0.42) * 0.12;
      if (dx * dx + dy * dy + warp > 1) continue;
      let c = [38, 38, 42];
      if (rnd() < 0.12) c = [58, 58, 64];
      if (rnd() < 0.05) c = [92, 92, 100];
      img.set(x, y, c[0], c[1], c[2]);
    }
  for (let i = 0; i < 5; i++) img.set(22 + i, 24 - i, 110, 110, 120); // 高光棱线
}

function paintGem(img) {
  // 菱形宝石：亮顶刻面 + 深色底刻面
  for (let y = 0; y < 40; y++) {
    const half = y < 14 ? 6 + y * 1.6 : Math.max(0, 28 - (y - 14) * 1.1);
    for (let dx = -half; dx <= half; dx++) {
      const facet = Math.abs(dx) > half - 5 || y < 5;
      let c = y < 14 ? (facet ? [196, 250, 250] : [126, 230, 230]) : (facet ? [58, 168, 178] : [88, 200, 208]);
      img.set(32 + dx, 12 + y, c[0], c[1], c[2]);
    }
  }
  img.set(26, 18, 255, 255, 255); img.set(27, 18, 255, 255, 255); img.set(26, 19, 255, 255, 255);
}

export function createItemAssets() {
  const defs = {
    100: paintMeat, 101: paintApple, 102: paintRotten,
    103: paintStick,
    104: paintIngot([236, 238, 244], [204, 208, 218], [150, 154, 166]),
    105: paintCoal,
    106: paintIngot([250, 224, 120], [232, 190, 70], [178, 138, 36]),
    107: paintGem,
    110: paintTool('pickaxe', 'wood'), 111: paintTool('axe', 'wood'), 112: paintTool('shovel', 'wood'), 113: paintTool('sword', 'wood'),
    114: paintTool('pickaxe', 'stone'), 115: paintTool('axe', 'stone'), 116: paintTool('shovel', 'stone'), 117: paintTool('sword', 'stone'),
    118: paintTool('pickaxe', 'iron'), 119: paintTool('axe', 'iron'), 120: paintTool('shovel', 'iron'), 121: paintTool('sword', 'iron'),
    122: paintTool('pickaxe', 'gold'), 123: paintTool('axe', 'gold'), 124: paintTool('shovel', 'gold'), 125: paintTool('sword', 'gold'),
    126: paintTool('pickaxe', 'gem'), 127: paintTool('axe', 'gem'), 128: paintTool('shovel', 'gem'), 129: paintTool('sword', 'gem'),
  };
  const icons = {}, textures = {};
  for (const [id, painter] of Object.entries(defs)) {
    const img = new Img(); // 透明底
    painter(img);
    const canvas = imgToCanvas(img);
    icons[id] = canvas.toDataURL('image/png');
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    textures[id] = tex;
  }
  return { icons, textures };
}

// 从图集取某个 tile 内容区的若干像素颜色（挖掘粒子用）
export function samplePalette(atlasCanvas, tile, count = 8) {
  const ctx = atlasCanvas.getContext('2d');
  const ox = (tile % COLS) * CELL + PAD;
  const oy = ((tile / COLS) | 0) * CELL + PAD;
  const data = ctx.getImageData(ox, oy, T, T).data;
  const rand = rng(tile * 31 + 7);
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = (rand() * T) | 0, y = (rand() * T) | 0;
    const o = (y * T + x) * 4;
    out.push([data[o] / 255, data[o + 1] / 255, data[o + 2] / 255]);
  }
  return out;
}

// 等距立方体方块图标：纯 2D Canvas 从图集裁面 + 平行四边形变换绘制。
// 不依赖 WebGL / preserveDrawingBuffer / WebGL-toDataURL，
// 避免 iOS Safari 与部分安卓 WebView 导出空白图的兼容性问题。
export function renderBlockIcons(blockIds, PROPS, atlasCanvas) {
  const size = 96;
  const s = 86;                 // 立方体对角尺寸
  const cx = size / 2, cy = size / 2;
  const w = s / 2, hh = s / 4, d = s / 2;
  // 顶点：N 上、E 右、S 中、W 左
  const N = [cx, cy - s / 2], E = [cx + w, cy - hh], S = [cx, cy], W = [cx - w, cy - hh];

  // tile 在图集中的内容区原点
  const srcXY = (tile) => [(tile % COLS) * CELL + PAD, ((tile / COLS) | 0) * CELL + PAD];

  // 单面贴图 + 明暗（先画到临时画布，用 source-atop 保留透明区不被压暗）
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = T;
  const tctx = tmp.getContext('2d');

  function face(ctx, tile, origin, bx, by, shade) {
    const [sx, sy] = srcXY(tile);
    tctx.save();
    tctx.globalCompositeOperation = 'source-over';
    tctx.clearRect(0, 0, T, T);
    tctx.drawImage(atlasCanvas, sx, sy, T, T, 0, 0, T, T);
    if (shade > 0) {
      tctx.globalCompositeOperation = 'source-atop';
      tctx.fillStyle = `rgba(12, 10, 20, ${shade})`;
      tctx.fillRect(0, 0, T, T);
    }
    tctx.restore();
    ctx.setTransform(bx[0] / T, bx[1] / T, by[0] / T, by[1] / T, origin[0], origin[1]);
    ctx.drawImage(tmp, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  const icons = {};
  for (const id of blockIds) {
    const tiles = PROPS[id].tiles;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // 顶面（原点 N，基向量 N→E / N→W）、左面（W→S / 垂直）、右面（S→E / 垂直）
    face(ctx, tiles.top, N, [E[0] - N[0], E[1] - N[1]], [W[0] - N[0], W[1] - N[1]], 0);
    face(ctx, tiles.side, W, [S[0] - W[0], S[1] - W[1]], [0, d], 0.34);
    face(ctx, tiles.side, S, [E[0] - S[0], E[1] - S[1]], [0, d], 0.16);
    icons[id] = c.toDataURL('image/png');
  }
  return icons;
}
