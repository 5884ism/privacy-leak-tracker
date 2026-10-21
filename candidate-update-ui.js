(() => {
  let updateInfo = null;
  let newIds = new Set();

  const PROMOTE_URL='https://github.com/5884ism/privacy-leak-tracker/actions/workflows/promote-incident.yml';

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

  function cleanSourceName(s){
    const n=String(s?.name || '').trim();
    if(s?.official) return n || '公式発表';
    if(!n || n==='Googleニュース経由' || n==='Google News') return 'Googleニュース';
    return n;
  }

  function sourceLinks(x){
    const srcs=[];
    const seen=new Set();

    for(const s of (Array.isArray(x.sources) ? x.sources : [])){
      if(!s?.url) continue;
      const name=cleanSourceName(s);
      const key=(s.official?'official:':'media:') + name.toLowerCase();
      if(seen.has(key)) continue;
      seen.add(key);
      srcs.push({...s, displayName:name});
    }

    if(!srcs.length) return '';

    srcs.sort((a,b)=>Number(Boolean(b.official))-Number(Boolean(a.official)));

    return `
      <div class="candidate-update-sources">
        <span>情報源</span>
        <div class="candidate-update-source-links">
          ${srcs.map(s=>{
            const text = s.official && s.displayName !== '公式発表'
              ? `公式発表：${s.displayName}`
              : s.displayName;
            return `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(text)}</a>`;
          }).join('')}
        </div>
      </div>
    `;
  }

  function currentIncident(id){
    if(!id || typeof data==='undefined' || !Array.isArray(data)) return null;
    return data.find(x=>String(x.id||'')===String(id)) || null;
  }

  function isStillCandidate(id){
    const x=currentIncident(id);
    return Boolean(x && x.status==='candidate');
  }

  function currentRows(){
    const rows=Array.isArray(updateInfo?.new_candidates) ? updateInfo.new_candidates : [];
    return rows.filter(x=>x?.id && isStillCandidate(x.id));
  }

  function promoteButton(x){
    if(!x.id) return '';
    return `
      <a
        class="review-search-btn candidate-update-promote-link"
        href="${PROMOTE_URL}"
        target="_blank"
        rel="noopener"
        data-incident-id="${esc(x.id)}"
        title="案件ID ${esc(x.id)} を昇格フォームで確認します"
      >昇格させる</a>
    `;
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

    const rows = currentRows();

    // IMPORTANT:
    // candidate-update.json is a daily/update snapshot. Its original new_count can
    // include incidents already promoted after the snapshot was created.
    // The panel must reflect the CURRENT candidate state instead.
    const newCount = rows.length;

    const before = Number(updateInfo.visible_before_count ?? updateInfo.before_count ?? 0);
    const snapshotAfter = Number(updateInfo.visible_after_count ?? updateInfo.after_count ?? 0);
    const promotedSinceSnapshot = Math.max(
      0,
      Number(updateInfo.new_count || 0) - newCount
    );
    const after = Math.max(0, snapshotAfter - promotedSinceSnapshot);
    const net = after - before;
    const netText = `${net > 0 ? '+' : ''}${net}`;

    const rawBefore = Number(updateInfo.raw_before_count ?? 0);
    const rawAfter = Number(updateInfo.raw_after_count ?? 0);
    const rawNet = Number(updateInfo.raw_net_change ?? (rawAfter - rawBefore));
    const rawNetText = `${rawNet > 0 ? '+' : ''}${rawNet}`;

    const summaryClass = newCount > 0 ? 'has-new' : 'no-new';

    panel.innerHTML = `
      <div class="candidate-update-head ${summaryClass}">
        <div>
          <span class="candidate-update-kicker">LATEST UPDATE</span>
          <strong>今回の更新：新規表示候補 ${newCount}件</strong>
          <span class="candidate-update-total">
            表示候補総数 ${before} → ${after}件
            （差分 ${esc(netText)}）
          </span>
          ${rawBefore || rawAfter ? `
            <span class="candidate-update-total">
              内部candidate生データ ${rawBefore} → ${rawAfter}件
              （差分 ${esc(rawNetText)}）
            </span>
          ` : ''}
        </div>
        <span class="candidate-update-time">
          更新 ${esc(jstTime(updateInfo.generated_at))}
        </span>
      </div>

      ${rows.length ? `
        <details class="candidate-update-details" open>
          <summary>今回追加された表示候補を見る</summary>
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
                ${sourceLinks(x)}
                <div class="candidate-update-actions">
                  ${promoteButton(x)}
                  ${x.id ? `<code>${esc(x.id)}</code>` : ''}
                </div>
              </article>
            `).join('')}
          </div>
        </details>
      ` : `<p class="candidate-update-empty">今回追加された候補は、すべて確認済みです。</p>`}
    `;

    panel.querySelectorAll('.candidate-update-promote-link').forEach(link=>{
      link.addEventListener('click', async ()=>{
        const id=link.dataset.incidentId;
        if(!id) return;
        try{
          await navigator.clipboard.writeText(id);
        }catch(e){
          console.warn('incident id copy failed', e);
        }
      });
    });
  }

  function addPromoteActions(){
    document.querySelectorAll('#cards .card').forEach(card => {
      if(!card.querySelector('.badge.candidate')) return;

      const tools=card.querySelector('.incident-tools');
      if(!tools) return;

      tools.querySelectorAll('.review-help').forEach(el=>el.remove());

      if(!tools.querySelector('.candidate-promote-link')){
        const link=document.createElement('a');
        link.className='review-search-btn candidate-promote-link';
        link.href=PROMOTE_URL;
        link.target='_blank';
        link.rel='noopener';
        link.textContent='昇格させる';

        const code=tools.querySelector('code');
        tools.insertBefore(link, code || tools.firstChild);
      }
    });
  }

  function decorateCards(){
    addPromoteActions();

    const currentIds=new Set(currentRows().map(x=>String(x.id)));
    newIds=currentIds;

    if(!newIds.size) return;

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
    addPromoteActions();
    await loadUpdateInfo();
  });
})();
