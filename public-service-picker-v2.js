(() => {
  const MAX_RESULTS = 8;
  const RECENT_RESULTS = 6;
  let serviceMaster = [];
  let draft = new Map();
  let ready = false;

  function waitForData(){
    if(
      typeof data !== 'undefined' &&
      Array.isArray(data) &&
      data.length &&
      typeof selectedServices !== 'undefined'
    ){
      initPicker();
      return;
    }
    setTimeout(waitForData, 80);
  }

  function makeMaster(){
    const map = new Map();

    for(const x of data){
      const company = String(x.company || '').trim();
      const service = String(x.service || '').trim();
      if(!company) continue;

      const key = serviceKey(company, service);
      const item = {
        key,
        company,
        service,
        label: serviceLabel(company, service),
        latest: String(x.published || '')
      };

      if(!map.has(key)){
        map.set(key, item);
      }else if(item.latest > map.get(key).latest){
        map.get(key).latest = item.latest;
      }
    }

    return [...map.values()].sort((a,b)=>
      a.label.localeCompare(b.label, 'ja')
    );
  }

  function syncDraftFromSaved(){
    draft = new Map(
      (selectedServices || []).map(x => [
        x.key,
        {
          key:x.key,
          company:x.company || '',
          service:x.service || '',
          label:x.label || serviceLabel(x.company || '', x.service || '')
        }
      ])
    );
  }

  function updateCount(){
    if(els?.selectedServiceCount){
      els.selectedServiceCount.textContent = draft.size;
    }
  }

  function selectedHtml(){
    if(!draft.size){
      return `<p class="service-v2-none">まだ選択されていません。</p>`;
    }

    return [...draft.values()].map(x=>`
      <button
        type="button"
        class="service-v2-chip"
        data-remove-key="${escapeHtml(x.key)}"
        title="${escapeHtml(x.label)}を削除"
      >
        <span>${escapeHtml(x.label)}</span>
        <b aria-hidden="true">×</b>
      </button>
    `).join('');
  }

  function addButton(x){
    const selected = draft.has(x.key);
    return `
      <button
        type="button"
        class="service-v2-result ${selected ? 'is-selected' : ''}"
        data-add-key="${escapeHtml(x.key)}"
        ${selected ? 'disabled' : ''}
      >
        <span>${escapeHtml(x.label)}</span>
        <b>${selected ? '選択済み' : '追加'}</b>
      </button>
    `;
  }

  function currentQuery(){
    return norm(els?.myServiceSearch?.value || '');
  }

  function searchItems(){
    const q = currentQuery();

    if(!q){
      return serviceMaster
        .slice()
        .sort((a,b)=>b.latest.localeCompare(a.latest))
        .slice(0, RECENT_RESULTS);
    }

    return serviceMaster
      .filter(x=>norm(x.label).includes(q))
      .slice(0, MAX_RESULTS);
  }

  function renderSuggestions(){
    const box = document.getElementById('serviceV2Suggestions');
    if(!box) return;

    const q = currentQuery();
    const items = searchItems();

    const heading = q
      ? `検索結果 ${items.length}件${items.length===MAX_RESULTS ? '（上位表示）' : ''}`
      : '最近の案件から';

    box.innerHTML = `
      <div class="service-v2-subhead">${heading}</div>
      <div class="service-v2-results">
        ${items.length
          ? items.map(addButton).join('')
          : `<p class="service-v2-none">該当する企業・サービスはありません。</p>`
        }
      </div>
    `;

    bindButtons(box);
  }

  function renderSelected(){
    const box = document.getElementById('serviceV2Selected');
    if(!box) return;
    box.innerHTML = selectedHtml();
    bindButtons(box);
    updateCount();
  }

  function renderAll(){
    const box = document.getElementById('serviceV2AllList');
    if(!box) return;

    box.innerHTML = serviceMaster.map(addButton).join('');
    bindButtons(box);
  }

  function bindButtons(scope){
    scope.querySelectorAll('[data-add-key]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const item = serviceMaster.find(x=>x.key===btn.dataset.addKey);
        if(!item) return;
        draft.set(item.key, item);
        renderSelected();
        renderSuggestions();

        const details = document.getElementById('serviceV2All');
        if(details?.open) renderAll();
      });
    });

    scope.querySelectorAll('[data-remove-key]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        draft.delete(btn.dataset.removeKey);
        renderSelected();
        renderSuggestions();

        const details = document.getElementById('serviceV2All');
        if(details?.open) renderAll();
      });
    });
  }

  function saveDraft(){
    selectedServices = [...draft.values()];

    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedServices));
    }catch{}

    pageByView.mine = 1;
    updateCount();
    render();

    const mineTab = document.querySelector('.view-tab[data-view="mine"]');
    const msg = document.getElementById('serviceV2Saved');
    if(msg){
      msg.textContent = selectedServices.length
        ? `${selectedServices.length}件を保存しました。「自分に関連」で確認できます。`
        : '選択内容を保存しました。';
      msg.hidden = false;
      setTimeout(()=>{ msg.hidden = true; }, 3500);
    }

    if(selectedServices.length && mineTab){
      mineTab.classList.add('service-v2-attention');
      setTimeout(()=>mineTab.classList.remove('service-v2-attention'), 1800);
    }
  }

  function clearDraft(){
    draft.clear();
    selectedServices = [];

    try{
      localStorage.removeItem(STORAGE_KEY);
    }catch{}

    pageByView.mine = 1;

    if(currentView === 'mine'){
      currentView = 'verified';
      document.querySelectorAll('.view-tab').forEach(
        b=>b.classList.toggle('active', b.dataset.view==='verified')
      );
    }

    renderSelected();
    renderSuggestions();

    const details = document.getElementById('serviceV2All');
    if(details?.open) renderAll();

    render();
  }

  function buildUi(){
    const oldGroups = document.querySelector(
      '#myServicesPanel .service-picker-groups'
    );
    if(!oldGroups) return false;

    // 既存の全件チェックボックスは非表示。既存ロジック用DOMは残す。
    oldGroups.hidden = true;

    if(document.getElementById('serviceV2')) return true;

    const ui = document.createElement('div');
    ui.id = 'serviceV2';
    ui.className = 'service-v2';
    ui.innerHTML = `
      <section class="service-v2-selected-wrap">
        <div class="service-v2-title-row">
          <h3>選択中のサービス</h3>
          <span>クリックで解除できます</span>
        </div>
        <div id="serviceV2Selected" class="service-v2-selected"></div>
      </section>

      <section class="service-v2-search-wrap">
        <div id="serviceV2Suggestions"></div>
      </section>

      <details id="serviceV2All" class="service-v2-all">
        <summary>すべての企業・サービスを見る</summary>
        <div id="serviceV2AllList" class="service-v2-all-list"></div>
      </details>

      <p id="serviceV2Saved" class="service-v2-saved" hidden></p>
    `;

    oldGroups.insertAdjacentElement('afterend', ui);

    document.getElementById('serviceV2All')?.addEventListener('toggle', e=>{
      if(e.currentTarget.open) renderAll();
    });

    return true;
  }

  function interceptLegacyButtons(){
    if(els?.saveMyServices){
      els.saveMyServices.addEventListener('click', e=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        saveDraft();
      }, true);
    }

    if(els?.clearMyServices){
      els.clearMyServices.addEventListener('click', e=>{
        e.preventDefault();
        e.stopImmediatePropagation();
        clearDraft();
      }, true);
    }
  }

  function initPicker(){
    if(ready) return;
    if(!buildUi()) return;

    ready = true;
    serviceMaster = makeMaster();
    syncDraftFromSaved();

    // 文言を検索型UI向けに変更
    const intro = document.querySelector('#myServicesPanel .service-intro');
    if(intro){
      intro.textContent =
        '利用している企業・サービスを検索して追加すると、関連する案件だけを「自分に関連」タブで確認できます。';
    }

    const searchLabel = document.querySelector(
      '#myServicesPanel label[for="myServiceSearch"]'
    );
    if(searchLabel){
      searchLabel.textContent = '利用している企業・サービスを検索';
    }

    if(els?.myServiceSearch){
      els.myServiceSearch.placeholder = '例：Amazon、ニフティ、コミックシーモア';
      els.myServiceSearch.addEventListener('input', renderSuggestions);
    }

    interceptLegacyButtons();
    renderSelected();
    renderSuggestions();
  }

  if(document.readyState === 'loading'){
    window.addEventListener('DOMContentLoaded', waitForData, {once:true});
  }else{
    waitForData();
  }
})();
