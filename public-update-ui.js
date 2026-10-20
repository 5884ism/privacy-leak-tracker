(() => {
  let updateInfo = null;

  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  }[c]));

  const label = x => x.service
    ? `${x.company || ''} / ${x.service}`
    : (x.company || '案件');

  function cleanSourceName(s){
    const n = String(s?.name || '').trim();
    if(s?.official) return n && n !== 'Googleニュース経由' ? n : '公式発表';
    if(!n || n === 'Googleニュース経由' || n === 'Google News') return 'Googleニュース';
    return n;
  }

  function uniqueSources(x){
    const out=[], seen=new Set();
    for(const s of (Array.isArray(x.sources) ? x.sources : [])){
      if(!s?.url) continue;
      const name=cleanSourceName(s);
      const key=(s.official?'official:':'media:')+name.toLowerCase();
      if(seen.has(key)) continue;
      seen.add(key);
      out.push({...s, displayName:name});
    }
    out.sort((a,b)=>Number(Boolean(b.official))-Number(Boolean(a.official)));
    return out;
  }

  function sourceLinks(x){
    const sources=uniqueSources(x);

    if(x.resolution_url && !sources.some(s=>s.url===x.resolution_url)){
      sources.unshift({
        url:x.resolution_url,
        official:true,
        displayName:'漏えいなし確認の公式発表'
      });
    }

    if(!sources.length) return '';

    const official=sources.filter(s=>s.official);
    const media=sources.filter(s=>!s.official);
    const visible=[...official, ...media.slice(0,3)];
    const hidden=media.slice(3);

    const linkHtml=s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${
      s.official ? '公式発表：' : ''
    }${esc(s.displayName)}</a>`;

    return `
      <div class="public-update-sources">
        <span>情報源</span>
        <div class="public-update-source-links">
          ${visible.map(linkHtml).join('')}
          ${hidden.length ? `
            <details class="public-update-more-sources">
              <summary>ほか${hidden.length}媒体</summary>
              <div>${hidden.map(linkHtml).join('')}</div>
            </details>
          ` : ''}
        </div>
      </div>
    `;
  }

  function jstTime(iso=''){
    if(!iso) return '-';
    const d=new Date(iso);
    if(Number.isNaN(d.getTime())) return iso;
    return new Intl.DateTimeFormat('ja-JP',{
      timeZone:'Asia/Tokyo',
      year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit'
    }).format(d);
  }

  function ensurePanel(){
    if(document.getElementById('publicUpdatePanel')) return;
    const tabs=document.querySelector('.content-switcher');
    if(!tabs) return;
    const panel=document.createElement('section');
    panel.id='publicUpdatePanel';
    panel.className='public-update-panel';
    panel.setAttribute('aria-live','polite');
    tabs.parentNode.insertBefore(panel,tabs);
  }

  function renderPanel(){
    ensurePanel();
    const panel=document.getElementById('publicUpdatePanel');
    if(!panel||!updateInfo) return;

    const added=Number(updateInfo.added_count||0);
    const changed=Number(updateInfo.changed_count||0);
    const net=Number(updateInfo.net_change||0);
    const netText=`${net>0?'+':''}${net}`;
    const hasUpdate=added>0||changed>0;
    const addedRows=updateInfo.added||[];
    const changedRows=updateInfo.changed||[];

    panel.innerHTML=`
      <div class="public-update-head ${hasUpdate?'has-update':'no-update'}">
        <div>
          <span class="public-update-kicker">TODAY'S UPDATE</span>
          <strong>今日の更新：新規公開 ${added}件${changed?` / ステータス更新 ${changed}件`:''}</strong>
          <span class="public-update-total">
            公開対象総数 ${Number(updateInfo.day_start_count||0)}
            → ${Number(updateInfo.after_count||0)}件
            （本日差分 ${esc(netText)}）
          </span>
        </div>
        <span class="public-update-time">
          最終確認 ${esc(jstTime(updateInfo.last_checked_at||updateInfo.generated_at))}
        </span>
      </div>

      ${hasUpdate?`
        <details class="public-update-details" open>
          <summary>今日の更新内容を見る</summary>
          <div class="public-update-list">
            ${addedRows.map(x=>`
              <article class="public-update-item">
                <div class="public-update-meta">
                  <span class="badge public-new">NEW</span>
                  <span>${esc(x.published||'-')}</span>
                </div>
                <strong>${esc(label(x))}</strong>
                <p>${esc(x.summary||'')}</p>
                ${sourceLinks(x)}
              </article>
            `).join('')}
            ${changedRows.map(x=>`
              <article class="public-update-item">
                <div class="public-update-meta">
                  <span class="badge public-updated">UPDATED</span>
                  <span>${esc(x.published||'-')}</span>
                </div>
                <strong>${esc(label(x))}</strong>
                <p class="status-change">
                  ${esc(x.from_label||x.from_status)}
                  → <strong>${esc(x.to_label||x.to_status)}</strong>
                </p>
                ${x.resolution_note?`<p>${esc(x.resolution_note)}</p>`:''}
                ${sourceLinks(x)}
              </article>
            `).join('')}
          </div>
        </details>
      `:`<p class="public-update-empty">本日はまだ新たな公開案件・ステータス更新はありません。</p>`}
    `;
  }

  function improveMainSourceDisplays(){
    document.querySelectorAll('.source-details').forEach(details=>{
      const lis=[...details.querySelectorAll('li')];
      const seen=new Set();
      const names=[];

      for(const li of lis){
        const a=li.querySelector('a');
        if(!a) continue;
        let name=(a.textContent||'').trim();
        if(!name || name==='Googleニュース経由') name='Googleニュース';
        a.textContent=name;

        const key=name.toLowerCase();
        if(seen.has(key)){
          li.remove();
          continue;
        }
        seen.add(key);
        names.push(name);
      }

      const summary=details.querySelector('summary');
      if(!summary) return;
      const span=summary.querySelector('span');
      if(span){
        const preview=names.slice(0,3).join(' / ');
        const more=names.length>3?` / ほか${names.length-3}媒体`:'';
        span.textContent=preview+more;
      }

      const prefix=summary.childNodes[0];
      if(prefix && prefix.nodeType===Node.TEXT_NODE){
        prefix.textContent=`情報源：${names.length}件 `;
      }
    });
  }

  function decorateCards(){
    if(!updateInfo) return;
    document.querySelectorAll('#cards .card').forEach(card=>{
      const h3=card.querySelector('h3');
      if(!h3) return;
      const date=card.querySelector('.date')?.textContent?.trim()||'';
      const title=h3.textContent.trim();
      const added=(updateInfo.added||[]).find(
        x=>label(x)===title&&String(x.published||'-')===date
      );
      const changed=(updateInfo.changed||[]).find(
        x=>label(x)===title&&String(x.published||'-')===date
      );
      const meta=card.querySelector('.meta');
      if(!meta) return;

      if(added&&!meta.querySelector('.public-new')){
        card.classList.add('public-new-card');
        const badge=document.createElement('span');
        badge.className='badge public-new';
        badge.textContent='NEW';
        meta.prepend(badge);
      }else if(changed&&!meta.querySelector('.public-updated')){
        card.classList.add('public-updated-card');
        const badge=document.createElement('span');
        badge.className='badge public-updated';
        badge.textContent='UPDATED';
        meta.prepend(badge);
      }
    });
    improveMainSourceDisplays();
  }

  async function loadUpdateInfo(){
    try{
      const res=await fetch('data/public-update.json',{cache:'no-store'});
      if(!res.ok) return;
      updateInfo=await res.json();
      renderPanel();
      decorateCards();
    }catch(e){
      console.warn('public update info unavailable',e);
    }
  }

  function patchRender(){
    if(typeof render!=='function') return false;
    if(window.__publicUpdateUIPatched) return true;
    window.__publicUpdateUIPatched=true;
    const originalRender=render;
    render=function(){
      originalRender();
      renderPanel();
      decorateCards();
    };
    return true;
  }

  window.addEventListener('DOMContentLoaded',async()=>{
    patchRender();
    await loadUpdateInfo();
    improveMainSourceDisplays();
  });
})();
