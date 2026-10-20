(() => {
  let todayNewIds = new Set();

  function sortVerifiedNewFirst(rows){
    if (typeof currentView === 'undefined' || currentView !== 'verified') {
      return rows;
    }

    // 「日付の新しい順」のときだけ、
    // 今日NEW → それ以外 の順に分け、各グループ内は公表日降順。
    if (!els?.sort || els.sort.value !== 'date-desc') {
      return rows;
    }

    return rows.slice().sort((a, b) => {
      const aNew = todayNewIds.has(String(a.id || '')) ? 1 : 0;
      const bNew = todayNewIds.has(String(b.id || '')) ? 1 : 0;

      if (aNew !== bNew) {
        return bNew - aNew;
      }

      return String(b.published || '').localeCompare(String(a.published || ''));
    });
  }

  function patchFilteredRows(){
    if (typeof filteredRows !== 'function') return false;
    if (window.__publicNewFirstSortPatched) return true;

    const originalFilteredRows = filteredRows;

    filteredRows = function(){
      const rows = originalFilteredRows();
      return sortVerifiedNewFirst(rows);
    };

    window.__publicNewFirstSortPatched = true;
    return true;
  }

  async function loadTodayNewIds(){
    try{
      const res = await fetch('data/public-update.json', {cache:'no-store'});
      if(!res.ok) return;

      const info = await res.json();
      todayNewIds = new Set(
        (info.added_ids || [])
          .map(x => String(x || ''))
          .filter(Boolean)
      );

      if (typeof render === 'function') {
        pageByView.verified = 1;
        render();
      }
    }catch(e){
      console.warn('today NEW sort data unavailable', e);
    }
  }

  window.addEventListener('DOMContentLoaded', async () => {
    patchFilteredRows();
    await loadTodayNewIds();
  });
})();
