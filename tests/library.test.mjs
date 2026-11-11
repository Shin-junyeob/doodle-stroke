// node --test tests/library.test.mjs — 보관함 L1~L7 (2판 계획서). file:// 로 열고 페이지 오류 0 도 판정.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { launch } from './pw.mjs';

const URL_ = pathToFileURL(new URL('../src/index.html', import.meta.url).pathname).href;
let browser, page;
const errors = [];

// 보관함 패널은 바깥을 누르면 접힌다(U6) — 사용자처럼 그리기 전엔 닫고, 목록을 볼 땐 다시 연다
const setLib = async (open) => { if ((await page.isVisible('#panel')) !== open) await page.click('#libbtn'); };
async function stroke(pts) {
  await setLib(false);
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
const dark = () => page.evaluate(() => {
  const d = document.getElementById('pad').getContext('2d').getImageData(0, 0, 800, 600).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] < 128) n++;
  return n;
});
const items = () => page.locator('#lib li[data-id]');
const stored = () => page.evaluate(() => globalThis.doodle.library.all());
async function decodePng(buf) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    return { w: img.width, h: img.height, px: Array.from(x.getImageData(0, 0, 1, 1).data) };
  }, buf.toString('base64'));
}

before(async () => {
  browser = await launch();
  page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL_);
  await page.click('#libbtn');
});
after(async () => {
  await browser?.close();
  assert.deepEqual(errors, [], '페이지 스크립트 오류');
});

let before3;
test('L1 저장→목록: 두 획 저장하면 목록 1개, 썸네일 img', async () => {
  await stroke(line(100, 100, 500, 400));
  await stroke(line(500, 100, 150, 450));
  await page.click('#store');
  await setLib(true);
  await assert.doesNotReject(items().first().waitFor());
  assert.equal(await items().count(), 1);
  assert.match(await items().first().locator('img').getAttribute('src'), /^data:image\/png;base64,/);
  assert.match(await page.textContent('#status'), /보관함에 저장함/);
});

test('L2 새로고침 뒤에도 목록이 남음', async () => {
  before3 = await dark();
  await page.reload();
  await page.click('#libbtn');
  await items().first().waitFor();
  assert.equal(await items().count(), 1);
  assert.deepEqual(errors, []);
});

test('L3 불러오기 = 같은 그림 (어두운 픽셀 수 차 ≤ 1%)', async () => {
  assert.equal(await dark(), 0, '새로고침 뒤 칸은 비어 있음');
  await items().first().locator('button.load').click();
  const n = await dark();
  assert.ok(before3 > 0);
  assert.ok(Math.abs(n - before3) <= before3 * 0.01, `저장 전 ${before3} · 불러온 뒤 ${n}`);
});

test('L4 이어 그리기: 한 획 더 → 다시 저장 → 항목 1, 획 3', async () => {
  await stroke(line(300, 500, 700, 500));
  await page.click('#store');
  await setLib(true);
  await page.waitForFunction(async () => (await globalThis.doodle.library.all())[0]?.strokes.length === 3);
  const all = await stored();
  assert.equal(all.length, 1);
  assert.equal(all[0].strokes.length, 3);
  assert.deepEqual(all[0].strokes.map((s) => s.seed), [1, 2, 3], '새 획은 최대 시드+1');
  assert.equal(await items().count(), 1);
});

test('L5 PNG 받기: 서명·800×600·왼쪽 위 흰색', async () => {
  await page.click('#clear');
  await setLib(true);
  const [dl] = await Promise.all([page.waitForEvent('download'), items().first().locator('button.png').click()]);
  const buf = fs.readFileSync(await dl.path());
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const { w, h, px } = await decodePng(buf);
  assert.deepEqual([w, h], [800, 600]);
  assert.deepEqual(px, [255, 255, 255, 255]);
  assert.equal(await dark(), 0, '칸을 건드리지 않음');
});

let exported;
test('L6 삭제: 한 번 누르면 남고 두 번 누르면 사라짐 (내보내기 먼저)', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  assert.match(dl.suggestedFilename(), /^doodle-library-\d{8}\.json$/);
  exported = await dl.path();
  const del = items().first().locator('button.del');
  await del.click();
  assert.equal(await items().count(), 1, '한 번 누르면 남음');
  assert.equal((await stored()).length, 1);
  await del.click();
  await page.waitForFunction(() => !document.querySelector('#lib li[data-id]'));
  assert.equal((await stored()).length, 0);
});

test('L7 내보내기→가져오기 왕복 · 잘못된 JSON 은 거부', async () => {
  const want = JSON.parse(fs.readFileSync(exported, 'utf8'));
  assert.equal(want.version, 1);
  assert.equal(want.items.length, 1);
  await page.setInputFiles('#import', exported);
  await items().first().waitFor();
  const got = await stored();
  assert.equal(got.length, want.items.length);
  assert.deepEqual(got.map((it) => it.strokes), want.items.map((it) => it.strokes), '같은 획 데이터');

  for (const bad of ['{not json', JSON.stringify({ version: 1, items: [{ id: 'x', strokes: 'nope' }] })]) {
    await page.setInputFiles('#import', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(bad) });
    await page.waitForFunction(() => /실패/.test(document.getElementById('status').textContent));
    assert.equal((await stored()).length, 1, '보관함 그대로');
    assert.equal(await items().count(), 1);
    await page.evaluate(() => { document.getElementById('status').textContent = ''; });
  }
});
