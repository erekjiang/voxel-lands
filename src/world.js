// 体素世界：chunk 数据生成（噪声地形 + 树木 + 水域）、按需流式加载、
// 每 chunk 合并几何体（只输出可见面，带 4 点 AO 与水面下沉），编辑记录用于存档。

import * as THREE from 'three';
import { BLOCK, PROPS, OPAQUE_TABLE } from './blocks.js';
import { makeNoise } from './noise.js';
import { tileUV } from './textures.js';

// 复用的网格构建缓冲：按面写入定长 TypedArray，避免每次构建产生大量数组垃圾
class MeshBuilder {
  constructor(cap = 4096) {
    this.alloc(cap);
  }
  alloc(cap) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 12);
    this.norm = new Float32Array(cap * 12);
    this.uv = new Float32Array(cap * 8);
    this.col = new Float32Array(cap * 12);
    this.idx = new Uint32Array(cap * 6);
    this.f = 0; // 已写入面数
  }
  reset() { this.f = 0; }
  ensure() {
    if (this.f >= this.cap) {
      const { pos, norm, uv, col, idx } = this;
      this.alloc(this.cap * 2);
      this.pos.set(pos); this.norm.set(norm); this.uv.set(uv);
      this.col.set(col); this.idx.set(idx);
    }
  }
  toGeometry() {
    if (this.f === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.f * 12), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.norm.slice(0, this.f * 12), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, this.f * 8), 2));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, this.f * 12), 3));
    geo.setIndex(new THREE.BufferAttribute(this.idx.slice(0, this.f * 6), 1));
    geo.computeBoundingSphere();
    return geo;
  }
}

const BUILDERS = {
  opaque: new MeshBuilder(4096),
  cutout: new MeshBuilder(512),
  water: new MeshBuilder(1024),
};

export const CHUNK = 16;
export const HEIGHT = 64;
export const SEA = 19;

// 六个面：dir 法线；corners 顺序配合索引 (0,1,2, 2,1,3)（来自标准体素面表）
const FACES = [
  { dir: [-1, 0, 0], corners: [ { pos: [0, 1, 0], uv: [0, 1] }, { pos: [0, 0, 0], uv: [0, 0] }, { pos: [0, 1, 1], uv: [1, 1] }, { pos: [0, 0, 1], uv: [1, 0] } ] },
  { dir: [1, 0, 0],  corners: [ { pos: [1, 1, 1], uv: [0, 1] }, { pos: [1, 0, 1], uv: [0, 0] }, { pos: [1, 1, 0], uv: [1, 1] }, { pos: [1, 0, 0], uv: [1, 0] } ] },
  { dir: [0, -1, 0], corners: [ { pos: [1, 0, 1], uv: [1, 0] }, { pos: [0, 0, 1], uv: [0, 0] }, { pos: [1, 0, 0], uv: [1, 1] }, { pos: [0, 0, 0], uv: [0, 1] } ] },
  { dir: [0, 1, 0],  corners: [ { pos: [0, 1, 1], uv: [1, 1] }, { pos: [1, 1, 1], uv: [0, 1] }, { pos: [0, 1, 0], uv: [1, 0] }, { pos: [1, 1, 0], uv: [0, 0] } ] },
  { dir: [0, 0, -1], corners: [ { pos: [1, 0, 0], uv: [0, 0] }, { pos: [0, 0, 0], uv: [1, 0] }, { pos: [1, 1, 0], uv: [0, 1] }, { pos: [0, 1, 0], uv: [1, 1] } ] },
  { dir: [0, 0, 1],  corners: [ { pos: [0, 0, 1], uv: [0, 0] }, { pos: [1, 0, 1], uv: [1, 0] }, { pos: [0, 1, 1], uv: [0, 1] }, { pos: [1, 1, 1], uv: [1, 1] } ] },
];

// 预计算每个角点的 AO 采样偏移（side1 / side2 / corner）
for (const f of FACES) {
  const d = f.dir;
  const tAxes = [];
  for (let a = 0; a < 3; a++) if (d[a] === 0) tAxes.push(a);
  for (const c of f.corners) {
    const u = c.pos[tAxes[0]] * 2 - 1;
    const v = c.pos[tAxes[1]] * 2 - 1;
    c.s1 = [...d]; c.s1[tAxes[0]] += u;
    c.s2 = [...d]; c.s2[tAxes[1]] += v;
    c.cn = [...d]; c.cn[tAxes[0]] += u; c.cn[tAxes[1]] += v;
  }
}

const AO_BRIGHT = [0.5, 0.72, 0.87, 1.0];

export class World {
  constructor(scene, materials, seed) {
    this.scene = scene;
    this.materials = materials;
    this.seed = seed | 0;
    this.noise = makeNoise(this.seed);
    this.chunks = new Map();   // "cx,cz" -> { cx, cz, data, meshes, hasMesh }
    this.edits = new Map();    // "cx,cz" -> Map(localIndex -> blockId)
    this.queue = [];
    this.lastCX = null;
    this.lastCZ = null;
    this.viewDist = 5;         // chunk 半径
    this.dirtySave = false;
    this.firstLoadDone = false;
  }

  key(cx, cz) { return cx + ',' + cz; }

  // ---------- 地形函数（纯函数，确定性） ----------

  groundHeight(x, z) {
    const n = this.noise;
    const base = n.fbm(x * 0.005, z * 0.005, 4);
    const hills = n.fbm(x * 0.022 + 133.7, z * 0.022 + 71.3, 3);
    const m = n.fbm(x * 0.009 + 511.1, z * 0.009 - 322.8, 4);
    let h = 9 + base * 25 + hills * 6;
    const mm = Math.max(0, m - 0.56) / 0.44;
    h += mm * mm * 26; // 偶发山地
    return Math.max(2, Math.min(HEIGHT - 8, h | 0));
  }

  // 硫磺洞穴群系（2D 区域掩码）
  sulfurBiomeAt(x, z) {
    return this.noise.fbm(x * 0.004 + 777.7, z * 0.004 - 888.8, 3) > 0.63;
  }

  // 全局对齐的洞穴噪声格点（步长 4），保证跨 chunk 结果一致
  latticeVal(ix, iy, iz) {
    return this.noise.fbm3(ix * 0.24, iy * 0.36, iz * 0.24, 3);
  }

  caveThreshold(y, h) {
    // 接近地表时阈值升高：洞口更少但存在
    return 0.66 + Math.max(0, y - (h - 8)) * 0.012;
  }

  // 世界坐标版本（树/泉/生物生成用，与 chunk 内插值完全一致）
  carvedAt(x, y, z, h) {
    if (y < 2 || y > h) return false;
    const x0 = Math.floor(x / 4), y0 = Math.floor(y / 4), z0 = Math.floor(z / 4);
    const fx = x / 4 - x0, fy = y / 4 - y0, fz = z / 4 - z0;
    const L = (a, b, t) => a + (b - a) * t;
    const v = L(
      L(L(this.latticeVal(x0, y0, z0), this.latticeVal(x0 + 1, y0, z0), fx),
        L(this.latticeVal(x0, y0 + 1, z0), this.latticeVal(x0 + 1, y0 + 1, z0), fx), fy),
      L(L(this.latticeVal(x0, y0, z0 + 1), this.latticeVal(x0 + 1, y0, z0 + 1), fx),
        L(this.latticeVal(x0, y0 + 1, z0 + 1), this.latticeVal(x0 + 1, y0 + 1, z0 + 1), fx), fy),
      fz
    );
    return v > this.caveThreshold(y, h);
  }

  // 返回树干高度（0 = 无树）
  treeHeight(x, z, h) {
    if (h <= SEA + 1 || h + 9 >= HEIGHT) return 0;
    if (this.sulfurBiomeAt(x, z)) return 0; // 硫磺群系寸草不生
    const f = this.noise.fbm(x * 0.014 + 937.7, z * 0.014 + 413.9, 2);
    const p = f > 0.56 ? 0.035 : f > 0.48 ? 0.006 : 0;
    if (p === 0) return 0;
    if (this.noise.hash(x * 3 + 7, z * 3 - 11) >= p) return 0;
    if (this.carvedAt(x, h, z, h)) return 0; // 地表被洞口挖穿则不长树
    return 4 + ((this.noise.hash(x * 5 + 1, z * 5 + 3) * 3) | 0);
  }

  findSpawn() {
    for (let d = 0; d < 300; d += 3) {
      const cands = d === 0 ? [[0, 0]] : [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d]];
      for (const [x, z] of cands) {
        const h = this.groundHeight(x, z);
        if (h > SEA + 1 && h < 44 && !this.treeHeight(x, z, h) &&
            !this.sulfurBiomeAt(x, z) && !this.carvedAt(x, h, z, h)) {
          return new THREE.Vector3(x + 0.5, h + 1.02, z + 0.5);
        }
      }
    }
    return new THREE.Vector3(0.5, this.groundHeight(0, 0) + 2, 0.5);
  }

  // 找最近的硫磺群系中心（HUD 罗盘提示用）
  findNearestSulfur(fromX, fromZ, maxDist = 900) {
    for (let d = 0; d <= maxDist; d += 24) {
      const steps = d === 0 ? 1 : Math.max(8, ((d * Math.PI * 2) / 24) | 0);
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = Math.round(fromX + Math.cos(a) * d);
        const z = Math.round(fromZ + Math.sin(a) * d);
        if (this.sulfurBiomeAt(x, z)) return { x, z };
      }
    }
    return null;
  }

  // ---------- chunk 数据 ----------

  genData(cx, cz) {
    const data = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    // 周边 20x20 高度缓存（含树冠 2 格余量）
    const hs = new Int16Array(20 * 20);
    for (let dx = 0; dx < 20; dx++)
      for (let dz = 0; dz < 20; dz++)
        hs[dx * 20 + dz] = this.groundHeight(cx * 16 + dx - 2, cz * 16 + dz - 2);

    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        const h = hs[(x + 2) * 20 + (z + 2)];
        const sandy = h <= SEA + 1;
        const col = x + z * 16;
        const gx = cx * 16 + x, gz = cz * 16 + z;
        const snowy = !sandy && h >= 42; // 高山雪顶
        // 矿簇为 2x2x2，同一列内每两层结果相同：按 y>>1 缓存哈希结果
        let lastPair = -1, pairOre = 0;
        for (let y = 0; y <= h; y++) {
          let id;
          if (y === 0) id = BLOCK.BEDROCK;
          else if (y < h - 3) {
            const pair = y >> 1;
            if (pair !== lastPair) {
              lastPair = pair;
              pairOre = this.orePick(gx >> 1, pair, gz >> 1, y);
            }
            id = pairOre || BLOCK.STONE;
          }
          else if (y < h) id = sandy ? BLOCK.SAND : BLOCK.DIRT;
          else id = sandy ? BLOCK.SAND : snowy ? BLOCK.SNOW : BLOCK.GRASS;
          data[col + y * 256] = id;
        }
        for (let y = h + 1; y <= SEA; y++) data[col + y * 256] = BLOCK.WATER;
      }
    }

    this.carveCaves(data, cx, cz, hs);

    // 树（考虑跨 chunk 树冠：候选点扩到 -2..17）
    for (let tx = -2; tx < 18; tx++) {
      for (let tz = -2; tz < 18; tz++) {
        const gx = cx * 16 + tx, gz = cz * 16 + tz;
        const h = hs[(tx + 2) * 20 + (tz + 2)];
        const th = this.treeHeight(gx, gz, h);
        if (th) this.stampTree(data, cx, cz, gx, gz, h, th);
      }
    }

    // 应用玩家历史修改
    const em = this.edits.get(this.key(cx, cz));
    if (em) for (const [i, id] of em) data[i] = id;

    return data;
  }

  // 洞穴雕刻 + 硫磺群系涂层 + 地表硫磺泉
  carveCaves(data, cx, cz, hs) {
    // 本地格点缓存：全局对齐（ix = cx*4-1 .. cx*4+5），与 carvedAt 完全一致
    const LX = 7, LY = HEIGHT / 4 + 1;
    const lat = new Float32Array(LX * LY * LX);
    const ox = cx * 4 - 1, oz = cz * 4 - 1;
    for (let ix = 0; ix < LX; ix++)
      for (let iy = 0; iy < LY; iy++)
        for (let iz = 0; iz < LX; iz++)
          lat[(ix * LY + iy) * LX + iz] = this.latticeVal(ox + ix, iy, oz + iz);

    const L = (a, b, t) => a + (b - a) * t;
    // lx, lz 允许 -1..16（涂层要看邻格）
    const noiseAt = (lx, y, lz) => {
      const gx = cx * 16 + lx, gz = cz * 16 + lz;
      const x0 = Math.floor(gx / 4), y0 = Math.floor(y / 4), z0 = Math.floor(gz / 4);
      const ax = x0 - ox, ay = y0, az = z0 - oz;
      const fx = gx / 4 - x0, fy = y / 4 - y0, fz = gz / 4 - z0;
      const V = (dx, dy, dz) => lat[((ax + dx) * LY + (ay + dy)) * LX + (az + dz)];
      return L(
        L(L(V(0, 0, 0), V(1, 0, 0), fx), L(V(0, 1, 0), V(1, 1, 0), fx), fy),
        L(L(V(0, 0, 1), V(1, 0, 1), fx), L(V(0, 1, 1), V(1, 1, 1), fx), fy),
        fz
      );
    };

    // 挖空掩码（含 ±1 邻带），水下/沙滩列不挖以免破坏水体
    const MW = 18;
    const carved = new Uint8Array(MW * MW * HEIGHT);
    const hOf = (lx, lz) => hs[(lx + 2) * 20 + (lz + 2)];
    for (let lx = -1; lx <= 16; lx++) {
      for (let lz = -1; lz <= 16; lz++) {
        const h = hOf(lx, lz);
        if (h <= SEA + 1) continue;
        for (let y = 2; y <= h; y++) {
          if (noiseAt(lx, y, lz) > this.caveThreshold(y, h)) {
            carved[(lx + 1) + (lz + 1) * MW + y * MW * MW] = 1;
          }
        }
      }
    }
    const isCarved = (lx, y, lz) =>
      y >= 0 && y < HEIGHT && carved[(lx + 1) + (lz + 1) * MW + y * MW * MW] === 1;

    // 群系掩码（每列）
    const biome = new Uint8Array(16 * 16);
    for (let lx = 0; lx < 16; lx++)
      for (let lz = 0; lz < 16; lz++)
        biome[lx + lz * 16] = this.sulfurBiomeAt(cx * 16 + lx, cz * 16 + lz) ? 1 : 0;

    // 挖空
    for (let lx = 0; lx < 16; lx++) {
      for (let lz = 0; lz < 16; lz++) {
        for (let y = 2; y < HEIGHT; y++) {
          if (isCarved(lx, y, lz)) data[lx + lz * 16 + y * 256] = BLOCK.AIR;
        }
      }
    }

    // 硫磺群系涂层：洞壁按高度分带（硫磺/朱砂交替），洞底铺硫磺
    for (let lx = 0; lx < 16; lx++) {
      for (let lz = 0; lz < 16; lz++) {
        if (!biome[lx + lz * 16]) continue;
        const gx = cx * 16 + lx, gz = cz * 16 + lz;
        const h = hOf(lx, lz);
        for (let y = 1; y <= h; y++) {
          const j = lx + lz * 16 + y * 256;
          const id = data[j];
          if (id !== BLOCK.STONE && id !== BLOCK.DIRT) continue;
          const nearCave =
            isCarved(lx + 1, y, lz) || isCarved(lx - 1, y, lz) ||
            isCarved(lx, y, lz + 1) || isCarved(lx, y, lz - 1) ||
            isCarved(lx, y + 1, lz) || isCarved(lx, y - 1, lz);
          if (!nearCave) continue;
          if (isCarved(lx, y + 1, lz)) {
            data[j] = BLOCK.SULFUR; // 洞底
          } else {
            const band = y % 6 < 2;
            const jitter = this.noise.hash(gx * 11 + y * 3, gz * 11 - y * 5) < 0.18;
            data[j] = (band !== jitter) ? BLOCK.CINNABAR : BLOCK.SULFUR;
          }
        }
        // 地表硫磺斑块（群系标记）
        const top = lx + lz * 16 + h * 256;
        if (h > SEA + 1 && data[top] === BLOCK.GRASS &&
            this.noise.hash(gx * 13 + 5, gz * 13 - 3) < 0.1) {
          data[top] = BLOCK.SULFUR;
        }
      }
    }

    // 地表硫磺泉：群系内低概率生成，硫磺镶边 + 中心浅水（跨界候选 -2..17）
    for (let tx = -2; tx < 18; tx++) {
      for (let tz = -2; tz < 18; tz++) {
        const gx = cx * 16 + tx, gz = cz * 16 + tz;
        if (this.noise.hash(gx * 17 + 923, gz * 17 - 411) >= 0.004) continue;
        if (!this.sulfurBiomeAt(gx, gz)) continue;
        const h = hOf(tx, tz);
        if (h <= SEA + 2 || this.carvedAt(gx, h, gz, h)) continue;
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            const lx = tx + dx, lz = tz + dz;
            if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
            if (Math.abs(hOf(lx, lz) - h) > 1) continue;
            const r = Math.abs(dx) + Math.abs(dz);
            const col = lx + lz * 16;
            if (r <= 1) {
              data[col + h * 256] = BLOCK.WATER;      // 泉眼
              data[col + (h - 1) * 256] = BLOCK.SULFUR;
            } else if (r <= 3) {
              data[col + h * 256] = BLOCK.SULFUR;     // 镶边
            }
          }
        }
      }
    }
  }

  stampTree(data, cx, cz, gx, gz, h, th) {
    const setLocal = (wx, wy, wz, id, keepExisting) => {
      const lx = wx - cx * 16, lz = wz - cz * 16;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || wy < 1 || wy >= HEIGHT) return;
      const j = lx + lz * 16 + wy * 256;
      if (keepExisting && data[j] !== BLOCK.AIR) return;
      data[j] = id;
    };
    const topY = h + th;
    for (let ly = topY - 2; ly <= topY + 1; ly++) {
      const rad = ly >= topY ? 1 : 2;
      for (let dx = -rad; dx <= rad; dx++) {
        for (let dz = -rad; dz <= rad; dz++) {
          if (dx === 0 && dz === 0 && ly <= topY) continue; // 树干位置
          const corner = Math.abs(dx) === rad && Math.abs(dz) === rad;
          if (corner) {
            if (ly === topY + 1) continue; // 顶层十字形
            if (this.noise.hash(gx * 7 + dx + ly * 13, gz * 7 + dz - ly * 17) < 0.4) continue;
          }
          setLocal(gx + dx, ly, gz + dz, BLOCK.LEAVES, true);
        }
      }
    }
    for (let y = h + 1; y <= topY; y++) setLocal(gx, y, gz, BLOCK.LOG, false);
  }

  // 矿脉与矿囊：2x2x2 团簇哈希，稀有度递增、越深越多。
  // 深度阈值均为偶数，与 y>>1 团簇对齐，保证簇内一致。
  orePick(cxx, cyy, czz, y) {
    const n = this.noise;
    if (y < 6 && n.hash3(cxx + 91, cyy + 77, czz - 55) < 0.05) return BLOCK.OBSIDIAN;
    if (y < 10 && n.hash3(cxx - 31, cyy + 17, czz + 43) < 0.010) return BLOCK.GEM_ORE;
    if (y < 16 && n.hash3(cxx + 53, cyy - 29, czz + 19) < 0.012) return BLOCK.GOLD_ORE;
    if (y < 30 && n.hash3(cxx + 7, cyy - 3, czz + 11) < (y < 16 ? 0.022 : 0.012)) return BLOCK.IRON_ORE;
    if (y < 40 && n.hash3(cxx - 13, cyy + 37, czz - 7) < 0.028) return BLOCK.COAL_ORE;
    if (y < 36 && n.hash3(cxx + 67, cyy + 5, czz + 71) < 0.014) return BLOCK.GRAVEL;
    return 0;
  }

  ensureData(cx, cz) {
    const k = this.key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = { cx, cz, data: this.genData(cx, cz), meshes: [], hasMesh: false };
      this.chunks.set(k, c);
    }
    return c;
  }

  getBlock(x, y, z) {
    if (y < 0) return BLOCK.STONE; // 世界底部当作实体，剔除底面
    if (y >= HEIGHT) return BLOCK.AIR;
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    const c = this.ensureData(cx, cz);
    return c.data[(x - cx * 16) + (z - cz * 16) * 16 + y * 256];
  }

  setBlock(x, y, z, id) {
    if (y < 1 || y >= HEIGHT) return false;
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    const lx = x - cx * 16, lz = z - cz * 16;
    const c = this.ensureData(cx, cz);
    const j = lx + lz * 16 + y * 256;
    if (c.data[j] === id) return false;
    c.data[j] = id;

    const k = this.key(cx, cz);
    let em = this.edits.get(k);
    if (!em) { em = new Map(); this.edits.set(k, em); }
    em.set(j, id);
    this.dirtySave = true;

    // 重建受影响的 chunk（边界修改会影响邻 chunk 的面与 AO）
    const affected = new Set();
    for (const ddx of [-1, 0, 1])
      for (const ddz of [-1, 0, 1])
        affected.add(this.key(Math.floor((x + ddx) / 16), Math.floor((z + ddz) / 16)));
    for (const ak of affected) {
      const ac = this.chunks.get(ak);
      if (ac && ac.hasMesh) this.buildMesh(ac.cx, ac.cz);
    }
    return true;
  }

  // 批量修改（爆炸等）：先写完所有数据再统一重建网格，避免重复重建
  setBlocksBulk(list) {
    const affected = new Set();
    for (const [x, y, z, id] of list) {
      if (y < 1 || y >= HEIGHT) continue;
      const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
      const c = this.ensureData(cx, cz);
      const j = (x - cx * 16) + (z - cz * 16) * 16 + y * 256;
      if (c.data[j] === id) continue;
      c.data[j] = id;
      const k = this.key(cx, cz);
      let em = this.edits.get(k);
      if (!em) { em = new Map(); this.edits.set(k, em); }
      em.set(j, id);
      for (const ddx of [-1, 0, 1])
        for (const ddz of [-1, 0, 1])
          affected.add(this.key(Math.floor((x + ddx) / 16), Math.floor((z + ddz) / 16)));
    }
    if (affected.size === 0) return;
    this.dirtySave = true;
    for (const ak of affected) {
      const ac = this.chunks.get(ak);
      if (ac && ac.hasMesh) this.buildMesh(ac.cx, ac.cz);
    }
  }

  // ---------- 网格构建 ----------

  buildMesh(cx, cz) {
    // 确保 3x3 邻域数据存在（面剔除 + AO 需要）
    const datas = [];
    for (let bx = 0; bx < 3; bx++)
      for (let bz = 0; bz < 3; bz++)
        datas[bx * 3 + bz] = this.ensureData(cx + bx - 1, cz + bz - 1).data;

    const c = this.chunks.get(this.key(cx, cz));
    this.disposeMeshes(c);

    // 局部坐标读取（lx, lz 允许 -16..31）
    const get = (lx, y, lz) => {
      if (y < 0) return BLOCK.STONE;
      if (y >= HEIGHT) return BLOCK.AIR;
      const d = datas[((lx + 16) >> 4) * 3 + ((lz + 16) >> 4)];
      return d[(lx & 15) + (lz & 15) * 16 + y * 256];
    };
    const occl = (lx, y, lz) => OPAQUE_TABLE[get(lx, y, lz)];

    BUILDERS.opaque.reset();
    BUILDERS.cutout.reset();
    BUILDERS.water.reset();

    const data = c.data;
    const aos = [1, 1, 1, 1];
    let i = 0;
    for (let y = 0; y < HEIGHT; y++) {
      for (let z = 0; z < 16; z++) {
        for (let x = 0; x < 16; x++, i++) {
          const id = data[i];
          if (id === BLOCK.AIR) continue;
          const props = PROPS[id];
          const b = BUILDERS[props.bucket];
          const isWater = id === BLOCK.WATER;
          const opaqueSelf = OPAQUE_TABLE[id];
          // 水面块（上方无水）顶面下沉
          const topY = isWater && get(x, y + 1, z) !== BLOCK.WATER ? 0.86 : 1;

          for (let f = 0; f < 6; f++) {
            const face = FACES[f];
            const d = face.dir;
            const nb = get(x + d[0], y + d[1], z + d[2]);
            // 可见性查表：空气可见；不透明或同类邻居剔除
            if (nb !== BLOCK.AIR && (OPAQUE_TABLE[nb] || nb === id)) continue;

            const tile = isWater ? 0 :
              d[1] > 0 ? props.tiles.top : d[1] < 0 ? props.tiles.bottom : props.tiles.side;

            b.ensure();
            const fi = b.f;
            const pv = fi * 12, uvo = fi * 8, io = fi * 6, vo = fi * 4;
            for (let k = 0; k < 4; k++) {
              const cr = face.corners[k];
              const p3 = pv + k * 3;
              b.pos[p3] = x + cr.pos[0];
              b.pos[p3 + 1] = y + (cr.pos[1] === 1 ? topY : 0);
              b.pos[p3 + 2] = z + cr.pos[2];
              b.norm[p3] = d[0]; b.norm[p3 + 1] = d[1]; b.norm[p3 + 2] = d[2];
              if (isWater) {
                b.uv[uvo + k * 2] = cr.uv[0];
                b.uv[uvo + k * 2 + 1] = cr.uv[1];
              } else {
                const t = tileUV(tile, cr.uv[0], cr.uv[1]);
                b.uv[uvo + k * 2] = t[0];
                b.uv[uvo + k * 2 + 1] = t[1];
              }
              let bright = 1;
              if (opaqueSelf) {
                const s1 = occl(x + cr.s1[0], y + cr.s1[1], z + cr.s1[2]);
                const s2 = occl(x + cr.s2[0], y + cr.s2[1], z + cr.s2[2]);
                const co = occl(x + cr.cn[0], y + cr.cn[1], z + cr.cn[2]);
                const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + co);
                aos[k] = ao;
                bright = AO_BRIGHT[ao];
              } else aos[k] = 1;
              b.col[p3] = bright; b.col[p3 + 1] = bright; b.col[p3 + 2] = bright;
            }
            // 依据 AO 选择四边形对角线，避免插值各向异性
            if (aos[0] + aos[3] > aos[1] + aos[2]) {
              b.idx[io] = vo; b.idx[io + 1] = vo + 1; b.idx[io + 2] = vo + 3;
              b.idx[io + 3] = vo; b.idx[io + 4] = vo + 3; b.idx[io + 5] = vo + 2;
            } else {
              b.idx[io] = vo; b.idx[io + 1] = vo + 1; b.idx[io + 2] = vo + 2;
              b.idx[io + 3] = vo + 2; b.idx[io + 4] = vo + 1; b.idx[io + 5] = vo + 3;
            }
            b.f++;
          }
        }
      }
    }

    const matMap = {
      opaque: this.materials.opaque,
      cutout: this.materials.cutout,
      water: this.materials.water,
    };
    for (const name of ['opaque', 'cutout', 'water']) {
      const geo = BUILDERS[name].toGeometry();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, matMap[name]);
      mesh.position.set(cx * 16, 0, cz * 16);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      if (name === 'water') mesh.renderOrder = 1;
      this.scene.add(mesh);
      c.meshes.push(mesh);
    }
    c.hasMesh = true;
  }

  disposeMeshes(c) {
    for (const m of c.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    c.meshes.length = 0;
    c.hasMesh = false;
  }

  // ---------- 流式加载 ----------

  // meshBudget：每帧最多构建的网格数；dataBudget：每帧最多生成的 chunk 数据数。
  // 网格构建前先分帧补齐 3x3 邻域数据，避免一帧内同时生成多块地形造成卡顿尖峰。
  update(px, pz, meshBudget = 1, dataBudget = 3) {
    const ccx = Math.floor(px / 16), ccz = Math.floor(pz / 16);
    if (ccx !== this.lastCX || ccz !== this.lastCZ) {
      this.lastCX = ccx;
      this.lastCZ = ccz;
      const vd = this.viewDist;
      const wanted = [];
      for (let dx = -vd; dx <= vd; dx++) {
        for (let dz = -vd; dz <= vd; dz++) {
          const d2 = dx * dx + dz * dz;
          if (d2 > (vd + 0.5) * (vd + 0.5)) continue;
          const cx = ccx + dx, cz = ccz + dz;
          const c = this.chunks.get(this.key(cx, cz));
          if (!c || !c.hasMesh) wanted.push({ cx, cz, d2 });
        }
      }
      wanted.sort((a, b) => a.d2 - b.d2);
      this.queue = wanted;

      // 卸载远处 chunk 的网格（保留数据缓存）
      for (const c of this.chunks.values()) {
        if (c.hasMesh && Math.max(Math.abs(c.cx - ccx), Math.abs(c.cz - ccz)) > vd + 1) {
          this.disposeMeshes(c);
        }
      }
    }

    let built = 0;
    while (this.queue.length && built < meshBudget) {
      const { cx, cz } = this.queue[0];
      const existing = this.chunks.get(this.key(cx, cz));
      if (existing && existing.hasMesh) {
        this.queue.shift();
        continue;
      }
      // 分帧补齐邻域数据
      let missing = 0;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (this.chunks.has(this.key(cx + dx, cz + dz))) continue;
          if (dataBudget > 0) {
            this.ensureData(cx + dx, cz + dz);
            dataBudget--;
          } else missing++;
        }
      }
      if (missing > 0) break; // 数据预算用尽，下一帧继续
      this.queue.shift();
      this.buildMesh(cx, cz);
      built++;
    }
    if (!this.firstLoadDone && this.queue.length === 0) this.firstLoadDone = true;
  }

  countLoaded() {
    let n = 0;
    for (const c of this.chunks.values()) if (c.hasMesh) n++;
    return n;
  }

  // ---------- 存档 ----------

  serializeEdits() {
    const out = {};
    for (const [k, m] of this.edits) {
      if (m.size === 0) continue;
      const o = {};
      for (const [i, id] of m) o[i] = id;
      out[k] = o;
    }
    return out;
  }

  loadEdits(obj) {
    if (!obj) return;
    for (const [k, o] of Object.entries(obj)) {
      const m = new Map();
      for (const [i, id] of Object.entries(o)) m.set(+i, id);
      this.edits.set(k, m);
    }
  }
}
