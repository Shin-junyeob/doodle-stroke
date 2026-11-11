// 배경 — 우리 엔진으로 그린 흑백 낙서 무늬 조각(504×504)을 페이지 배경에 반복해 깐다. 시드 고정이라 늘 같은 무늬.
(function () {
  'use strict';
  const { doodle, render } = globalThis.doodle;
  const N = 7, TILE = 504, CELL = TILE / N, R = 19; // 낙서는 칸 안쪽에만 → 조각 이음매가 보이지 않는다
  const COLOR = '#222';
  const ring = (n, f) => Array.from({ length: n + 1 }, (_, i) => f((i / n) * 2 * Math.PI));
  const SHAPES = [
    (t) => ring(80, (a) => [Math.sin(a) ** 3 * t, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * t / 16]), // 하트
    (t) => ring(10, (a) => { const r = (Math.round(a / (Math.PI / 5)) % 2 ? 0.45 : 1) * t; return [r * Math.sin(a), -r * Math.cos(a)]; }), // 별
    (t) => Array.from({ length: 90 }, (_, i) => { const a = i / 10, r = (i / 90) * t; return [r * Math.cos(a), r * Math.sin(a)]; }), // 소용돌이
    (t) => ring(60, (a) => { const r = t * (0.8 + 0.2 * Math.abs(Math.sin(3 * a))); return [r * Math.cos(a), r * Math.sin(a) * 0.6]; }), // 구름
    (t) => Array.from({ length: 50 }, (_, i) => [(-1 + (2 * i) / 49) * t, Math.sin(i / 4) * t * 0.3]), // 물결
    (t) => ring(90, (a) => { const r = t * Math.cos(3 * a); return [r * Math.cos(a), r * Math.sin(a)]; }), // 꽃잎
    (t) => [[-t, -t * 0.4], [-t * 0.4, t * 0.4], [0, -t * 0.4], [t * 0.4, t * 0.4], [t, -t * 0.4]], // 지그재그
    (t) => ring(50, (a) => [t * 0.7 * Math.cos(a), t * 0.7 * Math.sin(a)]), // 동그라미
  ];

  function tile() {
    const c = document.createElement('canvas');
    c.width = c.height = TILE;
    const ctx = c.getContext('2d');
    let n = 0;
    const h = (x) => (Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0) / 4294967296; // 칸마다 고정된 0~1 값
    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N; col++, n++) {
        const k = Math.floor(h(n + 1) * SHAPES.length);
        const cx = col * CELL + CELL / 2 + (h(n + 101) - 0.5) * 16;
        const cy = row * CELL + CELL / 2 + (h(n + 201) - 0.5) * 16;
        const turn = (((n * 71) % 360) * Math.PI) / 180;
        const pts = SHAPES[k](R).map(([x, y]) => [cx + x * Math.cos(turn) - y * Math.sin(turn), cy + x * Math.sin(turn) + y * Math.cos(turn)]);
        render(ctx, doodle(pts, { seed: 100 + n, size: 1.4, base: 0.6 }), COLOR);
      }
    }
    return c.toDataURL('image/png');
  }

  document.body.style.backgroundImage = `url(${tile()})`;
})();
