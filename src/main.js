// 入口：渲染器 / 场景 / 光照 / 昼夜循环，组装世界、玩家、生物、掉落物、
// 交互、HUD，生存与创造模式切换，localStorage 自动存档。

import * as THREE from 'three';
import { BLOCK, PROPS, ALL_ITEMS, FOODS, TOOLS, RECIPES, isBlockItem, itemName } from './blocks.js';
import {
  createTextures, renderBlockIcons, samplePalette,
  createMobSkins, createItemAssets,
} from './textures.js';
import { World, SEA } from './world.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Interact } from './interact.js';
import { Particles } from './particles.js';
import { MobManager, MOB_TYPES } from './mobs.js';
import { Drops } from './drops.js';
import { Sfx } from './audio.js';
import { Hud } from './hud.js';
import { TouchControls } from './touch.js';
import { loadSave, storeSave, clearSave } from './save.js';

// 收集运行时错误方便自检
window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason)));

const DAY_SKY = new THREE.Color(0x8fbce8);
const NIGHT_SKY = new THREE.Color(0x0c1226);
const DUSK_TINT = new THREE.Color(0xd9834f);
const WATER_FOG = 0x1a4b9e;
const DAY_LENGTH = 480; // 一昼夜秒数

// 触屏设备检测（手机 / iPad；带鼠标的桌面触屏仍走键鼠）
let touchMode =
  (navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches) ||
  'ontouchstart' in window;

// ---------- 渲染器 ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, touchMode ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(DAY_SKY.getHex(), 55, 95);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);

// ---------- 光照：太阳平行光 + 环境光（昼夜驱动强度）----------
const sun = new THREE.DirectionalLight(0xfff5e0, 0.75);
sun.position.set(0.6, 1, 0.35).multiplyScalar(100);
scene.add(sun);
const ambient = new THREE.AmbientLight(0xdfe8ff, 0.5);
scene.add(ambient);

// ---------- 贴图与材质 ----------
const tex = createTextures();
const maxAniso = renderer.capabilities.getMaxAnisotropy();
tex.atlasTexture.anisotropy = Math.min(touchMode ? 4 : 8, maxAniso);
tex.waterTexture.anisotropy = Math.min(touchMode ? 2 : 4, maxAniso);

const materials = {
  opaque: new THREE.MeshLambertMaterial({ map: tex.atlasTexture, vertexColors: true }),
  cutout: new THREE.MeshLambertMaterial({ map: tex.atlasTexture, vertexColors: true, alphaTest: 0.4 }),
  water: new THREE.MeshLambertMaterial({
    map: tex.waterTexture,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
  // 自发光方块：不受光照，夜里也保持全亮（荧光石）
  glow: new THREE.MeshBasicMaterial({ map: tex.atlasTexture }),
};

// 方形太阳 / 月亮 + 像素云层
const sunMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(28, 28),
  new THREE.MeshBasicMaterial({ color: 0xfff8c8, fog: false })
);
scene.add(sunMesh);
const moonMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(20, 20),
  new THREE.MeshBasicMaterial({ color: 0xd8deee, fog: false })
);
scene.add(moonMesh);

const cloudMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(1400, 1400),
  new THREE.MeshBasicMaterial({
    map: tex.cloudTexture,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
);
cloudMesh.rotation.x = -Math.PI / 2;
scene.add(cloudMesh);

// ---------- 存档 / 世界 ----------
const save = loadSave();
const seed = save?.seed ?? ((Math.random() * 0x7fffffff) | 0);
let mode = save?.mode ?? 'survival';
let timeOfDay = save?.time ?? 0.06; // 清晨开局

const world = new World(scene, materials, seed);
world.loadEdits(save?.edits);
const BASE_VIEW_DIST = touchMode ? 4 : 5;
world.viewDist = BASE_VIEW_DIST;
if (touchMode) document.body.classList.add('touch');

const player = new Player(world, camera);
const spawn = world.findSpawn();
player.setSpawn(spawn);
if (save?.player) {
  player.pos.set(save.player.x, save.player.y, save.player.z);
  player.yaw = save.player.yaw ?? 0;
  player.pitch = save.player.pitch ?? 0;
  if (save.player.hp != null) player.hp = save.player.hp;
  if (save.player.hunger != null) player.hunger = save.player.hunger;
}
player.updateCamera();

// ---------- 物品栏（生存模式计数）----------
const inv = {
  counts: new Map(Object.entries(save?.inventory ?? {}).map(([k, v]) => [+k, v])),
  count(id) { return this.counts.get(id) ?? 0; },
  has(id) { return this.count(id) > 0; },
  add(id, n) {
    this.counts.set(id, this.count(id) + n);
    world.dirtySave = true;
    refreshInvUI();
  },
  consume(id, n) {
    this.counts.set(id, Math.max(0, this.count(id) - n));
    world.dirtySave = true;
    refreshInvUI();
  },
  serialize() { return Object.fromEntries(this.counts); },
};

// 工具磨损（同类工具共用当前那把的磨损值，简化处理）
const toolWear = new Map(Object.entries(save?.toolWear ?? {}).map(([k, v]) => [+k, v]));

// ---------- HUD / 输入 / 交互 / 生物 / 掉落 ----------
const blockIcons = renderBlockIcons(ALL_ITEMS.filter(isBlockItem), PROPS, tex.atlas);
const itemAssets = createItemAssets();
const icons = { ...blockIcons, ...itemAssets.icons };
const hud = new Hud(icons);
if (save?.player?.hotbar) hud.setBlocks(save.player.hotbar);
if (save?.player?.slot != null) hud.select(save.player.slot);

const palettes = {};
for (const [idStr, p] of Object.entries(PROPS)) {
  if (p && p.tiles) palettes[idStr] = samplePalette(tex.atlas, p.tiles.side);
}
// 生物死亡粒子的调色板别名
palettes.ghoul = palettes[BLOCK.LEAVES];

const sfx = new Sfx();
const input = new Input();
const particles = new Particles(scene);
const drops = new Drops(scene, world, player, tex.atlasTexture, itemAssets.textures, sfx, (id, n) => {
  inv.add(id, n);
  hud.showItemName('+ ' + (FOODS[id]?.name ?? PROPS[id].name));
});
// 工具使用一次：累积磨损，耗尽则损毁
function onToolUse(id) {
  const def = TOOLS[id];
  if (!def) return;
  const wear = (toolWear.get(id) ?? 0) + 1;
  if (wear >= def.dur) {
    toolWear.set(id, 0);
    inv.consume(id, 1);
    hud.showItemName(def.name + ' 已损坏！');
    sfx.hurt();
  } else {
    toolWear.set(id, wear);
    world.dirtySave = true;
    refreshInvUI();
  }
}

const api = { mode: () => mode, inv, drops, hud, onToolUse };
const interact = new Interact(world, player, camera, scene, tex.crackTextures, particles, palettes, sfx, api);
const mobs = new MobManager(scene, world, player, tex.atlasTexture, createMobSkins(), particles, palettes, sfx, drops);
interact.setMobs(mobs);

// UI 刷新节流：挖矿/拾取高频触发时合并为 ~150ms 一次，避免 DOM 抖动掉帧
let invUIDirty = false;
let invUITimer = 0;
function refreshInvUI(force) {
  if (!force) {
    invUIDirty = true;
    return;
  }
  invUIDirty = false;
  invUITimer = 0;
  hud.refreshCounts(inv, mode === 'survival', toolWear);
}
player.survival = mode === 'survival';
refreshInvUI(true);

// 合成
hud.onCraft = (ri) => {
  const recipe = RECIPES[ri];
  if (mode === 'survival') {
    if (!recipe.in.every(([id, n]) => inv.count(id) >= n)) return;
    for (const [id, n] of recipe.in) inv.consume(id, n);
  }
  inv.add(recipe.out[0], recipe.out[1]);
  hud.showItemName('合成了 ' + itemName(recipe.out[0]) + (recipe.out[1] > 1 ? ' ×' + recipe.out[1] : ''));
  sfx.place();
  refreshInvUI(true); // 面板打开中，立即反映数量与配方可用性
};

input.onHotkey = (i) => { hud.select(i); sfx.click(); };
input.onWheel = (dir) => {
  hud.select((hud.selected + dir + 9) % 9);
};

// 硫磺群系罗盘：启动时找一次最近的群系
const nearestSulfur = world.findNearestSulfur(player.pos.x, player.pos.z);

// ---------- 玩家生命回调 ----------
const deathEl = document.getElementById('death');
player.onDamage = () => { hud.flashHurt(); sfx.hurt(); };
player.onDeath = () => {
  sfx.died();
  deathEl.classList.remove('hidden');
  if (touchMode) input.clear();
  else document.exitPointerLock();
};
document.getElementById('btn-respawn').addEventListener('click', () => {
  player.respawn();
  deathEl.classList.add('hidden');
  requestLock();
});

// ---------- 触屏控制 ----------
if (touchMode) {
  new TouchControls(input, canvas, {
    pause: () => pausePlay(),
    inventory: () => {
      if (inventoryOpen) closeInventory(true);
      else if (running && !player.dead) openInventory();
    },
  });
}
hud.onSlotTap = (i) => { hud.select(i); sfx.click(); };
// 触屏关闭物品清单：点面板外区域
document.getElementById('inventory').addEventListener('click', (e) => {
  if (e.target.id === 'inventory') closeInventory(true);
});

// ---------- 暂停 / pointer lock / 物品清单 ----------
const overlay = document.getElementById('overlay');
const btnStart = document.getElementById('btn-start');
const btnReset = document.getElementById('btn-reset');
const btnMode = document.getElementById('btn-mode');
const pauseHint = document.getElementById('pausehint');

let running = false;
let started = false;
let inventoryOpen = false;

function setRunning(on) {
  running = on;
  input.enabled = on;
  document.body.classList.toggle('playing', on);
  if (!on) input.clear();
}

// 触屏：直接开始/暂停；桌面：经由 pointer lock
function startPlay() {
  started = true;
  inventoryOpen = false;
  hud.showInventory(false);
  overlay.classList.add('hidden');
  setRunning(true);
}
function pausePlay() {
  setRunning(false);
  if (started) {
    pauseHint.hidden = false;
    btnStart.textContent = '继续游戏';
  }
  if (!inventoryOpen && !player.dead) overlay.classList.remove('hidden');
  saveNow();
}

function requestLock() {
  if (touchMode) {
    startPlay();
    return;
  }
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch { /* 短时间内重复请求可能被浏览器拒绝 */ }
}

function openInventory() {
  inventoryOpen = true;
  refreshInvUI(true);
  hud.showInventory(true);
  document.body.classList.add('inv-open');
  if (touchMode) input.clear(); // 世界继续运行，仅冻结输入
  else document.exitPointerLock();
}
function closeInventory(relock) {
  inventoryOpen = false;
  hud.showInventory(false);
  document.body.classList.remove('inv-open');
  if (touchMode) return; // 触屏保持运行状态
  if (relock) requestLock();
  else overlay.classList.remove('hidden');
}

hud.onPick = (id) => {
  hud.setSlotBlock(hud.selected, id);
  world.dirtySave = true;
  sfx.click();
  closeInventory(true);
};

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE') {
    if (running && !inventoryOpen && !player.dead) openInventory();
    else if (inventoryOpen) closeInventory(true);
  } else if (e.code === 'Escape' && inventoryOpen) {
    closeInventory(false);
  }
});

function updateModeButton() {
  btnMode.textContent = '模式：' + (mode === 'survival' ? '生存' : '创造');
}
updateModeButton();
btnMode.addEventListener('click', () => {
  mode = mode === 'survival' ? 'creative' : 'survival';
  player.survival = mode === 'survival';
  if (mode === 'survival' && player.hp <= 0) player.respawn();
  updateModeButton();
  refreshInvUI(true);
  world.dirtySave = true;
  sfx.click();
});

btnStart.addEventListener('click', () => {
  sfx.unlock();
  requestLock();
});
btnReset.addEventListener('click', () => {
  if (confirm('确定重置世界吗？将删除本地存档并使用新种子重新生成。')) {
    clearSave();
    location.reload();
  }
});
canvas.addEventListener('click', () => {
  if (!running && !player.dead) requestLock();
});

document.addEventListener('pointerlockchange', () => {
  if (touchMode) return; // 触屏不走 pointer lock
  const locked = document.pointerLockElement === canvas;
  if (locked) startPlay();
  else pausePlay(); // 物品清单 / 死亡界面时 pausePlay 内部不弹暂停菜单
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    input.clear();
    saveNow();
  }
});

// ---------- PWA：离线缓存 + 安装引导 ----------
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

const btnInstall = document.getElementById('btn-install');
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  btnInstall.hidden = false;
});
btnInstall.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null;
  btnInstall.hidden = true;
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  btnInstall.hidden = true;
});
// iOS 无 beforeinstallprompt：Safari 且未安装时显示添加指引
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isIOS && !navigator.standalone) {
  document.getElementById('ios-hint').hidden = false;
}

// ---------- 存档 ----------
function saveNow() {
  if (!started && !world.dirtySave) return;
  storeSave({
    seed,
    mode,
    time: timeOfDay,
    edits: world.serializeEdits(),
    inventory: inv.serialize(),
    toolWear: Object.fromEntries(toolWear),
    player: {
      x: player.pos.x, y: player.pos.y, z: player.pos.z,
      yaw: player.yaw, pitch: player.pitch, slot: hud.selected,
      hotbar: hud.blocks, hp: player.hp, hunger: player.hunger,
    },
  });
  world.dirtySave = false;
}
setInterval(() => { if (world.dirtySave) saveNow(); }, 4000);
window.addEventListener('pagehide', saveNow);

// ---------- resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- 昼夜循环 ----------
const _sky = new THREE.Color();
function updateDayNight(dt) {
  if (running) timeOfDay = (timeOfDay + dt / DAY_LENGTH) % 1;
  const ang = timeOfDay * Math.PI * 2; // 0 = 日出
  const b = Math.max(0, Math.sin(ang)); // 太阳高度 0..1
  const isNight = b < 0.08;

  // 天空色：夜 -> 昼，日出日落混入暖色
  _sky.copy(NIGHT_SKY).lerp(DAY_SKY, Math.pow(b, 0.6));
  const duskAmount = b > 0 && b < 0.3 ? (1 - b / 0.3) * 0.45 : 0;
  if (duskAmount > 0) _sky.lerp(DUSK_TINT, duskAmount);

  sun.intensity = 0.12 + b * 0.68;
  ambient.intensity = 0.15 + b * 0.38;

  // 太阳 / 月亮绕玩家旋转
  const R = 180;
  sunMesh.position.set(
    camera.position.x + Math.cos(ang) * R,
    camera.position.y + Math.sin(ang) * R,
    camera.position.z + 40
  );
  sunMesh.lookAt(camera.position);
  sunMesh.visible = Math.sin(ang) > -0.1;
  moonMesh.position.set(
    camera.position.x - Math.cos(ang) * R,
    camera.position.y - Math.sin(ang) * R,
    camera.position.z - 40
  );
  moonMesh.lookAt(camera.position);
  moonMesh.visible = Math.sin(ang) < 0.1;
  sun.position.set(
    camera.position.x + Math.cos(ang) * 100,
    camera.position.y + Math.max(20, Math.sin(ang) * 150),
    camera.position.z + 40
  );
  sun.target.position.copy(camera.position);
  sun.target.updateMatrixWorld();

  return { isNight, sky: _sky };
}

// ---------- 主循环 ----------
const clock = new THREE.Clock();
let fps = 0, fpsAcc = 0, fpsFrames = 0, debugTimer = 0;
let baseFov = 75;

// 帧率自适应视距：持续掉帧则收缩，充裕则恢复
let adaptTimer = 0;
function adaptQuality(dt) {
  if (!running) return;
  adaptTimer += dt;
  if (adaptTimer < 4) return;
  adaptTimer = 0;
  if (fps > 0 && fps < 24 && world.viewDist > 3) {
    world.viewDist--;
    world.lastCX = null; // 触发重建加载队列并卸载远处区块
  } else if (fps > 50 && world.viewDist < BASE_VIEW_DIST) {
    world.viewDist++;
    world.lastCX = null;
  }
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  // 运行时每帧最多建 1 个网格、生成 2 块地形数据，摊平卡顿尖峰
  world.update(player.pos.x, player.pos.z, running ? 1 : 4, running ? 2 : 9);
  const { isNight, sky } = updateDayNight(dt);

  if (running) {
    player.update(dt, input);
    interact.update(dt, input, hud.currentItem());
    mobs.update(dt, { isNight, survival: mode === 'survival' });
    drops.update(dt);
    particles.update(dt);
  }

  // 疾跑视野拉伸
  const targetFov = baseFov + (player.sprinting ? 9 : 0);
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }

  // 水面动画
  const t = clock.elapsedTime;
  tex.waterTexture.offset.set((t * 0.03) % 1, (t * 0.017) % 1);
  cloudMesh.position.set(camera.position.x, 72, camera.position.z);
  tex.cloudTexture.offset.x = (t * 0.0016) % 1;

  // 相机入水的雾效；日常雾距跟随视距（隐藏未加载区块边缘）
  const camBlock = world.getBlock(
    Math.floor(camera.position.x),
    Math.floor(camera.position.y),
    Math.floor(camera.position.z)
  );
  const underwater = camBlock === BLOCK.WATER;
  if (underwater) {
    scene.fog.color.setHex(WATER_FOG);
    scene.fog.near = 2;
    scene.fog.far = 22;
    renderer.setClearColor(WATER_FOG);
  } else {
    const fogFar = world.viewDist * 16 - 6;
    scene.fog.color.copy(sky);
    scene.fog.near = fogFar - 34;
    scene.fog.far = fogFar;
    renderer.setClearColor(sky);
  }
  hud.setUnderwater(underwater);
  hud.updateStats(player, mode === 'survival');

  // 调试信息
  fpsAcc += dt; fpsFrames++;
  debugTimer += dt;
  if (fpsAcc >= 0.5) {
    fps = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0; fpsFrames = 0;
  }
  adaptQuality(dt);

  // 节流的物品栏 UI 刷新
  invUITimer += dt;
  if (invUIDirty && invUITimer >= 0.15) refreshInvUI(true);
  if (debugTimer >= 0.25) {
    debugTimer = 0;
    const p = player.pos;
    const facing = interact.hit ? PROPS[interact.hit.id].name : '—';
    const hours = ((timeOfDay * 24 + 6) % 24) | 0;
    const mins = ((timeOfDay * 24 * 60 + 360) % 60) | 0;
    const clockStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    let biomeLine;
    if (world.sulfurBiomeAt(Math.floor(p.x), Math.floor(p.z))) {
      biomeLine = '硫磺洞穴群系 ☀（留意地面的黄色斑块与洞口）';
    } else if (nearestSulfur) {
      const dx = nearestSulfur.x - p.x, dz = nearestSulfur.z - p.z;
      const dist = Math.round(Math.hypot(dx, dz));
      const dirs = ['东', '东南', '南', '西南', '西', '西北', '北', '东北'];
      const angD = Math.atan2(dz, dx);
      const dirName = dirs[((Math.round(angD / (Math.PI / 4)) % 8) + 8) % 8];
      biomeLine = `硫磺群系 → ${dirName} ${dist}m`;
    } else {
      biomeLine = '附近没有硫磺群系';
    }
    hud.setDebug(
      `FPS ${fps} · ${mode === 'survival' ? '生存' : '创造'} · ${clockStr} ${isNight ? '🌙' : '☀'}\n` +
      `XYZ ${p.x.toFixed(1)} / ${p.y.toFixed(1)} / ${p.z.toFixed(1)}\n` +
      `区块 ${world.countLoaded()} · 种子 ${seed} · 生物 ${mobs.mobs.length} · 掉落物 ${drops.list.length}\n` +
      `指向 ${facing}\n` +
      biomeLine
    );
  }

  renderer.render(scene, camera);
}
loop();

// ---------- 自检钩子（浏览器控制台 / 自动化验证用） ----------
window.__game = {
  world, player, camera, hud, interact, input, particles, mobs, drops, inv, toolWear,
  seed, SEA, BLOCK, MOB_TYPES, nearestSulfur,
  get touchMode() { return touchMode; },
  // 桌面浏览器调试触屏 UI 用
  forceTouch() {
    touchMode = true;
    document.body.classList.add('touch');
    world.viewDist = 4;
    new TouchControls(input, canvas, {
      pause: () => pausePlay(),
      inventory: () => {
        if (inventoryOpen) closeInventory(true);
        else if (running && !player.dead) openInventory();
      },
    });
  },
  startPlay, pausePlay,
  get mode() { return mode; },
  setMode(m) { mode = m; player.survival = m === 'survival'; updateModeButton(); refreshInvUI(true); },
  get timeOfDay() { return timeOfDay; },
  setTime(v) { timeOfDay = v; },
  get running() { return running; },
  get ready() { return world.firstLoadDone; },
  get fps() { return fps; },
};
