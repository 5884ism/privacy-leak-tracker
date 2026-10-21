(() => {
  const WORKFLOW_URL='https://github.com/5884ism/privacy-leak-tracker/actions/workflows/edit-reviewed-incident.yml';

  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[c]));

  function findIncident(card){
    const id=card.querySelector('.incident-tools code')?.textContent?.trim();
    if(!id||typeof data==='undefined'||!Array.isArray(data)) return null;
    return data.find(x=>x.id===id)||null;
  }

  function fmtCount(v){
    const n=Number(v);
    return Number.isFinite(n)&&n>0
      ? new Intl.NumberFormat('ja-JP').format(n)+'件'
      : '0';
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
            <p>登録内容と情報源を確認し、必要な箇所だけ修正してください。</p>
          </div>
          <button type="button" class="reviewed-editor-close" data-editor-close>×</button>
        </header>

        <form id="reviewedEditorForm" class="reviewed-editor-form">
          <div class="reviewed-editor-field wide">
            <label>案件ID</label>
            <input name="incident_id" readonly />
          </div>

          <div class="reviewed-editor-field">
            <label>公表日</label>
            <input name="published" type="date" />
          </div>
          <div class="reviewed-editor-field">
            <label>確認状況</label>
            <select name="status">
              <option value="confirmed">confirmed（漏えい確認）</option>
              <option value="possible">possible（漏えいの可能性）</option>
            </select>
          </div>

          <div class="reviewed-editor-field wide">
            <label>企業・団体名</label>
            <input name="company" />
          </div>
          <div class="reviewed-editor-field wide">
            <label>サービス名</label>
            <input name="service" />
          </div>

          <div class="reviewed-editor-field">
            <label>対象規模</label>
            <input name="affected_count" />
            <small>例：4,454,097件</small>
          </div>
          <div class="reviewed-editor-field">
            <label>原因・分類</label>
            <input name="cause" />
          </div>

          <div class="reviewed-editor-field wide">
            <label>案件概要</label>
            <textarea name="summary" rows="3"></textarea>
          </div>
          <div class="reviewed-editor-field wide">
            <label>漏えい・対象情報</label>
            <textarea name="exposed_data" rows="3"></textarea>
          </div>

          <section class="reviewed-editor-sources wide">
            <div class="reviewed-editor-sources-head">
              <div>
                <strong>情報源管理</strong>
                <span>誤った自動挿入リンクは「削除」にチェックしてください。</span>
              </div>
              <button type="button" id="reviewedEditorAddSource">＋ 情報源を追加</button>
            </div>
            <div id="reviewedEditorSources"></div>
          </section>

          <div class="reviewed-editor-field wide">
            <label>確認・修正メモ</label>
            <textarea name="note" rows="2"></textarea>
          </div>

          <div class="reviewed-editor-preview wide">
            <strong>GitHub Actionsへ転記する内容</strong>
            <pre id="reviewedEditorPreview"></pre>
          </div>

          <div class="reviewed-editor-actions wide">
            <button type="button" class="secondary" id="reviewedEditorCopy">入力内容をコピー</button>
            <a href="${WORKFLOW_URL}" target="_blank" rel="noopener">GitHub Actionsを開く</a>
          </div>

          <p class="reviewed-editor-note wide">
            ※ sources_json は「削除」にチェックしていない情報源だけで生成されます。
          </p>
        </form>
      </section>
    `;
    document.body.appendChild(modal);

    modal.querySelectorAll('[data-editor-close]').forEach(b=>b.addEventListener('click',closeModal));
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&!modal.hidden) closeModal();
    });

    const form=modal.querySelector('#reviewedEditorForm');
    form.addEventListener('input',renderPreview);
    form.addEventListener('change',renderPreview);

    modal.querySelector('#reviewedEditorAddSource').addEventListener('click',()=>{
      addSourceRow({name:'',url:'',official:false});
      renderPreview();
    });

    modal.querySelector('#reviewedEditorCopy').addEventListener('click',async()=>{
      const text=modal.querySelector('#reviewedEditorPreview').textContent;
      const btn=modal.querySelector('#reviewedEditorCopy');
      const old=btn.textContent;
      try{
        await navigator.clipboard.writeText(text);
        btn.textContent='コピーしました';
      }catch{
        btn.textContent='コピー失敗';
      }
      setTimeout(()=>btn.textContent=old,1200);
    });
  }

  function addSourceRow(src){
    const box=document.getElementById('reviewedEditorSources');
    const row=document.createElement('div');
    row.className='reviewed-editor-source-row';
    row.innerHTML=`
      <input class="source-name" placeholder="表示名" value="${esc(src.name||'')}" />
      <input class="source-url" placeholder="https://..." value="${esc(src.url||'')}" />
      <label class="source-check">
        <input type="checkbox" class="source-official" ${src.official?'checked':''} />
        <span>公式</span>
      </label>
      <label class="source-delete">
        <input type="checkbox" class="source-remove" />
        <span>削除</span>
      </label>
    `;
    box.appendChild(row);
  }

  function sourceValues(){
    return [...document.querySelectorAll('.reviewed-editor-source-row')]
      .filter(row=>!row.querySelector('.source-remove').checked)
      .map(row=>({
        name:row.querySelector('.source-name').value.trim()||'情報源',
        url:row.querySelector('.source-url').value.trim(),
        official:row.querySelector('.source-official').checked
      }))
      .filter(x=>x.url);
  }

  function formValues(){
    const fd=new FormData(document.getElementById('reviewedEditorForm'));
    return Object.fromEntries(fd.entries());
  }

  function previewText(){
    const v=formValues();
    const sources=sourceValues();
    return [
      `incident_id: ${v.incident_id||''}`,
      `published: ${v.published||''}`,
      `company: ${v.company||''}`,
      `service: ${v.service||''}`,
      `affected_count: ${v.affected_count||''}`,
      `status: ${v.status||''}`,
      `cause: ${v.cause||''}`,
      `summary: ${v.summary||''}`,
      `exposed_data: ${v.exposed_data||''}`,
      `sources_json: ${JSON.stringify(sources)}`,
      `official_url: `,
      `source_name: `,
      `note: ${v.note||''}`,
    ].join('\n');
  }

  function renderPreview(){
    const pre=document.getElementById('reviewedEditorPreview');
    if(pre) pre.textContent=previewText();
  }

  function openModal(x){
    ensureModal();
    const modal=document.getElementById('reviewedEditorModal');
    const form=document.getElementById('reviewedEditorForm');

    form.elements.incident_id.value=x.id||'';
    form.elements.published.value=x.published||'';
    form.elements.company.value=x.company||'';
    form.elements.service.value=x.service||'';
    form.elements.affected_count.value=fmtCount(x.affected_count);
    form.elements.status.value=['confirmed','possible'].includes(x.status)?x.status:'confirmed';
    form.elements.cause.value=x.cause||'';
    form.elements.summary.value=x.summary||'';
    form.elements.exposed_data.value=x.exposed_data||'';
    form.elements.note.value=x.review_note||'';

    const sourceBox=document.getElementById('reviewedEditorSources');
    sourceBox.innerHTML='';
    (Array.isArray(x.sources)?x.sources:[]).forEach(addSourceRow);

    renderPreview();
    modal.hidden=false;
    document.body.classList.add('reviewed-editor-open');
  }

  function closeModal(){
    const modal=document.getElementById('reviewedEditorModal');
    if(modal) modal.hidden=true;
    document.body.classList.remove('reviewed-editor-open');
  }

  function upgradeButtons(){
    document.querySelectorAll('#cards .card').forEach(card=>{
      const link=card.querySelector('.edit-reviewed-action');
      if(!link||link.dataset.sourcesEditorReady==='1') return;

      link.dataset.sourcesEditorReady='1';
      link.href='#';
      link.removeAttribute('target');
      link.removeAttribute('rel');
      link.addEventListener('click',e=>{
        e.preventDefault();
        const x=findIncident(card);
        if(x) openModal(x);
      });
    });
  }

  function start(){
    ensureModal();
    upgradeButtons();
    const cards=document.getElementById('cards');
    if(cards){
      new MutationObserver(upgradeButtons).observe(cards,{childList:true,subtree:true});
    }
  }

  if(document.readyState==='loading'){
    window.addEventListener('DOMContentLoaded',start,{once:true});
  }else{
    start();
  }
})();
