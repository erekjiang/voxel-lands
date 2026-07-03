// 触屏控制：左下虚拟摇杆移动，画布拖动转视角（多指独立追踪），
// 右侧按键：跳跃 / 挖掘(按住) / 放置(按住) / 疾跑(切换)，
// 顶部按键：暂停 / 背包。全部写入 Input.virtual。

const JOY_RADIUS = 52;      // 摇杆最大偏移（px）
const LOOK_SENS = 2.4;      // 拖动 -> 视角增量倍率
const DEADZONE = 0.18;

// 触觉反馈（Android 生效，iOS 静默忽略）
function buzz(ms = 8) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch { /* 忽略 */ }
}

export class TouchControls {
  constructor(input, canvas, hooks) {
    this.input = input;
    this.hooks = hooks; // { pause, inventory }

    this.joyId = null;
    this.joyCX = 0;
    this.joyCY = 0;
    this.lookId = null;
    this.lookX = 0;
    this.lookY = 0;

    this.joy = document.getElementById('joy');
    this.knob = document.getElementById('joy-knob');

    this.bindJoystick();
    this.bindLook(canvas);
    this.bindHold('tbtn-jump', (v) => { input.virtual.jump = v; });
    this.bindHold('tbtn-mine', (v) => { input.virtual.left = v; });
    this.bindHold('tbtn-place', (v) => { input.virtual.right = v; });
    this.bindTap('tbtn-pause', () => hooks.pause());
    this.bindTap('tbtn-inv', () => hooks.inventory());

    // 疾跑：切换式
    const sprintBtn = document.getElementById('tbtn-sprint');
    sprintBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      buzz(12);
      input.virtual.sprint = !input.virtual.sprint;
      sprintBtn.classList.toggle('on', input.virtual.sprint);
    }, { passive: false });
  }

  bindJoystick() {
    const joy = this.joy;
    joy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.joyId !== null) return;
      const t = e.changedTouches[0];
      this.joyId = t.identifier;
      const rect = joy.getBoundingClientRect();
      this.joyCX = rect.left + rect.width / 2;
      this.joyCY = rect.top + rect.height / 2;
      this.moveJoy(t);
    }, { passive: false });
    joy.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) this.moveJoy(t);
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) {
          this.joyId = null;
          this.input.virtual.forward = 0;
          this.input.virtual.strafe = 0;
          this.knob.style.transform = 'translate(0px, 0px)';
        }
      }
    };
    joy.addEventListener('touchend', end);
    joy.addEventListener('touchcancel', end);
  }

  moveJoy(t) {
    let dx = t.clientX - this.joyCX;
    let dy = t.clientY - this.joyCY;
    const len = Math.hypot(dx, dy);
    if (len > JOY_RADIUS) {
      dx = (dx / len) * JOY_RADIUS;
      dy = (dy / len) * JOY_RADIUS;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    let f = -dy / JOY_RADIUS;
    let s = dx / JOY_RADIUS;
    if (Math.abs(f) < DEADZONE) f = 0;
    if (Math.abs(s) < DEADZONE) s = 0;
    this.input.virtual.forward = f;
    this.input.virtual.strafe = s;
  }

  bindLook(canvas) {
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.lookId !== null) return;
      const t = e.changedTouches[0];
      this.lookId = t.identifier;
      this.lookX = t.clientX;
      this.lookY = t.clientY;
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== this.lookId) continue;
        if (this.input.enabled) {
          this.input.mouseDX += (t.clientX - this.lookX) * LOOK_SENS;
          this.input.mouseDY += (t.clientY - this.lookY) * LOOK_SENS;
        }
        this.lookX = t.clientX;
        this.lookY = t.clientY;
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.lookId) this.lookId = null;
      }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
  }

  bindHold(id, setter) {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      buzz();
      setter(true);
      el.classList.add('on');
    }, { passive: false });
    const off = (e) => {
      e.preventDefault();
      setter(false);
      el.classList.remove('on');
    };
    el.addEventListener('touchend', off);
    el.addEventListener('touchcancel', off);
  }

  bindTap(id, fn) {
    const el = document.getElementById(id);
    const flash = () => {
      el.classList.add('on');
      setTimeout(() => el.classList.remove('on'), 140);
    };
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      buzz(12);
      flash();
      fn();
    }, { passive: false });
    // 桌面调试也可点
    el.addEventListener('click', (e) => {
      if (e.detail !== 0) { flash(); fn(); }
    });
  }
}
