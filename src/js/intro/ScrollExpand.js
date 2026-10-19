// Framework-native adaptation of the ScrollExpand JavaScript + CSS supplied
// with this task (React Bits). Keeps its inset expansion and exponential follow
// behavior, while exposing progress to the Three.js camera and character rig.
export const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export function smoothstep(a, b, value) {
  const t = clamp((value - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
}

export class ScrollExpand {
  constructor(root, { scrollDistance = 5.8, smoothing = 0.14 } = {}) {
    this.root = root;
    this.track = root.querySelector('.scroll-expand__track');
    this.stage = root.querySelector('.scroll-expand__stage');
    this.frame = root.querySelector('.scroll-expand__frame');
    this.scrollDistance = scrollDistance;
    this.smoothing = smoothing;
    this.current = 0;
    this.target = 0;
    this.onScroll = () => {
      if (root.clientHeight !== this.stageHeight) { this.measure(); return; }
      this.target = clamp(root.scrollTop / this.span);
    };
    this.measure = () => {
      const height = root.clientHeight;
      this.stageHeight = height;
      this.span = Math.max(1, height * this.scrollDistance);
      this.stage.style.height = `${height}px`;
      this.track.style.height = `${height + this.span}px`;
      root.scrollTop = this.target * this.span;
    };
    this.measure();
    this.observer = new ResizeObserver(this.measure);
    this.observer.observe(root);
    root.addEventListener('scroll', this.onScroll, { passive: true });
  }

  update(dt) {
    const follow = 1 - Math.exp(-dt / Math.max(0.001, this.smoothing));
    // Even a fast trackpad fling gets a readable sequence of separate pulls.
    const advance = clamp((this.target - this.current) * follow, -dt * 0.28, dt * 0.23);
    this.current = clamp(this.current + advance);
    const expand = smoothstep(0, 0.24, this.current);
    const mobile = this.root.clientWidth < 640;
    const x = (mobile ? 5 : 17) * (1 - expand);
    const y = 40 * (1 - expand);
    this.frame.style.clipPath = `inset(${y}% ${x}% round ${2 * (1 - expand)}px)`;
    return this.current;
  }

  advance(amount = 0.12) {
    this.root.scrollTo({ top: clamp(this.target + amount) * this.span, behavior: 'smooth' });
  }

  dispose() {
    this.observer.disconnect();
    this.root.removeEventListener('scroll', this.onScroll);
  }
}
