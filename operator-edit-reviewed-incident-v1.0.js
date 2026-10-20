(() => {
  const EDIT_URL='https://github.com/5884ism/privacy-leak-tracker/actions/workflows/edit-reviewed-incident.yml';

  function addButtons(){
    document.querySelectorAll('#cards .card').forEach(card=>{
      const status=card.querySelector('.badge.confirmed, .badge.possible, .badge.cleared');
      if(!status) return;

      const actions=card.querySelector('.operator-maintenance-actions');
      if(!actions) return;

      // Remove the narrower "official info correction" button if the previous package was installed.
      actions.querySelector('.replace-official-action')?.remove();

      if(actions.querySelector('.edit-reviewed-action')) return;

      const link=document.createElement('a');
      link.className='edit-reviewed-action';
      link.href=EDIT_URL;
      link.target='_blank';
      link.rel='noopener';
      link.textContent='案件情報を修正';
      link.title='確認済み案件の主要項目を再入力して上書きします';

      const resolve=actions.querySelector('.resolve-action');
      actions.insertBefore(link,resolve || null);
    });
  }

  function start(){
    addButtons();
    const cards=document.getElementById('cards');
    if(cards){
      new MutationObserver(addButtons).observe(cards,{childList:true,subtree:true});
    }
  }

  if(document.readyState==='loading'){
    window.addEventListener('DOMContentLoaded',start,{once:true});
  }else{
    start();
  }
})();
