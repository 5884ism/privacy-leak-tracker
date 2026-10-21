(() => {
  const API='/api/merge-candidates';
  let seedCandidate=null;
  let selectedCandidates=new Set();
  let selectedParent=null;

  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const allRows=()=>typeof data!=='undefined'&&Array.isArray(data)?data:[];
  const candidates=()=>allRows().filter(x=>x.status==='candidate');
  const parents=()=>allRows().filter(x=>['confirmed','possible'].includes(x.status));
  const label=x=>x.service?`${x.company||''} / ${x.service}`:(x.company||'(企業名なし)');
  const fmt=n=>Number(n)>0?new Intl.NumberFormat('ja-JP').format(Number(n))+'件':'0';

  function ensure(){
    if(document.getElementById('candidateMergeModal')) return;
    const m=document.createElement('div');
    m.id='candidateMergeModal';m.className='candidate-merge-modal';m.hidden=true;
    m.innerHTML=`
      <div class="candidate-merge-backdrop" data-merge-close></div>
      <section class="candidate-merge-dialog">
        <header>
          <div><span>LINK / MERGE INCIDENTS</span><h2>同一事故としてまとめる</h2><p>既存の確認済み案件へ紐づけるか、新しい親案件を作成します。</p></div>
          <button type="button" data-merge-close>×</button>
        </header>

        <form id="candidateMergeForm">
          <section class="merge-mode wide">
            <label><input type="radio" name="mode" value="existing" checked> 既存の確認済み案件に紐づける</label>
            <label><input type="radio" name="mode" value="new"> 新しい親案件を作る</label>
          </section>

          <section id="existingParentSection" class="merge-pick wide">
            <div class="merge-pick-head"><strong>親案件を選択</strong><input id="parentSearch" placeholder="企業名・サービス名・案件IDで検索"></div>
            <div id="parentList" class="merge-list"></div>
          </section>

          <div id="selectedParentInfo" class="selected-parent wide" hidden></div>

          <section class="merge-pick wide">
            <div class="merge-pick-head"><strong>紐づける要確認候補</strong><input id="candidateSearch" placeholder="候補を検索"></div>
            <div id="candidateList" class="merge-list"></div>
          </section>

          <div class="merge-field wide"><label>親案件の企業・委託先名</label><input name="company"></div>
          <div class="merge-field wide"><label>サービス/システム名</label><input name="service"></div>
          <div class="merge-field"><label>公表日</label><input type="date" name="published"></div>
          <div class="merge-field"><label>対象規模</label><input name="affected_count"></div>
          <div class="merge-field wide"><label>原因・分類</label><input name="cause"></div>
          <div class="merge-field wide"><label>案件概要</label><textarea name="summary" rows="3"></textarea></div>
          <div class="merge-field wide"><label>漏えい・対象情報</label><textarea name="exposed_data" rows="3"></textarea></div>

          <div class="merge-field wide"><label>影響組織（1行1団体）</label><textarea name="affected_orgs" rows="5"></textarea></div>
          <div class="merge-field wide"><label>統合/紐づけ理由</label><textarea name="note" rows="2" placeholder="例：同一委託先サーバーの事故として既存案件へ紐づけ"></textarea></div>

          <div id="mergeStatus" class="merge-status wide" hidden></div>
          <div class="merge-actions wide"><button type="button" id="mergeExecute">この内容で実行</button></div>
        </form>
      </section>`;
    document.body.appendChild(m);

    m.querySelectorAll('[data-merge-close]').forEach(b=>b.addEventListener('click',closeModal));
    m.querySelectorAll('input[name=mode]').forEach(r=>r.addEventListener('change',modeChanged));
    m.querySelector('#parentSearch').addEventListener('input',renderParents);
    m.querySelector('#candidateSearch').addEventListener('input',renderCandidates);
    m.querySelector('#mergeExecute').addEventListener('click',execute);
  }

  function form(){return document.getElementById('candidateMergeForm');}
  function currentMode(){return form().elements.mode.value;}

  function fillFields(x, preserveIfEmpty=false){
    const f=form();
    const set=(name,val)=>{
      if(!preserveIfEmpty || !f.elements[name].value) f.elements[name].value=val||'';
    };
    set('company',x?.company||'');
    set('service',x?.service||'');
    set('published',x?.published||'');
    set('affected_count',fmt(x?.affected_count||0));
    set('cause',x?.cause||'');
    set('summary',x?.summary||'');
    set('exposed_data',x?.exposed_data||'');
  }

  function modeChanged(){
    const existing=currentMode()==='existing';
    document.getElementById('existingParentSection').hidden=!existing;
    document.getElementById('selectedParentInfo').hidden=!existing||!selectedParent;
    if(existing&&selectedParent) fillFields(selectedParent);
    if(!existing&&seedCandidate) fillFields(seedCandidate);
    syncDerived();
  }

  function renderParents(){
    const box=document.getElementById('parentList');
    const q=(document.getElementById('parentSearch').value||'').toLowerCase();
    const rows=parents().filter(x=>!q||`${label(x)} ${x.id||''} ${x.summary||''}`.toLowerCase().includes(q)).slice(0,30);
    box.innerHTML=rows.map(x=>`
      <label class="merge-choice-row ${selectedParent?.id===x.id?'is-selected':''}">
        <input type="radio" name="parent_choice" value="${esc(x.id)}" ${selectedParent?.id===x.id?'checked':''}>
        <span><strong>${esc(label(x))}</strong><small>${esc(x.published||'')} / ${esc(fmt(x.affected_count))} / ${esc(x.status)}</small></span>
      </label>`).join('');
    box.querySelectorAll('input[name=parent_choice]').forEach(r=>r.addEventListener('change',()=>{
      selectedParent=parents().find(x=>x.id===r.value)||null;
      const info=document.getElementById('selectedParentInfo');
      if(selectedParent){
        info.hidden=false;
        info.innerHTML=`<strong>親案件：</strong>${esc(label(selectedParent))}<span>${esc(selectedParent.id)}</span>`;
        fillFields(selectedParent);
      }
      renderParents();syncDerived();
    }));
  }

  function renderCandidates(){
    const box=document.getElementById('candidateList');
    const q=(document.getElementById('candidateSearch').value||'').toLowerCase();
    const rows=candidates().filter(x=>!q||`${label(x)} ${x.id||''} ${x.summary||''}`.toLowerCase().includes(q));
    box.innerHTML=rows.map(x=>`
      <label class="merge-choice-row">
        <input type="checkbox" value="${esc(x.id)}" ${selectedCandidates.has(x.id)?'checked':''}>
        <span><strong>${esc(label(x))}</strong><small>${esc(x.published||'')} / ${esc(fmt(x.affected_count))}</small></span>
      </label>`).join('');
    box.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.addEventListener('change',()=>{
      cb.checked?selectedCandidates.add(cb.value):selectedCandidates.delete(cb.value);
      syncDerived();
    }));
  }

  function syncDerived(){
    const f=form();
    const selected=[...selectedCandidates].map(id=>candidates().find(x=>x.id===id)).filter(Boolean);

    const existingOrgNames=currentMode()==='existing'&&selectedParent
      ? (selectedParent.affected_organizations||[]).map(o=>typeof o==='string'?o:o?.name).filter(Boolean)
      : [];
    const incomingNames=selected.map(x=>label(x));
    f.elements.affected_orgs.value=[...new Set([...existingOrgNames,...incomingNames])].join('\n');

    if(currentMode()==='new'){
      const total=selected.reduce((sum,x)=>sum+Number(x.affected_count||0),0);
      if(total>0) f.elements.affected_count.value=fmt(total);
      if(selected.length&&(!f.elements.company.value||f.elements.company.value===seedCandidate?.company)){
        fillFields(seedCandidate||selected[0], true);
      }
    }
  }

  function openModal(x){
    ensure();
    seedCandidate=x;
    selectedCandidates=new Set([x.id]);
    selectedParent=null;

    const f=form();
    f.reset();
    f.elements.mode.value='existing';
    document.getElementById('parentSearch').value='';
    document.getElementById('candidateSearch').value='';
    document.getElementById('selectedParentInfo').hidden=true;
    document.getElementById('mergeStatus').hidden=true;

    fillFields(x);
    renderParents();
    renderCandidates();
    modeChanged();

    document.getElementById('candidateMergeModal').hidden=false;
    document.body.classList.add('candidate-merge-open');
  }

  function closeModal(){
    document.getElementById('candidateMergeModal').hidden=true;
    document.body.classList.remove('candidate-merge-open');
  }

  function setStatus(text,type){
    const el=document.getElementById('mergeStatus');
    el.hidden=false;el.className=`merge-status wide is-${type}`;el.textContent=text;
  }

  async function execute(){
    const f=form(), mode=currentMode(), ids=[...selectedCandidates];
    if(!ids.length){setStatus('紐づける候補を1件以上選択してください。','error');return;}
    if(mode==='existing'&&!selectedParent){setStatus('既存の親案件を選択してください。','error');return;}

    const verb=mode==='existing'
      ? `${ids.length}件の候補を既存案件「${label(selectedParent)}」へ紐づけます。`
      : `${ids.length}件の候補から新しい親案件を作成します。`;
    if(!confirm(`${verb}\nよろしいですか？`)) return;

    const body={
      mode,
      parent_id:mode==='existing'?selectedParent.id:'',
      merge_ids:ids,
      company:f.elements.company.value,
      service:f.elements.service.value,
      published:f.elements.published.value,
      affected_count:f.elements.affected_count.value,
      cause:f.elements.cause.value,
      summary:f.elements.summary.value,
      exposed_data:f.elements.exposed_data.value,
      affected_organizations:f.elements.affected_orgs.value.split(/\n+/).map(name=>({name:name.trim()})).filter(x=>x.name),
      note:f.elements.note.value
    };

    const btn=document.getElementById('mergeExecute');
    btn.disabled=true;btn.textContent='処理を開始中...';

    try{
      const r=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const j=await r.json().catch(()=>({}));
      if(!r.ok||!j.ok) throw new Error(j.error||`HTTP ${r.status}`);
      setStatus(j.message||'処理を開始しました。','success');
      btn.textContent='開始しました';
    }catch(e){
      setStatus(e.message||'処理開始に失敗しました。','error');
      btn.disabled=false;btn.textContent='この内容で実行';
    }
  }

  function wire(){
    document.querySelectorAll('#cards .card').forEach(card=>{
      const isCandidate=[...card.querySelectorAll('.badge')].some(x=>(x.textContent||'').includes('要確認'));
      if(!isCandidate||card.querySelector('.candidate-merge-btn')) return;
      const id=card.querySelector('.incident-tools code')?.textContent?.trim();
      const x=candidates().find(v=>v.id===id);
      if(!x) return;

      const actions=card.querySelector('.incident-tools')||card;
      const b=document.createElement('button');
      b.type='button';b.className='candidate-merge-btn';b.textContent='同一事故にまとめる';
      b.addEventListener('click',()=>openModal(x));
      actions.appendChild(b);
    });
  }

  function start(){
    ensure();wire();
    const cards=document.getElementById('cards');
    if(cards)new MutationObserver(wire).observe(cards,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
