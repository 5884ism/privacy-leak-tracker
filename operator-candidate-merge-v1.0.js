(() => {
  const API='/api/merge-candidates';
  let primary=null, selected=new Set();

  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const candidates=()=>typeof data!=='undefined'&&Array.isArray(data)?data.filter(x=>x.status==='candidate'):[];
  const label=x=>x.service?`${x.company||''} / ${x.service}`:(x.company||'(企業名なし)');
  const fmt=n=>Number(n)>0?new Intl.NumberFormat('ja-JP').format(Number(n))+'件':'0';

  function ensure(){
    if(document.getElementById('candidateMergeModal')) return;
    const m=document.createElement('div');
    m.id='candidateMergeModal';m.className='candidate-merge-modal';m.hidden=true;
    m.innerHTML=`
      <div class="candidate-merge-backdrop" data-merge-close></div>
      <section class="candidate-merge-dialog">
        <header><div><span>MERGE CANDIDATES</span><h2>同一事故の候補を統合</h2><p>委託先・共通サーバー等の同一事故を1件へまとめます。</p></div><button data-merge-close>×</button></header>
        <form id="candidateMergeForm">
          <div class="merge-field wide"><label>統合後に残す案件ID</label><input name="primary_id" readonly></div>
          <div class="merge-field wide"><label>統合後の企業・委託先名</label><input name="company"></div>
          <div class="merge-field wide"><label>サービス/システム名</label><input name="service"></div>
          <div class="merge-field"><label>公表日</label><input type="date" name="published"></div>
          <div class="merge-field"><label>対象規模</label><input name="affected_count"></div>
          <div class="merge-field wide"><label>原因・分類</label><input name="cause"></div>
          <div class="merge-field wide"><label>案件概要</label><textarea name="summary" rows="3"></textarea></div>
          <div class="merge-field wide"><label>漏えい・対象情報</label><textarea name="exposed_data" rows="3"></textarea></div>

          <section class="merge-pick wide">
            <div class="merge-pick-head"><strong>統合する候補</strong><input id="mergeCandidateSearch" placeholder="候補を検索"></div>
            <div id="mergeCandidateList"></div>
          </section>

          <div class="merge-field wide"><label>影響組織（1行1団体）</label><textarea name="affected_orgs" rows="5"></textarea></div>
          <div class="merge-field wide"><label>統合理由・メモ</label><textarea name="note" rows="2" placeholder="例：同一委託先サーバーの事故として統合"></textarea></div>
          <div id="mergeStatus" class="merge-status wide" hidden></div>
          <div class="merge-actions wide"><button type="button" id="mergeExecute">この内容で統合</button></div>
        </form>
      </section>`;
    document.body.appendChild(m);
    m.querySelectorAll('[data-merge-close]').forEach(b=>b.addEventListener('click',close));
    m.querySelector('#mergeCandidateSearch').addEventListener('input',renderList);
    m.querySelector('#mergeExecute').addEventListener('click',execute);
  }

  function renderList(){
    const box=document.getElementById('mergeCandidateList');
    const q=(document.getElementById('mergeCandidateSearch')?.value||'').toLowerCase();
    box.innerHTML=candidates().filter(x=>!q||`${label(x)} ${x.summary||''} ${x.id||''}`.toLowerCase().includes(q)).map(x=>`
      <label class="merge-candidate-row">
        <input type="checkbox" value="${esc(x.id)}" ${selected.has(x.id)?'checked':''} ${x.id===primary?.id?'disabled':''}>
        <span><strong>${esc(label(x))}</strong><small>${esc(x.published||'')} / ${esc(fmt(x.affected_count))}</small></span>
      </label>`).join('');
    box.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.addEventListener('change',()=>{
      cb.checked?selected.add(cb.value):selected.delete(cb.value);syncOrgs();
    }));
  }

  function syncOrgs(){
    const f=document.getElementById('candidateMergeForm');
    const names=[...selected].map(id=>candidates().find(x=>x.id===id)).filter(Boolean).map(x=>label(x));
    f.elements.affected_orgs.value=[...new Set(names)].join('\n');
    const total=[...selected].map(id=>candidates().find(x=>x.id===id)?.affected_count||0).reduce((a,b)=>a+Number(b||0),0);
    if(total>0) f.elements.affected_count.value=fmt(total);
  }

  function open(x){
    ensure();primary=x;selected=new Set([x.id]);
    const f=document.getElementById('candidateMergeForm');
    f.elements.primary_id.value=x.id||'';
    f.elements.company.value=x.company||'';
    f.elements.service.value=x.service||'';
    f.elements.published.value=x.published||'';
    f.elements.affected_count.value=fmt(x.affected_count);
    f.elements.cause.value=x.cause||'';
    f.elements.summary.value=x.summary||'';
    f.elements.exposed_data.value=x.exposed_data||'';
    f.elements.note.value='';
    document.getElementById('mergeCandidateSearch').value='';
    renderList();syncOrgs();
    document.getElementById('mergeStatus').hidden=true;
    document.getElementById('candidateMergeModal').hidden=false;
    document.body.classList.add('candidate-merge-open');
  }
  function close(){document.getElementById('candidateMergeModal').hidden=true;document.body.classList.remove('candidate-merge-open');}
  function setStatus(t,type){const e=document.getElementById('mergeStatus');e.hidden=false;e.className=`merge-status wide is-${type}`;e.textContent=t;}

  async function execute(){
    const f=document.getElementById('candidateMergeForm');
    const ids=[...selected];
    if(ids.length<2){setStatus('統合する候補を2件以上選択してください。','error');return;}
    if(!confirm(`${ids.length}件の候補を1件へ統合します。よろしいですか？`)) return;
    const body={
      primary_id:f.elements.primary_id.value,merge_ids:ids,
      company:f.elements.company.value,service:f.elements.service.value,published:f.elements.published.value,
      affected_count:f.elements.affected_count.value,cause:f.elements.cause.value,
      summary:f.elements.summary.value,exposed_data:f.elements.exposed_data.value,
      affected_organizations:f.elements.affected_orgs.value.split(/\n+/).map(name=>({name:name.trim()})).filter(x=>x.name),
      note:f.elements.note.value
    };
    const btn=document.getElementById('mergeExecute');btn.disabled=true;btn.textContent='統合処理を開始中...';
    try{
      const r=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const j=await r.json().catch(()=>({}));
      if(!r.ok||!j.ok) throw new Error(j.error||`HTTP ${r.status}`);
      setStatus(j.message||'統合処理を開始しました。','success');btn.textContent='開始しました';
    }catch(e){setStatus(e.message||'統合開始に失敗しました。','error');btn.disabled=false;btn.textContent='この内容で統合';}
  }

  function wire(){
    document.querySelectorAll('#cards .card').forEach(card=>{
      const candidate=[...card.querySelectorAll('.badge')].some(x=>(x.textContent||'').includes('要確認'));
      if(!candidate||card.querySelector('.candidate-merge-btn')) return;
      const code=card.querySelector('.incident-tools code'); const id=code?.textContent?.trim();
      const x=candidates().find(v=>v.id===id); if(!x) return;
      const actions=card.querySelector('.incident-tools')||card;
      const b=document.createElement('button');b.type='button';b.className='candidate-merge-btn';b.textContent='候補を統合';
      b.addEventListener('click',()=>open(x));actions.appendChild(b);
    });
  }
  function start(){ensure();wire();const c=document.getElementById('cards');if(c)new MutationObserver(wire).observe(c,{childList:true,subtree:true});}
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
