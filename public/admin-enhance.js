<!-- public/admin-enhance.js (strict, no navigation) -->
/*! admin-enhance.js (strict)
 * 1) QR 클릭 → 새 탭/페이지로 이동 없이 즉시 다운로드
 * 2) 로그인/로그아웃 버튼 하나만 보이게 토글
 * 3) 교차 출처 이미지는 /api/download-proxy 로 프록시 후 저장
 */
(function(){
  // --- auth guard css once ---
  (function ensureAuthGuardCSS(){
    if (document.querySelector('style[data-auth-guard]')) return;
    const s=document.createElement('style');
    s.setAttribute('data-auth-guard','1');
    s.textContent = `
    .auth-guarded{position:relative; filter: blur(2px); pointer-events:none; user-select:none;}
    .auth-mask{
      position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
      background:rgba(7,10,14,0.65); color:#cbd5e1; font:600 14px/1.4 system-ui, -apple-system, "Noto Sans KR", sans-serif;
      border:1px dashed rgba(148,163,184,0.35); border-radius:12px; pointer-events:auto;
    }
    .auth-mask span{background:rgba(15,23,42,0.8); padding:10px 14px; border-radius:10px; border:1px solid rgba(148,163,184,0.25)}
    .auth-hidden{display:none !important;}
    `;
    document.head.appendChild(s);
  })();

  function isAuthed(){ try { return !!(localStorage.getItem('adminToken')||'').trim(); } catch(_) { return false; } }

  function guardPaneById(id){
    const el = document.getElementById(id);
    if(!el) return;
    const authed = isAuthed();

    // find or create mask
    let mask = el.querySelector(':scope > .auth-mask');
    if(!mask){
      mask = document.createElement('div');
      mask.className = 'auth-mask auth-hidden';
      const msg = document.createElement('span');
      msg.textContent = '로그인 후 이용 가능합니다';
      mask.appendChild(msg);
      el.appendChild(mask);
    }

    if(!authed){
      el.classList.add('auth-guarded');
      mask.classList.remove('auth-hidden');
      // disable form controls inside
      el.querySelectorAll('button, input, select, textarea, a').forEach(n=>{ n.setAttribute('tabindex','-1'); });
    }else{
      el.classList.remove('auth-guarded');
      mask.classList.add('auth-hidden');
      el.querySelectorAll('button, input, select, textarea, a').forEach(n=>{ n.removeAttribute('tabindex'); });
    }
  }

  function applyAuthGuards(){
    ensureAuthGuardCSS && ensureAuthGuardCSS();
    const ids = ['pane-orders','pane-qr','pane-menu','pane-pay','pane-daily','pane-code'];
    ids.forEach(guardPaneById);
  }

  // ---- Anchor #dlPng hardening: keep real URL in data-url and neutralize href to avoid navigation ----
  (function hardenDlAnchor(){
    const a = document.getElementById('dlPng');
    if(!a) return;
    function neutralize(url){
      if(!url) return;
      a.dataset.url = url;
      a.setAttribute('href', '#');
      a.removeAttribute('target');
      a.setAttribute('rel', 'noopener');
    }
    // initial
    const href0 = a.getAttribute('href') || '';
    if(href0.includes('/qr?')) neutralize(href0);
    // on attribute changes
    const mo = new MutationObserver((muts)=>{
      muts.forEach(m=>{
        if(m.attributeName==='href'){
          const href = a.getAttribute('href') || '';
          if(href.includes('/qr?')) neutralize(href);
        }
      });
    });
    try{ mo.observe(a, {attributes:true, attributeFilter:['href']}); }catch(_){}
    // click handler
    if(!a.dataset.boundHarden){
      a.dataset.boundHarden='1';
      a.addEventListener('click', (e)=>{
        stopAll(e);
        const url = a.dataset.url || '';
        const fname = `qr${getTable()}_${today()}.png`;
        forceDownload(url, fname);
        return false;
      }, {passive:false});
    }
  })();

  // ---- Global guard: block any QR-page openings programmatically (window.open) ----
  (function patchWindowOpen(){
    const orig = window.open;
    if (!orig || orig.__qrPatched) return;
    function guessTableFromQR(url){
      try{
        const u = new URL(url, location.origin);
        const data = u.searchParams.get('data');
        if (data) {
          const du = new URL(decodeURIComponent(data));
          return du.searchParams.get('table') || '';
        }
      }catch(e){}
      return '';
    }
    window.open = function(url, ...rest){
      try{
        if (typeof url === 'string' && url.includes('/qr?')){
          const t = guessTableFromQR(url) || getTable();
          const fname = `qr${t}_${today()}.png`;
          forceDownload(url, fname);
          return null;
        }
      }catch(e){}
      return orig.apply(this, [url, ...rest]);
    };
    window.open.__qrPatched = true;
  })();

  // ---- Capture-phase click guard anywhere in the doc for links to /qr? ----
  (function bindGlobalQrLinkInterceptor(){
    if (document.__qrLinkGuard) return;
    document.__qrLinkGuard = true;
    document.addEventListener('click', function(e){
      try{
        const a = e.target && e.target.closest && e.target.closest('a[href]');
        if (!a) return;
        const href = a.getAttribute('href') || '';
        if (href.includes('/qr?') || (a.href && a.href.includes('/qr?'))){
          stopAll(e);
          const tMatch = href.match(/[?&]data=([^&]+)/);
          let t = '';
          if (tMatch){
            try{
              const du = new URL(decodeURIComponent(tMatch[1]));
              t = du.searchParams.get('table') || '';
            }catch(_){}
          }
          const fname = `qr${t || getTable()}_${today()}.png`;
          forceDownload(a.href || href, fname);
          return false;
        }
      }catch(_){}
    }, {capture:true, passive:false});
  })();

  function pad2(n){return String(n).padStart(2,'0');}
  function today(){const d=new Date();return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;}
  function getTable(){
    const el=document.getElementById('qrTable')||document.querySelector('input[name="table"]');
    const v=(el&&(el.value||el.getAttribute('value')))||'';
    return (v||'').toString().trim()||'qr';
  }
  function ensureHiddenCSS(){
    if(!document.querySelector('style[data-hidden-enforce]')){
      const s=document.createElement('style');s.setAttribute('data-hidden-enforce','1');
      s.textContent='.hidden{display:none !important}';document.head.appendChild(s);
    }
  }
  function stopAll(e){try{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();}catch(_){}}

  async function downloadBlob(blob, filename){
    const u=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=u;a.download=filename||'qr.png';
    document.body.appendChild(a);a.click();requestAnimationFrame(()=>{a.remove();URL.revokeObjectURL(u);});
  }
  async function dataUrlToBlob(dataUrl){const r=await fetch(dataUrl);return await r.blob();}

  async function forceDownload(url, filename){
    // ---- Single-download throttle to avoid Chrome "multiple downloads" prompt ----
    try {
      const now = Date.now();
      if (!window.__qrDlGateTs) window.__qrDlGateTs = 0;
      if (now - window.__qrDlGateTs < 1200) { return; }
      window.__qrDlGateTs = now;
    } catch(_) {}

    try{
      if(!url) return;
      if(url.startsWith('data:')){ const b=await dataUrlToBlob(url); return downloadBlob(b, filename); }
      const u=new URL(url, location.origin);
      if(u.origin===location.origin){
        const r=await fetch(u.toString(), {credentials:'include'}); const b=await r.blob(); return downloadBlob(b, filename);
      }else{
        const prox=`/api/download-proxy?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
        const r=await fetch(prox, {credentials:'include'}); if(!r.ok) throw new Error('proxy failed');
        const b=await r.blob(); return downloadBlob(b, filename);
      }
    }catch(e){ console.warn('[QR download] failed:', e); }
  }

/* ---- Single-flight wrapper to dedupe downloads ---- */
(function reinforceForceDownloadDedup(){
  try{
    if (typeof forceDownload !== 'function' || forceDownload.__dedupWrapped) return;
    const __qrOrigFD = forceDownload;
    let __qrBusy = false;
    let __qrLast = 0;
    forceDownload = async function(url, filename){
      const now = Date.now();
      if (__qrBusy || (now - __qrLast) < 800) return;
      __qrBusy = true;
      try{
        await __qrOrigFD(url, filename);
      } finally {
        __qrBusy = false;
        __qrLast = Date.now();
      }
    };
    forceDownload.__dedupWrapped = true;
  }catch(_){}
})();



  function bindQrStrict(){
    const img=document.getElementById('qrImg');
    if(img){
      img.style.cursor='pointer';
      img.addEventListener('click', (e)=>{
        stopAll(e);
        const url=document.getElementById('dlPng')?.href||img.src||'';
        const fname=`qr${getTable()}_${today()}.png`;
        forceDownload(url, fname);
        return false;
      }, {passive:false});
    // also intercept anchor around the preview (#dlPng) so that clicking doesn't navigate
    const aDl = document.getElementById('dlPng');
    if (aDl && !aDl.dataset.bound) {
      aDl.dataset.bound = '1';
      aDl.addEventListener('click', (e)=>{
        stopAll(e);
        const url = aDl.href || '';
        const fname = `qr${getTable()}_${today()}.png`;
        forceDownload(url, fname);
        return false;
      }, {passive:false});
    }

    // defensive: block any <a> whose href includes '/qr?' inside the QR pane
    const qrPane = document.querySelector('#pane-qr, .qr-pane, [data-pane="pane-qr"]') || document;
    if (qrPane && !qrPane.dataset.boundQrLinks) {
      qrPane.dataset.boundQrLinks = '1';
      qrPane.addEventListener('click', (e)=>{
        const a = e.target && e.target.closest && e.target.closest('a[href]');
        if (!a) return;
        const href = a.getAttribute('href') || '';
        if (href.includes('/qr?')) {
          stopAll(e);
          const fname = `qr${getTable()}_${today()}.png`;
          forceDownload(a.href, fname);
          return false;
        }
      }, {passive:false});
    }

    }
    const grid=document.getElementById('qrxSaved');
    if(grid){
      grid.addEventListener('click',(e)=>{
        const a=e.target?.closest?.('a[href]');
        if(a && grid.contains(a)){
          stopAll(e);
          const t=(a.closest('.qrxCard')?.querySelector('.label')?.textContent||'').match(/(\d+)/)?.[1]||getTable();
          const fname=a.getAttribute('download')||a.dataset.filename||`qr${t}_${today()}.png`;
          forceDownload(a.href, fname);
          return false;
        }
      }, {passive:false});
    }
    const pane=document.querySelector('#pane-qr, .qr-pane, [data-pane="pane-qr"]')||document;
    pane.addEventListener('click',(e)=>{
      const a=e.target?.closest?.('a[download]');
      if(a && pane.contains(a)){
        stopAll(e);
        const fname=a.getAttribute('download')||`qr${getTable()}_${today()}.png`;
        forceDownload(a.href, fname);
        return false;
      }
    }, {passive:false});
  }

  function getToken(){ try{return localStorage.getItem('adminToken')||'';}catch(_){return '';} }
  function setAuthUI(){
    try{ applyAuthGuards(); }catch(_){}

    const loginBtn=document.getElementById('btnLogin');
    const logoutBtn=document.getElementById('btnLogout');
    const logged=!!getToken();
    if(loginBtn)  loginBtn.classList.toggle('hidden',  logged);
    if(logoutBtn) logoutBtn.classList.toggle('hidden', !logged);
  }
  function bindAuth(){
    ensureHiddenCSS();
    document.getElementById('btnLogin')?.classList.add('hidden');
    document.getElementById('btnLogout')?.classList.add('hidden');
    window.setAuthUI=setAuthUI; setAuthUI(); try{applyAuthGuards();}catch(_){ }
    const lo=document.getElementById('btnLogout');
    if(lo && !lo.dataset.bound){
      lo.dataset.bound='1';
      lo.addEventListener('click', ()=>{ try{localStorage.removeItem('adminToken');}catch(_){}
        setAuthUI(); try{applyAuthGuards();}catch(_){ } try{location.href='/login.html';}catch(_){}
      });
    }
    window.addEventListener('storage', (e)=>{ if(e && e.key==='adminToken') setAuthUI(); try{applyAuthGuards();}catch(_){ } });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ bindAuth(); bindQrStrict(); }, {once:true});
  }else{
    bindAuth(); bindQrStrict();
  }
})();
