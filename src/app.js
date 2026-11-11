// 앱 — 그리는 칸에서 획을 모아 엔진으로 바꾸고 다시 그린다. PNG 저장 · 보관함.
(function () {
  'use strict';
  const { doodle, render, library } = globalThis.doodle;
  const $ = (id) => document.getElementById(id);
  const canvas = $('pad');
  const ctx = canvas.getContext('2d');
  const hint = $('hint');
  const done = [];      // 변환된 획(가닥 배열) 목록
  const raw = [];       // 원래 획 {points, seed} — 보관함에 저장되는 원본
  let strokeNo = 0;     // 시드 = 획 번호, 지우기 때 0
  let currentId = null; // 보관함에서 온(또는 저장한) 그림이면 그 id — 다시 저장하면 덮어쓴다
  let cur = null;
  window.__timings = [];

  function redraw() {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const strands of done) render(ctx, strands);
    hint.hidden = done.length > 0;
  }

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) * canvas.width) / r.width, ((e.clientY - r.top) * canvas.height) / r.height];
  }

  let statusTimer = 0;
  function say(msg) {
    $('status').textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { $('status').textContent = ''; }, 2000);
  }

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // shortcut: 펜 압력(e.pressure)은 무시한다 — 펜 굵기 반영이 필요해지면 widths 에 곱한다.
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    canvas.setPointerCapture(e.pointerId);
    hint.hidden = true;
    cur = [pos(e)];
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!cur) return;
    const p = pos(e), q = cur[cur.length - 1];
    cur.push(p);
    // 그리는 동안 얇은 미리보기 선
    ctx.save();
    ctx.strokeStyle = '#9aa7ab';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(q[0], q[1]);
    ctx.lineTo(p[0], p[1]);
    ctx.stroke();
    ctx.restore();
  });
  function finish() {
    if (!cur) return;
    const t0 = performance.now();
    const pts = cur;
    cur = null;
    strokeNo += 1;
    raw.push({ points: pts, seed: strokeNo });
    done.push(doodle(pts, { seed: strokeNo }));
    redraw(); // 원래 획(미리보기)은 지워지고 두들만 남는다
    window.__timings.push(performance.now() - t0);
    canvas.dataset.done = String(Number(canvas.dataset.done || 0) + 1);
  }
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  // Ctrl+Z — 마지막 한 획만 뺀다(시드 번호는 되돌리지 않음: 다음 획은 새 시드)
  function undo() {
    if (!raw.length) return;
    raw.pop();
    done.pop();
    redraw();
  }

  function clear() {
    done.length = 0;
    raw.length = 0;
    strokeNo = 0;
    currentId = null;
    redraw();
  }

  // 800×600 흰 배경에 원래 획을 엔진으로 다시 그린 캔버스
  function picture(strokes) {
    const c = document.createElement('canvas');
    c.width = 800; c.height = 600;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 800, 600);
    for (const s of strokes) render(x, doodle(s.points, { seed: s.seed }));
    return c;
  }
  function thumb(src) {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 120;
    c.getContext('2d').drawImage(src, 0, 0, 160, 120);
    return c.toDataURL('image/png');
  }

  const pad2 = (n) => String(n).padStart(2, '0');
  async function store() {
    if (!raw.length) return say('그린 것이 없습니다');
    const d = new Date();
    const old = currentId && (await library.all()).find((it) => it.id === currentId);
    const item = {
      id: currentId || Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: old ? old.name : `두들 ${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
      savedAt: d.getTime(),
      strokes: raw.map((s) => ({ points: s.points, seed: s.seed })),
      thumb: thumb(canvas),
    };
    await library.put([item]);
    currentId = item.id;
    say('보관함에 저장함');
    await list();
  }

  function load(item) {
    clear();
    for (const s of item.strokes) {
      raw.push({ points: s.points, seed: s.seed });
      done.push(doodle(s.points, { seed: s.seed }));
    }
    strokeNo = Math.max(0, ...item.strokes.map((s) => s.seed)); // 새 획은 최대 시드+1부터
    currentId = item.id;
    redraw();
    say('불러옴');
  }

  function btn(text, cls, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = text;
    b.addEventListener('click', () => fn(b));
    return b;
  }
  async function list() {
    const items = await library.all();
    const ul = $('lib');
    ul.replaceChildren();
    if (!items.length) {
      const li = document.createElement('li');
      li.textContent = '보관함이 비어 있습니다';
      ul.append(li);
    }
    for (const it of items) {
      const li = document.createElement('li');
      li.dataset.id = it.id;
      const img = document.createElement('img');
      img.src = it.thumb;
      img.alt = it.name;
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = it.name;
      const row = document.createElement('div');
      row.append(
        btn('불러오기', 'load', () => load(it)),
        btn('PNG 받기', 'png', () => picture(it.strokes).toBlob((b) => download(b, `doodle-${it.id}.png`), 'image/png')),
        btn('삭제', 'del', (b) => {
          if (b.dataset.armed) return library.remove(it.id).then(() => { say('삭제함'); return list(); }).catch(fail);
          b.dataset.armed = '1';
          b.textContent = '한 번 더 눌러 삭제';
          setTimeout(() => { delete b.dataset.armed; b.textContent = '삭제'; }, 3000);
        }),
      );
      li.append(img, name, row);
      ul.append(li);
    }
  }
  const fail = (e) => say('보관함 오류: ' + (e && e.message || e));

  // 가져오기는 바깥 파일 — 형식이 하나라도 틀리면 아무것도 넣지 않는다
  const num = Number.isFinite;
  function valid(data) {
    return data && data.version === 1 && Array.isArray(data.items) && data.items.every((it) =>
      it && typeof it.id === 'string' && it.id && typeof it.name === 'string' && num(it.savedAt) &&
      Array.isArray(it.strokes) && it.strokes.every((s) => s && num(s.seed) && Array.isArray(s.points) && s.points.length > 0 &&
        s.points.every((p) => Array.isArray(p) && num(p[0]) && num(p[1]))));
  }
  async function importFile(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { data = null; }
    if (!valid(data)) return say('가져오기 실패: 두들 보관함 파일 형식이 아닙니다');
    for (const it of data.items) {
      if (typeof it.thumb !== 'string' || !it.thumb.startsWith('data:image/png;')) it.thumb = thumb(picture(it.strokes));
    }
    await library.put(data.items.map(({ id, name, savedAt, strokes, thumb: t }) =>
      ({ id, name, savedAt, strokes: strokes.map((s) => ({ points: s.points, seed: s.seed })), thumb: t })));
    say(`${data.items.length}개 가져옴`);
    await list();
  }

  $('undo').addEventListener('click', undo);
  $('clear').addEventListener('click', clear);
  $('save').addEventListener('click', () => canvas.toBlob((b) => download(b, 'doodle.png'), 'image/png'));
  $('store').addEventListener('click', () => store().catch(fail));
  function setPanel(open) {
    $('panel').hidden = !open;
    $('libbtn').setAttribute('aria-expanded', String(open));
    $('libbtn').textContent = open ? '보관함 닫기' : '보관함 열기';
  }
  $('libbtn').addEventListener('click', () => setPanel($('panel').hidden));
  // 보관함이 열린 채 바깥을 누르면 접는다 — 그 누름은 접기에만 쓰고 그리는 칸에 획을 남기지 않는다
  document.addEventListener('pointerdown', (e) => {
    if ($('panel').hidden || $('panel').contains(e.target) || $('libbtn').contains(e.target)) return;
    setPanel(false);
    if (e.target === canvas) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  $('export').addEventListener('click', async () => {
    try {
      const items = await library.all();
      const d = new Date();
      const blob = new Blob([JSON.stringify({ version: 1, items })], { type: 'application/json' });
      download(blob, `doodle-library-${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}.json`);
    } catch (e) { fail(e); }
  });
  $('importbtn').addEventListener('click', () => $('import').click());
  $('import').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importFile(f).catch(fail);
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault(); // 브라우저 '페이지 저장' 대화상자 대신
      store().catch(fail);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.target.tagName !== 'INPUT') {
      e.preventDefault();
      undo();
    } else if (e.key === 'Delete' && e.target.tagName !== 'INPUT') {
      clear();
    }
  });

  redraw();
  list().catch(fail);
})();
