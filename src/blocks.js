// 方块注册表：id、名称、贴图 tile、物理与渲染属性

export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  LOG: 4,
  LEAVES: 5,
  SAND: 6,
  WATER: 7,
  PLANKS: 8,
  GLASS: 9,
  BRICK: 10,
  BEDROCK: 11,
  SULFUR: 12,
  CINNABAR: 13,
  CINNABAR_BRICKS: 14,
  SULFUR_BRICKS: 15,
  WOOL: 16,
  IRON_ORE: 17,
};

// 贴图图集中的 tile 序号（4 列 x 8 行图集）
export const TILE = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  LOG_TOP: 4,
  LOG_SIDE: 5,
  LEAVES: 6,
  SAND: 7,
  PLANKS: 8,
  GLASS: 9,
  BRICK: 10,
  BEDROCK: 11,
  SULFUR: 12,
  CINNABAR: 13,
  CINNABAR_BRICKS: 14,
  SULFUR_BRICKS: 15,
  WOOL: 16,
  IRON_ORE: 17,
};

function same(t) {
  return { top: t, side: t, bottom: t };
}

// bucket: 'opaque' 不透明合批 | 'cutout' 镂空(玻璃) | 'water' 半透明水
// toolClass: 'pickaxe' | 'axe' | 'shovel' | null 对应加速工具
// needsTier: >0 时必须用该阶及以上的镐才有掉落（1=任意镐 2=石镐+）
export const PROPS = [];
function def(id, p) {
  PROPS[id] = Object.assign(
    { solid: true, opaque: true, bucket: 'opaque', breakable: true, hardness: 1, toolClass: null, needsTier: 0 },
    p
  );
}

def(BLOCK.AIR,     { name: '空气', solid: false, opaque: false, bucket: null, breakable: false });
def(BLOCK.GRASS,   { name: '草方块', hardness: 0.7,  toolClass: 'shovel', tiles: { top: TILE.GRASS_TOP, side: TILE.GRASS_SIDE, bottom: TILE.DIRT } });
def(BLOCK.DIRT,    { name: '泥土', hardness: 0.6,  toolClass: 'shovel', tiles: same(TILE.DIRT) });
def(BLOCK.STONE,   { name: '石头', hardness: 2.0,  toolClass: 'pickaxe', needsTier: 1, tiles: same(TILE.STONE) });
def(BLOCK.LOG,     { name: '原木', hardness: 1.4,  toolClass: 'axe', tiles: { top: TILE.LOG_TOP, side: TILE.LOG_SIDE, bottom: TILE.LOG_TOP } });
def(BLOCK.LEAVES,  { name: '树叶', hardness: 0.25, tiles: same(TILE.LEAVES) });
def(BLOCK.SAND,    { name: '沙子', hardness: 0.55, toolClass: 'shovel', tiles: same(TILE.SAND) });
def(BLOCK.WATER,   { name: '水', solid: false, opaque: false, bucket: 'water', breakable: false, hardness: Infinity });
def(BLOCK.PLANKS,  { name: '木板', hardness: 1.3,  toolClass: 'axe', tiles: same(TILE.PLANKS) });
def(BLOCK.GLASS,   { name: '玻璃', opaque: false, bucket: 'cutout', hardness: 0.3, tiles: same(TILE.GLASS) });
def(BLOCK.BRICK,   { name: '砖块', hardness: 2.2,  toolClass: 'pickaxe', needsTier: 1, tiles: same(TILE.BRICK) });
def(BLOCK.BEDROCK, { name: '基岩', breakable: false, hardness: Infinity, toolClass: 'pickaxe', tiles: same(TILE.BEDROCK) });
def(BLOCK.SULFUR,          { name: '硫磺块', hardness: 0.5,  toolClass: 'shovel', tiles: same(TILE.SULFUR) });
def(BLOCK.CINNABAR,        { name: '朱砂块', hardness: 2.0,  toolClass: 'pickaxe', needsTier: 1, tiles: same(TILE.CINNABAR) });
def(BLOCK.CINNABAR_BRICKS, { name: '朱砂砖', hardness: 2.2,  toolClass: 'pickaxe', needsTier: 1, tiles: same(TILE.CINNABAR_BRICKS) });
def(BLOCK.SULFUR_BRICKS,   { name: '硫磺砖', hardness: 1.8,  toolClass: 'pickaxe', needsTier: 1, tiles: same(TILE.SULFUR_BRICKS) });
def(BLOCK.WOOL,            { name: '绒毛块', hardness: 0.6,  tiles: same(TILE.WOOL) });
def(BLOCK.IRON_ORE,        { name: '铁矿石', hardness: 3.0,  toolClass: 'pickaxe', needsTier: 2, tiles: same(TILE.IRON_ORE) });

// ---------- 物品（非方块，id 从 100 起）----------
export const ITEM = {
  MEAT: 100, APPLE: 101, ROTTEN: 102, STICK: 103, IRON: 104,
  WOOD_PICK: 110, WOOD_AXE: 111, WOOD_SHOVEL: 112, WOOD_SWORD: 113,
  STONE_PICK: 114, STONE_AXE: 115, STONE_SHOVEL: 116, STONE_SWORD: 117,
  IRON_PICK: 118, IRON_AXE: 119, IRON_SHOVEL: 120, IRON_SWORD: 121,
};

export const FOODS = {
  [ITEM.MEAT]:   { name: '肉排', restore: 5 },
  [ITEM.APPLE]:  { name: '苹果', restore: 4 },
  [ITEM.ROTTEN]: { name: '腐肉', restore: 2 },
};

export const MISC_ITEMS = {
  [ITEM.STICK]: { name: '木棍' },
  [ITEM.IRON]:  { name: '铁锭' },
};

// 工具：class 决定加速的方块类；tier 1木 2石 3铁；dur 耐久；dmg 攻击力
export const TOOLS = {};
function defTools(tier, matName, dur, dmg, ids) {
  const [pick, axe, shovel, sword] = ids;
  TOOLS[pick]   = { name: matName + '镐', class: 'pickaxe', tier, dur };
  TOOLS[axe]    = { name: matName + '斧', class: 'axe', tier, dur };
  TOOLS[shovel] = { name: matName + '锹', class: 'shovel', tier, dur };
  TOOLS[sword]  = { name: matName + '剑', class: 'sword', tier, dur, dmg };
}
defTools(1, '木', 60, 4,  [ITEM.WOOD_PICK, ITEM.WOOD_AXE, ITEM.WOOD_SHOVEL, ITEM.WOOD_SWORD]);
defTools(2, '石', 132, 5, [ITEM.STONE_PICK, ITEM.STONE_AXE, ITEM.STONE_SHOVEL, ITEM.STONE_SWORD]);
defTools(3, '铁', 251, 6, [ITEM.IRON_PICK, ITEM.IRON_AXE, ITEM.IRON_SHOVEL, ITEM.IRON_SWORD]);

// 挖掘耗时：正确工具按阶加速；镐类方块徒手更慢
const TIER_SPEED = [1, 3, 5, 8];
export function breakTime(props, toolDef) {
  let t = props.hardness * (props.toolClass === 'pickaxe' ? 2.5 : 1.2);
  if (toolDef && toolDef.class === props.toolClass) t /= TIER_SPEED[toolDef.tier];
  return Math.max(0.15, t);
}

// 是否满足掉落条件（needsTier 的方块必须用足够阶的镐）
export function canHarvest(props, toolDef) {
  if (!props.needsTier) return true;
  return !!toolDef && toolDef.class === 'pickaxe' && toolDef.tier >= props.needsTier;
}

export function isBlockItem(id) {
  return id < 100;
}

export function itemName(id) {
  return FOODS[id]?.name ?? MISC_ITEMS[id]?.name ?? TOOLS[id]?.name ?? PROPS[id]?.name ?? '?';
}

// 挖掘掉落映射：草掉泥土，铁矿掉铁锭，树叶低概率掉苹果（在 interact 里处理）
export function dropOf(id) {
  if (id === BLOCK.GRASS) return BLOCK.DIRT;
  if (id === BLOCK.IRON_ORE) return ITEM.IRON;
  if (id === BLOCK.LEAVES) return null; // 苹果概率另行处理
  if (id === BLOCK.WATER || id === BLOCK.BEDROCK || id === BLOCK.AIR) return null;
  return id;
}

// ---------- 合成配方 ----------
export const RECIPES = [
  { out: [BLOCK.PLANKS, 4], in: [[BLOCK.LOG, 1]] },
  { out: [ITEM.STICK, 4],   in: [[BLOCK.PLANKS, 2]] },
  { out: [ITEM.WOOD_PICK, 1],   in: [[BLOCK.PLANKS, 3], [ITEM.STICK, 2]] },
  { out: [ITEM.WOOD_AXE, 1],    in: [[BLOCK.PLANKS, 3], [ITEM.STICK, 2]] },
  { out: [ITEM.WOOD_SHOVEL, 1], in: [[BLOCK.PLANKS, 1], [ITEM.STICK, 2]] },
  { out: [ITEM.WOOD_SWORD, 1],  in: [[BLOCK.PLANKS, 2], [ITEM.STICK, 1]] },
  { out: [ITEM.STONE_PICK, 1],   in: [[BLOCK.STONE, 3], [ITEM.STICK, 2]] },
  { out: [ITEM.STONE_AXE, 1],    in: [[BLOCK.STONE, 3], [ITEM.STICK, 2]] },
  { out: [ITEM.STONE_SHOVEL, 1], in: [[BLOCK.STONE, 1], [ITEM.STICK, 2]] },
  { out: [ITEM.STONE_SWORD, 1],  in: [[BLOCK.STONE, 2], [ITEM.STICK, 1]] },
  { out: [ITEM.IRON_PICK, 1],   in: [[ITEM.IRON, 3], [ITEM.STICK, 2]] },
  { out: [ITEM.IRON_AXE, 1],    in: [[ITEM.IRON, 3], [ITEM.STICK, 2]] },
  { out: [ITEM.IRON_SHOVEL, 1], in: [[ITEM.IRON, 1], [ITEM.STICK, 2]] },
  { out: [ITEM.IRON_SWORD, 1],  in: [[ITEM.IRON, 2], [ITEM.STICK, 1]] },
];

// 快捷栏默认 9 格
export const HOTBAR_BLOCKS = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.LOG, BLOCK.PLANKS,
  BLOCK.LEAVES, BLOCK.SAND, BLOCK.GLASS, BLOCK.BRICK,
];

// 方块清单（E 键）里可选的全部方块
export const PLACEABLE_BLOCKS = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.LOG, BLOCK.LEAVES,
  BLOCK.PLANKS, BLOCK.SAND, BLOCK.GLASS, BLOCK.BRICK,
  BLOCK.SULFUR, BLOCK.SULFUR_BRICKS, BLOCK.CINNABAR, BLOCK.CINNABAR_BRICKS,
  BLOCK.WOOL, BLOCK.IRON_ORE,
];

// 物品清单 = 方块 + 材料 + 食物 + 工具
export const ALL_ITEMS = [
  ...PLACEABLE_BLOCKS,
  ITEM.STICK, ITEM.IRON,
  ITEM.MEAT, ITEM.APPLE, ITEM.ROTTEN,
  ITEM.WOOD_PICK, ITEM.WOOD_AXE, ITEM.WOOD_SHOVEL, ITEM.WOOD_SWORD,
  ITEM.STONE_PICK, ITEM.STONE_AXE, ITEM.STONE_SHOVEL, ITEM.STONE_SWORD,
  ITEM.IRON_PICK, ITEM.IRON_AXE, ITEM.IRON_SHOVEL, ITEM.IRON_SWORD,
];

// 面剔除规则：邻居是空气则画；邻居不透明则不画；
// 同类透明方块（水-水、玻璃-玻璃）之间不画内部面。
export function faceVisible(id, neighborId) {
  if (neighborId === BLOCK.AIR) return true;
  const p = PROPS[neighborId];
  if (p.opaque) return false;
  return neighborId !== id;
}
