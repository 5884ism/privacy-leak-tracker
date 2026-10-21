(() => {
  const API='/api/promote-incident';

  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[c]));

  function incidentFromCard(card){
    const id=card.querySelector('.incident-tools code')?.textContent?.trim();
    if(!id||typeof data==='undefined'||!Array.isArray(data)) return null;
    return data.find(x=>x.id===id)||null;
  }

  function incidentFromId(id){
    if(!id||typeof data==='undefined'||!Array.isArray(data)) return null;
    return data.find(x=>x.id===id)||null;
  }

  function count(v){
    const n=Number(v);
    return Number.isFinite(n)&&n>0?new Intl.NumberFormat('ja-JP').format(n)+'件':'0';
  }

  function ensureModal(){
    if(document.getElementById('promoteEditorModal')) return;
    const m=document.createElement('div');
    m.id='promoteEditorModal';
    m.className='promote-editor-modal';
    m.hidden=true;
    m.innerHTML=`
      <div class="promote-editor-backdrop" data-promote-close></div>
      <section class="promote-editor-dialog" role="dialog" aria-modal="true">
        <header class="promote-editor-head">
          <div>
            <span class="promote-editor-kicker">PROMOTE CANDIDATE</span>
            <h2>候補案件を昇格</h2>
            <p>自動取得された既存情報をすべて確認・修正してから公開できます。</p>
          </div>
          <button type="button" class="promote-editor-close" data-promote-close>×</button>
        </header>
        <form id="promoteEditorForm" class="promote-editor-form">
          <div class="promote-field wide"><label>案件ID</label><input name="incident_id" readonly /></div>
          <div class="promote-field"><label>公表日</label><input name="published" type="date" /></div>
          <div class="promote-field"><label>公開ステータス</label>
            <select name="status">
              <option value="confirmed">confirmed（漏えい確認）</option>
              <option value="possible">possible（漏えいの可能性）</option>
            </select>
          </div>
          <div class="promote-field wide"><label>企業・団体名</label><input name="company" /></div>
          <div class="promote-field wide"><label>サービス名</label><input name="service" /></div>
          <div class="promote-field"><label>対象規模</label><input name="affected_count" /></div>
          <div class="promote-field"><label>原因・分類</label><input name="cause" /></div>
          <div class="promote-field wide"><label>案件概要</label><textarea name="summary" rows="3"></textarea></div>
          <div class="promote-field wide"><label>漏えい・対象情報</label><textarea name="exposed_data" rows="3"></textarea></div>
          <section class="promote-sources wide">
            <div class="promote-sources-head">
              <div><strong>情報源管理</strong><span>自動取得リンクも修正・削除できます。公式発表には「公式」をチェックします。</span></div>
              <button type="button" id="promoteAddSource">＋ 情報源を追加</button>
            </div>
            <div id="promoteSources"></div>
          </section>
          <div class="promote-field wide"><label>確認・昇格メモ</label><textarea name="note" rows="2"></textarea></div>
          <div id="promoteStatus" class="promote-status wide" hidden></div>
          <div class="promote-actions wide">
            <button type="button" class="primary" id="promoteExecute">この内容で昇格</button>
          </div>
        </form>
      </section>`;
    document.body.appendChild(m);
    m.querySelectorAll('[data-promote-close]').forEach(b=>b.addEventListener('click',closeModal));
    m.querySelector('#promoteAddSource').addEventListener('click',()=>addSource({name:'',url:'',official:false}));
    m.querySelector('#promoteExecute').addEventListener('click',execute);
  }

  function addSource(s){
    const box=document.getElementById('promoteSources');
    const row=document.createElement('div');
    row.className='promote-source-row';
    row.innerHTML=`
      <input class="source-name" value="${esc(s.name||'')}" placeholder="表示名" />
      <input class="source-url" value="${esc(s.url||'')}" placeholder="https://..." />
      <label><input type="checkbox" class="source-official" ${s.official?'checked':''}/> 公式</label>
      <label class="delete"><input type="checkbox" class="source-remove"/> 削除</label>`;
    box.appendChild(row);
  }

  function sources(){
    return [...document.querySelectorAll('.promote-source-row')]
      .filter(r=>!r.querySelector('.source-remove').checked)
      .map(r=>({
        name:r.querySelector('.source-name').value.trim()||'情報源',
        url:r.querySelector('.source-url').value.trim(),
        official:r.querySelector('.source-official').checked
      })).filter(x=>x.url);
  }

  function payload(){
    const fd=new FormData(document.getElementById('promoteEditorForm'));
    const v=Object.fromEntries(fd.entries());
    return {...v,sources:sources()};
  }

  function status(text,type='info'){
    const el=document.getElementById('promoteStatus');
    el.hidden=false;
    el.className=`promote-status wide is-${type}`;
    el.textContent=text;
  }

  async function execute(){
    const body=payload();
    if(!body.incident_id){ status('案件IDを取得できません。','error'); return; }
    if(!confirm('この内容で候補案件を公開対象へ昇格します。よろしいですか？')) return;

    const btn=document.getElementById('promoteExecute');
    const old=btn.textContent;
    btn.disabled=true;
    btn.textContent='昇格処理を開始中...';
    status('GitHub Actionsを起動しています。','info');

    try{
      const res=await fetch(API,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify(body)
      });
      const result=await res.json().catch(()=>({}));
      if(!res.ok||!result.ok) throw new Error(result.error||`昇格開始に失敗しました（HTTP ${res.status}）`);
      status(result.message||'昇格処理を開始しました。','success');
      btn.textContent='開始しました';
      setTimeout(()=>{btn.disabled=false;btn.textContent=old},2500);
    }catch(e){
      status(e?.message||'昇格処理の開始に失敗しました。','error');
      btn.disabled=false;
      btn.textContent=old;
    }
  }

  function openModal(x){
    ensureModal();
    const m=document.getElementById('promoteEditorModal');
    const f=document.getElementById('promoteEditorForm');
    f.elements.incident_id.value=x.id||'';
    f.elements.published.value=x.published||'';
    f.elements.status.value='confirmed';
    f.elements.company.value=x.company||'';
    f.elements.service.value=x.service||'';
    f.elements.affected_count.value=count(x.affected_count);
    f.elements.cause.value=x.cause||'';
    f.elements.summary.value=x.summary||'';
    f.elements.exposed_data.value=x.exposed_data||'';
    f.elements.note.value=x.review_note||'';

    const box=document.getElementById('promoteSources');
    box.innerHTML='';
    (Array.isArray(x.sources)?x.sources:[]).forEach(addSource);

    const s=document.getElementById('promoteStatus');
    s.hidden=true;s.textContent='';
    m.hidden=false;
    document.body.classList.add('promote-editor-open');
  }

  function closeModal(){
    const m=document.getElementById('promoteEditorModal');
    if(m) m.hidden=true;
    document.body.classList.remove('promote-editor-open');
  }

  function wire(){
    document.querySelectorAll('#cards .card').forEach(card=>{
      const candidate=card.querySelector('.badge.candidate') ||
        [...card.querySelectorAll('.badge')].find(x=>(x.textContent||'').includes('要確認'));
      if(!candidate) return;
      const btn=[...card.querySelectorAll('a,button')].find(x=>{
        const t=(x.textContent||'').trim();
        const href=x.getAttribute?.('href')||'';
        return t==='昇格させる'||href.includes('promote-incident.yml');
      });
      if(!btn||btn.dataset.promoteFormReady==='1') return;

      btn.dataset.promoteFormReady='1';
      if(btn.tagName==='A'){
        btn.href='#';btn.removeAttribute('target');btn.removeAttribute('rel');
      }
      btn.addEventListener('click',e=>{
        e.preventDefault();
        const x=incidentFromCard(card);
        if(x) openModal(x);
      });
    });
  }

  function wireLatestUpdatePanel(){
    if(window.__promoteLatestUpdatePanelReady) return;
    window.__promoteLatestUpdatePanelReady=true;
    document.addEventListener('click',e=>{
      const link=e.target.closest?.('.candidate-update-promote-link');
      if(!link) return;
      const id=link.dataset.incidentId?.trim();
      const x=incidentFromId(id);
      if(!x) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openModal(x);
    },true);
  }

  function start(){
    ensureModal();
    wireLatestUpdatePanel();
    wire();
    const cards=document.getElementById('cards');
    if(cards) new MutationObserver(wire).observe(cards,{childList:true,subtree:true});
  }

  if(document.readyState==='loading') window.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
