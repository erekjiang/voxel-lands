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
  COBBLE: 18,
  GRAVEL: 19,
  SNOW: 20,
  ICE: 21,
  SANDSTONE: 22,
  COAL_ORE: 23,
  GOLD_ORE: 24,
  GEM_ORE: 25,
  OBSIDIAN: 26,
  MOSSY_COBBLE: 27,
  STONE_BRICKS: 28,
  GOLD_BLOCK: 29,
  GEM_BLOCK: 30,
  BOOKSHELF: 31,
  BIRCH_LOG: 32,
  BIRCH_PLANKS: 33,
  GLOWSTONE: 34,
  DARKSTONE: 35,
  DARKSTONE_BRICKS: 36,
  CLAY: 37,
  PUMPKIN: 38,
  WOOL_RED: 39,
  WOOL_YELLOW: 40,
  WOOL_GREEN: 41,
  WOOL_BLUE: 42,
  WOOL_BLACK: 43,
};

// 贴图图集中的 tile 序号（8 列 x 8 行图集）
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
  COBBLE: 18,
  GRAVEL: 19,
  SNOW: 20,
  ICE: 21,
  SANDSTONE: 22,
  COAL_ORE: 23,
  GOLD_ORE: 24,
  GEM_ORE: 25,
  OBSIDIAN: 26,
  MOSSY_COBBLE: 27,
  STONE_BRICKS: 28,
  GOLD_BLOCK: 29,
  GEM_BLOCK: 30,
  BOOKSHELF_SIDE: 31,
  BIRCH_LOG_SIDE: 32,
  BIRCH_LOG_TOP: 33,
  BIRCH_PLANKS: 34,
  GLOWSTONE: 35,
  DARKSTONE: 36,
  DARKSTONE_BRICKS: 37,
  CLAY: 38,
  PUMPKIN_SIDE: 39,
  PUMPKIN_TOP: 40,
  WOOL_RED: 41,
  WOOL_YELLOW: 42,
  WOOL_GREEN: 43,
  WOOL_BLUE: 44,
  WOOL_BLACK: 45,
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
def(BLOCK.COBBLE,          { name: '圆石', hardness: 2.0,  toolClass: 'pickaxe', needsTier: 1, tiles: same(TILE.COBBLE) });
def(BLOCK.GRAVEL,          { name: '沙砾', hardness: 0.6,  toolClass: 'shovel', tiles: same(TILE.GRAVEL) });
def(BLOCK.SNOW,            { name: '雪块', hardness: 0.25, toolClass: 'shovel', tiles: same(TILE.SNOW) });
def(BLOCK.ICE,             { name: '冰块', hardness: 0.5,  toolClass: 'pickaxe', tiles: same(TILE.ICE) });
def(BLOCK.SANDSTONE,       { name: '沙岩', hardness: 1.6,  toolClass: 'pickaxe', needsTier: 1, tiles: same(TILE.SANDSTONE) });
def(BLOCK.COAL_ORE,        { name: '煤矿石', hardness: 3.0,  toolClass: 'pickaxe', needsTier: 1, tiles: same(TILE.COAL_ORE) });
def(BLOCK.GOLD_ORE,        { name: '金矿石', hardness: 3.0,  toolClass: 'pickaxe', needsTier: 3, tiles: same(TILE.GOLD_ORE) });
def(BLOCK.GEM_ORE,         { name: '蓝晶矿石', hardness: 3.2, toolClass: 'pickaxe', needsTier: 3, tiles: same(TILE.GEM_ORE) });
def(BLOCK.OBSIDIAN,        { name: '黑曜石', hardness: 15,  toolClass: 'pickaxe', needsTier: 4, tiles: same(TILE.OBSIDIAN) });
def(BLOCK.MOSSY_COBBLE,    { name: '苔石', hardness: 2.0,  toolClass: 'pickaxe', needsTier: 1, tiles: same(TILE.MOSSY_COBBLE) });
def(BLOCK.STONE_BRICKS,    { name: '石砖', hardness: 2.0,  toolClass: 'pickaxe', needsTier: 1, tiles: same(TILE.STONE_BRICKS) });
def(BLOCK.GOLD_BLOCK,      { name: '金块', hardness: 3.0,  toolClass: 'pickaxe', needsTier: 2, tiles: same(TILE.GOLD_BLOCK) });
def(BLOCK.GEM_BLOCK,       { name: '蓝晶块', hardness: 4.0,  toolClass: 'pickaxe', needsTier: 2, tiles: same(TILE.GEM_BLOCK) });
def(BLOCK.BOOKSHELF,       { name: '书柜', hardness: 1.5,  toolClass: 'axe', tiles: { top: TILE.PLANKS, side: TILE.BOOKSHELF_SIDE, bottom: TILE.PLANKS } });
def(BLOCK.BIRCH_LOG,       { name: '桦木原木', hardness: 1.4, toolClass: 'axe', tiles: { top: TILE.BIRCH_LOG_TOP, side: TILE.BIRCH_LOG_SIDE, bottom: TILE.BIRCH_LOG_TOP } });
def(BLOCK.BIRCH_PLANKS,    { name: '桦木板', hardness: 1.3, toolClass: 'axe', tiles: same(TILE.BIRCH_PLANKS) });
def(BLOCK.GLOWSTONE,       { name: '荧光石', hardness: 0.4, bucket: 'glow', tiles: same(TILE.GLOWSTONE) });
def(BLOCK.DARKSTONE,       { name: '暗岩', hardness: 2.4,  toolClass: 'pickaxe', needsTier: 1, tiles: same(TILE.DARKSTONE) });
def(BLOCK.DARKSTONE_BRICKS,{ name: '暗岩砖', hardness: 2.4, toolClass: 'pickaxe', needsTier: 1, tiles: same(TILE.DARKSTONE_BRICKS) });
def(BLOCK.CLAY,            { name: '黏土', hardness: 0.5,  toolClass: 'shovel', tiles: same(TILE.CLAY) });
def(BLOCK.PUMPKIN,         { name: '南瓜', hardness: 1.0,  toolClass: 'axe', tiles: { top: TILE.PUMPKIN_TOP, side: TILE.PUMPKIN_SIDE, bottom: TILE.PUMPKIN_TOP } });
def(BLOCK.WOOL_RED,        { name: '红绒毛', hardness: 0.6, tiles: same(TILE.WOOL_RED) });
def(BLOCK.WOOL_YELLOW,     { name: '黄绒毛', hardness: 0.6, tiles: same(TILE.WOOL_YELLOW) });
def(BLOCK.WOOL_GREEN,      { name: '绿绒毛', hardness: 0.6, tiles: same(TILE.WOOL_GREEN) });
def(BLOCK.WOOL_BLUE,       { name: '蓝绒毛', hardness: 0.6, tiles: same(TILE.WOOL_BLUE) });
def(BLOCK.WOOL_BLACK,      { name: '黑绒毛', hardness: 0.6, tiles: same(TILE.WOOL_BLACK) });

// ---------- 物品（非方块，id 从 100 起）----------
export const ITEM = {
  MEAT: 100, APPLE: 101, ROTTEN: 102, STICK: 103, IRON: 104,
  COAL: 105, GOLD: 106, GEM: 107, CLAY_BALL: 108, GOLD_APPLE: 109,
  WOOD_PICK: 110, WOOD_AXE: 111, WOOD_SHOVEL: 112, WOOD_SWORD: 113,
  STONE_PICK: 114, STONE_AXE: 115, STONE_SHOVEL: 116, STONE_SWORD: 117,
  IRON_PICK: 118, IRON_AXE: 119, IRON_SHOVEL: 120, IRON_SWORD: 121,
  GOLD_PICK: 122, GOLD_AXE: 123, GOLD_SHOVEL: 124, GOLD_SWORD: 125,
  GEM_PICK: 126, GEM_AXE: 127, GEM_SHOVEL: 128, GEM_SWORD: 129,
};

export const FOODS = {
  [ITEM.MEAT]:   { name: '肉排', restore: 5 },
  [ITEM.APPLE]:  { name: '苹果', restore: 4 },
  [ITEM.ROTTEN]: { name: '腐肉', restore: 2 },
  [ITEM.GOLD_APPLE]: { name: '金苹果', restore: 10 },
};

export const MISC_ITEMS = {
  [ITEM.STICK]: { name: '木棍' },
  [ITEM.IRON]:  { name: '铁锭' },
  [ITEM.COAL]:  { name: '煤' },
  [ITEM.GOLD]:  { name: '金锭' },
  [ITEM.GEM]:   { name: '蓝晶' },
  [ITEM.CLAY_BALL]: { name: '黏土球' },
};

// 工具：class 决定加速的方块类；tier 采集等级(1木 2石 3铁 4蓝晶)；
// speed 挖掘倍速；dur 耐久；dmg 攻击力。金=速度最快但脆且采集等级低。
export const TOOLS = {};
function defTools(tier, speed, matName, dur, dmg, ids) {
  const [pick, axe, shovel, sword] = ids;
  TOOLS[pick]   = { name: matName + '镐', class: 'pickaxe', tier, speed, dur };
  TOOLS[axe]    = { name: matName + '斧', class: 'axe', tier, speed, dur };
  TOOLS[shovel] = { name: matName + '锹', class: 'shovel', tier, speed, dur };
  TOOLS[sword]  = { name: matName + '剑', class: 'sword', tier, speed, dur, dmg };
}
defTools(1, 3,  '木', 60, 4,   [ITEM.WOOD_PICK, ITEM.WOOD_AXE, ITEM.WOOD_SHOVEL, ITEM.WOOD_SWORD]);
defTools(2, 5,  '石', 132, 5,  [ITEM.STONE_PICK, ITEM.STONE_AXE, ITEM.STONE_SHOVEL, ITEM.STONE_SWORD]);
defTools(3, 8,  '铁', 251, 6,  [ITEM.IRON_PICK, ITEM.IRON_AXE, ITEM.IRON_SHOVEL, ITEM.IRON_SWORD]);
defTools(1, 12, '金', 33, 4,   [ITEM.GOLD_PICK, ITEM.GOLD_AXE, ITEM.GOLD_SHOVEL, ITEM.GOLD_SWORD]);
defTools(4, 11, '蓝晶', 780, 7, [ITEM.GEM_PICK, ITEM.GEM_AXE, ITEM.GEM_SHOVEL, ITEM.GEM_SWORD]);

// 挖掘耗时：正确工具按倍速加速；镐类方块徒手更慢
export function breakTime(props, toolDef) {
  let t = props.hardness * (props.toolClass === 'pickaxe' ? 2.5 : 1.2);
  if (toolDef && toolDef.class === props.toolClass) t /= toolDef.speed;
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

// 挖掘掉落映射：草掉泥土，石头掉圆石，矿石掉对应材料，
// 树叶低概率掉苹果（在 interact 里处理）
export function dropOf(id) {
  if (id === BLOCK.GRASS) return BLOCK.DIRT;
  if (id === BLOCK.STONE) return BLOCK.COBBLE;
  if (id === BLOCK.IRON_ORE) return ITEM.IRON;
  if (id === BLOCK.COAL_ORE) return ITEM.COAL;
  if (id === BLOCK.GOLD_ORE) return ITEM.GOLD;
  if (id === BLOCK.GEM_ORE) return ITEM.GEM;
  if (id === BLOCK.CLAY) return ITEM.CLAY_BALL; // 数量在 interact 里为 4
  if (id === BLOCK.LEAVES) return null; // 苹果概率另行处理
  if (id === BLOCK.WATER || id === BLOCK.BEDROCK || id === BLOCK.AIR) return null;
  return id;
}

// ---------- 合成配方 ----------
function toolRecipes(mat, ids) {
  const [pick, axe, shovel, sword] = ids;
  return [
    { out: [pick, 1],   in: [[mat, 3], [ITEM.STICK, 2]] },
    { out: [axe, 1],    in: [[mat, 3], [ITEM.STICK, 2]] },
    { out: [shovel, 1], in: [[mat, 1], [ITEM.STICK, 2]] },
    { out: [sword, 1],  in: [[mat, 2], [ITEM.STICK, 1]] },
  ];
}

export const RECIPES = [
  { out: [BLOCK.PLANKS, 4], in: [[BLOCK.LOG, 1]] },
  { out: [ITEM.STICK, 4],   in: [[BLOCK.PLANKS, 2]] },
  ...toolRecipes(BLOCK.PLANKS, [ITEM.WOOD_PICK, ITEM.WOOD_AXE, ITEM.WOOD_SHOVEL, ITEM.WOOD_SWORD]),
  ...toolRecipes(BLOCK.COBBLE, [ITEM.STONE_PICK, ITEM.STONE_AXE, ITEM.STONE_SHOVEL, ITEM.STONE_SWORD]),
  ...toolRecipes(ITEM.IRON, [ITEM.IRON_PICK, ITEM.IRON_AXE, ITEM.IRON_SHOVEL, ITEM.IRON_SWORD]),
  ...toolRecipes(ITEM.GOLD, [ITEM.GOLD_PICK, ITEM.GOLD_AXE, ITEM.GOLD_SHOVEL, ITEM.GOLD_SWORD]),
  ...toolRecipes(ITEM.GEM, [ITEM.GEM_PICK, ITEM.GEM_AXE, ITEM.GEM_SHOVEL, ITEM.GEM_SWORD]),
  // 建材加工
  { out: [BLOCK.STONE, 1],        in: [[BLOCK.COBBLE, 1]] },
  { out: [BLOCK.STONE_BRICKS, 4], in: [[BLOCK.STONE, 4]] },
  { out: [BLOCK.SANDSTONE, 4],    in: [[BLOCK.SAND, 4]] },
  { out: [BLOCK.MOSSY_COBBLE, 1], in: [[BLOCK.COBBLE, 1], [BLOCK.LEAVES, 1]] },
  { out: [BLOCK.BOOKSHELF, 1],    in: [[BLOCK.PLANKS, 6]] },
  { out: [BLOCK.GOLD_BLOCK, 1],   in: [[ITEM.GOLD, 9]] },
  { out: [BLOCK.GEM_BLOCK, 1],    in: [[ITEM.GEM, 9]] },
  { out: [BLOCK.BIRCH_PLANKS, 4], in: [[BLOCK.BIRCH_LOG, 1]] },
  { out: [ITEM.STICK, 4],         in: [[BLOCK.BIRCH_PLANKS, 2]] },
  { out: [BLOCK.BRICK, 1],        in: [[ITEM.CLAY_BALL, 4]] },
  { out: [BLOCK.DARKSTONE_BRICKS, 4], in: [[BLOCK.DARKSTONE, 4]] },
  { out: [BLOCK.GLOWSTONE, 1],    in: [[BLOCK.SULFUR, 4]] },
  { out: [ITEM.GOLD_APPLE, 1],    in: [[ITEM.APPLE, 1], [ITEM.GOLD, 2]] },
  // 绒毛染色（使用本作矿物/植物材料）
  { out: [BLOCK.WOOL_RED, 1],    in: [[BLOCK.WOOL, 1], [BLOCK.CINNABAR, 1]] },
  { out: [BLOCK.WOOL_YELLOW, 1], in: [[BLOCK.WOOL, 1], [BLOCK.SULFUR, 1]] },
  { out: [BLOCK.WOOL_GREEN, 1],  in: [[BLOCK.WOOL, 1], [BLOCK.LEAVES, 1]] },
  { out: [BLOCK.WOOL_BLUE, 1],   in: [[BLOCK.WOOL, 1], [ITEM.GEM, 1]] },
  { out: [BLOCK.WOOL_BLACK, 1],  in: [[BLOCK.WOOL, 1], [ITEM.COAL, 1]] },
];

// 快捷栏默认 9 格
export const HOTBAR_BLOCKS = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.LOG, BLOCK.PLANKS,
  BLOCK.LEAVES, BLOCK.SAND, BLOCK.GLASS, BLOCK.BRICK,
];

// 方块清单（E 键）里可选的全部方块
export const PLACEABLE_BLOCKS = [
  BLOCK.GRASS, BLOCK.DIRT, BLOCK.STONE, BLOCK.COBBLE, BLOCK.MOSSY_COBBLE,
  BLOCK.STONE_BRICKS, BLOCK.DARKSTONE, BLOCK.DARKSTONE_BRICKS,
  BLOCK.LOG, BLOCK.BIRCH_LOG, BLOCK.LEAVES, BLOCK.PLANKS, BLOCK.BIRCH_PLANKS, BLOCK.BOOKSHELF,
  BLOCK.SAND, BLOCK.SANDSTONE, BLOCK.GRAVEL, BLOCK.CLAY, BLOCK.SNOW, BLOCK.ICE,
  BLOCK.GLASS, BLOCK.BRICK, BLOCK.PUMPKIN, BLOCK.GLOWSTONE,
  BLOCK.WOOL, BLOCK.WOOL_RED, BLOCK.WOOL_YELLOW, BLOCK.WOOL_GREEN, BLOCK.WOOL_BLUE, BLOCK.WOOL_BLACK,
  BLOCK.COAL_ORE, BLOCK.IRON_ORE, BLOCK.GOLD_ORE, BLOCK.GEM_ORE,
  BLOCK.GOLD_BLOCK, BLOCK.GEM_BLOCK, BLOCK.OBSIDIAN,
  BLOCK.SULFUR, BLOCK.SULFUR_BRICKS, BLOCK.CINNABAR, BLOCK.CINNABAR_BRICKS,
];

// 物品清单 = 方块 + 材料 + 食物 + 工具
export const ALL_ITEMS = [
  ...PLACEABLE_BLOCKS,
  ITEM.STICK, ITEM.COAL, ITEM.IRON, ITEM.GOLD, ITEM.GEM, ITEM.CLAY_BALL,
  ITEM.MEAT, ITEM.APPLE, ITEM.GOLD_APPLE, ITEM.ROTTEN,
  ITEM.WOOD_PICK, ITEM.WOOD_AXE, ITEM.WOOD_SHOVEL, ITEM.WOOD_SWORD,
  ITEM.STONE_PICK, ITEM.STONE_AXE, ITEM.STONE_SHOVEL, ITEM.STONE_SWORD,
  ITEM.IRON_PICK, ITEM.IRON_AXE, ITEM.IRON_SHOVEL, ITEM.IRON_SWORD,
  ITEM.GOLD_PICK, ITEM.GOLD_AXE, ITEM.GOLD_SHOVEL, ITEM.GOLD_SWORD,
  ITEM.GEM_PICK, ITEM.GEM_AXE, ITEM.GEM_SHOVEL, ITEM.GEM_SWORD,
];

// 面剔除规则：邻居是空气则画；邻居不透明则不画；
// 同类透明方块（水-水、玻璃-玻璃）之间不画内部面。
export function faceVisible(id, neighborId) {
  if (neighborId === BLOCK.AIR) return true;
  const p = PROPS[neighborId];
  if (p.opaque) return false;
  return neighborId !== id;
}

// 快速查表：网格构建与碰撞的热路径避免对象属性链访问
export const SOLID_TABLE = new Uint8Array(256);
export const OPAQUE_TABLE = new Uint8Array(256);
for (let i = 0; i < PROPS.length; i++) {
  if (PROPS[i]) {
    SOLID_TABLE[i] = PROPS[i].solid ? 1 : 0;
    OPAQUE_TABLE[i] = PROPS[i].opaque ? 1 : 0;
  }
}
