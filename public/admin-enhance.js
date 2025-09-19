
/*! admin-enhance.js
  Fixes:
  1) QR 이미지/저장목록 클릭 시 페이지 이동 없이 다운로드
  2) 로그인/로그아웃 버튼 단일 표시 토글
  Non-invasive: 기존 코드/함수는 변경하지 않고 덧씌움
*/
(function(){
  // ---------- helpers ----------
  function pad2(n){ return String(n).padStart(2,'0'); }
  function todayStr(ts){
    const d = ts ? new Date(Number(ts)) : new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate());
  }
  function getTableNo(){
    const el = document.getElementById('qrTable')
      || document.querySelector('input[name="table"], input[placeholder*="테이블"], input[placeholder*="table"]');
    const v = (el && (el.value||el.getAttribute('value'))) || '';
    return (v || '').toString().trim() || 'qr';
  }
  function getQrUrl(){
    const a = document.getElementById('dlPng');
    if(a && a.href) return a.href;
    const img = document.getElementById('qrImg');
    if(img && img.src) return img.src;
    // saved grid anchor fallback (first)
    const a2 = document.querySelector('#qrxSaved a[href]');
    return a2 ? a2.href : '';
  }
  async function downloadUrl(url, filename){
    try{
      // try fetch -> blob (works even if anchor download is ignored for cross-origin)
      const res = await fetch(url, {mode:'cors'});
      if(!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u; a.download = filename || 'qr.png';
      document.body.appendChild(a); a.click();
      requestAnimationFrame(()=>{ a.remove(); URL.revokeObjectURL(u); });
    }catch(e){
      // last resort (if CORS blocks fetch) – fallback to normal navigation in new tab
      try{
        const a = document.createElement('a');
        a.href = url; a.target = '_blank'; a.rel = 'noopener';
        a.download = filename || 'qr.png';
        document.body.appendChild(a); a.click();
        requestAnimationFrame(()=>a.remove());
      }catch(_){}
    }
  }
  function ensureHiddenCSS(){
    try{
      if(!document.querySelector('style[data-hidden-enforce]')){
        const s = document.createElement('style');
        s.setAttribute('data-hidden-enforce','1');
        s.textContent = '.hidden{display:none !important}';
        document.head.appendChild(s);
      }
    }catch(_){}
  }

  // ---------- QR: click -> download ----------
  function bindQrDownload(){
    // preview image
    const img = document.getElementById('qrImg');
    if(img){
      img.setAttribute('crossorigin','anonymous'); // allow CORS-friendly fetch/canvas if server permits
      img.style.cursor = 'pointer';
      img.addEventListener('click', function(e){
        e.preventDefault?.();
        const url = getQrUrl();
        const fname = `qr${getTableNo()}_${todayStr()}.png`;
        if(url) downloadUrl(url, fname);
      }, {passive:false});
    }
    // saved grid anchors
    const grid = document.getElementById('qrxSaved');
    if(grid){
      grid.addEventListener('click', function(e){
        const a = e.target.closest('a[href]');
        if(a && grid.contains(a)){
          e.preventDefault();
          const dl = a.getAttribute('download') || a.dataset.filename || '';
          const label = a.parentElement?.querySelector?.('.label')?.textContent || '';
          const m = label.match(/(\d+)/);
          const t = m ? m[1] : getTableNo();
          const fname = dl || `qr${t}_${todayStr()}.png`;
          downloadUrl(a.href, fname);
        }
      }, {passive:false});
    }
    // generic: any anchor with download inside QR pane
    const pane = document.querySelector('#pane-qr, .qr-pane, [data-pane="pane-qr"]');
    if(pane){
      pane.addEventListener('click', function(e){
        const a = e.target.closest('a[download]');
        if(a && pane.contains(a)){
          e.preventDefault();
          const dl = a.getAttribute('download') || a.dataset.filename || `qr${getTableNo()}_${todayStr()}.png`;
          downloadUrl(a.href, dl);
        }
      }, {passive:false});
    }
  }

  // ---------- Login/Logout toggle ----------
  function getToken(){
    try{ return localStorage.getItem('adminToken') || ''; }catch(_){ return ''; }
  }
  function setAuthUI(){
    const loginBtn  = document.getElementById('btnLogin');
    const logoutBtn = document.getElementById('btnLogout');
    const logged = !!getToken();
    if(loginBtn)  loginBtn.classList.toggle('hidden',  logged);
    if(logoutBtn) logoutBtn.classList.toggle('hidden', !logged);
  }
  function bindAuth(){
    ensureHiddenCSS();
    // hide both initially to avoid flicker
    document.getElementById('btnLogin')?.classList.add('hidden');
    document.getElementById('btnLogout')?.classList.add('hidden');
    // expose globally for existing calls
    window.setAuthUI = setAuthUI;
    setAuthUI();
    // logout action
    const logoutBtn = document.getElementById('btnLogout');
    if(logoutBtn && !logoutBtn.dataset.bound){
      logoutBtn.dataset.bound = '1';
      logoutBtn.addEventListener('click', function(){
        try{ localStorage.removeItem('adminToken'); }catch(_){}
        setAuthUI();
        try{ location.href='/login'; }catch(_){}
      });
    }
    // reflect changes from other tabs
    window.addEventListener('storage', function(e){
      if(e && e.key === 'adminToken') setAuthUI();
    });
  }

  // ---------- boot ----------
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){
      bindAuth();
      bindQrDownload();
    }, {once:true});
  }else{
    bindAuth();
    bindQrDownload();
  }
})();
