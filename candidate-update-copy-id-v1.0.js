(() => {
  function addCopyButtons(){
    const panel=document.getElementById('candidateUpdatePanel');
    if(!panel) return;

    panel.querySelectorAll('.candidate-update-actions').forEach(actions=>{
      if(actions.querySelector('.candidate-update-copy-id')) return;

      const code=actions.querySelector('code');
      const id=code?.textContent?.trim();
      if(!id) return;

      const btn=document.createElement('button');
      btn.type='button';
      btn.className='candidate-update-copy-id';
      btn.dataset.copyCandidateId=id;
      btn.textContent='案件IDをコピー';
      btn.title=`案件ID ${id} をコピー`;

      code.insertAdjacentElement('afterend',btn);
    });
  }

  async function copyId(btn){
    const id=btn.dataset.copyCandidateId;
    if(!id) return;

    const old=btn.textContent;
    try{
      await navigator.clipboard.writeText(id);
      btn.textContent='コピーしました';
      btn.classList.add('is-copied');
    }catch(e){
      console.warn('incident id copy failed',e);
      btn.textContent='コピー失敗';
    }

    setTimeout(()=>{
      btn.textContent=old;
      btn.classList.remove('is-copied');
    },1200);
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest('.candidate-update-copy-id');
    if(btn) copyId(btn);
  });

  function start(){
    addCopyButtons();

    const target=document.body;
    const observer=new MutationObserver(addCopyButtons);
    observer.observe(target,{childList:true,subtree:true});
  }

  if(document.readyState==='loading'){
    window.addEventListener('DOMContentLoaded',start,{once:true});
  }else{
    start();
  }
})();
