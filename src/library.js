// 보관함 — 브라우저 IndexedDB 에 그림 항목({id, name, savedAt, strokes:[{points, seed}], thumb})을 둔다. file:// 에서도 동작.
(function () {
  'use strict';
  let dbp = null;
  function db() {
    return dbp || (dbp = new Promise((ok, no) => {
      const r = indexedDB.open('doodle', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('items', { keyPath: 'id' });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => no(r.error);
    }));
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((ok, no) => {
      const t = d.transaction('items', mode);
      const req = fn(t.objectStore('items'));
      t.oncomplete = () => ok(req && req.result);
      t.onerror = t.onabort = () => no(t.error);
    });
  }
  const library = {
    all: () => tx('readonly', (s) => s.getAll()).then((a) => a.sort((x, y) => y.savedAt - x.savedAt)),
    put: (items) => tx('readwrite', (s) => { for (const it of items) s.put(it); }),
    remove: (id) => tx('readwrite', (s) => s.delete(id)),
  };
  globalThis.doodle = Object.assign(globalThis.doodle || {}, { library });
})();
