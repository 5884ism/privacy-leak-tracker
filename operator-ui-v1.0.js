(() => {
  const MAX_RESULTS = 8;
  const RECENT_RESULTS = 8;
  let master = [];
  let draft = new Map();
  let ready = false;

  function waitForApp(){
    if(
      typeof data !== 'undefined' &&
      Array.isArray(data) &&
      data.length &&
      typeof selectedServices !== 'undefined' &&
      typeof serviceKey === 'function' &&
      typeof serviceLabel === 'function'
    ){
      initOperatorUi();
      return;
    }
    setTimeout(waitForApp,80);
  }

  function makeMaster(){
    const map=new Map();

    for(const x of data){
      if(!(x.status==='confirmed'||x.status==='possible')) continue;

      const company=String(x.company||'').trim();
      const service=String(x.service||'').trim();
      if(!company) continue;

      const key=serviceKey(company,service);
      const item={
        key,
        company,
        service,
        label:serviceLabel(company,service),
        latest:String(x.published||'')
      };

      if(!map.has(key) || item.latest>map.get(key).latest){
        map.set(key,item);
      }
    }

    return [...map.values()].sort((a,b)=>a.label.localeCompare(b.label,'ja'));
  }

  function syncDraft(){
    draft=new Map(
      (selectedServices||[]).map(x=>[
        x.key,{
          key:x.key,
          company:x.company||'',
          service:x.service||'',
          label:x.label||serviceLabel(x.company||'',x.service||'')
        }
      ])
    );
  }

  function esc(v=''){
    return String(v).replace(/[&<>'"]/g,c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
    }[c]));
  }

  function currentQuery(){
    return norm(els?.myServiceSearch?.value||'');
  }

  function selectedHtml(){
    if(!draft.size){
      return `<p class="operator-service-empty">まだ選択されていません。</p>`;
    }

    return [...draft.values()].map(x=>`
      <button type="button" class="operator-service-chip"
        data-remove-key="${esc(x.key)}" title="${esc(x.label)}を削除">
        <span>${esc(x.label)}</span><b aria-hidden="true">×</b>
      </button>
    `).join('');
  }

  function choiceButton(x){
    const selected=draft.has(x.key);
    return `
      <button type="button"
        class="operator-service-choice ${selected?'is-selected':''}"
        data-toggle-key="${esc(x.key)}"
        aria-pressed="${selected?'true':'false'}">
        <span class="operator-service-check" aria-hidden="true">${selected?'✓':''}</span>
        <span>${esc(x.label)}</span>
      </button>
    `;
  }

  function recentItems(){
    const q=currentQuery();

    if(q){
      return master.filter(x=>norm(x.label).includes(q)).slice(0,MAX_RESULTS);
    }

    return master
      .slice()
      .sort((a,b)=>b.latest.localeCompare(a.latest))
      .slice(0,RECENT_RESULTS);
  }

  function renderSelected(){
    const box=document.getElementById('operatorServiceSelected');
    if(!box) return;
    box.innerHTML=selectedHtml();
    bind(box);

    if(els?.selectedServiceCount){
      els.selectedServiceCount.textContent=draft.size;
    }
  }

  function renderRecent(){
    const box=document.getElementById('operatorServiceRecent');
    if(!box) return;

    const q=currentQuery();
    const items=recentItems();

    box.innerHTML=`
      <div class="operator-service-subhead">
        ${q?`検索結果 ${items.length}件${items.length===MAX_RESULTS?'（上位表示）':''}`:'最近の案件から'}
      </div>
      <div class="operator-service-results">
        ${items.length
          ?items.map(choiceButton).join('')
          :`<p class="operator-service-empty">該当する企業・サービスはありません。</p>`}
      </div>
    `;
    bind(box);
  }

  function renderAll(){
    const box=document.getElementById('operatorServiceAllList');
    if(!box) return;

    box.innerHTML=master.map(choiceButton).join('');
    bind(box);
  }

  function refresh(){
    renderSelected();
    renderRecent();

    const details=document.getElementById('operatorServiceAll');
    if(details?.open) renderAll();
  }

  function bind(scope){
    scope.querySelectorAll('[data-toggle-key]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const key=btn.dataset.toggleKey;
        const item=master.find(x=>x.key===key);
        if(!item) return;

        draft.has(key)?draft.delete(key):draft.set(key,item);
        refresh();
      });
    });

    scope.querySelectorAll('[data-remove-key]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        draft.delete(btn.dataset.removeKey);
        refresh();
      });
    });
  }

  function saveDraft(){
    selectedServices=[...draft.values()];

    try{
      localStorage.setItem(STORAGE_KEY,JSON.stringify(selectedServices));
    }catch{}

    if(els?.selectedServiceCount){
      els.selectedServiceCount.textContent=selectedServices.length;
    }

    render();

    const msg=document.getElementById('operatorServiceSaved');
    if(msg){
      msg.textContent=selectedServices.length
        ?`${selectedServices.length}件を保存しました。「自分に関連」で確認できます。`
        :'選択内容を保存しました。';
      msg.hidden=false;
      setTimeout(()=>{msg.hidden=true},3500);
    }
  }

  function clearDraft(){
    draft.clear();
    selectedServices=[];

    try{
      localStorage.removeItem(STORAGE_KEY);
    }catch{}

    if(currentView==='mine'){
      currentView='verified';
      document.querySelectorAll('.view-tab').forEach(
        b=>b.classList.toggle('active',b.dataset.view==='verified')
      );
    }

    refresh();
    render();
  }

  function buildPicker(){
    const legacy=document.querySelector('#myServicesPanel .service-picker-groups');
    if(!legacy) return false;

    legacy.style.setProperty('display','none','important');

    document.getElementById('operatorServiceV2')?.remove();

    const ui=document.createElement('div');
    ui.id='operatorServiceV2';
    ui.className='operator-service-v2';
    ui.innerHTML=`
      <section class="operator-service-selected">
        <div class="operator-service-title">
          <h3>選択中のサービス</h3>
          <span>クリックで解除できます</span>
        </div>
        <div id="operatorServiceSelected" class="operator-service-chips"></div>
      </section>

      <details id="operatorServiceAll" class="operator-service-all">
        <summary>
          <span>一覧から選択</span>
          <span>${master.length}件</span>
        </summary>
        <div class="operator-service-all-note">
          確認済み・可能性ありの企業・サービスです。クリックで選択／解除できます。
        </div>
        <div id="operatorServiceAllList" class="operator-service-all-list"></div>
      </details>

      <section class="operator-service-search">
        <div id="operatorServiceRecent"></div>
      </section>

      <p id="operatorServiceSaved" class="operator-service-saved" hidden></p>
    `;

    legacy.insertAdjacentElement('afterend',ui);

    const all=document.getElementById('operatorServiceAll');
    all.open=false;
    all.addEventListener('toggle',()=>{
      if(all.open) renderAll();
    });

    return true;
  }

  function decorateFeature(){
    const panel=document.getElementById('myServicesPanel');
    const summary=panel?.querySelector(':scope > summary');
    if(!summary) return;

    summary.innerHTML=`
      <span class="operator-feature-icon" aria-hidden="true">✓</span>
      <span class="operator-feature-copy">
        <span class="operator-feature-title-row">
          <strong>自分の利用サービスをチェック</strong>
          <span class="operator-feature-badge">運営チェック</span>
        </span>
        <span class="operator-feature-subtitle">
          利用中のサービスから、関連する漏えい案件をすばやく確認できます
        </span>
      </span>
      <span class="operator-feature-chevron" aria-hidden="true"></span>
    `;

    const intro=panel.querySelector('.service-intro');
    if(!intro){
      const p=document.createElement('p');
      p.className='service-intro';
      p.textContent='利用している企業・サービスを検索または一覧から選択できます。';
      summary.insertAdjacentElement('afterend',p);
    }
  }

  function decorateHeader(){
    const eyebrow=document.querySelector('.site-header .eyebrow');
    if(!eyebrow || document.querySelector('.operator-mode-badge')) return;

    const badge=document.createElement('span');
    badge.className='operator-mode-badge';
    badge.textContent='OPERATOR';
    eyebrow.insertAdjacentElement('afterend',badge);
  }

  function interceptLegacyActions(){
    if(els?.saveMyServices){
      els.saveMyServices.addEventListener('click',e=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        saveDraft();
      },true);
    }

    if(els?.clearMyServices){
      els.clearMyServices.addEventListener('click',e=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        clearDraft();
      },true);
    }
  }

  function initOperatorUi(){
    if(ready) return;

    ready=true;
    master=makeMaster();
    syncDraft();

    decorateHeader();
    decorateFeature();

    if(!buildPicker()) return;

    if(els?.myServiceSearch){
      els.myServiceSearch.placeholder='例：Amazon、ニフティ、コミックシーモア';
      els.myServiceSearch.addEventListener('input',renderRecent);
    }

    interceptLegacyActions();
    renderSelected();
    renderRecent();
  }

  if(document.readyState==='loading'){
    window.addEventListener('DOMContentLoaded',waitForApp,{once:true});
  }else{
    waitForApp();
  }
})();
