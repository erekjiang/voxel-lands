// 挖掘碎屑粒子：预分配缓冲的 THREE.Points，颜色取自被挖方块贴图像素，
// 每帧只写入现有 TypedArray，不产生临时对象。

import * as THREE from 'three';

const CAP = 256;
const GRAV = 16;

export class Particles {
  constructor(scene) {
    this.count = 0;
    this.positions = new Float32Array(CAP * 3);
    this.colors = new Float32Array(CAP * 3);
    this.vels = new Float32Array(CAP * 3);
    this.lifes = new Float32Array(CAP);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setDrawRange(0, 0);
    this.geo = geo;

    const mat = new THREE.PointsMaterial({ size: 0.14, vertexColors: true });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(x, y, z, palette) {
    if (!palette || palette.length === 0) return;
    const n = 22;
    for (let i = 0; i < n; i++) {
      if (this.count >= CAP) break;
      const j = this.count++;
      this.positions[j * 3] = x + (Math.random() - 0.5) * 0.7;
      this.positions[j * 3 + 1] = y + (Math.random() - 0.5) * 0.7;
      this.positions[j * 3 + 2] = z + (Math.random() - 0.5) * 0.7;
      this.vels[j * 3] = (Math.random() - 0.5) * 3.5;
      this.vels[j * 3 + 1] = Math.random() * 4 + 1.2;
      this.vels[j * 3 + 2] = (Math.random() - 0.5) * 3.5;
      const c = palette[(Math.random() * palette.length) | 0];
      this.colors[j * 3] = c[0];
      this.colors[j * 3 + 1] = c[1];
      this.colors[j * 3 + 2] = c[2];
      this.lifes[j] = 0.45 + Math.random() * 0.35;
    }
    this.geo.attributes.color.needsUpdate = true;
  }

  update(dt) {
    let i = 0;
    while (i < this.count) {
      this.lifes[i] -= dt;
      if (this.lifes[i] <= 0) {
        // 与最后一个粒子交换后收缩
        const last = --this.count;
        for (let k = 0; k < 3; k++) {
          this.positions[i * 3 + k] = this.positions[last * 3 + k];
          this.vels[i * 3 + k] = this.vels[last * 3 + k];
          this.colors[i * 3 + k] = this.colors[last * 3 + k];
        }
        this.lifes[i] = this.lifes[last];
        this.geo.attributes.color.needsUpdate = true;
        continue;
      }
      this.vels[i * 3 + 1] -= GRAV * dt;
      this.positions[i * 3] += this.vels[i * 3] * dt;
      this.positions[i * 3 + 1] += this.vels[i * 3 + 1] * dt;
      this.positions[i * 3 + 2] += this.vels[i * 3 + 2] * dt;
      i++;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.setDrawRange(0, this.count);
  }
}
