(() => {
  const WORKFLOW_URL = 'https://github.com/5884ism/privacy-leak-tracker/actions/workflows/edit-reviewed-incident.yml';

  const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[c]));

  function findIncidentFromCard(card){
    const id = card.querySelector('.incident-tools code')?.textContent?.trim();
    if(!id || typeof data === 'undefined' || !Array.isArray(data)) return null;
    return data.find(x => x.id === id) || null;
  }

  function officialSource(x){
    const src = (x.sources || []).find(s => s.official);
    const url = (x.official_urls || [])[0] || src?.url || '';
    const name = src?.name || '公式発表';
    return {url, name};
  }

  function fmtCountForEdit(v){
    const n = Number(v);
    return Number.isFinite(n) && n > 0
      ? new Intl.NumberFormat('ja-JP').format(n) + '件'
      : '0';
  }

  function ensureModal(){
    if(document.getElementById('reviewedEditorModal')) return;

    const el = document.createElement('div');
    el.id = 'reviewedEditorModal';
    el.className = 'reviewed-editor-modal';
    el.hidden = true;
    el.innerHTML = `
      <div class="reviewed-editor-backdrop" data-editor-close></div>
      <section class="reviewed-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="reviewedEditorTitle">
        <header class="reviewed-editor-head">
          <div>
            <span class="reviewed-editor-kicker">EDIT REVIEWED INCIDENT</span>
            <h2 id="reviewedEditorTitle">案件情報を修正</h2>
            <p>現在の登録値を読み込んでいます。必要な箇所だけ修正してください。</p>
          </div>
          <button type="button" class="reviewed-editor-close" data-editor-close aria-label="閉じる">×</button>
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
            <input name="affected_count" inputmode="numeric" />
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

          <div class="reviewed-editor-field wide">
            <label>公式発表URL</label>
            <input name="official_url" type="url" />
          </div>

          <div class="reviewed-editor-field wide">
            <label>公式情報源の表示名</label>
            <input name="source_name" />
          </div>

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
            <a id="reviewedEditorWorkflow" href="${WORKFLOW_URL}" target="_blank" rel="noopener">GitHub Actionsを開く</a>
          </div>

          <p class="reviewed-editor-note wide">
            ※ 現段階では安全のため、ここからGitHubへ直接送信しません。
            内容を確認後、GitHub Actions「Edit reviewed incident」に転記して実行します。
          </p>
        </form>
      </section>
    `;
    document.body.appendChild(el);

    el.querySelectorAll('[data-editor-close]').forEach(btn => {
      btn.addEventListener('click', closeModal);
    });

    document.addEventListener('keydown', e => {
      if(e.key === 'Escape' && !el.hidden) closeModal();
    });

    const form = el.querySelector('#reviewedEditorForm');
    form.addEventListener('input', renderPreview);
    form.addEventListener('change', renderPreview);

    el.querySelector('#reviewedEditorCopy').addEventListener('click', async () => {
      const text = el.querySelector('#reviewedEditorPreview').textContent;
      const btn = el.querySelector('#reviewedEditorCopy');
      const old = btn.textContent;
      try{
        await navigator.clipboard.writeText(text);
        btn.textContent = 'コピーしました';
      }catch{
        btn.textContent = 'コピー失敗';
      }
      setTimeout(()=>btn.textContent=old,1200);
    });
  }

  function valuesFromForm(){
    const form = document.getElementById('reviewedEditorForm');
    const fd = new FormData(form);
    return Object.fromEntries(fd.entries());
  }

  function previewText(v){
    return [
      `incident_id: ${v.incident_id || ''}`,
      `published: ${v.published || ''}`,
      `company: ${v.company || ''}`,
      `service: ${v.service || ''}`,
      `affected_count: ${v.affected_count || ''}`,
      `status: ${v.status || ''}`,
      `cause: ${v.cause || ''}`,
      `summary: ${v.summary || ''}`,
      `exposed_data: ${v.exposed_data || ''}`,
      `official_url: ${v.official_url || ''}`,
      `source_name: ${v.source_name || ''}`,
      `note: ${v.note || ''}`,
    ].join('\n');
  }

  function renderPreview(){
    const pre = document.getElementById('reviewedEditorPreview');
    if(!pre) return;
    pre.textContent = previewText(valuesFromForm());
  }

  function openModal(x){
    ensureModal();
    const modal = document.getElementById('reviewedEditorModal');
    const form = document.getElementById('reviewedEditorForm');
    const off = officialSource(x);

    form.elements.incident_id.value = x.id || '';
    form.elements.published.value = x.published || '';
    form.elements.company.value = x.company || '';
    form.elements.service.value = x.service || '';
    form.elements.affected_count.value = fmtCountForEdit(x.affected_count);
    form.elements.status.value = ['confirmed','possible'].includes(x.status) ? x.status : 'confirmed';
    form.elements.cause.value = x.cause || '';
    form.elements.summary.value = x.summary || '';
    form.elements.exposed_data.value = x.exposed_data || '';
    form.elements.official_url.value = off.url || '';
    form.elements.source_name.value = off.name || '公式発表';
    form.elements.note.value = x.review_note || '';

    renderPreview();

    modal.hidden = false;
    document.body.classList.add('reviewed-editor-open');
    setTimeout(()=>form.elements.company.focus(),0);
  }

  function closeModal(){
    const modal = document.getElementById('reviewedEditorModal');
    if(!modal) return;
    modal.hidden = true;
    document.body.classList.remove('reviewed-editor-open');
  }

  function upgradeButtons(){
    document.querySelectorAll('#cards .card').forEach(card => {
      const link = card.querySelector('.edit-reviewed-action');
      if(!link || link.dataset.prefillReady === '1') return;

      link.dataset.prefillReady = '1';
      link.setAttribute('href','#');
      link.setAttribute('role','button');
      link.removeAttribute('target');
      link.removeAttribute('rel');
      link.title = '現在の登録値を読み込んで編集フォームを開きます';

      link.addEventListener('click', e => {
        e.preventDefault();
        const incident = findIncidentFromCard(card);
        if(!incident) return;
        openModal(incident);
      });
    });
  }

  function start(){
    ensureModal();
    upgradeButtons();

    const cards = document.getElementById('cards');
    if(cards){
      new MutationObserver(upgradeButtons).observe(cards,{childList:true,subtree:true});
    }
  }

  if(document.readyState === 'loading'){
    window.addEventListener('DOMContentLoaded', start, {once:true});
  }else{
    start();
  }
})();
