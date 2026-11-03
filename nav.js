/*
  全站共用導覽列
  用法：在頁面放 <header class="sn" data-current="live"></header>，再載入這支檔案。
        封面頁加上 data-overlay，導覽列會疊在影片上方。
  新增或完成一個頁面時，只要改下面的 NAV 設定（ready: true 代表頁面已做好）。
*/
(() => {
  const NAV = [
    { key: 'home', label: '首頁', href: 'index.html', ready: true },
    { key: 'detect', label: '影像辨識', children: [
      { key: 'photo', label: '照片辨識', desc: '上傳照片，標出目標與各類數量', href: 'photo.html', ready: true },
      { key: 'video', label: '影片辨識', desc: '上傳影片，逐幀追蹤並計數', href: 'video.html', ready: true },
      { key: 'live',  label: '即時辨識', desc: '示範串流、螢幕擷取或鏡頭', href: 'live.html', ready: true },
    ]},
    { key: 'stats', label: '統計分析', href: 'stats.html', ready: true },
    { key: 'eval',  label: '模型評估', href: 'eval.html', ready: true },
  ];

  const css = `
  .sn{position:relative;z-index:20;font-family:var(--body, system-ui, sans-serif)}
  .sn[data-overlay]{position:absolute;inset:0 0 auto;
    padding-block:calc(18px + env(safe-area-inset-top,0px)) 18px;
    padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
  .sn a{text-decoration:none}
  .sn-mark{color:var(--text)!important}
  .sn-in{max-width:1360px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px}
  .sn-mark{display:flex;align-items:baseline;gap:.6em;word-spacing:.35em;font-family:var(--mono, monospace);font-weight:600;letter-spacing:.2em;font-size:.9rem;color:var(--text);white-space:nowrap}
  .sn-mark i{font-style:normal;color:var(--scan)}
  .sn-list{display:flex;align-items:center;gap:clamp(6px,1.4vw,18px);list-style:none;margin:0;padding:0}
  .sn-link,.sn-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 10px;font:inherit;font-size:.92rem;
    color:var(--dim);background:none;border:0;cursor:pointer;white-space:nowrap;text-decoration:none}
  .sn-link:hover,.sn-btn:hover,.sn-link[aria-current],.sn-btn.is-current{color:var(--text)}
  .sn-link[aria-current],.sn-btn.is-current{box-shadow:inset 0 -2px 0 var(--scan)}
  .sn-btn svg{width:10px;height:10px;transition:transform .2s}
  .sn-btn[aria-expanded="true"] svg{transform:rotate(180deg)}
  .sn-off{color:var(--dim);opacity:.55;cursor:default}
  .sn-group{position:relative}
  .sn-menu{position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);min-width:330px;
    background:rgba(8,22,31,.94);border:1px solid var(--line);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
    padding:6px;list-style:none;margin:0}
  .sn-menu::before{content:"";position:absolute;inset:-9px 0 auto;height:9px}
  .sn-menu[hidden]{display:none}
  .sn-item{display:grid;grid-template-columns:3px 1fr auto;gap:2px 12px;align-items:center;padding:10px 12px;text-decoration:none;color:var(--text)}
  .sn-item::before{content:"";grid-row:1/3;align-self:stretch;background:transparent}
  .sn-item b{font-weight:500;font-size:.95rem}
  .sn-item small{grid-column:2;font-size:.8rem;color:var(--dim)}
  .sn-item em{grid-row:1/3;grid-column:3;font-style:normal;font-family:var(--mono, monospace);font-size:.68rem;letter-spacing:.08em;color:var(--dim);border:1px solid var(--line);padding:2px 6px}
  a.sn-item:hover,a.sn-item:focus-visible{background:rgba(99,230,196,.07)}
  a.sn-item:hover::before,.sn-item[aria-current]::before{background:var(--scan)}
  .sn-item.sn-off{opacity:.5}
  .sn-online{display:flex;align-items:center;gap:8px;font-family:var(--mono, monospace);font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:var(--text);white-space:nowrap}
  .sn-online i{width:7px;height:7px;border-radius:50%;background:var(--scan);box-shadow:0 0 8px var(--scan);animation:snPulse 2s ease-in-out infinite}
  .sn-toggle{display:none;font:inherit;font-size:.9rem;color:var(--text);background:rgba(7,18,26,.5);border:1px solid var(--line);padding:7px 14px;cursor:pointer}
  @keyframes snPulse{50%{opacity:.35}}
  @media (max-width:860px){
    .sn-online{display:none}
    .sn-toggle{display:inline-flex}
    .sn-nav{position:absolute;top:100%;left:max(16px,env(safe-area-inset-left,0px));right:max(16px,env(safe-area-inset-right,0px));
      background:rgba(8,22,31,.97);border:1px solid var(--line);padding:8px}
    .sn:not([data-overlay]) .sn-nav{left:0;right:0}
    .sn-nav[hidden]{display:none}
    .sn-list{flex-direction:column;align-items:stretch;gap:0}
    .sn-link,.sn-btn{width:100%;padding:12px}
    .sn-btn svg{display:none}
    .sn-btn{cursor:default;color:var(--text);font-weight:500}
    .sn-link[aria-current],.sn-btn.is-current{box-shadow:inset 2px 0 0 var(--scan)}
    .sn-menu{position:static;transform:none;min-width:0;border:0;background:none;padding:0 0 6px 12px}
  }
  @media (prefers-reduced-motion:reduce){ .sn-online i{animation:none} .sn-btn svg{transition:none} }
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const host = document.querySelector('header.sn');
  if (!host) return;
  const cur = host.dataset.current;
  const chev = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';

  const top = item => {
    if (!item.ready) return `<li><span class="sn-link sn-off" title="製作中">${item.label}</span></li>`;
    return `<li><a class="sn-link" href="${item.href}"${item.key === cur ? ' aria-current="page"' : ''}>${item.label}</a></li>`;
  };
  const group = (g, i) => {
    const active = g.children.some(c => c.key === cur);
    const rows = g.children.map(c => c.ready
      ? `<li><a class="sn-item" href="${c.href}"${c.key === cur ? ' aria-current="page"' : ''}><b>${c.label}</b><small>${c.desc}</small></a></li>`
      : `<li><span class="sn-item sn-off"><b>${c.label}</b><small>${c.desc}</small><em>製作中</em></span></li>`).join('');
    return `<li class="sn-group">
      <button class="sn-btn${active ? ' is-current' : ''}" type="button" aria-expanded="false" aria-controls="sn-menu-${i}">${g.label}${chev}</button>
      <ul class="sn-menu" id="sn-menu-${i}" hidden>${rows}</ul></li>`;
  };

  host.innerHTML = `<div class="sn-in">
    <a class="sn-mark" href="index.html">MILITARY VISION</a>
    <button class="sn-toggle" type="button" aria-expanded="false" aria-controls="sn-nav">選單</button>
    <nav class="sn-nav" id="sn-nav" aria-label="主要頁面"><ul class="sn-list">
      ${NAV.map((n, i) => n.children ? group(n, i) : top(n)).join('')}
    </ul></nav>
    <div class="sn-online"><i></i>System online</div>
  </div>`;

  const mobile = matchMedia('(max-width:860px)');
  const nav = host.querySelector('.sn-nav'), toggle = host.querySelector('.sn-toggle');
  const groups = [...host.querySelectorAll('.sn-group')];
  const setNav = open => { toggle.setAttribute('aria-expanded', open); toggle.textContent = open ? '關閉' : '選單'; nav.hidden = !open; };
  const setMenu = (g, open) => { g.querySelector('.sn-btn').setAttribute('aria-expanded', open); g.querySelector('.sn-menu').hidden = !open; };
  // 手機版：子選單一律展開列在選單裡；桌機版：點擊或滑鼠移入才展開
  const closeAll = () => groups.forEach(g => setMenu(g, mobile.matches));
  const sync = () => { setNav(!mobile.matches); closeAll(); };
  sync(); mobile.addEventListener('change', sync);

  toggle.addEventListener('click', () => setNav(nav.hidden));
  groups.forEach(g => {
    const btn = g.querySelector('.sn-btn');
    let hoverAt = 0;
    btn.addEventListener('click', () => {
      if (mobile.matches) return;
      if (performance.now() - hoverAt < 500) return;   // 剛被滑鼠移入展開，這次點擊不收起
      const o = btn.getAttribute('aria-expanded') !== 'true'; closeAll(); setMenu(g, o);
    });
    // 滑鼠移入就展開
    g.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && !mobile.matches) { hoverAt = performance.now(); setMenu(g, true); } });
    g.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !mobile.matches) setMenu(g, false); });
  });
  document.addEventListener('click', e => { if (!host.contains(e.target)) { closeAll(); if (mobile.matches) setNav(false); } });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = groups.find(g => g.querySelector('.sn-btn').getAttribute('aria-expanded') === 'true');
    if (open) { setMenu(open, false); open.querySelector('.sn-btn').focus(); }
    else if (mobile.matches && !nav.hidden) { setNav(false); toggle.focus(); }
  });
})();
