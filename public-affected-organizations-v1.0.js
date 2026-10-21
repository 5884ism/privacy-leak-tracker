(() => {
  function label(x){return x.service?`${x.company||''} / ${x.service}`:(x.company||'');}
  function add(){
    if(typeof data==='undefined'||!Array.isArray(data)) return;
    document.querySelectorAll('#cards .card').forEach(card=>{
      if(card.querySelector('.affected-orgs-box')) return;
      const title=card.querySelector('h3')?.textContent?.trim()||'';
      const date=card.querySelector('.date')?.textContent?.trim()||'';
      const x=data.find(v=>label(v)===title&&String(v.published||'')===date&&Array.isArray(v.affected_organizations)&&v.affected_organizations.length);
      if(!x) return;
      const box=document.createElement('details');
      box.className='affected-orgs-box';
      box.innerHTML=`<summary>影響組織：${x.affected_organizations.length}団体</summary><div>${x.affected_organizations.map(o=>`<span>${String(o.name||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</span>`).join('')}</div>`;
      const sources=card.querySelector('.source-details');
      (sources||card).insertAdjacentElement(sources?'beforebegin':'beforeend',box);
    });
  }
  function start(){add();const c=document.getElementById('cards');if(c)new MutationObserver(add).observe(c,{childList:true,subtree:true});}
  if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
