(() => {
  let updateInfo = null;
  let newIds = new Set();

  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  }[c]));

  const fmtCount = n => Number(n) > 0
    ? new Intl.NumberFormat('ja-JP').format(Number(n)) + '件'
    : '非公表/調査中';

  const label = x => x.service
    ? `${x.company || ''} / ${x.service}`
    : (x.company || '要確認');

  function jstTime(iso=''){
    if(!iso) return '-';
    const d = new Date(iso);
    if(Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone:'Asia/Tokyo',
      year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit'
    }).format(d);
  }

  function ensurePanel(){
    if(document.getElementById('candidateUpdatePanel')) return;

    const tabs = document.querySelector('.view-tabs');
    if(!tabs) return;

    const panel = document.createElement('section');
    panel.id = 'candidateUpdatePanel';
    panel.className = 'candidate-update-panel';
    panel.setAttribute('aria-live','polite');

    tabs.parentNode.insertBefore(panel, tabs);
  }

  function renderPanel(){
    ensurePanel();
    const panel = document.getElementById('candidateUpdatePanel');
    if(!panel || !updateInfo) return;

    const net = Number(updateInfo.net_change || 0);
    const netText = `${net > 0 ? '+' : ''}${net}`;
    const newCount = Number(updateInfo.new_count || 0);
    const rows = updateInfo.new_candidates || [];

    const summaryClass = newCount > 0 ? 'has-new' : 'no-new';

    panel.innerHTML = `
      <div class="candidate-update-head ${summaryClass}">
        <div>
          <span class="candidate-update-kicker">LATEST UPDATE</span>
          <strong>今回の更新：新規候補 ${newCount}件</strong>
          <span class="candidate-update-total">
            候補総数 ${Number(updateInfo.before_count || 0)}
            → ${Number(updateInfo.after_count || 0)}件
            （差分 ${esc(netText)}）
          </span>
        </div>
        <span class="candidate-update-time">
          更新 ${esc(jstTime(updateInfo.generated_at))}
        </span>
      </div>
      ${rows.length ? `
        <details class="candidate-update-details" open>
          <summary>今回追加された案件を見る</summary>
          <div class="candidate-update-list">
            ${rows.map(x => `
              <article class="candidate-update-item">
                <div class="candidate-update-item-meta">
                  <span class="badge candidate-new">NEW</span>
                  ${x.priority ? `<span class="badge priority priority-${esc(x.priority)}">優先確認 ${esc(x.priority)}</span>` : ''}
                  <span>${esc(x.published || '-')}</span>
                </div>
                <strong>${esc(label(x))}</strong>
                <span class="candidate-update-count">${esc(fmtCount(x.affected_count))}</span>
                ${x.summary ? `<p>${esc(x.summary)}</p>` : ''}
                ${x.id ? `<code>${esc(x.id)}</code>` : ''}
              </article>
            `).join('')}
          </div>
        </details>
      ` : `<p class="candidate-update-empty">今回、新たな要確認候補はありません。</p>`}
    `;
  }

  function decorateCards(){
    if(!updateInfo || !newIds.size) return;

    document.querySelectorAll('#cards .card').forEach(card => {
      const code = card.querySelector('.incident-tools code');
      const id = code?.textContent?.trim();
      if(!id || !newIds.has(id)) return;

      card.classList.add('candidate-new-card');

      const meta = card.querySelector('.meta');
      if(meta && !meta.querySelector('.candidate-new')){
        const badge = document.createElement('span');
        badge.className = 'badge candidate-new';
        badge.textContent = 'NEW';
        meta.prepend(badge);
      }
    });
  }

  async function loadUpdateInfo(){
    try{
      const res = await fetch('data/candidate-update.json', {cache:'no-store'});
      if(!res.ok) return;
      updateInfo = await res.json();
      newIds = new Set(updateInfo.new_candidate_ids || []);
      renderPanel();
      decorateCards();
    }catch(e){
      console.warn('candidate update info unavailable', e);
    }
  }

  function patchRender(){
    if(typeof render !== 'function') return false;
    if(window.__candidateUpdateUIPatched) return true;
    window.__candidateUpdateUIPatched = true;

    const originalRender = render;
    render = function(){
      originalRender();
      renderPanel();
      decorateCards();
    };
    return true;
  }

  window.addEventListener('DOMContentLoaded', async () => {
    patchRender();
    await loadUpdateInfo();
  });
})();
