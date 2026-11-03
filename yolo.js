/*
  MILITARY VISION 共用的 YOLO 推論工具（照片、影片、即時辨識都用這一支）
  - 模型：本組訓練的 YOLO11m，匯出為 best.onnx（輸入 1x3x640x640，輸出 1x9x8400）
  - 執行：瀏覽器內的 onnxruntime-web，優先用 WebGPU，不支援時改用 WASM
  - 前處理與後處理跟 Ultralytics 相同：letterbox 補灰邊 → RGB/255 → 類別分數取最大 → 依類別做 NMS
*/
(function (root) {
  const CLASSES = [
    // 顏色已用色盲模擬檢查過（深色底 #0c1b25），ink 是色塊上的文字顏色
    { name: 'aeroplane',        zh: '戰機',     color: '#3987e5', ink: '#ffffff' },
    { name: 'military vehicle', zh: '軍用車輛', color: '#d95926', ink: '#ffffff' },
    { name: 'person',           zh: '人員',     color: '#199e70', ink: '#ffffff' },
    { name: 'tank',             zh: '戰車',     color: '#c98500', ink: '#0b0b0b' },
    { name: 'warship',          zh: '戰艦',     color: '#d55181', ink: '#ffffff' },
  ];
  let SIZE = 640;                  // 模型輸入尺寸，載入時由 model.json 決定
  let INFO = { name: 'YOLO11m', conf: 0.4 };
  const ORT_VERSION = '1.20.1';
  const ORT_CDN = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;
  const ORT_LOCAL = 'ort/';   // 離線展示：把 onnxruntime-web 的檔案放在這裡就不需要網路

  /* ---------- 後處理（純運算，可在 Node 測試） ---------- */
  function iou(a, b) {
    const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    return inter / (a.w * a.h + b.w * b.h - inter + 1e-9);
  }

  /**
   * out: Float32Array，長度 9*8400，排列為 [4+類別數][8400]
   * meta: { r, dx, dy, W, H } 由 letterbox 產生，用來把框換回原圖座標
   * 回傳 [{ cls, name, zh, color, conf, x, y, w, h }]，依信心度由高到低
   */
  function decode(out, meta, conf = 0.25, iouThr = 0.45, maxDet = 300) {
    const nc = CLASSES.length, n = out.length / (4 + nc);
    const cand = [];
    for (let i = 0; i < n; i++) {
      let best = 0, c = -1;
      for (let k = 0; k < nc; k++) { const s = out[(4 + k) * n + i]; if (s > best) { best = s; c = k; } }
      if (best <= conf) continue;
      const cx = out[i], cy = out[n + i], w = out[2 * n + i], h = out[3 * n + i];
      let x = (cx - w / 2 - meta.dx) / meta.r, y = (cy - h / 2 - meta.dy) / meta.r;
      let bw = w / meta.r, bh = h / meta.r;
      // 裁到圖片範圍內
      const x2 = Math.min(meta.W, x + bw), y2 = Math.min(meta.H, y + bh);
      x = Math.max(0, x); y = Math.max(0, y); bw = x2 - x; bh = y2 - y;
      if (bw <= 1 || bh <= 1) continue;
      cand.push({ cls: c, conf: best, x, y, w: bw, h: bh });
    }
    cand.sort((a, b) => b.conf - a.conf);
    const keep = [];
    for (const d of cand) {
      if (keep.some(k => k.cls === d.cls && iou(k, d) > iouThr)) continue;
      keep.push(d);
      if (keep.length >= maxDet) break;
    }
    return keep.map(d => ({ ...d, name: CLASSES[d.cls].name, zh: CLASSES[d.cls].zh, color: CLASSES[d.cls].color, ink: CLASSES[d.cls].ink }));
  }

  /* ---------- 前處理（瀏覽器） ---------- */
  let lbCanvas = null;
  function preprocess(source, W, H) {
    if (!lbCanvas || lbCanvas.width !== SIZE) { lbCanvas = document.createElement('canvas'); lbCanvas.width = lbCanvas.height = SIZE; }
    const ctx = lbCanvas.getContext('2d', { willReadFrequently: true });
    const r = Math.min(SIZE / W, SIZE / H);
    const nw = Math.round(W * r), nh = Math.round(H * r);
    const dx = Math.round((SIZE - nw) / 2 - 0.1), dy = Math.round((SIZE - nh) / 2 - 0.1);
    ctx.fillStyle = 'rgb(114,114,114)'; ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, dx, dy, nw, nh);
    const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
    const area = SIZE * SIZE, data = new Float32Array(3 * area);
    for (let i = 0, p = 0; i < area; i++, p += 4) {
      data[i] = px[p] / 255; data[area + i] = px[p + 1] / 255; data[2 * area + i] = px[p + 2] / 255;
    }
    return { data, meta: { r, dx, dy, W, H } };
  }

  /* ---------- 載入 onnxruntime-web 與模型 ---------- */
  function loadScript(src) {
    return new Promise((ok, fail) => {
      const s = document.createElement('script'); s.src = src; s.onload = ok;
      s.onerror = () => { s.remove(); fail(new Error('無法載入 ' + src)); };
      document.head.appendChild(s);
    });
  }

  async function fetchWithProgress(url, onProgress) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`找不到模型檔 ${url}（HTTP ${res.status}）`);
    const total = +res.headers.get('content-length') || 0;
    if (!res.body || !total) return new Uint8Array(await res.arrayBuffer());
    const reader = res.body.getReader(), buf = new Uint8Array(total); let got = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      buf.set(value, got); got += value.length; onProgress && onProgress(got, total);
    }
    return buf;
  }

  let session = null, backend = '';
  async function load(modelUrl = 'best.onnx', onProgress) {
    if (session) return { backend, info: INFO };
    // 讀模型設定（輸入尺寸、預設門檻、名稱）
    try {
      const r = await fetch('model.json');
      if (r.ok) { INFO = { ...INFO, ...(await r.json()) }; SIZE = INFO.input || SIZE; if (INFO.file) modelUrl = '' + INFO.file; }
    } catch {}
    if (location.protocol === 'file:') throw new Error('請用本機伺服器開啟網站（在網站資料夾執行 python -m http.server），直接雙擊 HTML 檔無法載入模型。');
    if (!root.ort) {
      try { await loadScript(ORT_LOCAL + 'ort.webgpu.min.js'); root.ort.env.wasm.wasmPaths = ORT_LOCAL; }
      catch { await loadScript(ORT_CDN + 'ort.webgpu.min.js'); root.ort.env.wasm.wasmPaths = ORT_CDN; }
    }
    // 模型分成多個檔案時（GitHub 網頁上傳單檔上限 25 MB），依序下載後接回一個檔案
    let bytes;
    if (INFO.parts) {
      const urls = Array.from({ length: INFO.parts }, (_, i) => modelUrl + '.part' + i);
      const sizes = [], chunks = []; let total = 0;
      for (const u of urls) { const h = await fetch(u, { method: 'HEAD' }); sizes.push(+h.headers.get('content-length') || 0); }
      total = sizes.reduce((a, c) => a + c, 0); let done = 0;
      for (const u of urls) {
        const c = await fetchWithProgress(u, (g) => onProgress && total && onProgress(done + g, total));
        chunks.push(c); done += c.length; onProgress && total && onProgress(done, total);
      }
      bytes = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
      let off = 0; for (const c of chunks) { bytes.set(c, off); off += c.length; }
    } else {
      bytes = await fetchWithProgress(modelUrl, onProgress);
    }
    const tries = navigator.gpu ? ['webgpu', 'wasm'] : ['wasm'];
    let lastErr;
    for (const ep of tries) {
      try { session = await root.ort.InferenceSession.create(bytes, { executionProviders: [ep], graphOptimizationLevel: 'all' }); backend = ep; break; }
      catch (e) { lastErr = e; }
    }
    if (!session) throw lastErr;
    return { backend, info: INFO };
  }

  /** 對一張圖（img / video / canvas）跑模型，回傳原始輸出與換算資訊；後處理另外做，調整門檻時不用重跑模型 */
  async function infer(source, W, H) {
    const { data, meta } = preprocess(source, W, H);
    const t0 = performance.now();
    const feeds = { [session.inputNames[0]]: new root.ort.Tensor('float32', data, [1, 3, SIZE, SIZE]) };
    const res = await session.run(feeds);
    const out = res[session.outputNames[0]].data;
    return { out: out instanceof Float32Array ? out : Float32Array.from(out), meta, ms: performance.now() - t0 };
  }

  const api = { CLASSES, decode, iou, preprocess, load, infer, get backend() { return backend; }, get size() { return SIZE; }, get info() { return INFO; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MV_YOLO = api;
})(typeof window !== 'undefined' ? window : globalThis);
