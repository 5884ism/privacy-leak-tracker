(() => {
  function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
  function host(url=''){try{return new URL(url).hostname.replace(/^www\./,'')}catch{return ''}}

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
      if(body.querySelector('.official-updates'))return;

      const updates=x.official_updates||[];
      const badge=document.createElement('span');
      badge.className='badge official-update';
      badge.textContent=`公式更新あり ${updates.length}`;
      card.querySelector('.meta')?.appendChild(badge);

      const d=document.createElement('details');
      d.className='official-updates';
      d.innerHTML=`<summary>公式発表の更新履歴：${updates.length}件</summary>
        <ul>${updates.slice().reverse().map(u=>`<li>
          <span class="official-update-date">${esc(u.detected_at||u.published||'')}</span>
          <a href="${esc(u.url||'#')}" target="_blank" rel="noopener">${esc(u.title||'公式発表の更新')}</a>
          <span class="update-kind">${u.kind==='page_changed'?'既存ページ更新':'新規公式発表'}</span>
        </li>`).join('')}</ul>
        <p class="official-update-note">※ 件数・対象範囲などの主要データは自動変更していません。公式発表を確認して必要なら更新してください。</p>`;
      const source=body.querySelector('.source-details');
      if(source) body.insertBefore(d,source); else body.appendChild(d);
    });
  }

  const mo=new MutationObserver(()=>enhance());
  window.addEventListener('DOMContentLoaded',()=>{
    enhance();
    const cards=document.getElementById('cards');
    if(cards)mo.observe(cards,{childList:true,subtree:true});
  });
})();
