// 确定性哈希值噪声（value noise）+ fBm，用于地形生成。
// 同一 seed 下任意坐标的结果完全可复现，与 chunk 加载顺序无关。

export function makeNoise(seed) {
  const s = seed | 0;

  // 2D 整数坐标 -> [0,1) 的确定性哈希
  function hash(x, z) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + s) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  // 双线性插值的值噪声
  function value2(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const a = hash(xi, zi);
    const b = hash(xi + 1, zi);
    const c = hash(xi, zi + 1);
    const d = hash(xi + 1, zi + 1);
    const u = smooth(xf), v = smooth(zf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  // 分形叠加，返回值大致在 [0,1]
  function fbm(x, z, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += value2(x * freq, z * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  // 3D 哈希 / 值噪声 / fBm：洞穴雕刻用
  function hash3(x, y, z) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 3266489917) +
             Math.imul(z | 0, 668265263) + s) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function value3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = smooth(x - xi), v = smooth(y - yi), w = smooth(z - zi);
    const lerp = (a, b, t) => a + (b - a) * t;
    const c00 = lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u);
    const c10 = lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u);
    const c01 = lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u);
    const c11 = lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u);
    return lerp(lerp(c00, c10, v), lerp(c01, c11, v), w);
  }

  function fbm3(x, y, z, octaves = 3, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += value3(x * freq, y * freq, z * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  return { hash, value2, fbm, hash3, value3, fbm3 };
}

// mulberry32：贴图绘制用的可复现随机数
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
