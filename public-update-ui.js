(() => {
  let updateInfo = null;

  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  }[c]));

  const label = x => x.service
    ? `${x.company || ''} / ${x.service}`
    : (x.company || '案件');

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
    if(document.getElementById('publicUpdatePanel')) return;
    const tabs = document.querySelector('.content-switcher');
    if(!tabs) return;

    const panel = document.createElement('section');
    panel.id = 'publicUpdatePanel';
    panel.className = 'public-update-panel';
    panel.setAttribute('aria-live','polite');
    tabs.parentNode.insertBefore(panel, tabs);
  }

  function renderPanel(){
    ensurePanel();
    const panel = document.getElementById('publicUpdatePanel');
    if(!panel || !updateInfo) return;

    const added = Number(updateInfo.added_count || 0);
    const changed = Number(updateInfo.changed_count || 0);
    const net = Number(updateInfo.net_change || 0);
    const netText = `${net > 0 ? '+' : ''}${net}`;
    const hasUpdate = added > 0 || changed > 0;

    const addedRows = updateInfo.added || [];
    const changedRows = updateInfo.changed || [];

    panel.innerHTML = `
      <div class="public-update-head ${hasUpdate ? 'has-update' : 'no-update'}">
        <div>
          <span class="public-update-kicker">TODAY'S UPDATE</span>
          <strong>
            今日の更新：新規公開 ${added}件
            ${changed ? ` / ステータス更新 ${changed}件` : ''}
          </strong>
          <span class="public-update-total">
            公開対象総数 ${Number(updateInfo.day_start_count || 0)}
            → ${Number(updateInfo.after_count || 0)}件
            （本日差分 ${esc(netText)}）
          </span>
        </div>
        <span class="public-update-time">
          最終確認 ${esc(jstTime(updateInfo.last_checked_at || updateInfo.generated_at))}
        </span>
      </div>

      ${hasUpdate ? `
        <details class="public-update-details" open>
          <summary>今日の更新内容を見る</summary>
          <div class="public-update-list">
            ${addedRows.map(x => `
              <article class="public-update-item">
                <div class="public-update-meta">
                  <span class="badge public-new">NEW</span>
                  <span>${esc(x.published || '-')}</span>
                </div>
                <strong>${esc(label(x))}</strong>
                <p>${esc(x.summary || '')}</p>
              </article>
            `).join('')}

            ${changedRows.map(x => `
              <article class="public-update-item">
                <div class="public-update-meta">
                  <span class="badge public-updated">UPDATED</span>
                  <span>${esc(x.published || '-')}</span>
                </div>
                <strong>${esc(label(x))}</strong>
                <p class="status-change">
                  ${esc(x.from_label || x.from_status)}
                  → <strong>${esc(x.to_label || x.to_status)}</strong>
                </p>
                ${x.resolution_note ? `<p>${esc(x.resolution_note)}</p>` : ''}
              </article>
            `).join('')}
          </div>
        </details>
      ` : `
        <p class="public-update-empty">
          本日はまだ新たな公開案件・ステータス更新はありません。
        </p>
      `}
    `;
  }

  function decorateCards(){
    if(!updateInfo) return;

    document.querySelectorAll('#cards .card').forEach(card => {
      const h3 = card.querySelector('h3');
      if(!h3) return;

      const date = card.querySelector('.date')?.textContent?.trim() || '';
      const title = h3.textContent.trim();

      const added = (updateInfo.added || []).find(
        x => label(x) === title && String(x.published || '-') === date
      );
      const changed = (updateInfo.changed || []).find(
        x => label(x) === title && String(x.published || '-') === date
      );

      const meta = card.querySelector('.meta');
      if(!meta) return;

      if(added && !meta.querySelector('.public-new')){
        card.classList.add('public-new-card');
        const badge = document.createElement('span');
        badge.className = 'badge public-new';
        badge.textContent = 'NEW';
        meta.prepend(badge);
      } else if(changed && !meta.querySelector('.public-updated')){
        card.classList.add('public-updated-card');
        const badge = document.createElement('span');
        badge.className = 'badge public-updated';
        badge.textContent = 'UPDATED';
        meta.prepend(badge);
      }
    });
  }

  async function loadUpdateInfo(){
    try{
      const res = await fetch('data/public-update.json', {cache:'no-store'});
      if(!res.ok) return;
      updateInfo = await res.json();
      renderPanel();
      decorateCards();
    }catch(e){
      console.warn('public update info unavailable', e);
    }
  }

  function patchRender(){
    if(typeof render !== 'function') return false;
    if(window.__publicUpdateUIPatched) return true;
    window.__publicUpdateUIPatched = true;

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
