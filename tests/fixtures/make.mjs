// 픽스처 생성식 — `node tests/fixtures/make.mjs` 로 *.json 을 다시 만든다.
// px 규약: 좌표는 캔버스 px(800×600), 경계상자 대각선 300~500px, 가장자리 여백 20px 이상.
// 형식: 획 배열 [[[x,y],...], ...]. 소수 둘째 자리로 반올림.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const r2 = (v) => Math.round(v * 100) / 100;
const range = (n) => Array.from({ length: n }, (_, i) => i);

// 하트: x=16sin³t, y=13cost-5cos2t-2cos3t-cos4t, 배율 7.5, 중심 (400,300), y 뒤집음.
// t=π(아래 끝)에서 시작해 한 바퀴, 끝점=시작점(닫힌 획). 대각선 약 323px.
const heart = [range(401).map((i) => {
  const t = Math.PI + (2 * Math.PI * i) / 400;
  const x = 16 * Math.sin(t) ** 3;
  const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  return [400 + 7.5 * x, 300 - 7.5 * y];
})];

// 별: 꼭짓점 5개, 바깥 반지름 180, 안 반지름 72, 중심 (400,320), 맨 위 꼭짓점에서 시작해 닫음.
// 변마다 25 등분. 대각선 약 472px.
const starCorners = range(11).map((i) => {
  const a = -Math.PI / 2 + (Math.PI * i) / 5;
  const rr = i % 2 ? 72 : 180;
  return [400 + rr * Math.cos(a), 320 + rr * Math.sin(a)];
});
const star = [starCorners.slice(1).flatMap((b, j) => {
  const a = starCorners[j];
  return range(25).map((k) => [a[0] + ((b[0] - a[0]) * k) / 25, a[1] + ((b[1] - a[1]) * k) / 25]);
}).concat([starCorners[0]])];

// 원: 반지름 130, 중심 (400,300), 300 등분, 끝점=시작점. 대각선 약 368px.
const circle = [range(301).map((i) => {
  const a = (2 * Math.PI * i) / 300;
  return [400 + 130 * Math.cos(a), 300 + 130 * Math.sin(a)];
})];

// 물결(열린 획): x 200→600, y = 300 + 60·sin(2π(x-200)/260), 2px 간격. 대각선 약 412px.
const wave = [range(201).map((i) => {
  const x = 200 + 2 * i;
  return [x, 300 + 60 * Math.sin((2 * Math.PI * (x - 200)) / 260)];
})];

// 사과(여러 획): 몸통(닫힘, 위쪽 골) · 꼭지(열림) · 잎(닫힘). 전체 대각선 약 380px.
const body = range(241).map((i) => {
  const t = (2 * Math.PI * i) / 240; // t=0 이 위쪽 골
  const w = ((t + Math.PI) % (2 * Math.PI)) - Math.PI;
  return [400 + 130 * Math.sin(t), 340 - 120 * Math.cos(t) + 35 * Math.exp(-((w / 0.4) ** 2))];
});
const stem = range(31).map((i) => {
  const u = i / 30;
  return [400 + 12 * u + 6 * Math.sin(Math.PI * u), 252 - 80 * u];
});
const leaf = range(61).map((i) => {
  const a = (2 * Math.PI * i) / 60; // 아몬드: 긴 축 70px, 두께 ±16px, 30° 기울임
  const lx = 35 * Math.cos(a), ly = 16 * Math.sin(a) * Math.abs(Math.sin(a)) ** 0.3;
  const c = Math.cos(-0.5), s = Math.sin(-0.5);
  return [450 + lx * c - ly * s, 205 + lx * s + ly * c];
});
const apple = [body, stem, leaf];

const all = { heart, star, circle, wave, apple };
for (const [name, strokes] of Object.entries(all)) {
  const pts = strokes.flat();
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const diag = Math.hypot(x1 - x0, y1 - y0);
  console.log(name, 'diag', diag.toFixed(1), 'bbox', [x0, y0, x1, y1].map((v) => v.toFixed(0)).join(','));
  if (diag < 300 || diag > 500) throw new Error(`${name}: 대각선 ${diag} 이 300~500 밖`);
  if (x0 < 20 || y0 < 20 || x1 > 780 || y1 > 580) throw new Error(`${name}: 여백 20px 미만`);
  fs.writeFileSync(path.join(DIR, `${name}.json`), JSON.stringify(strokes.map((s) => s.map((p) => p.map(r2)))) + '\n');
}
