/*
  辨識紀錄：照片、影片、即時辨識每完成一次，就在這台電腦的瀏覽器裡存一筆，給「統計分析」頁使用
  - 存在 localStorage（只在這個瀏覽器、這台電腦），換電腦或清除瀏覽資料就會不見
  - 需要保存時，請在統計分析頁按「匯出」
  紀錄格式：{ id, type: 'photo'|'video'|'live', name, at, counts:[5 類], review, ms, backend, ...其他欄位 }
*/
(function (root) {
  const KEY = 'mv-log-v1', MAX = 1000;
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  const write = list => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); return true; } catch { return false; } };
  const api = {
    add(rec) {
      const list = read();
      const r = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: new Date().toISOString(), ...rec };
      list.push(r); write(list); return r;
    },
    list: read,
    remove(id) { write(read().filter(r => r.id !== id)); },
    clear() { write([]); },
    replace(list) { return write(list); },
  };
  root.MV_LOG = api;
})(window);
