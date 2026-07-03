// 掉落物实体：挖掘/生物死亡后弹出的迷你立方，旋转漂浮，
// 靠近玩家时被磁吸，接触后进入物品栏。

import * as THREE from 'three';
import { PROPS, isBlockItem } from './blocks.js';
import { tileUV } from './textures.js';

const SIZE = 0.28;
const MAX_DROPS = 80;

export class Drops {
  constructor(scene, world, player, atlasTexture, itemTextures, sfx, onPickup) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.sfx = sfx;
    this.onPickup = onPickup;
    this.list = [];

    this.atlasMat = new THREE.MeshLambertMaterial({ map: atlasTexture });
    this.itemMats = {};
    for (const [id, tex] of Object.entries(itemTextures)) {
      this.itemMats[id] = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.3 });
    }
    // 基准 box uv（物品用默认 uv，方块用图集重映射）
    const ref = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
    this.baseUV = ref.attributes.uv.array.slice();
    ref.dispose();
  }

  spawn(id, x, y, z, n = 1) {
    for (let i = 0; i < n; i++) {
      if (this.list.length >= MAX_DROPS) return;
      let mesh;
      if (isBlockItem(id)) {
        const geo = new THREE.BoxGeometry(SIZE, SIZE, SIZE);
        const uv = geo.attributes.uv;
        const tiles = PROPS[id].tiles;
        for (let f = 0; f < 6; f++) {
          const tile = f === 2 ? tiles.top : f === 3 ? tiles.bottom : tiles.side;
          for (let v = 0; v < 4; v++) {
            const k = f * 4 + v;
            const [u2, v2] = tileUV(tile, this.baseUV[k * 2], this.baseUV[k * 2 + 1]);
            uv.setXY(k, u2, v2);
          }
        }
        mesh = new THREE.Mesh(geo, this.atlasMat);
      } else {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(SIZE, SIZE, 0.06),
          this.itemMats[id] || this.atlasMat
        );
      }
      this.scene.add(mesh);
      this.list.push({
        id, mesh,
        x, y, z,
        vx: (Math.random() - 0.5) * 2.4,
        vy: 3 + Math.random() * 1.5,
        vz: (Math.random() - 0.5) * 2.4,
        age: 0,
        delay: 0.4, // 刚弹出短暂不可拾取
      });
    }
  }

  update(dt) {
    const p = this.player.pos;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.age += dt;
      d.delay -= dt;

      // 磁吸与拾取
      const dx = p.x - d.x, dy = p.y + 0.8 - d.y, dz = p.z - d.z;
      const dist = Math.hypot(dx, dy, dz);
      if (d.delay <= 0 && dist < 2) {
        const pull = 8 / Math.max(0.4, dist);
        d.vx += (dx / dist) * pull * dt * 10;
        d.vy += (dy / dist) * pull * dt * 10;
        d.vz += (dz / dist) * pull * dt * 10;
      }
      if (d.delay <= 0 && dist < 0.9) {
        this.onPickup(d.id, 1);
        this.sfx.click();
        this.remove(i);
        continue;
      }
      if (d.age > 120 || d.y < -10) {
        this.remove(i);
        continue;
      }

      // 简易物理：重力 + 地面停靠
      d.vy -= 18 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      const below = this.world.getBlock(Math.floor(d.x), Math.floor(d.y - 0.05), Math.floor(d.z));
      if (PROPS[below].solid && d.vy < 0) {
        d.y = Math.floor(d.y - 0.05) + 1.05;
        d.vy = 0;
        d.vx *= 0.7;
        d.vz *= 0.7;
      }

      d.mesh.position.set(d.x, d.y + 0.18 + Math.sin(d.age * 2.5) * 0.05, d.z);
      d.mesh.rotation.y = d.age * 1.8;
    }
  }

  remove(i) {
    const d = this.list[i];
    this.scene.remove(d.mesh);
    if (d.mesh.geometry) d.mesh.geometry.dispose();
    this.list.splice(i, 1);
  }
}
