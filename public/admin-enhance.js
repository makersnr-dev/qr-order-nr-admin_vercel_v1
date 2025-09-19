<!-- public/admin-enhance.js (strict, no navigation) -->
/*! admin-enhance.js (strict)
 * 1) QR 클릭 → 새 탭/페이지로 이동 없이 즉시 다운로드
 * 2) 로그인/로그아웃 버튼 하나만 보이게 토글
 * 3) 교차 출처 이미지는 /api/download-proxy 로 프록시 후 저장
 */
(function(){
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
    window.setAuthUI=setAuthUI; setAuthUI();
    const lo=document.getElementById('btnLogout');
    if(lo && !lo.dataset.bound){
      lo.dataset.bound='1';
      lo.addEventListener('click', ()=>{ try{localStorage.removeItem('adminToken');}catch(_){}
        setAuthUI(); try{location.href='/login.html';}catch(_){}
      });
    }
    window.addEventListener('storage', (e)=>{ if(e && e.key==='adminToken') setAuthUI(); });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', ()=>{ bindAuth(); bindQrStrict(); }, {once:true});
  }else{
    bindAuth(); bindQrStrict();
  }
})();
