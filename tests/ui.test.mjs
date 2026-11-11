// node --test tests/ui.test.mjs — 화면 U1~U4 (2판 계획서). file:// 로 열고 페이지 오류 0 도 판정.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { launch } from './pw.mjs';

const URL_ = pathToFileURL(new URL('../src/index.html', import.meta.url).pathname).href;
let browser;
const errors = [];

async function open(width, height) {
  const page = await (await browser.newContext({ viewport: { width, height }, acceptDownloads: true })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL_);
  return page;
}
// pad 좌표(800×600 기준)로 그린다
async function stroke(page, pts) {
  const b = await page.locator('#pad').boundingBox();
  const k = b.width / 800;
  const n = Number(await page.locator('#pad').getAttribute('data-done'));
  await page.mouse.move(b.x + pts[0][0] * k, b.y + pts[0][1] * k);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) await page.mouse.move(b.x + x * k, b.y + y * k);
  await page.mouse.up();
  await page.waitForFunction((m) => document.getElementById('pad').dataset.done === String(m), n + 1);
}
const line = (x0, y0, x1, y1) => Array.from({ length: 30 }, (_, i) => [x0 + ((x1 - x0) * i) / 29, y0 + ((y1 - y0) * i) / 29]);
const dark = (page, x = 0, y = 0, w = 800, h = 600) => page.evaluate(([x, y, w, h]) => {
  const d = document.getElementById('pad').getContext('2d').getImageData(x, y, w, h).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 128) n++;
  return n;
}, [x, y, w, h]);

before(async () => { browser = await launch(); });
after(async () => {
  await browser?.close();
  assert.deepEqual(errors, [], '페이지 스크립트 오류');
});

test('U1 빈 칸 안내: 보임 → 한 획에 숨음 → 지우기에 다시 보임', async () => {
  const page = await open(1440, 900);
  assert.ok(await page.isVisible('#hint'));
  assert.match(await page.textContent('#hint'), /여기에 그려 보세요/);
  assert.equal(await page.$eval('#hint', (e) => getComputedStyle(e).pointerEvents), 'none');
  await stroke(page, line(100, 300, 700, 300));
  assert.ok(!(await page.isVisible('#hint')));
  await page.click('#clear');
  assert.ok(await page.isVisible('#hint'));
});

test('U2 Ctrl+S → 보관함 +1·다운로드 없음 / Delete → 칸 비움', async () => {
  const page = await open(1440, 900);
  let downloads = 0;
  page.on('download', () => downloads++);
  await stroke(page, line(100, 300, 700, 300));
  await page.keyboard.press('Control+s');
  await page.waitForFunction(async () => (await globalThis.doodle.library.all()).length === 1);
  await page.waitForTimeout(300);
  assert.equal(downloads, 0, '브라우저 다운로드 없음');
  assert.ok((await dark(page)) > 0);
  await page.keyboard.press('Delete');
  assert.equal(await dark(page), 0, '어두운 픽셀 0');
  assert.equal(await page.getAttribute('#pad', 'data-done'), '1', 'data-done 그대로');
});

test('U3 1440×900 가로 중앙 · 1024×600 가로 스크롤 없음·칸 전체가 창 안', async () => {
  let page = await open(1440, 900);
  let b = await page.locator('#pad').boundingBox();
  const left = b.x, right = 1440 - (b.x + b.width);
  assert.ok(Math.abs(left - right) <= 2, `좌 ${left} 우 ${right}`);
  page = await open(1024, 600);
  b = await page.locator('#pad').boundingBox();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '가로 스크롤 없음');
  assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= 1024 && b.y + b.height <= 600, `칸 ${JSON.stringify(b)}`);
  assert.ok(Math.abs(b.width / b.height - 4 / 3) < 0.01, '비율 유지');
  assert.deepEqual(await page.$eval('#pad', (c) => [c.width, c.height]), [800, 600], '내부 해상도 그대로');
});

test('U4 줄어든 칸(1024 폭)에 그린 획이 손 위치에 그려짐', async () => {
  const page = await open(1024, 600);
  const b = await page.locator('#pad').boundingBox();
  assert.ok(b.width < 800, `칸이 줄어 있어야 함 (${b.width})`);
  await stroke(page, line(100, 450, 700, 450)); // 내부 좌표 y=450 가로선
  assert.ok((await dark(page, 0, 430, 800, 40)) > 300, '손 위치(y≈450) 둘레에 선');
  assert.equal(await dark(page, 0, 0, 800, 400), 0, '다른 곳은 비어 있음');
});

test('U5 Ctrl+Z → 마지막 한 획만 빠짐, 다 빼면 빈 칸 안내', async () => {
  const page = await open(1440, 900);
  await stroke(page, line(100, 150, 700, 150));
  const one = await dark(page);
  await stroke(page, line(100, 450, 700, 450));
  assert.ok((await dark(page)) > one);
  await page.keyboard.press('Control+z');
  assert.equal(await dark(page, 0, 350, 800, 200), 0, '두 번째 획이 남아 있음');
  assert.ok((await dark(page, 0, 50, 800, 200)) > 0, '첫 획까지 빠짐');
  await page.keyboard.press('Control+z');
  assert.equal(await dark(page), 0);
  assert.ok(await page.isVisible('#hint'));
  await page.keyboard.press('Control+z'); // 빈 칸에서 눌러도 오류 없음
});

test('U6 보관함: 안쪽 누름은 그대로, 바깥(그리는 칸 포함) 누름이면 접힘·획 안 남김', async () => {
  const page = await open(1440, 900);
  await page.click('#libbtn');
  assert.ok(await page.isVisible('#panel'));
  await page.click('#panel', { position: { x: 20, y: 300 } });
  assert.ok(await page.isVisible('#panel'), '안쪽 누름에 접힘');
  const n = await page.locator('#pad').getAttribute('data-done');
  const b = await page.locator('#pad').boundingBox();
  await page.mouse.move(b.x + 100, b.y + 100);
  await page.mouse.down();
  await page.mouse.move(b.x + 300, b.y + 100);
  await page.mouse.up();
  assert.ok(!(await page.isVisible('#panel')), '그리는 칸 누름에 안 접힘');
  assert.equal(await page.locator('#pad').getAttribute('data-done'), n, '접는 누름이 획을 남김');
  assert.equal(await dark(page), 0);
  assert.equal(await page.textContent('#libbtn'), '보관함 열기');
  await page.click('#libbtn');
  await page.mouse.click(20, 880); // 칸 바깥 빈 곳
  assert.ok(!(await page.isVisible('#panel')));
});

test('U7 제목 Doodle Stroke', async () => {
  const page = await open(1440, 900);
  assert.equal(await page.title(), 'Doodle Stroke');
  assert.ok(await page.isVisible('text=Doodle Stroke'));
});

test('U8 되돌리기 버튼 = Ctrl+Z (마지막 한 획만 빠짐)', async () => {
  const page = await open(1440, 900);
  assert.match(await page.textContent('#undo'), /되돌리기/);
  await stroke(page, line(100, 150, 700, 150));
  await stroke(page, line(100, 450, 700, 450));
  await page.click('#undo');
  assert.equal(await dark(page, 0, 350, 800, 200), 0, '두 번째 획이 남아 있음');
  assert.ok((await dark(page, 0, 50, 800, 200)) > 0, '첫 획까지 빠짐');
  await page.click('#undo');
  assert.equal(await dark(page), 0);
  await page.click('#undo'); // 빈 칸에서 눌러도 오류 없음
});

test('U9 배경: 엔진으로 그린 낙서 무늬(data PNG)가 깔림, 바깥 그림 없음', async () => {
  const page = await open(1440, 900);
  assert.match(await page.evaluate(() => document.body.style.backgroundImage), /^url\("data:image\/png;base64,/);
});
