(() => {
  const API_URL='/api/edit-reviewed-incident';
  let currentIncident=null;
  let attachIds=new Set();

  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const allRows=()=>typeof data!=='undefined'&&Array.isArray(data)?data:[];
  const candidates=()=>allRows().filter(x=>x.status==='candidate');
  const label=x=>x.service?`${x.company||''} / ${x.service}`:(x.company||'(企業名なし)');
  const fmt=n=>Number(n)>0?new Intl.NumberFormat('ja-JP').format(Number(n))+'件':'0';

  function findIncident(card){
    const id=card.querySelector('.incident-tools code')?.textContent?.trim();
    return allRows().find(x=>x.id===id)||null;
  }

  function ensureModal(){
    if(document.getElementById('reviewedEditorModal')) return;

    const modal=document.createElement('div');
    modal.id='reviewedEditorModal';
    modal.className='reviewed-editor-modal';
    modal.hidden=true;
    modal.innerHTML=`
      <div class="reviewed-editor-backdrop" data-editor-close></div>
      <section class="reviewed-editor-dialog" role="dialog" aria-modal="true">
        <header class="reviewed-editor-head">
          <div>
            <span class="reviewed-editor-kicker">EDIT REVIEWED INCIDENT</span>
            <h2>案件情報を修正</h2>
            <p>登録内容の修正と、要確認候補の親案件への紐づけを同時に実行できます。</p>
          </div>
          <button type="button" class="reviewed-editor-close" data-editor-close>×</button>
        </header>

        <form id="reviewedEditorForm" class="reviewed-editor-form">
          <div class="reviewed-editor-field wide"><label>案件ID</label><input name="incident_id" readonly /></div>
          <div class="reviewed-editor-field"><label>公表日</label><input name="published" type="date" /></div>
          <div class="reviewed-editor-field"><label>確認状況</label><select name="status"><option value="confirmed">confirmed（漏えい確認）</option><option value="possible">possible（漏えいの可能性）</option></select></div>
          <div class="reviewed-editor-field wide"><label>企業・団体名</label><input name="company" /></div>
          <div class="reviewed-editor-field wide"><label>サービス名</label><input name="service" /></div>
          <div class="reviewed-editor-field"><label>対象規模</label><input name="affected_count" /></div>
          <div class="reviewed-editor-field"><label>原因・分類</label><input name="cause" /></div>
          <div class="reviewed-editor-field wide"><label>案件概要</label><textarea name="summary" rows="3"></textarea></div>
          <div class="reviewed-editor-field wide"><label>漏えい・対象情報</label><textarea name="exposed_data" rows="3"></textarea></div>

          <section class="reviewed-editor-sources wide">
            <div class="reviewed-editor-sources-head">
              <div><strong>情報源管理</strong><span>表示名・URL・公式判定・削除を編集できます。</span></div>
              <button type="button" id="reviewedEditorAddSource">＋ 情報源を追加</button>
            </div>
            <div id="reviewedEditorSources"></div>
          </section>

          <section class="reviewed-attach-candidates wide">
            <div class="reviewed-attach-head">
              <div>
                <strong>この親案件へ要確認候補を紐づける</strong>
                <span>同一の委託先・共通サーバー事故と思われる候補を選択します。</span>
              </div>
              <input id="reviewedCandidateSearch" placeholder="候補を検索">
            </div>
            <div id="reviewedCandidateList"></div>
          </section>

          <div class="reviewed-editor-field wide">
            <label>影響組織（1行1団体）</label>
            <textarea name="affected_orgs" rows="4"></textarea>
          </div>

          <div class="reviewed-editor-field wide"><label>確認・修正メモ</label><textarea name="note" rows="2"></textarea></div>
          <div id="reviewedEditorStatus" class="reviewed-editor-status wide" hidden></div>

          <div class="reviewed-editor-actions wide">
            <button type="button" class="primary-action" id="reviewedEditorExecute">更新を実行</button>
          </div>
        </form>
      </section>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll('[data-editor-close]').forEach(b=>b.addEventListener('click',closeModal));
    modal.querySelector('#reviewedEditorAddSource').addEventListener('click',()=>addSourceRow({name:'',url:'',official:false}));
    modal.querySelector('#reviewedCandidateSearch').addEventListener('input',renderCandidates);
    modal.querySelector('#reviewedEditorExecute').addEventListener('click',executeUpdate);
  }

  function addSourceRow(src){
    const box=document.getElementById('reviewedEditorSources');
    const row=document.createElement('div');
    row.className='reviewed-editor-source-row';
    row.innerHTML=`
      <input class="source-name" placeholder="表示名" value="${esc(src.name||'')}" />
      <input class="source-url" placeholder="https://..." value="${esc(src.url||'')}" />
      <label class="source-check"><input type="checkbox" class="source-official" ${src.official?'checked':''} /><span>公式</span></label>
      <label class="source-delete"><input type="checkbox" class="source-remove" /><span>削除</span></label>`;
    box.appendChild(row);
  }

  function sourceValues(){
    return [...document.querySelectorAll('.reviewed-editor-source-row')]
      .filter(r=>!r.querySelector('.source-remove').checked)
      .map(r=>({
        name:r.querySelector('.source-name').value.trim()||'情報源',
        url:r.querySelector('.source-url').value.trim(),
        official:r.querySelector('.source-official').checked
      })).filter(x=>x.url);
  }

  function renderCandidates(){
    const box=document.getElementById('reviewedCandidateList');
    const q=(document.getElementById('reviewedCandidateSearch')?.value||'').toLowerCase();
    const rows=candidates().filter(x=>!q||`${label(x)} ${x.id||''} ${x.summary||''}`.toLowerCase().includes(q));
    box.innerHTML=rows.map(x=>`
      <label class="reviewed-candidate-row">
        <input type="checkbox" value="${esc(x.id)}" ${attachIds.has(x.id)?'checked':''}>
        <span><strong>${esc(label(x))}</strong><small>${esc(x.published||'')} / ${esc(fmt(x.affected_count))}</small></span>
      </label>`).join('');
    box.querySelectorAll('input[type=checkbox]').forEach(cb=>cb.addEventListener('change',()=>{
      cb.checked?attachIds.add(cb.value):attachIds.delete(cb.value);
      syncAffectedOrgs();
    }));
  }

  function syncAffectedOrgs(){
    const f=document.getElementById('reviewedEditorForm');
    const existing=(currentIncident?.affected_organizations||[]).map(o=>typeof o==='string'?o:o?.name).filter(Boolean);
    const incoming=[...attachIds].map(id=>candidates().find(x=>x.id===id)).filter(Boolean).map(label);
    f.elements.affected_orgs.value=[...new Set([...existing,...incoming])].join('\n');
  }

  function payload(){
    const f=document.getElementById('reviewedEditorForm');
    const fd=new FormData(f);
    const v=Object.fromEntries(fd.entries());
    return {
      incident_id:v.incident_id||'',
      published:v.published||'',
      company:v.company||'',
      service:v.service||'',
      affected_count:v.affected_count||'',
      status:v.status||'',
      cause:v.cause||'',
      summary:v.summary||'',
      exposed_data:v.exposed_data||'',
      note:v.note||'',
      sources:sourceValues(),
      merge_ids:[...attachIds],
      affected_organizations:f.elements.affected_orgs.value.split(/\n+/).map(name=>({name:name.trim()})).filter(x=>x.name)
    };
  }

  function setStatus(text,type='info'){
    const el=document.getElementById('reviewedEditorStatus');
    el.hidden=false;el.className=`reviewed-editor-status wide is-${type}`;el.textContent=text;
  }

  async function executeUpdate(){
    const body=payload();
    if(!body.incident_id){setStatus('案件IDが取得できません。','error');return;}

    const msg=body.merge_ids.length
      ? `案件情報を更新し、要確認候補 ${body.merge_ids.length}件をこの親案件へ紐づけます。よろしいですか？`
      : 'この内容で案件情報を更新します。よろしいですか？';
    if(!confirm(msg)) return;

    const btn=document.getElementById('reviewedEditorExecute');
    const old=btn.textContent;btn.disabled=true;btn.textContent='更新処理を開始中...';

    try{
      const res=await fetch(API_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
      const result=await res.json().catch(()=>({}));
      if(!res.ok||!result.ok) throw new Error(result.error||`HTTP ${res.status}`);
      setStatus(result.message||'更新処理を開始しました。','success');
      btn.textContent='開始しました';
    }catch(e){
      setStatus(e?.message||'更新処理の開始に失敗しました。','error');
      btn.disabled=false;btn.textContent=old;
    }
  }

  function openModal(x){
    ensureModal();currentIncident=x;attachIds=new Set();
    const m=document.getElementById('reviewedEditorModal');
    const f=document.getElementById('reviewedEditorForm');

    f.elements.incident_id.value=x.id||'';
    f.elements.published.value=x.published||'';
    f.elements.company.value=x.company||'';
    f.elements.service.value=x.service||'';
    f.elements.affected_count.value=fmt(x.affected_count);
    f.elements.status.value=['confirmed','possible'].includes(x.status)?x.status:'confirmed';
    f.elements.cause.value=x.cause||'';
    f.elements.summary.value=x.summary||'';
    f.elements.exposed_data.value=x.exposed_data||'';
    f.elements.note.value=x.review_note||'';

    const sourceBox=document.getElementById('reviewedEditorSources');
    sourceBox.innerHTML='';
    (Array.isArray(x.sources)?x.sources:[]).forEach(addSourceRow);

    document.getElementById('reviewedCandidateSearch').value='';
    renderCandidates();
    syncAffectedOrgs();

    const s=document.getElementById('reviewedEditorStatus');s.hidden=true;s.textContent='';
    m.hidden=false;document.body.classList.add('reviewed-editor-open');
  }

  function closeModal(){
    const m=document.getElementById('reviewedEditorModal');
    if(m)m.hidden=true;
    document.body.classList.remove('reviewed-editor-open');
  }

  function upgradeButtons(){
    document.querySelectorAll('#cards .card').forEach(card=>{
      const link=card.querySelector('.edit-reviewed-action');
      if(!link||link.dataset.parentLinkEditor==='1')return;
      link.dataset.parentLinkEditor='1';
      link.href='#';link.removeAttribute('target');link.removeAttribute('rel');
      link.addEventListener('click',e=>{
        e.preventDefault();
        const x=findIncident(card);if(x)openModal(x);
      });
    });
  }

  function start(){
    ensureModal();upgradeButtons();
    const cards=document.getElementById('cards');
    if(cards)new MutationObserver(upgradeButtons).observe(cards,{childList:true,subtree:true});
  }
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
