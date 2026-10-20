(() => {
  const MAX_RESULTS = 8;
  const RECENT_RESULTS_DESKTOP = 6;
  const RECENT_RESULTS_MOBILE = 3;
  let recentExpanded = false;
  let serviceMaster = [];
  let draft = new Map();
  let ready = false;

  function injectStyles(){
    if(document.getElementById('servicePickerV22Styles')) return;

    const style=document.createElement('style');
    style.id='servicePickerV22Styles';
    style.textContent=`
      #serviceV2{display:grid;gap:14px;margin-top:12px}
      #serviceV2 .service-v2-selected-wrap,
      #serviceV2 .service-v2-search-wrap,
      #serviceV2 .service-v2-all{
        border:1px solid #e4e7ec;border-radius:12px;background:#fff
      }
      #serviceV2 .service-v2-selected-wrap{padding:12px}
      #serviceV2 .service-v2-title-row{
        display:flex;align-items:baseline;justify-content:space-between;
        gap:10px;margin-bottom:8px
      }
      #serviceV2 .service-v2-title-row h3{margin:0;font-size:13px}
      #serviceV2 .service-v2-title-row span,
      #serviceV2 .service-v2-subhead{color:#667085;font-size:11px}
      #serviceV2 .service-v2-selected{display:flex;flex-wrap:wrap;gap:7px}
      #serviceV2 .service-v2-chip{
        display:inline-flex;align-items:center;gap:7px;border:1px solid #c7d7fe;
        border-radius:999px;background:#f5f8ff;color:#2447d8;
        padding:6px 9px 6px 11px;font-size:12px;font-weight:800;cursor:pointer
      }
      #serviceV2 .service-v2-chip b{font-size:15px;line-height:1}
      #serviceV2 .service-v2-search-wrap{padding:10px 12px 12px}
      #serviceV2 .service-v2-subhead{margin-bottom:7px;font-weight:800}
      #serviceV2 .service-v2-results{display:grid;gap:6px}
      #serviceV2 .service-v2-result{
        width:100%;display:flex;align-items:center;justify-content:space-between;
        gap:14px;border:1px solid #e4e7ec;border-radius:9px;background:#fff;
        padding:9px 10px;text-align:left;color:#344054;cursor:pointer
      }
      #serviceV2 .service-v2-result:hover{border-color:#a4bcfd;background:#f8faff}
      #serviceV2 .service-v2-result b{flex:0 0 auto;color:#2447d8;font-size:11px}
      #serviceV2 .service-v2-result.is-selected{
        background:#f2f4f7;color:#667085;cursor:default
      }
      #serviceV2 .service-v2-result.is-selected b{color:#667085}

      #serviceV2 .service-v2-all{overflow:hidden}
      #serviceV2 .service-v2-all>summary{
        padding:11px 13px;cursor:pointer;color:#2447d8;
        font-size:12px;font-weight:800;
        display:flex;align-items:center;justify-content:space-between;gap:10px
      }
      #serviceV2 .service-v2-all-count{
        color:#667085;font-size:11px;font-weight:700
      }
      #serviceV2 .service-v2-all-note{
        padding:0 12px 8px;color:#667085;font-size:11px
      }

      #serviceV2 .service-v2-all-list{
        max-height:340px;overflow:auto;
        display:flex !important;
        flex-direction:row !important;
        flex-wrap:wrap !important;
        align-content:flex-start !important;
        gap:7px !important;
        padding:0 10px 12px !important
      }
      #serviceV2 .service-v2-all-choice{
        display:inline-flex !important;
        align-items:center !important;
        gap:6px !important;
        width:auto !important;
        min-width:0 !important;
        max-width:100% !important;
        flex:0 1 auto !important;
        border:1px solid #d0d5dd !important;
        border-radius:999px !important;
        background:#fff !important;
        color:#344054 !important;
        padding:6px 10px 6px 7px !important;
        font:inherit !important;
        font-size:11px !important;
        line-height:1.25 !important;
        cursor:pointer !important;
        white-space:normal !important;
        text-align:left !important;
      }
      #serviceV2 .service-v2-all-choice:hover{
        border-color:#a4bcfd !important;background:#f8faff !important
      }
      #serviceV2 .service-v2-all-choice.is-selected{
        border-color:#84adff !important;background:#eef4ff !important;
        color:#2447d8 !important;font-weight:800 !important
      }
      #serviceV2 .service-v2-all-check{
        display:inline-flex;align-items:center;justify-content:center;
        flex:0 0 15px;width:15px;height:15px;border:1px solid #cfd4dc;
        border-radius:4px;background:#fff;font-size:10px;line-height:1
      }
      #serviceV2 .service-v2-all-choice.is-selected .service-v2-all-check{
        border-color:#5b7cfa;background:#5b7cfa;color:#fff
      }
      #serviceV2 .service-v2-none{margin:0;color:#667085;font-size:12px}
      #serviceV2 .service-v2-saved{
        margin:0;padding:9px 11px;border-radius:8px;background:#ecfdf3;
        color:#027a48;font-size:12px;font-weight:700
      }
      #serviceV2 .service-v2-more-wrap{
        margin-top:8px;
        display:flex;
        justify-content:center;
      }
      #serviceV2 .service-v2-more-btn{
        border:0;
        background:transparent;
        color:#2447d8;
        font:inherit;
        font-size:11px;
        font-weight:800;
        padding:6px 10px;
        cursor:pointer;
      }

      @media(max-width:700px){
        #serviceV2 .service-v2-title-row{
          align-items:flex-start;flex-direction:column;gap:3px
        }

        #myServicesPanel .my-services-actions{
          display:grid !important;
          grid-template-columns:1fr !important;
          gap:8px !important;
        }
        #myServicesPanel .my-services-actions button{
          width:100% !important;
          min-height:44px;
        }
        #myServicesPanel .my-services-actions button.secondary{
          order:2;
        }
      }
    `;
    document.head.appendChild(style);
  }

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
    setTimeout(waitForData,80);
  }

  function makeMaster(){
    const map=new Map();
    for(const x of data){
      const company=String(x.company||'').trim();
      const service=String(x.service||'').trim();
      if(!company) continue;

      const key=serviceKey(company,service);
      const item={
        key,company,service,
        label:serviceLabel(company,service),
        latest:String(x.published||'')
      };

      if(!map.has(key) || item.latest>map.get(key).latest){
        map.set(key,item);
      }
    }

    return [...map.values()].sort((a,b)=>a.label.localeCompare(b.label,'ja'));
  }

  function syncDraftFromSaved(){
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

  function updateCount(){
    if(els?.selectedServiceCount){
      els.selectedServiceCount.textContent=draft.size;
    }
  }

  function selectedHtml(){
    if(!draft.size){
      return `<p class="service-v2-none">まだ選択されていません。</p>`;
    }

    return [...draft.values()].map(x=>`
      <button type="button" class="service-v2-chip"
        data-remove-key="${escapeHtml(x.key)}">
        <span>${escapeHtml(x.label)}</span><b aria-hidden="true">×</b>
      </button>
    `).join('');
  }

  function addButton(x){
    const selected=draft.has(x.key);
    return `
      <button type="button"
        class="service-v2-result ${selected?'is-selected':''}"
        data-add-key="${escapeHtml(x.key)}"
        ${selected?'disabled':''}>
        <span>${escapeHtml(x.label)}</span>
        <b>${selected?'選択済み':'追加'}</b>
      </button>
    `;
  }

  function allChoiceButton(x){
    const selected=draft.has(x.key);
    return `
      <button type="button"
        class="service-v2-all-choice ${selected?'is-selected':''}"
        data-toggle-key="${escapeHtml(x.key)}"
        aria-pressed="${selected?'true':'false'}">
        <span class="service-v2-all-check" aria-hidden="true">${selected?'✓':''}</span>
        <span>${escapeHtml(x.label)}</span>
      </button>
    `;
  }

  function currentQuery(){
    return norm(els?.myServiceSearch?.value||'');
  }

  function isMobile(){
    return window.matchMedia('(max-width:700px)').matches;
  }

  function recentLimit(){
    if(!isMobile()) return RECENT_RESULTS_DESKTOP;
    return recentExpanded ? RECENT_RESULTS_DESKTOP : RECENT_RESULTS_MOBILE;
  }

  function searchItems(){
    const q=currentQuery();

    if(!q){
      return serviceMaster
        .slice()
        .sort((a,b)=>b.latest.localeCompare(a.latest))
        .slice(0,recentLimit());
    }

    return serviceMaster
      .filter(x=>norm(x.label).includes(q))
      .slice(0,MAX_RESULTS);
  }

  function renderSuggestions(){
    const box=document.getElementById('serviceV2Suggestions');
    if(!box) return;

    const q=currentQuery();
    const items=searchItems();

    const showRecentMore = !q && isMobile() && serviceMaster.length > RECENT_RESULTS_MOBILE;

    box.innerHTML=`
      <div class="service-v2-subhead">
        ${q?`検索結果 ${items.length}件${items.length===MAX_RESULTS?'（上位表示）':''}`:'最近の案件から'}
      </div>
      <div class="service-v2-results">
        ${items.length?items.map(addButton).join(''):
          `<p class="service-v2-none">該当する企業・サービスはありません。</p>`}
      </div>
      ${showRecentMore ? `
        <div class="service-v2-more-wrap">
          <button type="button" class="service-v2-more-btn" id="serviceV2RecentMore">
            ${recentExpanded ? '表示を減らす' : 'もっと見る'}
          </button>
        </div>
      ` : ''}
    `;

    bindButtons(box);

    document.getElementById('serviceV2RecentMore')?.addEventListener('click',()=>{
      recentExpanded = !recentExpanded;
      renderSuggestions();
    });
  }

  function renderSelected(){
    const box=document.getElementById('serviceV2Selected');
    if(!box) return;
    box.innerHTML=selectedHtml();
    bindButtons(box);
    updateCount();
  }

  function renderAll(){
    const box=document.getElementById('serviceV2AllList');
    if(!box) return;
    box.innerHTML=serviceMaster.map(allChoiceButton).join('');
    bindButtons(box);
  }

  function refresh(){
    renderSelected();
    renderSuggestions();
    const details=document.getElementById('serviceV2All');
    if(details?.open) renderAll();
  }

  function bindButtons(scope){
    scope.querySelectorAll('[data-add-key]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const item=serviceMaster.find(x=>x.key===btn.dataset.addKey);
        if(!item) return;
        draft.set(item.key,item);
        refresh();
      });
    });

    scope.querySelectorAll('[data-remove-key]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        draft.delete(btn.dataset.removeKey);
        refresh();
      });
    });

    scope.querySelectorAll('[data-toggle-key]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const key=btn.dataset.toggleKey;
        const item=serviceMaster.find(x=>x.key===key);
        if(!item) return;
        draft.has(key)?draft.delete(key):draft.set(key,item);
        refresh();
      });
    });
  }

  function saveDraft(){
    selectedServices=[...draft.values()];
    try{
      localStorage.setItem(STORAGE_KEY,JSON.stringify(selectedServices));
    }catch{}

    pageByView.mine=1;
    updateCount();
    render();

    const msg=document.getElementById('serviceV2Saved');
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

    pageByView.mine=1;

    if(currentView==='mine'){
      currentView='verified';
      document.querySelectorAll('.view-tab').forEach(
        b=>b.classList.toggle('active',b.dataset.view==='verified')
      );
    }

    refresh();
    render();
  }

  function buildUi(){
    const oldGroups=document.querySelector('#myServicesPanel .service-picker-groups');
    if(!oldGroups) return false;

    // 古いチェックボックス一覧は確実に非表示
    oldGroups.style.setProperty('display','none','important');

    document.getElementById('serviceV2')?.remove();

    const ui=document.createElement('div');
    ui.id='serviceV2';
    ui.innerHTML=`
      <section class="service-v2-selected-wrap">
        <div class="service-v2-title-row">
          <h3>選択中のサービス</h3>
          <span>クリックで解除できます</span>
        </div>
        <div id="serviceV2Selected" class="service-v2-selected"></div>
      </section>

      <details id="serviceV2All" class="service-v2-all">
        <summary>
          一覧から選択
          <span id="serviceV2AllCount" class="service-v2-all-count"></span>
        </summary>
        <div class="service-v2-all-note">
          確認済み・可能性ありの企業・サービスです。クリックで選択／解除できます。
        </div>
        <div id="serviceV2AllList" class="service-v2-all-list"></div>
      </details>

      <section class="service-v2-search-wrap">
        <div id="serviceV2Suggestions"></div>
      </section>

      <p id="serviceV2Saved" class="service-v2-saved" hidden></p>
    `;

    oldGroups.insertAdjacentElement('afterend',ui);

    const details=document.getElementById('serviceV2All');
    if(details){
      details.open=false; // 初期状態を強制的に閉じる
      details.addEventListener('toggle',()=>{
        if(details.open) renderAll();
      });
    }

    return true;
  }

  function interceptLegacyButtons(){
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

  function initPicker(){
    if(ready) return;

    injectStyles();
    if(!buildUi()) return;

    ready=true;
    serviceMaster=makeMaster();
    syncDraftFromSaved();

    const allCount=document.getElementById('serviceV2AllCount');
    if(allCount){
      allCount.textContent=`${serviceMaster.length}件`;
    }

    const intro=document.querySelector('#myServicesPanel .service-intro');
    if(intro){
      intro.textContent=
        '利用している企業・サービスを検索して追加すると、関連する案件だけを「自分に関連」タブで確認できます。';
    }

    const searchLabel=document.querySelector(
      '#myServicesPanel label[for="myServiceSearch"]'
    );
    if(searchLabel){
      searchLabel.textContent='利用している企業・サービスを検索';
    }

    if(els?.myServiceSearch){
      els.myServiceSearch.placeholder='例：Amazon、ニフティ、コミックシーモア';
      els.myServiceSearch.addEventListener('input',()=>{
        if(currentQuery()) recentExpanded=false;
        renderSuggestions();
      });
    }

    interceptLegacyButtons();
    renderSelected();
    renderSuggestions();

    const media=window.matchMedia('(max-width:700px)');
    const onViewportChange=()=>{
      if(!media.matches) recentExpanded=false;
      renderSuggestions();
    };
    if(media.addEventListener){
      media.addEventListener('change',onViewportChange);
    }else if(media.addListener){
      media.addListener(onViewportChange);
    }
  }

  if(document.readyState==='loading'){
    window.addEventListener('DOMContentLoaded',waitForData,{once:true});
  }else{
    waitForData();
  }
})();
