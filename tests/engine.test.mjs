// node --test tests/engine.test.mjs — AC-4·5·6·11 (계획서 §4 시험 정의)
// 곡률·꼭짓점은 엔진 내부 함수를 쓰지 않고 입력 점에서 독립 계산한다(엔진과 같은 정의: ±8px 호 길이 창, 닫힌 획 순환).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

await import('../src/doodle.js');
const { doodle } = globalThis.doodle;

// 시험 상수 — 엔진 DEFAULTS 에서 읽지 않는다(조정 때 시험이 따라 움직이지 않게).
const WIN = 8;          // 꺾인 각을 재는 호 길이 창 ±px
const CORNER_DEG = 35;  // 꼭짓점 판정 각
const CORNER_R = 12;    // 꼭짓점 반경 r
const CLOSED_TOL = 6;
const T_TAPER = 0.8;    // 확정(2026-11-11 AC-10 사용자 OK, 기본값 size 5 · base 1.5 · wobble 1 · cornerR 70)
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const NAMES = ['heart', 'star', 'circle', 'wave', 'apple'];
const FIX = Object.fromEntries(NAMES.map((n) => [n, JSON.parse(fs.readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url)))]));

// ---- 기하 도우미 ----
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function polyDist(p, poly) {
  if (poly.length === 1) return dist(p, poly[0]);
  let m = Infinity;
  for (let i = 1; i < poly.length; i++) m = Math.min(m, segDist(p, poly[i - 1], poly[i]));
  return m;
}
function nearestIdx(p, pts) {
  let bi = 0, bd = Infinity;
  pts.forEach((q, i) => { const d = dist(p, q); if (d < bd) { bd = d; bi = i; } });
  return bi;
}
function bbox(pts) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
const diagOf = (pts) => { const b = bbox(pts); return Math.hypot(b[2] - b[0], b[3] - b[1]); };
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const isClosed = (s) => dist(s[0], s[s.length - 1]) <= CLOSED_TOL;

// 입력 획을 1px 간격으로 재표본(시험 자체 구현). 닫힌 획은 중복 끝점을 빼고 순환.
function resample(stroke, closed) {
  const src = closed ? [...stroke, stroke[0]] : stroke;
  const out = [src[0]];
  let carry = 0;
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1], b = src[i], L = dist(a, b);
    let s = 1 - carry;
    while (s <= L) { out.push([a[0] + ((b[0] - a[0]) * s) / L, a[1] + ((b[1] - a[1]) * s) / L]); s += 1; }
    carry = L - (s - 1);
  }
  if (closed && dist(out[out.length - 1], out[0]) < 0.5) out.pop();
  return out;
}

// 각 점의 꺾인 각(도)과 곡률(rad/px): ±WIN px 창의 두 방향 벡터 사이 각.
function analyze(stroke) {
  const closed = isClosed(stroke);
  const pts = resample(stroke, closed), n = pts.length;
  const at = (i) => (closed ? pts[((i % n) + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  const ang = pts.map((p, i) => {
    const a = at(i - WIN), b = at(i + WIN);
    const v1 = [p[0] - a[0], p[1] - a[1]], v2 = [b[0] - p[0], b[1] - p[1]];
    if (!Math.hypot(...v1) || !Math.hypot(...v2)) return 0;
    const c = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2));
    return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
  });
  const curv = ang.map((d) => (d * Math.PI) / 180 / (2 * WIN));
  const corners = [];
  ang.forEach((d, i) => { if (d > CORNER_DEG) corners.push(i); });
  // 1px 간격이므로 인덱스 차 = 호 길이(px)
  const cornerDist = pts.map((_, i) => Math.min(Infinity, ...corners.map((c) => {
    const d = Math.abs(i - c);
    return closed ? Math.min(d, n - d) : d;
  })));
  return { pts, closed, curv, corners, cornerDist, ang };
}

// 입력 점 p 에서 가닥 간 거리(가닥 쌍마다 한 가닥의 최근접점에서 다른 가닥 중심선까지, 쌍 평균)와 그 자리 평균 폭
function spreadAt(p, strands) {
  const near = strands.map((s) => nearestIdx(p, s.points));
  const ds = [];
  for (let a = 0; a < strands.length; a++)
    for (let b = 0; b < strands.length; b++)
      if (a !== b) ds.push(polyDist(strands[a].points[near[a]], strands[b].points));
  return { d: mean(ds), w: mean(strands.map((s, k) => s.widths[near[k]])) };
}

const quantile = (arr, q) => { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

const runs = {};
// 엔진은 획 하나를 받는다: doodle(points, opts) → 가닥 배열
const all = (name, seed) => FIX[name].map((s) => doodle(s, { seed }));
const run = (name, seed) => (runs[`${name}:${seed}`] ??= all(name, seed));

// ---- AC-4 가닥 수 ----
test('AC-4 가닥 수: 5 픽스처 × 시드 10, 획마다 2~3가닥', () => {
  for (const name of NAMES) for (const seed of SEEDS) {
    const out = run(name, seed);
    assert.equal(out.length, FIX[name].length, `${name}:${seed} 획 수`);
    out.forEach((strands, i) => {
      assert.ok(strands.length >= 2 && strands.length <= 3, `${name}:${seed} 획 ${i} 가닥 ${strands.length}`);
      for (const s of strands) assert.equal(s.points.length, s.widths.length);
    });
  }
});

// ---- AC-5 모양·위치 (AC-11 apple 획마다 포함) ----
function checkShape(stroke, strands, tag) {
  const D = diagOf(stroke), tol = Math.max(6, 0.03 * D), ov = Math.max(10, 0.06 * D);
  const inPts = resample(stroke, isClosed(stroke));
  for (const [k, s] of strands.entries()) {
    const miss = Math.max(...inPts.map((p) => polyDist(p, s.points)));
    assert.ok(miss <= tol, `${tag} 가닥${k}: 입력→가닥 최대 ${miss.toFixed(2)} > tol ${tol.toFixed(2)}`);
    const out = Math.max(...s.points.map((p) => polyDist(p, stroke)));
    assert.ok(out <= tol + ov, `${tag} 가닥${k}: 가닥→입력 최대 ${out.toFixed(2)} > ${(tol + ov).toFixed(2)}`);
    const bi = bbox(stroke), bs = bbox(s.points);
    const edge = Math.max(...bi.map((v, j) => Math.abs(v - bs[j])));
    assert.ok(edge <= 0.05 * D + ov, `${tag} 가닥${k}: 경계상자 변 차 ${edge.toFixed(2)}`);
  }
}
test('AC-5 모양·위치: 5 픽스처 × 시드 10', () => {
  for (const name of NAMES) for (const seed of SEEDS)
    run(name, seed).forEach((strands, i) => checkShape(FIX[name][i], strands, `${name}:${seed}:${i}`));
});

// ---- AC-6 겹선 모양 (한 획 픽스처 4개) ----
const SINGLE = ['heart', 'star', 'circle', 'wave'];

test('AC-6 곡률 비례 벌어짐: heart·wave, 꼭짓점 r 밖 곡률 상위 20% 평균 거리 > 하위 20% × 1.5', () => {
  for (const name of ['heart', 'wave']) {
    const A = analyze(FIX[name][0]);
    const idx = A.pts.map((_, i) => i).filter((i) => A.cornerDist[i] > CORNER_R);
    const cs = idx.map((i) => A.curv[i]);
    const hi = idx.filter((i) => A.curv[i] >= quantile(cs, 0.8));
    const lo = idx.filter((i) => A.curv[i] <= quantile(cs, 0.2));
    assert.ok(hi.length > 0 && lo.length > 0);
    for (const seed of SEEDS) {
      const st = run(name, seed)[0];
      const dHi = mean(hi.map((i) => spreadAt(A.pts[i], st).d));
      const dLo = mean(lo.map((i) => spreadAt(A.pts[i], st).d));
      assert.ok(dHi > 1.5 * dLo, `${name}:${seed} 상위 ${dHi.toFixed(2)} vs 하위 ${dLo.toFixed(2)}`);
    }
  }
});

test('AC-6 꼭짓점에서 붙음: heart 아래 끝·위 골, star 끝 — 반경 r 안 각 점에서 가닥 간 거리 < 그 자리 평균 폭', () => {
  for (const name of ['heart', 'star']) {
    const A = analyze(FIX[name][0]);
    // 꼭짓점 덩어리 수: heart = 아래 끝 + 위 골 2곳, star = 10곳
    const groups = A.corners.filter((c, j) => {
      const prev = A.corners[(j - 1 + A.corners.length) % A.corners.length];
      const gap = Math.abs(c - prev);
      return A.corners.length === 1 || Math.min(gap, A.pts.length - gap) > 1;
    }).length;
    assert.equal(groups, name === 'heart' ? 2 : 10, `${name} 꼭짓점 덩어리 수`);
    const near = A.pts.map((_, i) => i).filter((i) => A.cornerDist[i] <= CORNER_R);
    assert.ok(near.length > 0);
    for (const seed of SEEDS) {
      const st = run(name, seed)[0];
      for (const i of near) {
        const { d, w } = spreadAt(A.pts[i], st);
        assert.ok(d < w, `${name}:${seed} 점 ${i}(꼭짓점에서 ${A.cornerDist[i]}px) 거리 ${d.toFixed(2)} ≥ 폭 ${w.toFixed(2)}`);
      }
    }
  }
});

test('AC-6 곧은 구간 붙음: 곡률 하위 20% 평균 거리 < 그 구간 평균 폭', () => {
  for (const name of ['heart', 'star', 'wave']) {
    const A = analyze(FIX[name][0]);
    const idx = A.pts.map((_, i) => i).filter((i) => A.cornerDist[i] > CORNER_R);
    const lo = idx.filter((i) => A.curv[i] <= quantile(idx.map((j) => A.curv[j]), 0.2));
    assert.ok(lo.length > 0);
    for (const seed of SEEDS) {
      const r = lo.map((i) => spreadAt(A.pts[i], run(name, seed)[0]));
      const d = mean(r.map((x) => x.d)), w = mean(r.map((x) => x.w));
      assert.ok(d < w, `${name}:${seed} 거리 ${d.toFixed(2)} ≥ 폭 ${w.toFixed(2)}`);
    }
  }
});

test('AC-6 가닥이 서로 다름: 가닥 간 평균 거리 > 0.5px', () => {
  for (const name of SINGLE) {
    const A = analyze(FIX[name][0]);
    for (const seed of SEEDS) {
      const d = mean(A.pts.filter((_, i) => i % 4 === 0).map((p) => spreadAt(p, run(name, seed)[0]).d));
      assert.ok(d > 0.5, `${name}:${seed} ${d.toFixed(2)}`);
    }
  }
});

test('AC-6 굵기 흔들림: 가닥 가운데 60% 폭 변동계수 ≥ 0.05', () => {
  for (const name of SINGLE) for (const seed of SEEDS) for (const [k, s] of run(name, seed)[0].entries()) {
    const n = s.widths.length, mid = s.widths.slice(Math.floor(0.2 * n), Math.ceil(0.8 * n));
    const m = mean(mid), cv = Math.sqrt(mean(mid.map((w) => (w - m) ** 2))) / m;
    assert.ok(cv >= 0.05, `${name}:${seed} 가닥${k} CV ${cv.toFixed(3)}`);
  }
});

test(`AC-6 끝 가늘어짐: 양 끝 5% 평균 폭 / 가운데 평균 폭 < T_TAPER(${T_TAPER})`, () => {
  for (const name of SINGLE) for (const seed of SEEDS) for (const [k, s] of run(name, seed)[0].entries()) {
    const n = s.widths.length, e = Math.max(1, Math.round(0.05 * n));
    const mid = mean(s.widths.slice(Math.floor(0.2 * n), Math.ceil(0.8 * n)));
    for (const end of [s.widths.slice(0, e), s.widths.slice(n - e)]) {
      const r = mean(end) / mid;
      assert.ok(r < T_TAPER, `${name}:${seed} 가닥${k} 끝/가운데 ${r.toFixed(3)}`);
    }
  }
});

test('AC-6 overshoot: 열린 획은 끝점이 접선 방향으로 2px 넘게, 닫힌 획은 끝점이 첫 10% 경로 위(≤ 폭/2)', () => {
  for (const name of ['wave', 'heart', 'circle']) {
    const stroke = FIX[name][0], closed = isClosed(stroke);
    const pts = resample(stroke, closed);
    for (const seed of SEEDS) for (const [k, s] of run(name, seed)[0].entries()) {
      if (closed) {
        const head = s.points.slice(0, Math.max(2, Math.ceil(0.1 * s.points.length)));
        const d = polyDist(s.points[s.points.length - 1], head), w = s.widths[s.widths.length - 1];
        assert.ok(d <= w / 2, `${name}:${seed} 가닥${k} 끝→시작 경로 ${d.toFixed(2)} > ${(w / 2).toFixed(2)}`);
      } else {
        const ends = [[pts[0], pts[WIN], s.points[0]], [pts.at(-1), pts.at(-1 - WIN), s.points.at(-1)]];
        const beyond = ends.map(([e, inner, sp]) => {
          const t = [e[0] - inner[0], e[1] - inner[1]], L = Math.hypot(...t);
          return ((sp[0] - e[0]) * t[0] + (sp[1] - e[1]) * t[1]) / L;
        });
        assert.ok(Math.max(...beyond) > 2, `${name}:${seed} 가닥${k} 넘침 ${beyond.map((b) => b.toFixed(2))}`);
      }
    }
  }
});

// ---- AC-11 여러 획·결정성 ----
test('AC-11 여러 획(apple 획마다 AC-4·5)·결정성', () => {
  for (const seed of SEEDS) {
    const out = run('apple', seed);
    assert.equal(out.length, 3);
    out.forEach((strands, i) => {
      assert.ok(strands.length >= 2 && strands.length <= 3);
      checkShape(FIX.apple[i], strands, `apple:${seed}:${i}`);
    });
  }
  for (const name of NAMES) {
    assert.equal(JSON.stringify(all(name, 3)), JSON.stringify(all(name, 3)), `${name} 같은 시드`);
    assert.notEqual(JSON.stringify(all(name, 3)), JSON.stringify(all(name, 4)), `${name} 다른 시드`);
  }
});
