(() => {
  const PAGE_SIZE = 10;
  const pageByView = {
    verified: 1,
    mine: 1,
    candidate: 1,
    all: 1
  };

  function currentPage(){
    return pageByView[currentView] || 1;
  }

  function setPage(page){
    pageByView[currentView] = Math.max(1, page);
  }

  function removePager(){
    document.getElementById('incidentPager')?.remove();
  }

  function applyPagination(){
    const cardsWrap = document.getElementById('cards');
    if(!cardsWrap) return;

    removePager();

    const cards = [...cardsWrap.querySelectorAll(':scope > .card')];
    const total = cards.length;

    if(total <= PAGE_SIZE){
      cards.forEach(c => c.hidden = false);
      return;
    }

    const totalPages = Math.ceil(total / PAGE_SIZE);
    let page = Math.min(currentPage(), totalPages);
    setPage(page);

    const start = (page - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, total);

    cards.forEach((card, i) => {
      card.hidden = !(i >= start && i < end);
    });

    const pager = document.createElement('nav');
    pager.id = 'incidentPager';
    pager.className = 'incident-pager';
    pager.setAttribute('aria-label', '案件一覧ページ切り替え');

    pager.innerHTML = `
      <div class="incident-pager-info">
        ${start + 1}〜${end}件 / 全${total}件
      </div>
      <div class="incident-pager-actions">
        <button type="button" class="pager-btn" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>
          前の10件
        </button>
        <span class="pager-page">${page} / ${totalPages}ページ</span>
        <button type="button" class="pager-btn" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>
          次の10件
        </button>
      </div>
    `;

    cardsWrap.insertAdjacentElement('afterend', pager);

    pager.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const next = Number(btn.dataset.page || 1);
        setPage(next);
        applyPagination();

        const heading = document.querySelector('.section-head') || cardsWrap;
        heading.scrollIntoView({behavior:'smooth', block:'start'});
      });
    });
  }

  function resetCurrentPage(){
    setPage(1);
  }

  function patch(){
    if(typeof render !== 'function') return false;
    if(window.__paginationV28Patched) return true;
    window.__paginationV28Patched = true;

    const originalRender = render;
    render = function(){
      originalRender();
      requestAnimationFrame(applyPagination);
    };

    // 絞り込み条件変更時は1ページ目に戻す
    ['q','month','status','sort'].forEach(id => {
      const el = document.getElementById(id);
      if(!el) return;
      el.addEventListener(id === 'q' ? 'input' : 'change', resetCurrentPage, {capture:true});
    });

    // タブ切り替え時はそのタブの1ページ目へ
    document.querySelectorAll('.view-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        if(view) pageByView[view] = 1;
      }, {capture:true});
    });

    return true;
  }

  if(!patch()){
    window.addEventListener('DOMContentLoaded', () => {
      if(patch()) render();
    });
  }
})();
