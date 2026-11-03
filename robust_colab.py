"""
MILITARY VISION 穩健度實驗（完整測試集版）
在 Colab 執行：把這個檔案上傳到 Colab，或把內容貼到一格程式碼裡。
需要：best.pt、資料集的 data.yaml（MHCD2022），以及 GPU 執行階段（較快）。

做法：把測試集的每張圖加上不同程度的干擾（距離、模糊、雜訊、亮度、JPEG 壓縮），
     用 model.val() 算出每一種干擾下的 mAP50 與 mAP50-95，輸出成 robust_results.csv。
     「距離」會把畫面縮小並補灰邊，標註框也會一起換算，所以 mAP 仍然正確。
"""
# 執行前請先在另一格執行：!pip install -q ultralytics
import os, glob, json, shutil, csv
import cv2, numpy as np, yaml
from ultralytics import YOLO

MODEL = '/content/best.pt'
DATA = '/content/drive/MyDrive/Military-Camouflage-MHCD2022_yolo_dataset/data.yaml'
SPLIT = 'test'          # 資料集沒有 test 就改成 'val'
MAX_IMAGES = 300        # 只取前 N 張加快速度；設成 None 用全部
WORK = '/content/robust'

TESTS = {
    'distance': [1, 0.5, 0.35, 0.25, 0.18, 0.125],   # 畫面縮小倍率
    'blur':     [0, 2, 4, 8, 12],                     # 高斯模糊強度（以 1280 寬為基準）
    'noise':    [0, 10, 25, 40, 60],                  # 雜訊標準差
    'dark':     [1, 0.6, 0.4, 0.25, 0.15],            # 亮度倍率
    'jpeg':     [95, 50, 25, 10, 5],                  # JPEG 品質
}

def shrink(img, s):
    h, w = img.shape[:2]; out = np.full_like(img, 114)
    nh, nw = max(1, int(h * s)), max(1, int(w * s)); y, x = (h - nh) // 2, (w - nw) // 2
    out[y:y + nh, x:x + nw] = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
    return out
FN = {
    'distance': shrink,
    'blur':  lambda im, k: im if k == 0 else cv2.GaussianBlur(im, (0, 0), k * im.shape[1] / 1280),
    'noise': lambda im, sd: im if sd == 0 else np.clip(im + np.random.default_rng(0).normal(0, sd, im.shape), 0, 255).astype(np.uint8),
    'dark':  lambda im, g: np.clip(im.astype(np.float32) * g, 0, 255).astype(np.uint8),
    'jpeg':  lambda im, q: cv2.imdecode(cv2.imencode('.jpg', im, [cv2.IMWRITE_JPEG_QUALITY, q])[1], 1),
}

def fix_label(line, test, level):
    """距離測試：畫面縮小後，標註框的中心往畫面中心靠、寬高等比例縮小"""
    p = line.split()
    if test != 'distance' or len(p) < 5: return line
    c, x, y, w, h = p[0], *map(float, p[1:5])
    s = level
    return f'{c} {0.5 + (x - 0.5) * s:.6f} {0.5 + (y - 0.5) * s:.6f} {w * s:.6f} {h * s:.6f}'

cfg = yaml.safe_load(open(DATA))
root = cfg.get('path') or os.path.dirname(DATA)
if not os.path.isabs(root): root = os.path.join(os.path.dirname(DATA), root)
split = cfg[SPLIT]
img_dir = split if os.path.isabs(split) else os.path.join(root, split)
if not os.path.isdir(img_dir): raise SystemExit(f'找不到 {SPLIT} 圖片資料夾：{img_dir}，請檢查 DATA 和 SPLIT')
label_dir = img_dir.replace('/images', '/labels')
images = sorted(sum([glob.glob(os.path.join(img_dir, e)) for e in ('*.jpg', '*.jpeg', '*.png', '*.bmp')], []))[:MAX_IMAGES]
print(f'使用 {len(images)} 張圖片：{img_dir}')

model = YOLO(MODEL)
rows = []
for test, levels in TESTS.items():
    for level in levels:
        out_img = os.path.join(WORK, f'{test}_{level}', 'images'); out_lab = out_img.replace('/images', '/labels')
        shutil.rmtree(os.path.dirname(out_img), ignore_errors=True); os.makedirs(out_img); os.makedirs(out_lab)
        for p in images:
            im = cv2.imread(p)
            if im is None: continue
            cv2.imwrite(os.path.join(out_img, os.path.basename(p)), FN[test](im, level))
            lp = os.path.join(label_dir, os.path.splitext(os.path.basename(p))[0] + '.txt')
            if os.path.exists(lp):
                with open(lp) as f: lines = [fix_label(l.strip(), test, level) for l in f if l.strip()]
                with open(os.path.join(out_lab, os.path.basename(lp)), 'w') as f: f.write('\n'.join(lines))
        ycfg = os.path.join(WORK, f'{test}_{level}', 'data.yaml')
        yaml.safe_dump({'path': os.path.dirname(out_img), 'val': 'images', 'names': cfg['names']}, open(ycfg, 'w'), allow_unicode=True)
        m = model.val(data=ycfg, imgsz=640, plots=False, verbose=False)
        row = {'test': test, 'level': level, 'mAP50': round(float(m.box.map50), 4), 'mAP50-95': round(float(m.box.map), 4)}
        names = cfg['names'] if isinstance(cfg['names'], list) else [cfg['names'][k] for k in sorted(cfg['names'])]
        for i, n in enumerate(names):
            row[f'AP50-95 {n}'] = round(float(m.box.maps[i]), 4)
        rows.append(row); print(row)

with open('robust_results.csv', 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
print('完成，結果在 robust_results.csv')
try:
    from google.colab import files; files.download('robust_results.csv')
except Exception:
    pass
