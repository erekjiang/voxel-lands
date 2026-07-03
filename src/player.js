// 第一人称玩家：重力、跳跃、疾跑、空气控制、水中浮力，
// AABB 与体素网格逐轴碰撞（子步进防止高速穿墙）。

import * as THREE from 'three';
import { BLOCK, PROPS } from './blocks.js';
import { HEIGHT } from './world.js';

const GRAVITY = 32;
const JUMP_V = 9.0;        // 可跳约 1.25 格
const WALK_SPEED = 4.4;
const SPRINT_SPEED = 6.0;
const HALF_W = 0.3;        // 玩家半宽
const PLAYER_H = 1.8;
export const EYE_HEIGHT = 1.62;

export class Player {
  constructor(world, camera) {
    this.world = world;
    this.camera = camera;
    this.pos = new THREE.Vector3();   // 脚底中心
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.inWater = false;
    this.sprinting = false;
    this.hitWall = false;
    this.spawn = new THREE.Vector3();

    // ---- 生存属性 ----
    this.survival = true;
    this.hp = 20;
    this.hunger = 20;
    this.air = 10;
    this.dead = false;
    this.invuln = 0;
    this.peakY = 0;      // 摔落起始高度
    this.regenT = 0;
    this.starveT = 0;
    this.drownT = 0;
    this.onDamage = null; // (amount) => void  受击反馈
    this.onDeath = null;  // () => void
  }

  // 受到伤害（dir 为击退方向，force 无视无敌帧）
  damage(n, dir, force) {
    if (!this.survival || this.dead || n <= 0) return;
    if (this.invuln > 0 && !force) return;
    this.hp = Math.max(0, this.hp - n);
    this.invuln = 0.6;
    if (dir) {
      const l = Math.hypot(dir.x, dir.z) || 1;
      this.vel.x += (dir.x / l) * 7;
      this.vel.z += (dir.z / l) * 7;
      this.vel.y = Math.max(this.vel.y, 3.5);
    }
    if (this.onDamage) this.onDamage(n);
    if (this.hp <= 0) {
      this.dead = true;
      if (this.onDeath) this.onDeath();
    }
  }

  eat(restore) {
    this.hunger = Math.min(20, this.hunger + restore);
  }

  respawn() {
    this.pos.copy(this.spawn);
    this.vel.set(0, 0, 0);
    this.hp = 20;
    this.hunger = 20;
    this.air = 10;
    this.dead = false;
    this.invuln = 1;
    this.peakY = this.pos.y;
    this.updateCamera();
  }

  setSpawn(v) {
    this.spawn.copy(v);
    this.pos.copy(v);
    this.vel.set(0, 0, 0);
  }

  solidAt(x, y, z) {
    return PROPS[this.world.getBlock(x, y, z)].solid;
  }

  blockAtBody(dy) {
    return this.world.getBlock(
      Math.floor(this.pos.x),
      Math.floor(this.pos.y + dy),
      Math.floor(this.pos.z)
    );
  }

  update(dt, input) {
    if (this.dead) return;

    // 视角
    this.yaw -= input.mouseDX * 0.0022;
    this.pitch -= input.mouseDY * 0.0022;
    const lim = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    input.mouseDX = 0;
    input.mouseDY = 0;

    this.inWater =
      this.blockAtBody(0.4) === BLOCK.WATER || this.blockAtBody(1.2) === BLOCK.WATER;

    // 期望移动方向（相机水平面）
    const f = input.forward, s = input.strafe;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * f + cy * s;
    let wz = -cy * f - sy * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }

    // 生存模式下饥饿过低无法疾跑
    const canSprint = !this.survival || this.hunger > 6;
    this.sprinting = input.sprint && f > 0 && !this.inWater && canSprint;
    let speed = this.sprinting ? SPRINT_SPEED : WALK_SPEED;
    if (this.inWater) speed *= 0.55;

    // 水平速度趋近目标（地面响应快、空中弱控制）
    const rate = this.inWater ? 4.5 : this.onGround ? 12 : 3.2;
    const k = 1 - Math.exp(-rate * dt);
    this.vel.x += (wx * speed - this.vel.x) * k;
    this.vel.z += (wz * speed - this.vel.z) * k;

    // 垂直运动
    if (this.inWater) {
      this.vel.y -= 10 * dt;
      this.vel.y *= Math.max(0, 1 - 3.5 * dt);
      if (input.jump) this.vel.y += 28 * dt;
      this.vel.y = Math.max(-5, Math.min(5, this.vel.y));
      // 贴着方块游泳时按跳跃可以“爬”上岸
      if (this.hitWall && input.jump) this.vel.y = Math.max(this.vel.y, 4.5);
    } else {
      if (input.jump && this.onGround) {
        this.vel.y = JUMP_V;
        this.onGround = false;
        if (this.survival) this.hunger = Math.max(0, this.hunger - 0.05);
      }
      this.vel.y -= GRAVITY * dt;
      if (this.vel.y < -60) this.vel.y = -60;
    }

    // 子步进积分，单步位移 < 0.4 格
    const maxV = Math.max(Math.abs(this.vel.x), Math.abs(this.vel.y), Math.abs(this.vel.z));
    const steps = Math.min(8, Math.max(1, Math.ceil((maxV * dt) / 0.4)));
    const sdt = dt / steps;
    this.hitWall = false;
    for (let i = 0; i < steps; i++) {
      this.onGround = false;
      this.moveAxis(0, this.vel.x * sdt);
      this.moveAxis(2, this.vel.z * sdt);
      this.moveAxis(1, this.vel.y * sdt);
    }

    // 掉出世界兜底（正常有基岩挡住，防御性处理）
    if (this.pos.y < -20) this.setSpawn(this.spawn);

    if (this.survival) this.updateStats(dt, wl > 0.1);

    this.updateCamera();
  }

  // 摔伤 / 饥饿 / 回血 / 溺水
  updateStats(dt, moving) {
    this.invuln = Math.max(0, this.invuln - dt);

    // 摔落伤害：记录离地最高点，落地按超过 3 格的高度扣血
    if (this.inWater) {
      this.peakY = this.pos.y;
    } else if (!this.onGround) {
      this.peakY = Math.max(this.peakY, this.pos.y);
    } else {
      const drop = this.peakY - this.pos.y;
      this.peakY = this.pos.y;
      if (drop > 3.5) this.damage(Math.floor(drop - 3), null, true);
    }

    // 饥饿消耗
    const rate = this.sprinting ? 0.085 : moving ? 0.02 : 0.007;
    this.hunger = Math.max(0, this.hunger - rate * dt);

    // 吃饱回血 / 饥饿掉血（最低留 2 血）
    if (this.hunger >= 18 && this.hp < 20 && this.hp > 0) {
      this.regenT += dt;
      if (this.regenT >= 2) {
        this.regenT = 0;
        this.hp = Math.min(20, this.hp + 1);
        this.hunger = Math.max(0, this.hunger - 0.4);
      }
    } else this.regenT = 0;
    if (this.hunger <= 0) {
      this.starveT += dt;
      if (this.starveT >= 2.5) {
        this.starveT = 0;
        if (this.hp > 2) this.damage(1, null, true);
      }
    } else this.starveT = 0;

    // 溺水：头部入水耗氧，耗尽后持续掉血
    const headInWater = this.blockAtBody(EYE_HEIGHT) === BLOCK.WATER;
    if (headInWater) {
      this.air -= dt * 1.1;
      if (this.air <= 0) {
        this.drownT += dt;
        if (this.drownT >= 1.2) {
          this.drownT = 0;
          this.damage(2, null, true);
        }
      }
    } else {
      this.air = Math.min(10, this.air + dt * 3);
      this.drownT = 0;
    }
  }

  moveAxis(axis, delta) {
    if (delta === 0) return;
    const p = this.pos;
    if (axis === 0) p.x += delta;
    else if (axis === 1) p.y += delta;
    else p.z += delta;

    const minX = p.x - HALF_W, maxX = p.x + HALF_W;
    const minY = p.y, maxY = p.y + PLAYER_H;
    const minZ = p.z - HALF_W, maxZ = p.z + HALF_W;
    const x0 = Math.floor(minX), x1 = Math.floor(maxX - 1e-9);
    const y0 = Math.floor(minY), y1 = Math.floor(Math.min(maxY - 1e-9, HEIGHT - 0.01));
    const z0 = Math.floor(minZ), z1 = Math.floor(maxZ - 1e-9);

    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) {
          if (!this.solidAt(x, y, z)) continue;
          if (axis === 1) {
            if (delta < 0) {
              p.y = y + 1;
              this.onGround = true;
            } else {
              p.y = y - PLAYER_H - 1e-4;
            }
            this.vel.y = 0;
          } else if (axis === 0) {
            p.x = delta > 0 ? x - HALF_W - 1e-4 : x + 1 + HALF_W + 1e-4;
            this.vel.x = 0;
            this.hitWall = true;
          } else {
            p.z = delta > 0 ? z - HALF_W - 1e-4 : z + 1 + HALF_W + 1e-4;
            this.vel.z = 0;
            this.hitWall = true;
          }
          return; // 同一轴上所有碰撞块共享同一夹紧平面
        }
      }
    }
  }

  // 放置方块前检查是否与玩家身体重叠
  intersectsBlock(bx, by, bz) {
    const p = this.pos;
    return (
      bx < p.x + HALF_W && bx + 1 > p.x - HALF_W &&
      by < p.y + PLAYER_H && by + 1 > p.y &&
      bz < p.z + HALF_W && bz + 1 > p.z - HALF_W
    );
  }

  updateCamera() {
    this.camera.position.set(this.pos.x, this.pos.y + EYE_HEIGHT, this.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }
}
