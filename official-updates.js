(() => {
  const REVIEW_WORKFLOW='https://github.com/5884ism/privacy-leak-tracker/actions/workflows/review-official-updates.yml';

  function esc(v=''){
    return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))
  }

  async function enhance(){
    let json;
    try{
      const r=await fetch('data/incidents.json',{cache:'no-store'});
      json=await r.json();
    }catch{return}

    const incidents=(json.incidents||[]).filter(x=>(x.official_updates||[]).length);
    if(!incidents.length)return;

    document.querySelectorAll('.card').forEach(card=>{
      const title=card.querySelector('h3')?.textContent?.trim()||'';
      const x=incidents.find(i=>{
        const label=(i.company||'')+(i.service?` / ${i.service}`:'');
        return title===label || title.startsWith(i.company||'');
      });
      if(!x)return;

      const body=card.children[1]||card;
      body.querySelector('.official-updates')?.remove();
      card.querySelectorAll('.official-update,.official-reviewed').forEach(n=>n.remove());

      const updates=x.official_updates||[];
      const unreviewed=updates.filter(u=>u.reviewed!==true);
      const pending=x.official_update_pending===true || unreviewed.length>0;

      const badge=document.createElement('span');
      badge.className=`badge ${pending?'official-update':'official-reviewed'}`;
      badge.textContent=pending ? `公式更新あり ${unreviewed.length||updates.length}` : `公式更新確認済み ${updates.length}`;
      card.querySelector('.meta')?.appendChild(badge);

      const d=document.createElement('details');
      d.className=`official-updates ${pending?'pending':'reviewed'}`;
      d.innerHTML=`<summary>公式発表の更新履歴：${updates.length}件</summary>
        <ul>${updates.slice().reverse().map(u=>`<li>
          <span class="official-update-date">${esc(u.detected_at||u.published||'')}</span>
          <a href="${esc(u.url||'#')}" target="_blank" rel="noopener">${esc(u.title||'公式発表の更新')}</a>
          <span class="update-kind">${u.kind==='page_changed'?'既存ページ更新':'新規公式発表'}</span>
          ${u.reviewed===true?'<span class="reviewed-mark">確認済み</span>':''}
        </li>`).join('')}</ul>
        ${pending?`<div class="official-review-actions">
          <code>${esc(x.id||'')}</code>
          <button type="button" data-copy-review-id="${esc(x.id||'')}">案件IDをコピー</button>
          <a href="${REVIEW_WORKFLOW}" target="_blank" rel="noopener">公式更新を確認済みにする</a>
        </div>`:''}
        <p class="official-update-note">※ 件数・対象範囲などの主要データは自動変更していません。公式発表を確認して必要なら更新してください。</p>`;

      const source=body.querySelector('.source-details');
      if(source) body.insertBefore(d,source); else body.appendChild(d);
    });

    document.querySelectorAll('[data-copy-review-id]').forEach(btn=>{
      if(btn.dataset.bound)return;
      btn.dataset.bound='1';
      btn.addEventListener('click',()=>{
        navigator.clipboard.writeText(btn.dataset.copyReviewId).then(()=>{
          const old=btn.textContent; btn.textContent='コピーしました';
          setTimeout(()=>btn.textContent=old,1200);
        });
      });
    });
  }

  const mo=new MutationObserver(()=>enhance());
  window.addEventListener('DOMContentLoaded',()=>{
    enhance();
    const cards=document.getElementById('cards');
    if(cards)mo.observe(cards,{childList:true,subtree:true});
  });
})();
