(() => {
  let todayNewIds = new Set();
  let todayNewKeys = new Set();

  function norm(v=''){
    return String(v ?? '')
      .normalize('NFKC')
      .trim()
      .toLowerCase()
      .replace(/\s+/g,' ');
  }

  function incidentKey(x){
    return [
      String(x?.published || '').slice(0,10),
      norm(x?.company || ''),
      norm(x?.service || '')
    ].join('|||');
  }

  function isTodayNew(x){
    const id=String(x?.id || '');
    if(id && todayNewIds.has(id)) return true;
    return todayNewKeys.has(incidentKey(x));
  }

  function sortVerifiedNewFirst(rows){
    if(typeof currentView==='undefined' || currentView!=='verified'){
      return rows;
    }

    // ユーザーが別の並び順を選んでいる場合は、その選択を尊重。
    if(!els?.sort || els.sort.value!=='date-desc'){
      return rows;
    }

    return rows.slice().sort((a,b)=>{
      const aNew=isTodayNew(a) ? 1 : 0;
      const bNew=isTodayNew(b) ? 1 : 0;

      if(aNew!==bNew){
        return bNew-aNew;
      }

      return String(b.published||'').localeCompare(String(a.published||''));
    });
  }

  function patchFilteredRows(){
    if(typeof filteredRows!=='function') return false;
    if(window.__publicNewFirstSortPatchedV11) return true;

    const originalFilteredRows=filteredRows;

    filteredRows=function(){
      const rows=originalFilteredRows();
      return sortVerifiedNewFirst(rows);
    };

    window.__publicNewFirstSortPatchedV11=true;
    return true;
  }

  async function loadTodayNew(){
    try{
      const res=await fetch('data/public-update.json',{cache:'no-store'});
      if(!res.ok) return;

      const info=await res.json();

      todayNewIds=new Set(
        (info.added_ids||[])
          .map(x=>String(x||''))
          .filter(Boolean)
      );

      todayNewKeys=new Set(
        (info.added||[])
          .map(incidentKey)
          .filter(Boolean)
      );

      if(typeof render==='function'){
        if(typeof pageByView!=='undefined' && pageByView?.verified){
          pageByView.verified=1;
        }
        render();
      }
    }catch(e){
      console.warn('today NEW sort data unavailable',e);
    }
  }

  window.addEventListener('DOMContentLoaded',async()=>{
    patchFilteredRows();
    await loadTodayNew();
  });
})();
