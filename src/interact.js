// 交互：体素 DDA 射线检测、目标方块线框、按住左键分阶段挖掘（裂纹 + 粒子），
// 右键放置 / 进食 / 喂食生物。生存模式下：挖掘产出掉落物、放置消耗库存、
// 拍打生物造成伤害。创造模式：快速挖掘、无限方块、无掉落。

import * as THREE from 'three';
import {
  BLOCK, ITEM, PROPS, FOODS, TOOLS,
  isBlockItem, dropOf, breakTime, canHarvest,
} from './blocks.js';
import { HEIGHT } from './world.js';

const REACH = 5;
const PLACE_INTERVAL = 0.24;
const CREATIVE_BREAK_TIME = 0.12;
const HAND_DAMAGE = 2;

// Amanatides & Woo 体素遍历
export function raycastVoxel(world, origin, dir, maxDist, out) {
  let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
  const stepX = dir.x > 0 ? 1 : -1;
  const stepY = dir.y > 0 ? 1 : -1;
  const stepZ = dir.z > 0 ? 1 : -1;
  const tDeltaX = dir.x !== 0 ? Math.abs(1 / dir.x) : Infinity;
  const tDeltaY = dir.y !== 0 ? Math.abs(1 / dir.y) : Infinity;
  const tDeltaZ = dir.z !== 0 ? Math.abs(1 / dir.z) : Infinity;
  let tMaxX = dir.x !== 0 ? (dir.x > 0 ? (x + 1 - origin.x) : (origin.x - x)) * tDeltaX : Infinity;
  let tMaxY = dir.y !== 0 ? (dir.y > 0 ? (y + 1 - origin.y) : (origin.y - y)) * tDeltaY : Infinity;
  let tMaxZ = dir.z !== 0 ? (dir.z > 0 ? (z + 1 - origin.z) : (origin.z - z)) * tDeltaZ : Infinity;

  let t = 0;
  while (t <= maxDist) {
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX;
      out.nx = -stepX; out.ny = 0; out.nz = 0;
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY;
      out.nx = 0; out.ny = -stepY; out.nz = 0;
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ;
      out.nx = 0; out.ny = 0; out.nz = -stepZ;
    }
    if (t > maxDist) break;
    const id = world.getBlock(x, y, z);
    if (id !== BLOCK.AIR && PROPS[id].solid) {
      out.x = x; out.y = y; out.z = z;
      out.id = id; out.dist = t;
      return out;
    }
  }
  return null;
}

export class Interact {
  // api: { mode:()=>'survival'|'creative', inv, drops, hud }
  constructor(world, player, camera, scene, crackTextures, particles, palettes, sfx, api) {
    this.world = world;
    this.player = player;
    this.camera = camera;
    this.particles = particles;
    this.palettes = palettes;
    this.sfx = sfx;
    this.crackTextures = crackTextures;
    this.api = api;
    this.mobs = null;

    this.hit = null;
    this._hitOut = { x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, id: 0, dist: 0 };
    this._dir = new THREE.Vector3();

    this.breakTargetKey = null;
    this.breakProgress = 0;
    this.placeCooldown = 0;
    this.wasRight = false;
    this.wasLeft = false;

    // 目标方块线框
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002)),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.8 })
    );
    this.outline.visible = false;
    scene.add(this.outline);

    // 裂纹覆盖层
    this.crackMat = new THREE.MeshBasicMaterial({
      map: crackTextures[0],
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), this.crackMat);
    this.crack.visible = false;
    scene.add(this.crack);
  }

  setMobs(mobs) {
    this.mobs = mobs;
  }

  survival() {
    return this.api.mode() === 'survival';
  }

  // 当前手持工具定义（生存模式下必须实际持有）
  activeTool(itemId) {
    const def = TOOLS[itemId];
    if (!def) return null;
    if (this.survival() && !this.api.inv.has(itemId)) return null;
    return def;
  }

  update(dt, input, currentItemId) {
    if (this.player.dead) {
      this.outline.visible = false;
      this.crack.visible = false;
      return;
    }
    this.camera.getWorldDirection(this._dir);
    this.hit = raycastVoxel(this.world, this.camera.position, this._dir, REACH, this._hitOut);

    // 生物优先：左键攻击 / 右键喂食（硫磺立方）
    const mobHit = this.mobs
      ? this.mobs.raycast(this.camera.position, this._dir, REACH)
      : null;
    if (mobHit && (!this.hit || mobHit.dist < this.hit.dist)) {
      this.hit = null;
      this.outline.visible = false;
      this.crack.visible = false;
      this.breakTargetKey = null;
      this.breakProgress = 0;
      if (input.left && !this.wasLeft) {
        // 剑伤害最高；其他工具与徒手同伤
        const tool = this.activeTool(currentItemId);
        const dmg = tool?.dmg ?? HAND_DAMAGE;
        mobHit.mob.hurt(dmg, this._dir);
        if (tool && this.survival()) this.api.onToolUse(currentItemId);
      }
      if (input.right && !this.wasRight) {
        if (isBlockItem(currentItemId) &&
            (!this.survival() || this.api.inv.has(currentItemId))) {
          if (mobHit.mob.feed(currentItemId)) {
            if (this.survival()) this.api.inv.consume(currentItemId, 1);
            this.sfx.gulp();
          }
        }
      }
      this.wasLeft = input.left;
      this.wasRight = input.right;
      return;
    }
    this.wasLeft = input.left;

    if (this.hit) {
      this.outline.visible = true;
      this.outline.position.set(this.hit.x + 0.5, this.hit.y + 0.5, this.hit.z + 0.5);
    } else {
      this.outline.visible = false;
    }

    this.updateBreaking(dt, input, currentItemId);
    this.updateUse(dt, input, currentItemId);
  }

  updateBreaking(dt, input, itemId) {
    const hit = this.hit;
    if (!input.left || !hit || !PROPS[hit.id].breakable) {
      this.breakTargetKey = null;
      this.breakProgress = 0;
      this.crack.visible = false;
      return;
    }
    const key = hit.x + ',' + hit.y + ',' + hit.z;
    if (key !== this.breakTargetKey) {
      this.breakTargetKey = key;
      this.breakProgress = 0;
    }
    const tool = this.activeTool(itemId);
    const props = PROPS[hit.id];
    const time = this.survival() ? breakTime(props, tool) : CREATIVE_BREAK_TIME;
    this.breakProgress += dt / time;

    if (this.breakProgress >= 1) {
      const id = hit.id;
      this.world.setBlock(hit.x, hit.y, hit.z, BLOCK.AIR);
      this.particles.burst(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, this.palettes[id]);
      this.sfx.breakBlock();
      // 生存：产出掉落物（镐类方块必须用足够阶的镐才有掉落）
      if (this.survival()) {
        if (id === BLOCK.LEAVES) {
          if (Math.random() < 0.08) {
            this.api.drops.spawn(ITEM.APPLE, hit.x + 0.5, hit.y + 0.4, hit.z + 0.5, 1);
          }
        } else if (canHarvest(props, tool)) {
          const drop = dropOf(id);
          const n = id === BLOCK.CLAY ? 4 : 1; // 黏土掉 4 个黏土球
          if (drop != null) this.api.drops.spawn(drop, hit.x + 0.5, hit.y + 0.4, hit.z + 0.5, n);
        }
        if (tool) this.api.onToolUse(itemId);
      }
      this.breakTargetKey = null;
      this.breakProgress = 0;
      this.crack.visible = false;
    } else {
      const stage = Math.min(3, (this.breakProgress * 4) | 0);
      this.crackMat.map = this.crackTextures[stage];
      this.crack.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      this.crack.visible = true;
    }
  }

  updateUse(dt, input, itemId) {
    this.placeCooldown -= dt;
    if (input.right && !this.wasRight) this.placeCooldown = 0; // 按下沿立即生效
    this.wasRight = input.right;
    if (!input.right || this.placeCooldown > 0) return;

    // 食物：右键进食
    if (FOODS[itemId]) {
      if (!this.survival()) return;
      if (this.player.hunger >= 19.5) return;
      if (!this.api.inv.has(itemId)) return;
      this.api.inv.consume(itemId, 1);
      this.player.eat(FOODS[itemId].restore);
      this.sfx.eat();
      this.placeCooldown = 0.5;
      return;
    }

    // 方块：放置
    const hit = this.hit;
    if (!hit || !isBlockItem(itemId)) return;
    const tx = hit.x + hit.nx, ty = hit.y + hit.ny, tz = hit.z + hit.nz;
    if (ty < 1 || ty >= HEIGHT) return;

    const cur = this.world.getBlock(tx, ty, tz);
    if (cur !== BLOCK.AIR && cur !== BLOCK.WATER) return;
    if (PROPS[itemId].solid && this.player.intersectsBlock(tx, ty, tz)) return;
    if (this.survival() && !this.api.inv.has(itemId)) return;

    this.world.setBlock(tx, ty, tz, itemId);
    if (this.survival()) this.api.inv.consume(itemId, 1);
    this.sfx.place();
    this.placeCooldown = PLACE_INTERVAL;
  }
}
