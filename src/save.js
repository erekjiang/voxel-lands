// localStorage 存档：种子、玩家状态、方块修改记录。

// v3：地形加入多矿脉/雪顶后与旧档不兼容，换 key 避免旧数据错位
const KEY = 'voxel-lands-save-v3';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch { /* 存储满/隐私模式时忽略 */ }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* 忽略 */ }
}
