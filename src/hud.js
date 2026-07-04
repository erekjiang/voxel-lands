// HUD：快捷栏（图标 + 数量角标）、准星、生命/饥饿/氧气条（原创像素图标）、
// 物品名提示、调试信息、水下滤镜、受击红闪、E 键物品清单面板。

import { PROPS, HOTBAR_BLOCKS, ALL_ITEMS, FOODS, TOOLS, RECIPES, itemName } from './blocks.js';

// 5x 放大的小像素图标（心 / 肉腿 / 气泡），原创图案
function pixelIcon(rows, palette) {
  const c = document.createElement('canvas');
  const S = 4;
  c.width = rows[0].length * S;
  c.height = rows.length * S;
  const ctx = c.getContext('2d');
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      ctx.fillStyle = palette[ch];
      ctx.fillRect(x * S, y * S, S, S);
    });
  });
  return c.toDataURL();
}

const HEART_ROWS = [
  '.oo.oo.',
  'ofFofFo',
  'offffFo',
  '.ooffo.',
  '..ofo..',
  '...o...',
];
const FOOD_ROWS = [
  '..ooo..',
  '.ofmfo.',
  '.omffo.',
  '..off..',
  '...ob..',
  '...bb..',
];
const BUBBLE_ROWS = [
  '.ooo.',
  'obBbo',
  'obbbo',
  '.ooo.',
];

function makeIcons() {
  return {
    heartFull: pixelIcon(HEART_ROWS, { o: '#3a0c0c', f: '#d33127', F: '#ff8a7a', m: '#d33127' }),
    heartHalf: pixelIcon(HEART_ROWS, { o: '#3a0c0c', f: '#6a2320', F: '#d33127', m: '#6a2320' }),
    heartEmpty: pixelIcon(HEART_ROWS, { o: '#2c2c2c', f: '#4a4342', F: '#5c5250', m: '#4a4342' }),
    foodFull: pixelIcon(FOOD_ROWS, { o: '#4a2c12', f: '#a5652f', m: '#c8854a', b: '#e8e2d0' }),
    foodHalf: pixelIcon(FOOD_ROWS, { o: '#4a2c12', f: '#5c3d20', m: '#7a552f', b: '#9a968c' }),
    foodEmpty: pixelIcon(FOOD_ROWS, { o: '#2c2c2c', f: '#454240', m: '#575350', b: '#6a6660' }),
    bubble: pixelIcon(BUBBLE_ROWS, { o: '#2f6ea8', b: '#7fb8e8', B: '#d8eeff' }),
  };
}

export class Hud {
  constructor(icons) {
    this.icons = icons;       // 方块/物品图标 dataURL 表
    this.selected = 0;
    this.blocks = [...HOTBAR_BLOCKS];
    this.slots = [];
    this.slotImgs = [];
    this.slotCounts = [];
    this._nameTimer = 0;
    this.survivalUI = true;

    const hotbar = document.getElementById('hotbar');
    this.blocks.forEach((id, i) => {
      const slot = document.createElement('div');
      slot.className = 'slot' + (i === 0 ? ' sel' : '');
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = String(i + 1);
      const img = document.createElement('img');
      img.src = icons[id];
      img.alt = itemName(id);
      img.draggable = false;
      img.onerror = () => { img.style.display = 'none'; }; // 兜底：加载失败不显示破图
      const count = document.createElement('span');
      count.className = 'count';
      const dur = document.createElement('div');
      dur.className = 'dur';
      const durFill = document.createElement('div');
      dur.appendChild(durFill);
      slot.appendChild(num);
      slot.appendChild(img);
      slot.appendChild(count);
      slot.appendChild(dur);
      // 触屏：点按选中
      slot.addEventListener('click', () => {
        if (this.onSlotTap) this.onSlotTap(i);
      });
      hotbar.appendChild(slot);
      this.slots.push(slot);
      this.slotImgs.push(img);
      this.slotCounts.push(count);
      this.slotDurs = this.slotDurs || [];
      this.slotDurs.push(durFill);
    });

    this.onSlotTap = null;
    this.itemname = document.getElementById('itemname');
    this.debug = document.getElementById('debug');
    this.waterfx = document.getElementById('waterfx');
    this.hurtfx = document.getElementById('hurtfx');
    this.inventory = document.getElementById('inventory');

    // 状态条
    this.statIcons = makeIcons();
    this.heartImgs = [];
    this.foodImgs = [];
    this.bubbleImgs = [];
    const hearts = document.getElementById('hearts');
    const hungerEl = document.getElementById('hungerbar');
    const bubbles = document.getElementById('bubbles');
    for (let i = 0; i < 10; i++) {
      const h = document.createElement('img');
      h.src = this.statIcons.heartFull;
      hearts.appendChild(h);
      this.heartImgs.push(h);
      const f = document.createElement('img');
      f.src = this.statIcons.foodFull;
      hungerEl.appendChild(f);
      this.foodImgs.push(f);
      const b = document.createElement('img');
      b.src = this.statIcons.bubble;
      bubbles.appendChild(b);
      this.bubbleImgs.push(b);
    }
    this.statsEl = document.getElementById('stats');

    // 物品清单网格
    this.onPick = null;
    this.invCells = {};
    const grid = document.getElementById('inv-grid');
    // 图标 + 名称 + 数量的紧凑清单格
    for (const id of ALL_ITEMS) {
      const cell = document.createElement('button');
      cell.className = 'inv-cell';
      cell.title = itemName(id);
      const img = document.createElement('img');
      img.src = icons[id];
      img.draggable = false;
      img.onerror = () => { img.style.display = 'none'; };
      const label = document.createElement('span');
      label.className = 'inv-name';
      label.textContent = itemName(id);
      const cnt = document.createElement('span');
      cnt.className = 'inv-count';
      cell.appendChild(img);
      cell.appendChild(label);
      cell.appendChild(cnt);
      cell.addEventListener('click', () => {
        if (this.onPick) this.onPick(id);
      });
      grid.appendChild(cell);
      this.invCells[id] = { cell, cnt };
    }

    // 合成列表
    this.onCraft = null;
    this.craftRows = [];
    const craftList = document.getElementById('craft-list');
    RECIPES.forEach((recipe, ri) => {
      const row = document.createElement('div');
      row.className = 'craft-row';
      const img = document.createElement('img');
      img.src = icons[recipe.out[0]];
      img.draggable = false;
      img.onerror = () => { img.style.display = 'none'; };
      const name = document.createElement('span');
      name.className = 'craft-name';
      name.textContent = itemName(recipe.out[0]) + (recipe.out[1] > 1 ? ' ×' + recipe.out[1] : '');
      const need = document.createElement('span');
      need.className = 'craft-need';
      need.textContent = recipe.in.map(([id, n]) => `${itemName(id)}×${n}`).join(' + ');
      const btn = document.createElement('button');
      btn.className = 'craft-btn';
      btn.textContent = '合成';
      btn.addEventListener('click', () => {
        if (this.onCraft) this.onCraft(ri);
      });
      row.appendChild(img);
      row.appendChild(name);
      row.appendChild(need);
      row.appendChild(btn);
      craftList.appendChild(row);
      this.craftRows.push({ row, btn });
    });
  }

  select(i) {
    if (i === this.selected) return;
    this.slots[this.selected].classList.remove('sel');
    this.selected = i;
    this.slots[i].classList.add('sel');
    this.showItemName(itemName(this.blocks[i]));
  }

  setSlotBlock(i, id) {
    this.blocks[i] = id;
    this.slotImgs[i].src = this.icons[id];
    this.slotImgs[i].alt = itemName(id);
    this.showItemName(itemName(id));
  }

  setBlocks(arr) {
    arr.forEach((id, i) => {
      if (i < 9 && (PROPS[id]?.tiles || FOODS[id])) this.setSlotBlock(i, id);
    });
  }

  currentItem() {
    return this.blocks[this.selected];
  }

  // 数量角标（生存模式）、耐久条、清单计数、合成可用性
  refreshCounts(inv, survival, toolWear) {
    this.blocks.forEach((id, i) => {
      const n = inv.count(id);
      const isTool = !!TOOLS[id];
      this.slotCounts[i].textContent = survival && n > 0 && !isTool ? String(n) : '';
      this.slots[i].classList.toggle('empty', survival && n === 0);
      // 耐久条
      const wear = toolWear?.get(id) ?? 0;
      if (survival && isTool && n > 0 && wear > 0) {
        const pct = Math.max(0, 1 - wear / TOOLS[id].dur);
        this.slotDurs[i].style.width = (pct * 100).toFixed(0) + '%';
        this.slotDurs[i].style.background = pct > 0.5 ? '#5ad35a' : pct > 0.25 ? '#e8c840' : '#e04a3a';
        this.slotDurs[i].parentElement.style.display = 'block';
      } else {
        this.slotDurs[i].parentElement.style.display = 'none';
      }
    });
    for (const [id, { cell, cnt }] of Object.entries(this.invCells)) {
      const n = inv.count(+id);
      cnt.textContent = survival ? String(n) : '∞';
      cell.classList.toggle('none', survival && n === 0);
    }
    // 合成按钮可用性（创造模式全部可点）
    RECIPES.forEach((recipe, ri) => {
      const ok = !survival || recipe.in.every(([id, n]) => inv.count(id) >= n);
      this.craftRows[ri].btn.disabled = !ok;
      this.craftRows[ri].row.classList.toggle('unavailable', !ok);
    });
  }

  updateStats(player, survival) {
    // 每帧调用：值未变化时跳过全部 DOM 写入
    const hpQ = Math.max(0, Math.ceil(player.hp));
    const huQ = Math.max(0, Math.ceil(player.hunger));
    const airQ = player.air < 9.9 ? Math.max(0, Math.ceil(player.air)) : -1;
    const key = (survival ? 1 : 0) * 100000 + hpQ * 2000 + huQ * 40 + (airQ + 1);
    if (key === this._statsKey) return;
    this._statsKey = key;

    this.survivalUI = survival;
    this.statsEl.style.display = survival ? '' : 'none';
    if (!survival) return;
    const I = this.statIcons;
    for (let i = 0; i < 10; i++) {
      const v = hpQ - i * 2;
      this.heartImgs[i].src = v >= 2 ? I.heartFull : v >= 1 ? I.heartHalf : I.heartEmpty;
      const f = huQ - i * 2;
      this.foodImgs[i].src = f >= 2 ? I.foodFull : f >= 1 ? I.foodHalf : I.foodEmpty;
    }
    for (let i = 0; i < 10; i++) {
      this.bubbleImgs[i].style.visibility =
        airQ >= 0 && airQ > i ? 'visible' : 'hidden';
    }
  }

  flashHurt() {
    this.hurtfx.style.opacity = '1';
    clearTimeout(this._hurtTimer);
    this._hurtTimer = setTimeout(() => {
      this.hurtfx.style.opacity = '0';
    }, 180);
  }

  showItemName(name) {
    this.itemname.textContent = name;
    this.itemname.style.opacity = '1';
    clearTimeout(this._nameTimer);
    this._nameTimer = setTimeout(() => {
      this.itemname.style.opacity = '0';
    }, 1200);
  }

  showInventory(on) {
    this.inventory.classList.toggle('hidden', !on);
  }

  setDebug(text) {
    this.debug.textContent = text;
  }

  setUnderwater(on) {
    this.waterfx.style.opacity = on ? '1' : '0';
  }
}
