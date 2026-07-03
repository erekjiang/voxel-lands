// 生物系统（全部为本作原创立方风设计）：
//   硫磺立方 — 硫磺群系被动生物，可喂方块变球拍打（硫磺喂食会引爆）
//   野猪 / 绒球羊 — 草原被动动物，被打会逃跑，掉落肉排 / 绒毛块
//   夜噬怪 — 夜间敌对近战，追击玩家，白天日光下燃烧
//   硫磺爆虫 — 敌对，逼近玩家后点燃引信自爆（夜间地表 + 硫磺洞穴）

import * as THREE from 'three';
import { BLOCK, ITEM, PROPS } from './blocks.js';
import { HEIGHT, SEA } from './world.js';
import { tileUV } from './textures.js';

const GRAV = 30;
const DESPAWN_DIST = 90;

export const MOB_TYPES = {
  sulfurcube: {
    name: '硫磺立方', w: 0.9, h: 0.9, hp: 6, kind: 'cube',
    hostile: false, drops: [],
  },
  boar: {
    name: '野猪', w: 0.9, h: 0.8, hp: 6, kind: 'walker',
    hostile: false, speed: 1.6, fleeSpeed: 4.2, drops: [[ITEM.MEAT, 1, 2]],
  },
  fluff: {
    name: '绒球羊', w: 0.9, h: 0.95, hp: 6, kind: 'walker',
    hostile: false, speed: 1.3, fleeSpeed: 3.8, drops: [[BLOCK.WOOL, 1, 2]],
  },
  ghoul: {
    name: '夜噬怪', w: 0.65, h: 1.75, hp: 10, kind: 'walker',
    hostile: true, speed: 3.0, dmg: 3, drops: [[ITEM.ROTTEN, 0, 2]], burnsInDay: true,
  },
  burster: {
    name: '硫磺爆虫', w: 0.75, h: 0.75, hp: 6, kind: 'cube',
    hostile: true, speed: 3.4, drops: [[BLOCK.SULFUR, 1, 1]], exploder: true,
  },
};

// 逐轴 AABB 体素碰撞
function collideMove(world, pos, vel, dt, halfW, height) {
  const res = { hitX: false, hitY: false, hitZ: false, onGround: false };
  const solid = (x, y, z) => PROPS[world.getBlock(x, y, z)].solid;
  const maxV = Math.max(Math.abs(vel.x), Math.abs(vel.y), Math.abs(vel.z));
  const steps = Math.min(6, Math.max(1, Math.ceil((maxV * dt) / 0.4)));
  const sdt = dt / steps;

  for (let s = 0; s < steps; s++) {
    for (const axis of [0, 2, 1]) {
      const d = (axis === 0 ? vel.x : axis === 1 ? vel.y : vel.z) * sdt;
      if (d === 0) continue;
      if (axis === 0) pos.x += d;
      else if (axis === 1) pos.y += d;
      else pos.z += d;

      const x0 = Math.floor(pos.x - halfW), x1 = Math.floor(pos.x + halfW - 1e-9);
      const y0 = Math.floor(pos.y), y1 = Math.floor(Math.min(pos.y + height - 1e-9, HEIGHT - 0.01));
      const z0 = Math.floor(pos.z - halfW), z1 = Math.floor(pos.z + halfW - 1e-9);
      outer:
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            if (!solid(x, y, z)) continue;
            if (axis === 1) {
              if (d < 0) { pos.y = y + 1; res.onGround = true; }
              else pos.y = y - height - 1e-4;
              res.hitY = true;
            } else if (axis === 0) {
              pos.x = d > 0 ? x - halfW - 1e-4 : x + 1 + halfW + 1e-4;
              res.hitX = true;
            } else {
              pos.z = d > 0 ? z - halfW - 1e-4 : z + 1 + halfW + 1e-4;
              res.hitZ = true;
            }
            break outer;
          }
        }
      }
    }
  }
  return res;
}

// 硫磺立方吸收方块后的物理原型
function archetype(id) {
  switch (id) {
    case BLOCK.LOG:
    case BLOCK.PLANKS: return { rest: 0.8, kick: 1.35 };
    case BLOCK.GLASS: return { rest: 0.6, kick: 1.0, fragile: true };
    case BLOCK.SULFUR:
    case BLOCK.SULFUR_BRICKS: return { rest: 0.5, kick: 1.0, fuse: 3.0 };
    case BLOCK.SAND:
    case BLOCK.DIRT: return { rest: 0.12, kick: 0.7 };
    case BLOCK.STONE:
    case BLOCK.BRICK:
    case BLOCK.CINNABAR:
    case BLOCK.CINNABAR_BRICKS: return { rest: 0.35, kick: 0.85 };
    case BLOCK.WOOL: return { rest: 0.9, kick: 1.2 };
    default: return { rest: 0.5, kick: 1.0 };
  }
}

class Mob {
  constructor(m, type, x, y, z) {
    this.m = m;
    this.type = type;
    this.def = MOB_TYPES[type];
    this.pos = new THREE.Vector3(x, y, z); // 底面中心
    this.vel = new THREE.Vector3();
    this.hp = this.def.hp;
    this.dead = false;
    this.yaw = Math.random() * Math.PI * 2;
    this.onGround = false;

    this.hopTimer = 0.5 + Math.random() * 2;   // cube 类跳跃
    this.walkTimer = 0;                        // walker 类步行段
    this.walking = false;
    this.fleeT = 0;
    this.attackCd = 0;
    this.fuse = -1;                            // 爆虫/硫磺球引信
    this.burnT = 0;
    this.squash = 0;
    this.hurtFlash = 0;

    // 硫磺立方专属
    this.state = 'idle';
    this.absorbed = null;
    this.arch = null;
    this.impacts = 0;

    this.buildDefaultMesh();
  }

  buildDefaultMesh() {
    this.disposeMesh();
    const skin = this.m.skins[this.type];
    this.mats = [skin.bodyTex, skin.bodyTex, skin.bodyTex, skin.bodyTex, skin.faceTex, skin.bodyTex]
      .map((t) => new THREE.MeshLambertMaterial({ map: t }));
    const geo = new THREE.BoxGeometry(this.def.w, this.def.h, this.def.w);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, this.mats);
    this.m.scene.add(this.mesh);
  }

  buildAbsorbedMesh(blockId) {
    this.disposeMesh();
    const geo = new THREE.BoxGeometry(this.def.w, this.def.h, this.def.w);
    const uv = geo.attributes.uv;
    const base = this.m.baseBoxUV;
    const tiles = PROPS[blockId].tiles;
    for (let f = 0; f < 6; f++) {
      const tile = f === 2 ? tiles.top : f === 3 ? tiles.bottom : tiles.side;
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        const [u2, v2] = tileUV(tile, base[i * 2], base[i * 2 + 1]);
        uv.setXY(i, u2, v2);
      }
    }
    this.geo = geo;
    this.mats = [new THREE.MeshLambertMaterial({ map: this.m.atlasTexture, alphaTest: 0.4 })];
    this.mesh = new THREE.Mesh(geo, this.mats[0]);
    this.m.scene.add(this.mesh);
  }

  disposeMesh() {
    if (this.mesh) {
      this.m.scene.remove(this.mesh);
      for (const mt of this.mats) mt.dispose();
      if (this.geo) this.geo.dispose();
      this.mesh = null;
    }
  }

  // 通用受击（拍打硫磺球走 kick 分支）
  hurt(n, dir) {
    if (this.type === 'sulfurcube' && this.state === 'ball') {
      const k = this.arch.kick;
      this.vel.x += dir.x * 13 * k;
      this.vel.z += dir.z * 13 * k;
      this.vel.y = Math.max(this.vel.y, 5.5 * k);
      this.m.sfx.kick();
      return;
    }
    this.hp -= n;
    this.hurtFlash = 0.25;
    const l = Math.hypot(dir.x, dir.z) || 1;
    this.vel.x += (dir.x / l) * 6;
    this.vel.z += (dir.z / l) * 6;
    this.vel.y = Math.max(this.vel.y, 3.5);
    this.m.sfx.kick();
    if (!this.def.hostile) this.fleeT = 6;
    if (this.hp <= 0) this.die(true);
  }

  die(withDrops) {
    if (this.dead) return;
    this.dead = true;
    this.m.particles.burst(
      this.pos.x, this.pos.y + this.def.h / 2, this.pos.z,
      this.m.palettes[this.type === 'ghoul' ? BLOCK.LEAVES : BLOCK.SULFUR]
    );
    if (withDrops) {
      for (const [id, min, max] of this.def.drops) {
        const n = min + Math.floor(Math.random() * (max - min + 1));
        if (n > 0) this.m.drops.spawn(id, this.pos.x, this.pos.y + 0.4, this.pos.z, n);
      }
    }
  }

  // 硫磺立方：喂食
  feed(blockId) {
    if (this.type !== 'sulfurcube' || this.state !== 'idle') return false;
    this.absorbed = blockId;
    this.arch = archetype(blockId);
    this.state = 'ball';
    this.impacts = 0;
    if (this.arch.fuse) this.fuse = this.arch.fuse;
    this.buildAbsorbedMesh(blockId);
    return true;
  }

  releaseBlock() {
    this.m.particles.burst(this.pos.x, this.pos.y + 0.4, this.pos.z,
      this.m.palettes[this.absorbed] || this.m.palettes[BLOCK.SULFUR]);
    this.absorbed = null;
    this.arch = null;
    this.state = 'idle';
    this.fuse = -1;
    this.buildDefaultMesh();
  }

  distToPlayer() {
    const p = this.m.player.pos;
    return Math.hypot(p.x - this.pos.x, (p.y + 0.9) - (this.pos.y + this.def.h / 2), p.z - this.pos.z);
  }

  update(dt, env) {
    const def = this.def;
    const preVx = this.vel.x, preVy = this.vel.y, preVz = this.vel.z;
    const p = this.m.player;
    const dist = this.distToPlayer();

    const inWater = this.m.world.getBlock(
      Math.floor(this.pos.x), Math.floor(this.pos.y + 0.3), Math.floor(this.pos.z)
    ) === BLOCK.WATER;

    // ---- AI ----
    if (this.type === 'sulfurcube') {
      this.updateSulfurCube(dt, inWater, env);
      if (this.dead) return;
    } else if (def.hostile && env.survival && !p.dead && dist < 22) {
      // 追击
      const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
      this.yaw = Math.atan2(dz, dx);
      if (def.kind === 'walker') {
        this.vel.x = Math.cos(this.yaw) * def.speed;
        this.vel.z = Math.sin(this.yaw) * def.speed;
        if (this.hitWallLast && this.onGround) this.vel.y = 8.7; // 跳上台阶
      } else if (this.onGround || inWater) {
        // cube 类：朝玩家蹦跳
        this.hopTimer -= dt;
        if (this.hopTimer <= 0) {
          this.vel.y = inWater ? 5 : 7.2;
          this.vel.x = Math.cos(this.yaw) * def.speed;
          this.vel.z = Math.sin(this.yaw) * def.speed;
          this.hopTimer = 0.5 + Math.random() * 0.5;
          this.m.sfx.boing(dist);
        }
      }
      // 近战攻击
      this.attackCd -= dt;
      if (def.dmg && dist < 1.6 && this.attackCd <= 0) {
        this.attackCd = 1.2;
        p.damage(def.dmg, { x: p.pos.x - this.pos.x, z: p.pos.z - this.pos.z });
      }
      // 爆虫引信
      if (def.exploder) {
        if (dist < 2.6) {
          if (this.fuse < 0) { this.fuse = 1.6; this.m.sfx.hiss(); }
          this.fuse -= dt;
          this.vel.x *= 0.3; this.vel.z *= 0.3; // 停下引爆
          if (this.fuse <= 0) {
            this.m.explodeAt(this.pos.x, this.pos.y + 0.4, this.pos.z, 2.6, true);
            this.die(false);
            return;
          }
        } else if (this.fuse > 0 && dist > 4.2) {
          this.fuse = -1; // 玩家逃出范围，取消引爆
        }
      }
    } else {
      // 闲逛 / 逃跑
      this.fleeT = Math.max(0, this.fleeT - dt);
      if (def.kind === 'walker') {
        this.walkTimer -= dt;
        if (this.walkTimer <= 0) {
          this.walking = !this.walking || this.fleeT > 0;
          this.walkTimer = this.walking ? 1.5 + Math.random() * 2.5 : 1 + Math.random() * 3;
          this.yaw = Math.random() * Math.PI * 2;
        }
        if (this.fleeT > 0) {
          this.yaw = Math.atan2(this.pos.z - p.pos.z, this.pos.x - p.pos.x);
        }
        const spd = this.fleeT > 0 ? def.fleeSpeed : this.walking ? def.speed : 0;
        this.vel.x = Math.cos(this.yaw) * spd;
        this.vel.z = Math.sin(this.yaw) * spd;
        if (this.hitWallLast && this.onGround && spd > 0) this.vel.y = 8.7;
      } else {
        this.hopTimer -= dt;
        if (this.hopTimer <= 0 && (this.onGround || inWater)) {
          this.yaw = this.fleeT > 0
            ? Math.atan2(this.pos.z - p.pos.z, this.pos.x - p.pos.x)
            : Math.random() * Math.PI * 2;
          this.vel.y = inWater ? 5 : 7.2;
          const spd = this.fleeT > 0 ? 4 : 2.4;
          this.vel.x = Math.cos(this.yaw) * spd;
          this.vel.z = Math.sin(this.yaw) * spd;
          this.hopTimer = this.fleeT > 0 ? 0.4 : 1.2 + Math.random() * 2;
          this.m.sfx.boing(dist);
        }
      }
    }

    // 夜噬怪日光燃烧
    if (def.burnsInDay && !env.isNight) {
      const exposed = this.pos.y + def.h >
        this.m.world.groundHeight(Math.floor(this.pos.x), Math.floor(this.pos.z));
      if (exposed) {
        this.burnT += dt;
        if (this.burnT > 0.6) {
          this.burnT = 0;
          this.hp -= 2;
          this.hurtFlash = 0.3;
          this.m.particles.burst(this.pos.x, this.pos.y + def.h, this.pos.z, this.m.palettes[BLOCK.SULFUR]);
          if (this.hp <= 0) { this.die(false); return; }
        }
      }
    }

    // ---- 物理 ----
    if (inWater) {
      this.vel.y -= 6 * dt;
      this.vel.y *= Math.max(0, 1 - 2.5 * dt);
    } else {
      this.vel.y -= GRAV * dt;
      if (this.vel.y < -50) this.vel.y = -50;
    }
    const res = collideMove(this.m.world, this.pos, this.vel, dt, def.w / 2, def.h);
    this.onGround = res.onGround;
    this.hitWallLast = res.hitX || res.hitZ;

    if (this.type === 'sulfurcube' && this.state === 'ball' && this.arch) {
      const rest = this.arch.rest;
      if (res.hitY) {
        if (Math.abs(preVy) > 3) {
          this.vel.y = -preVy * rest;
          this.registerImpact();
        } else this.vel.y = 0;
      }
      if (res.hitX) {
        this.vel.x = Math.abs(preVx) > 2 ? -preVx * rest : 0;
        if (Math.abs(preVx) > 3) this.registerImpact();
      }
      if (res.hitZ) {
        this.vel.z = Math.abs(preVz) > 2 ? -preVz * rest : 0;
        if (Math.abs(preVz) > 3) this.registerImpact();
      }
      if (this.onGround) {
        const fr = Math.max(0, 1 - 1.2 * dt);
        this.vel.x *= fr; this.vel.z *= fr;
      }
    } else {
      if (res.hitY) this.vel.y = 0;
      if (res.hitX) this.vel.x = 0;
      if (res.hitZ) this.vel.z = 0;
      if (this.onGround && res.hitY && preVy < -4 && def.kind === 'cube') this.squash = 0.35;
    }

    // ---- 渲染同步 ----
    this.squash = Math.max(0, this.squash - dt * 2.2);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    const sy = 1 - this.squash * 0.55;
    const sxz = 1 + this.squash * 0.35;
    this.mesh.scale.set(sxz, sy, sxz);
    this.mesh.position.set(this.pos.x, this.pos.y + (def.h / 2) * sy, this.pos.z);
    this.mesh.rotation.y = Math.atan2(Math.cos(this.yaw), Math.sin(this.yaw));

    // 受击 / 引信 / 燃烧着色
    let r = 1, g = 1, b = 1;
    if (this.hurtFlash > 0) { g = 0.4; b = 0.4; }
    if (this.fuse > 0 && Math.sin(this.fuse * 20) > 0) { g = 0.3; b = 0.3; }
    if (this.def.burnsInDay && !env.isNight && this.burnT > 0.2) { g = 0.55; b = 0.3; }
    for (const mt of this.mats) mt.color.setRGB(r, g, b);
  }

  updateSulfurCube(dt, inWater, env) {
    if (this.state === 'idle') {
      this.hopTimer -= dt;
      if (this.hopTimer <= 0 && (this.onGround || inWater)) {
        this.yaw = Math.random() * Math.PI * 2;
        this.vel.y = inWater ? 5 : 7.2;
        this.vel.x = Math.cos(this.yaw) * 2.4;
        this.vel.z = Math.sin(this.yaw) * 2.4;
        this.hopTimer = 1.2 + Math.random() * 2;
        this.m.sfx.boing(this.distToPlayer());
      }
    } else if (this.fuse > 0) {
      this.fuse -= dt;
      if (this.fuse <= 0) {
        this.m.explodeAt(this.pos.x, this.pos.y + 0.45, this.pos.z, 2.3, true);
        this.die(false);
      }
    }
  }

  registerImpact() {
    this.m.sfx.bounce(this.distToPlayer());
    if (this.arch.fragile) {
      this.impacts++;
      if (this.impacts >= 3) this.releaseBlock();
    }
  }
}

export class MobManager {
  constructor(scene, world, player, atlasTexture, skins, particles, palettes, sfx, drops) {
    this.scene = scene;
    this.world = world;
    this.player = player;
    this.atlasTexture = atlasTexture;
    this.skins = skins;
    this.particles = particles;
    this.palettes = palettes;
    this.sfx = sfx;
    this.drops = drops;
    this.mobs = [];
    this.spawnTimer = 1;
    this.env = { isNight: false, survival: true };

    this.cubeGeo = new THREE.BoxGeometry(1, 1, 1);
    this.baseBoxUV = this.cubeGeo.attributes.uv.array.slice();
    this._ray = new THREE.Ray();
    this._box = new THREE.Box3();
    this._hitPoint = new THREE.Vector3();
  }

  count(filter) {
    let n = 0;
    for (const mob of this.mobs) if (filter(mob)) n++;
    return n;
  }

  update(dt, env) {
    this.env = env;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.6;
      this.trySpawn(env);
    }
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      mob.update(dt, env);
      const dist = mob.pos.distanceTo(this.player.pos);
      // 白天残留的地表敌对生物远离后静默清除（洞内的保留）
      const daytimeSurfaceHostile =
        mob.def.hostile && !env.isNight && dist > 40 &&
        mob.pos.y + 1 > this.world.groundHeight(Math.floor(mob.pos.x), Math.floor(mob.pos.z));
      if (mob.dead || dist > DESPAWN_DIST || daytimeSurfaceHostile) {
        mob.disposeMesh();
        this.mobs.splice(i, 1);
      }
    }
  }

  trySpawn(env) {
    const p = this.player.pos;
    const a = Math.random() * Math.PI * 2;
    const d = 18 + Math.random() * 24;
    const x = Math.floor(p.x + Math.cos(a) * d);
    const z = Math.floor(p.z + Math.sin(a) * d);
    const h = this.world.groundHeight(x, z);
    if (h <= SEA + 1) return;
    const biome = this.world.sulfurBiomeAt(x, z);

    if (biome) {
      // 硫磺群系：洞内刷爆虫/硫磺立方（任意时间）
      const cubes = this.count((m) => m.type === 'sulfurcube');
      const bursters = this.count((m) => m.type === 'burster');
      const spots = [];
      for (let y = 3; y <= Math.min(h + 1, HEIGHT - 2); y++) {
        if (this.world.getBlock(x, y, z) === BLOCK.AIR &&
            PROPS[this.world.getBlock(x, y - 1, z)].solid) spots.push(y);
      }
      if (spots.length === 0) return;
      const y = spots[(Math.random() * spots.length) | 0];
      if (Math.random() < 0.55 && cubes < 4) this.spawnAt('sulfurcube', x + 0.5, y + 0.01, z + 0.5);
      else if (bursters < 4) this.spawnAt('burster', x + 0.5, y + 0.01, z + 0.5);
      return;
    }

    if (env.isNight) {
      // 夜间地表：敌对生物
      if (this.count((m) => m.def.hostile) >= 8) return;
      if (this.world.getBlock(x, h + 1, z) !== BLOCK.AIR) return;
      this.spawnAt(Math.random() < 0.7 ? 'ghoul' : 'burster', x + 0.5, h + 1.01, z + 0.5);
    } else {
      // 白天草原：动物
      if (this.count((m) => !m.def.hostile && m.type !== 'sulfurcube') >= 8) return;
      if (this.world.getBlock(x, h, z) !== BLOCK.GRASS) return;
      if (this.world.getBlock(x, h + 1, z) !== BLOCK.AIR) return;
      this.spawnAt(Math.random() < 0.5 ? 'boar' : 'fluff', x + 0.5, h + 1.01, z + 0.5);
    }
  }

  spawnAt(type, x, y, z) {
    const mob = new Mob(this, type, x, y, z);
    this.mobs.push(mob);
    return mob;
  }

  // 爆炸：破坏地形 + 距离衰减伤害 + 冲击波
  explodeAt(cx, cy, cz, radius, breakBlocks) {
    if (breakBlocks) {
      const R = Math.ceil(radius);
      const list = [];
      for (let dx = -R; dx <= R; dx++)
        for (let dy = -R; dy <= R; dy++)
          for (let dz = -R; dz <= R; dz++) {
            if (dx * dx + dy * dy + dz * dz > radius * radius) continue;
            const x = Math.floor(cx + dx), y = Math.floor(cy + dy), z = Math.floor(cz + dz);
            if (PROPS[this.world.getBlock(x, y, z)].breakable) list.push([x, y, z, BLOCK.AIR]);
          }
      this.world.setBlocksBulk(list);
    }
    for (let i = 0; i < 3; i++) {
      this.particles.burst(
        cx + (Math.random() - 0.5) * 2, cy + (Math.random() - 0.5) * 2, cz + (Math.random() - 0.5) * 2,
        this.palettes[BLOCK.SULFUR]
      );
    }
    const p = this.player;
    const dvx = p.pos.x - cx, dvy = p.pos.y + 0.9 - cy, dvz = p.pos.z - cz;
    const dist = Math.max(0.5, Math.hypot(dvx, dvy, dvz));
    if (dist < 7) {
      const imp = 14 * (1 - dist / 7);
      p.vel.x += (dvx / dist) * imp;
      p.vel.y += Math.abs(dvy / dist) * imp * 0.6 + 2;
      p.vel.z += (dvz / dist) * imp;
      p.damage(Math.round(10 * (1 - dist / 7)) + 1, null, true);
    }
    // 波及其他生物
    for (const mob of this.mobs) {
      const md = mob.pos.distanceTo(new THREE.Vector3(cx, cy, cz));
      if (md < radius + 2 && !mob.dead) mob.hp -= 6, mob.hurtFlash = 0.3, mob.hp <= 0 && mob.die(true);
    }
    this.sfx.explode();
  }

  // 射线拾取最近的生物
  raycast(origin, dir, maxDist) {
    this._ray.set(origin, dir);
    let best = null;
    for (const mob of this.mobs) {
      const hw = mob.def.w / 2;
      this._box.min.set(mob.pos.x - hw, mob.pos.y, mob.pos.z - hw);
      this._box.max.set(mob.pos.x + hw, mob.pos.y + mob.def.h, mob.pos.z + hw);
      const pt = this._ray.intersectBox(this._box, this._hitPoint);
      if (!pt) continue;
      const dist = pt.distanceTo(origin);
      if (dist <= maxDist && (!best || dist < best.dist)) best = { mob, dist };
    }
    return best;
  }
}
