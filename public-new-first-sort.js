(() => {
  let todayNewIds = new Set();
  let todayNewKeys = new Set();
  let todayNewSourceUrls = new Set();

  function text(v=''){
    return String(v ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  }

  function rowKey(x){
    return [
      String(x?.published || '').slice(0,10),
      text(x?.company || ''),
      text(x?.service || '')
    ].join('|||');
  }

  function sourceUrls(x){
    return (Array.isArray(x?.sources) ? x.sources : [])
      .map(s => String(s?.url || '').trim())
      .filter(Boolean);
  }

  function isTodayNew(x){
    // 1) ID一致（将来 public feed にIDを残した場合）
    const id=String(x?.id || '').trim();
    if(id && todayNewIds.has(id)) return true;

    // 2) 公表日＋企業名＋サービス名
    if(todayNewKeys.has(rowKey(x))) return true;

    // 3) 情報源URL一致（公開feedとupdate feedの名称差異にも強い）
    return sourceUrls(x).some(url => todayNewSourceUrls.has(url));
  }

  function patchFilteredRows(){
    if(typeof filteredRows !== 'function') return false;
    if(window.__publicNewFirstSortPatchedV12) return true;

    const originalFilteredRows = filteredRows;

    filteredRows = function(){
      const rows = originalFilteredRows();

      if(
        typeof currentView === 'undefined' ||
        currentView !== 'verified' ||
        !els?.sort ||
        els.sort.value !== 'date-desc'
      ){
        return rows;
      }

      return rows.slice().sort((a,b)=>{
        const aNew=isTodayNew(a) ? 1 : 0;
        const bNew=isTodayNew(b) ? 1 : 0;

        if(aNew !== bNew) return bNew - aNew;

        return String(b.published||'').localeCompare(String(a.published||''));
      });
    };

    window.__publicNewFirstSortPatchedV12=true;
    return true;
  }

  function addListNewBadges(){
    if(typeof currentView === 'undefined' || currentView !== 'verified') return;

    // 現在ページのカードに視覚確認用NEWバッジを付ける。
    const rows = (typeof filteredRows === 'function') ? filteredRows() : [];
    const page = (typeof pageByView !== 'undefined' ? pageByView.verified : 1) || 1;
    const pageSize = (typeof PAGE_SIZE !== 'undefined' ? PAGE_SIZE : 10);
    const start = (page - 1) * pageSize;
    const pageRows = rows.slice(start, start + pageSize);

    document.querySelectorAll('#cards .card').forEach((cardEl, idx)=>{
      const row=pageRows[idx];
      if(!row || !isTodayNew(row)) return;

      const meta=cardEl.querySelector('.meta');
      if(meta && !meta.querySelector('.public-list-new')){
        const badge=document.createElement('span');
        badge.className='badge public-new public-list-new';
        badge.textContent='NEW';
        meta.prepend(badge);
      }
    });
  }

  function patchRender(){
    if(typeof render !== 'function') return false;
    if(window.__publicNewFirstRenderPatchedV12) return true;

    const originalRender=render;
    render=function(){
      originalRender();
      addListNewBadges();
    };

    window.__publicNewFirstRenderPatchedV12=true;
    return true;
  }

  async function loadTodayNew(){
    const res=await fetch(`data/public-update.json?_=${Date.now()}`, {cache:'no-store'});
    if(!res.ok) throw new Error(`public-update ${res.status}`);

    const info=await res.json();
    const added=Array.isArray(info.added) ? info.added : [];

    todayNewIds=new Set(
      (info.added_ids||[]).map(x=>String(x||'').trim()).filter(Boolean)
    );

    todayNewKeys=new Set(
      added.map(rowKey).filter(Boolean)
    );

    todayNewSourceUrls=new Set(
      added.flatMap(sourceUrls)
    );
  }

  async function start(){
    patchFilteredRows();
    patchRender();

    try{
      await loadTodayNew();

      if(typeof pageByView !== 'undefined'){
        pageByView.verified=1;
      }
      if(typeof render === 'function'){
        render();
      }
    }catch(e){
      console.warn('today NEW sort data unavailable', e);
    }
  }

  if(document.readyState === 'loading'){
    window.addEventListener('DOMContentLoaded', start, {once:true});
  }else{
    start();
  }
})();
