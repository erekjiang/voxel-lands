// 输入管理：键盘 / 鼠标 / 滚轮 + 触屏虚拟输入（摇杆与按键写入 virtual）。
// 仅在启用时接收游戏输入；失焦或解锁时清空状态，避免"卡键"。

export class Input {
  constructor() {
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseLeft = false;
    this.mouseRight = false;
    this.enabled = false;
    this.onHotkey = null;   // (index 0-8) => void
    this.onWheel = null;    // (dir ±1) => void

    // 触屏虚拟输入（TouchControls 写入）
    this.virtual = { forward: 0, strafe: 0, jump: false, sprint: false, left: false, right: false };

    document.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.code.startsWith('Digit')) {
        const n = +e.code.slice(5);
        if (n >= 1 && n <= 9 && this.onHotkey) this.onHotkey(n - 1);
      }
      this.keys.add(e.code);
      // 防止空格滚动页面 / Tab 移焦
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement === null) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.enabled || document.pointerLockElement === null) return;
      e.preventDefault();
      if (e.button === 0) this.mouseLeft = true;
      if (e.button === 2) this.mouseRight = true;
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseLeft = false;
      if (e.button === 2) this.mouseRight = false;
    });

    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('wheel', (e) => {
      if (!this.enabled || !this.onWheel) return;
      this.onWheel(e.deltaY > 0 ? 1 : -1);
    }, { passive: true });

    window.addEventListener('blur', () => this.clear());
  }

  clear() {
    this.keys.clear();
    this.mouseLeft = false;
    this.mouseRight = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.virtual.forward = 0;
    this.virtual.strafe = 0;
    this.virtual.jump = false;
    this.virtual.left = false;
    this.virtual.right = false;
    // 疾跑开关保留（触屏为切换式）
  }

  get forward() {
    const k = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    return Math.max(-1, Math.min(1, k + this.virtual.forward));
  }
  get strafe() {
    const k = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    return Math.max(-1, Math.min(1, k + this.virtual.strafe));
  }
  get jump() {
    return this.keys.has('Space') || this.virtual.jump;
  }
  get sprint() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ||
           this.keys.has('ControlLeft') || this.virtual.sprint;
  }
  get left() {
    return this.mouseLeft || this.virtual.left;
  }
  get right() {
    return this.mouseRight || this.virtual.right;
  }
}
