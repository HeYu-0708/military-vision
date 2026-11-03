/*
  多目標追蹤（ByteTrack 精簡版）：同一個目標在不同幀保持同一個 ID，計數時只算一次
  - 高信心度的偵測（≥ 門檻）可以建立或延續軌跡
  - 低信心度的偵測（< 門檻）只用來延續已存在的軌跡，避免目標短暫變模糊就被當成新目標
  - 只有同類別才會互相配對；連續出現 3 次以上才確認為一個目標
*/
(function (root) {
  const iou = (a, b) => {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    return inter / (a.w * a.h + b.w * b.h - inter + 1e-9);
  };

  /**
   * samples: [{ t, dets: [{cls, conf, x, y, w, h}] }]，dets 是用低門檻（例如 0.1）解出來的全部候選
   * opts: { conf: 計數門檻, maxLostSec: 目標消失多久後結束軌跡, minHits: 確認所需次數 }
   * 回傳 { frames: [{ t, objs:[{id, cls, conf, x, y, w, h}] }], tracks: [{id, cls, first, last, meanConf, hits}] }
   */
  /**
   * 建立一個逐幀追蹤器（即時辨識用）：每來一幀就呼叫 step(t, dets)
   * opts: { conf: 計數門檻, maxLostSec: 目標消失多久後結束軌跡, minHits: 確認所需次數 }
   * step 回傳這一幀畫面中已確認的目標 [{id, cls, conf, x, y, w, h}]
   * tracks() 回傳到目前為止所有已確認的軌跡 [{id, cls, first, last, meanConf, hits}]
   */
  function create(opts = {}) {
    const minHits = opts.minHits ?? 3, maxLostSec = opts.maxLostSec ?? 1.2;
    let thr = opts.conf ?? 0.25, live = [], nextId = 1;
    const done = [];

    const predict = t => ({ x: t.x + t.vx, y: t.y + t.vy, w: Math.max(1, t.w + t.vw), h: Math.max(1, t.h + t.vh) });
    function match(tracks, dets, thrIou) {
      const pairs = [];
      tracks.forEach((t, i) => { const p = predict(t); dets.forEach((d, j) => {
        if (d.cls !== t.cls) return; const v = iou(p, d); if (v >= thrIou) pairs.push([v, i, j]); }); });
      pairs.sort((a, b) => b[0] - a[0]);
      const ut = new Set(tracks.map((_, i) => i)), ud = new Set(dets.map((_, j) => j)), m = [];
      for (const [, i, j] of pairs) if (ut.has(i) && ud.has(j)) { ut.delete(i); ud.delete(j); m.push([i, j]); }
      return { m, ut: [...ut], ud: [...ud] };
    }
    function update(t, d, time) {
      const nx = 0.3 * t.x + 0.7 * d.x, ny = 0.3 * t.y + 0.7 * d.y, nw = 0.3 * t.w + 0.7 * d.w, nh = 0.3 * t.h + 0.7 * d.h;
      t.vx = 0.5 * t.vx + 0.5 * (nx - t.x); t.vy = 0.5 * t.vy + 0.5 * (ny - t.y);
      t.vw = 0.5 * t.vw + 0.5 * (nw - t.w); t.vh = 0.5 * t.vh + 0.5 * (nh - t.h);
      Object.assign(t, { x: nx, y: ny, w: nw, h: nh, conf: d.conf, lost: 0, lastT: time });
      t.hits++; t.confSum += d.conf;
      if (t.id === null && t.hits >= minHits) t.id = nextId++;
    }
    const close = t => { if (t.id !== null) done.push({ id: t.id, cls: t.cls, first: t.firstT, last: t.lastT, meanConf: t.confSum / t.hits, hits: t.hits }); };

    function step(time, dets) {
      const hi = dets.filter(d => d.conf >= thr), lo = dets.filter(d => d.conf < thr);
      const a = match(live, hi, 0.2);
      a.m.forEach(([i, j]) => update(live[i], hi[j], time));
      const rest = a.ut.map(i => live[i]);
      const b = match(rest, lo, 0.3);
      b.m.forEach(([i, j]) => update(rest[i], lo[j], time));
      b.ut.forEach(i => { const t = rest[i]; const p = predict(t); Object.assign(t, p); t.vx *= .7; t.vy *= .7; t.vw *= .7; t.vh *= .7; t.lost++; });
      live = live.filter(t => { const gone = t.lost > 0 && time - t.lastT > maxLostSec; if (gone) close(t); return !gone; });
      // 還沒確認的軌跡只要漏一次就丟掉，避免雜訊累積
      live = live.filter(t => t.id !== null || t.lost === 0);
      a.ud.forEach(j => { const d = hi[j];
        live.push({ cls: d.cls, x: d.x, y: d.y, w: d.w, h: d.h, vx: 0, vy: 0, vw: 0, vh: 0, conf: d.conf, hits: 1, confSum: d.conf, lost: 0, id: minHits <= 1 ? nextId++ : null, firstT: time, lastT: time }); });
      return live.filter(t => t.id !== null && t.lost === 0).map(t => ({ id: t.id, cls: t.cls, conf: t.conf, x: t.x, y: t.y, w: t.w, h: t.h }));
    }
    function tracks() {
      const open = live.filter(t => t.id !== null).map(t => ({ id: t.id, cls: t.cls, first: t.firstT, last: t.lastT, meanConf: t.confSum / t.hits, hits: t.hits }));
      return [...done, ...open].sort((a, b) => a.id - b.id);
    }
    return { step, tracks, setConf: c => { thr = c; } };
  }

  /**
   * 整段影片一次追蹤（影片辨識頁用）
   * samples: [{ t, dets: [{cls, conf, x, y, w, h}] }]，dets 是用低門檻（例如 0.1）解出來的全部候選
   * 回傳 { frames: [{ t, objs }], tracks }
   */
  function run(samples, opts = {}) {
    const tr = create(opts);
    const frames = samples.map(s => ({ t: s.t, objs: tr.step(s.t, s.dets) }));
    return { frames, tracks: tr.tracks() };
  }

  const api = { run, create, iou };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MV_TRACK = api;
})(typeof window !== 'undefined' ? window : globalThis);
