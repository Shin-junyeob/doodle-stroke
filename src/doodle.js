// 두들 엔진 — 획 하나(점 목록)를 두세 번 덧그은 가닥들로 바꾼다. DOM 없음, 시드 순수 함수.
// doodle(points, {seed, passes, size, closedTol}) → [{points:[[x,y],...], widths:[w,...]}, ...]
// file:// 에서 classic script 로 읽히도록 IIFE + globalThis.doodle 에만 붙인다.
(function () {
  'use strict';

  // 매개변수는 여기 한 곳. AC-10(눈 판정) 조정 대상.
  const DEFAULTS = {
    seed: 1,
    passes: 3,          // 가닥 수(2~3)
    size: 5,            // 기본 선 굵기 px — 사용자 화면 조절로 정함(2026-11-11)
    closedTol: 6,       // 시작·끝이 이 안이면 닫힌 획
    spacing: 2,         // 재표본 간격 px
    maxPoints: 2000,    // 재표본 점 수 상한
    win: 8,             // 꺾인 각을 재는 호 길이 창 ±px
    cornerDeg: 35,      // 이 각보다 크게 꺾이면 꼭짓점
    cornerR: 70,        // 꼭짓점 둘레 벌어짐 0→1 선형 램프 반경 px (시험의 r=12 보다 넓게 — 첨점 옆 곡선에서 다시 벌어지지 않게)
    denoisePx: 4,       // 각·법선을 잴 때 입력을 이 반경으로 이동평균 px
    smoothPx: 16,       // 곡률 다듬기 창 ±px
    curvRef: 0.012,      // 곡률(rad/px) 이 값이면 벌어짐 최대(고정 상수, 획마다 정규화하지 않음)
    base: 1.5,          // 곧은 곳의 기본 가닥 오프셋 px
    spread: 10,         // 휘는 곳에서 더 벌어지는 오프셋 상한 px
    spreadRel: 0.028,   // 벌어짐 = min(spread, 획 대각선 × 이 값) — 작은 획은 덜 벌어진다
    wobble: 1,          // 중심선 저주파 흔들림 진폭 px(가닥끼리 엇갈리게)
    offMaxRel: 0.027,   // 가닥이 원래 획에서 벗어나는 상한 = max(5.4px, 대각선 × 이 값) — 모양이 무너지지 않게
    widthWobble: 0.15,  // 굵기 흔들림 비율
    taperMin: 0.45,     // 끝 쪽 최소 폭 비율(약한 테이퍼)
    taperFrac: 0.08,    // 테이퍼가 걸리는 끝 구간(가닥 길이 비율)
    overshoot: 0.03,    // 열린 획 끝 넘침 = max(4px, 길이 × 이 값), 대각선 5% 상한
    closeOverlap: 14,   // 닫힌 획 끝을 시작 경로 따라 더 긋는 길이 px(가닥마다 ±40%)
    closeTail: 0.07,    // 닫힌 획 시작점 바깥으로 튀어나오는 꼬리 = 대각선 × 이 값(가닥마다 0.5~1.2배)
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // 균일 간격 재표본. 닫힌 획은 닫는 선분까지 따라가고 중복 끝점은 뺀다.
  function resample(pts, h, closed) {
    const src = closed ? pts.concat([pts[0]]) : pts;
    const out = [src[0].slice()];
    let carry = 0;
    for (let i = 1; i < src.length; i++) {
      const a = src[i - 1], b = src[i], L = dist(a, b);
      let s = h - carry;
      while (s <= L) {
        out.push([a[0] + ((b[0] - a[0]) * s) / L, a[1] + ((b[1] - a[1]) * s) / L]);
        s += h;
      }
      carry = L - (s - h);
    }
    if (closed) { if (dist(out[out.length - 1], out[0]) < h / 2) out.pop(); }
    else if (dist(out[out.length - 1], src[src.length - 1]) > h / 4) out.push(src[src.length - 1].slice());
    return out;
  }

  // 저주파 흔들림: 사인 두 개 합(-1~1 근처). 닫힌 획은 둘레에 정수 번 들어가게 해 이음매가 매끄럽다.
  function makeNoise(rand, period) {
    return [[0.7, 180], [0.3, 70]].map(([amp, lam]) => {
      const l = period ? period / Math.max(1, Math.round(period / lam)) : lam;
      const ph = rand() * 2 * Math.PI;
      return (s) => amp * Math.sin((2 * Math.PI * s) / l + ph);
    }).reduce((f, g) => (s) => f(s) + g(s));
  }

  function doodle(input, opts) {
    const o = Object.assign({}, DEFAULTS, opts);
    const rand = mulberry32(o.seed);
    const passes = Math.max(2, Math.min(3, o.passes | 0));
    const pts0 = input.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    let len = 0;
    for (let i = 1; i < pts0.length; i++) len += dist(pts0[i - 1], pts0[i]);
    if (pts0.length < 2 || len < 1) {
      const p = pts0[0] || [0, 0];
      return Array.from({ length: passes }, () => ({ points: [p.slice()], widths: [o.size] }));
    }
    const closed = pts0.length > 3 && dist(pts0[0], pts0[pts0.length - 1]) <= o.closedTol && len > 4 * o.closedTol;
    // shortcut: 점 수 상한 2000 — 아주 긴 획은 간격이 넓어진다. 성능 문제가 없으면 상한을 올린다.
    const h = Math.max(o.spacing, len / (o.maxPoints - 1));
    const P = resample(closed ? pts0.slice(0, -1) : pts0, h, closed);
    const n = P.length, L = closed ? n * h : (n - 1) * h;
    const k = Math.max(1, Math.round(o.win / h));
    const wrap = (A, i) => (closed ? A[((i % n) + n) % n] : A[Math.max(0, Math.min(n - 1, i))]);
    // 각·법선은 ±denoisePx 이동평균한 사본으로 잰다 — 마우스의 1px 계단이 곡률·법선을 흔들지 않게. 가닥 위치는 원래 점 P.
    const dk = Math.max(1, Math.round(o.denoisePx / h));
    const S = P.map((_, i) => {
      if (!closed && (i < dk || i >= n - dk)) return P[i];
      let x = 0, y = 0;
      for (let j = i - dk; j <= i + dk; j++) { const q = wrap(P, j); x += q[0]; y += q[1]; }
      return [x / (2 * dk + 1), y / (2 * dk + 1)];
    });
    const at = (i) => wrap(S, i);

    // 1) 꺾인 각(±win px 창, 닫힌 획은 순환)
    const ang = S.map((p, i) => {
      const a = at(i - k), b = at(i + k);
      const v1x = p[0] - a[0], v1y = p[1] - a[1], v2x = b[0] - p[0], v2y = b[1] - p[1];
      const m = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
      return m ? Math.acos(Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / m))) : 0;
    });
    // 2) 꼭짓점과 반경 cornerR 램프
    const cornerRad = (o.cornerDeg * Math.PI) / 180;
    const corners = [];
    ang.forEach((a, i) => { if (a > cornerRad) corners.push(i); });
    const ramp = P.map((_, i) => {
      let d = Infinity;
      for (const c of corners) { const g = Math.abs(i - c); d = Math.min(d, closed ? Math.min(g, n - g) : g); }
      return Math.min(1, (d * h) / o.cornerR);
    });
    // 3) 곡률(꼭짓점은 0, 램프 곱 — 꼭짓점의 큰 각이 다듬기로 옆에 새지 않게) → 다듬기 → 고정 상수로 0~1 자르기 → 램프 곱
    const raw = ang.map((a, i) => (ramp[i] * a) / (2 * k * h));
    const sk = Math.max(1, Math.round(o.smoothPx / h));
    const curv = P.map((_, i) => {
      let s = 0, c = 0;
      for (let j = i - sk; j <= i + sk; j++) {
        if (!closed && (j < 0 || j >= n)) continue;
        s += raw[((j % n) + n) % n]; c++;
      }
      return Math.min(1, s / c / o.curvRef) * ramp[i];
    });
    // 법선
    const N = P.map((_, i) => {
      const a = at(i - dk), b = at(i + dk), tx = b[0] - a[0], ty = b[1] - a[1], m = Math.hypot(tx, ty) || 1;
      return [-ty / m, tx / m];
    });
    const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
    const D = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));

    const spread = Math.min(o.spread, o.spreadRel * D), offMax = Math.max(5.4, o.offMaxRel * D);
    const strands = [];
    for (let s = 0; s < passes; s++) {
      // 가닥 부호: 바깥 둘은 -1·+1, 셋째는 한쪽 바깥 가닥 근처로 붙여 가운데 흰 틈을 메우지 않게 한다
      const sign = s === 0 ? -1 : s === 1 ? 1 : (rand() < 0.5 ? -1 : 1) * (0.6 + 0.4 * rand());
      const scale = 0.8 + 0.4 * rand();
      const offNoise = makeNoise(rand, closed ? L : 0);
      const widNoise = makeNoise(rand, 0);
      const pts = P.map((p, i) => {
        const off = Math.max(-offMax, Math.min(offMax, sign * (o.base + spread * curv[i]) + o.wobble * offNoise(i * h)));
        return [p[0] + N[i][0] * off, p[1] + N[i][1] * off];
      });
      if (closed) {
        // 닫힌 획: 끝을 시작 쪽 경로를 따라 이어 그려 겹친다(틈 방지)
        const m = Math.round(Math.min(o.closeOverlap * (0.6 + 0.8 * rand()), 0.08 * L) / h);
        for (let i = 0; i <= m; i++) pts.push(pts[i].slice());
        // 시작점 바깥으로 꼬리(빠르게 그은 손의 시작 자국) — 끝은 그대로 시작 경로 위에 겹친다
        const tl = o.closeTail * D * (0.5 + 0.7 * rand()), tk = Math.min(n - 1, k);
        const tx = pts[0][0] - pts[tk][0], ty = pts[0][1] - pts[tk][1], tm = Math.hypot(tx, ty) || 1;
        const steps = Math.ceil(tl / h), head = [];
        for (let j = steps; j >= 1; j--) head.push([pts[0][0] + (tx / tm) * (tl * j) / steps, pts[0][1] + (ty / tm) * (tl * j) / steps]);
        pts.unshift(...head);
      } else {
        // 열린 획: 양 끝을 접선 방향으로 넘친다
        const ovs = [0, 1].map(() => Math.max(4, Math.min(o.overshoot * L, 0.05 * D) * (0.7 + 0.5 * rand())));
        const ext = (end, inner, len) => {
          const tx = end[0] - inner[0], ty = end[1] - inner[1], m = Math.hypot(tx, ty) || 1;
          const out = [], steps = Math.ceil(len / h);
          for (let j = 1; j <= steps; j++) { const d = (len * j) / steps; out.push([end[0] + (tx / m) * d, end[1] + (ty / m) * d]); }
          return out;
        };
        const head = ext(pts[0], pts[Math.min(n - 1, k)], ovs[0]).reverse();
        const tail = ext(pts[n - 1], pts[Math.max(0, n - 1 - k)], ovs[1]);
        pts.unshift(...head);
        pts.push(...tail);
      }
      const m = pts.length, SL = (m - 1) * h;
      const widths = pts.map((_, i) => {
        const u = i * h, e = Math.min(u, SL - u) / (o.taperFrac * SL);
        const taper = o.taperMin + (1 - o.taperMin) * Math.min(1, e);
        return o.size * scale * (1 + o.widthWobble * widNoise(u)) * taper;
      });
      strands.push({ points: pts, widths });
    }
    return strands;
  }

  globalThis.doodle = Object.assign(globalThis.doodle || {}, { doodle, DEFAULTS });
})();
