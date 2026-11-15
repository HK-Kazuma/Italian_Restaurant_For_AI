export type InputHandlers = {
  onLook: (dx: number, dy: number) => void;
  onClick: () => void;
  onDoubleClick: () => void;
  onRightClick: () => void;
  onLockChange: (locked: boolean) => void;
  onTicketZoom: (on: boolean) => void;
  onTool: () => void; // F：道具の手（やっとこ・ヘラ）で操作する（クック編 C4）
};

// PointerLock 中のマウス・キー入力を、ゲーム側のコールバックに橋渡しする
export class Input {
  readonly keys = new Set<string>();

  constructor(
    private canvas: HTMLCanvasElement,
    h: InputHandlers,
  ) {
    document.addEventListener('pointerlockchange', () => {
      const locked = this.locked;
      if (!locked) this.keys.clear();
      h.onLockChange(locked);
    });

    document.addEventListener('mousemove', (e) => {
      if (this.locked) h.onLook(e.movementX, e.movementY);
    });

    document.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) {
        h.onClick();
        // 素早い連打は別の設備への2クリックでも detail=2 になるため、click は常に実行し、追加で doubleClick を呼ぶ
        if (e.detail >= 2) h.onDoubleClick();
      } else if (e.button === 2) {
        h.onRightClick();
      }
    });

    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      if (e.code === 'KeyE') h.onTicketZoom(true);
      if (e.code === 'KeyF' && !e.repeat) h.onTool(); // 押しっぱなしの繰り返しでは、1回だけ
      this.keys.add(e.code);
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'KeyE') h.onTicketZoom(false);
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  requestLock(): void {
    // 解除直後の再要求はブラウザに拒否されることがある（その場合は次のクリックで再試行）
    void Promise.resolve(this.canvas.requestPointerLock()).catch(() => {});
  }

  exitLock(): void {
    document.exitPointerLock();
  }
}
