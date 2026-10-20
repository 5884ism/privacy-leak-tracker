(() => {
  const REPLACE_URL='https://github.com/5884ism/privacy-leak-tracker/actions/workflows/replace-official-source.yml';

  function addButtons(){
    document.querySelectorAll('#cards .card').forEach(card=>{
      const status=card.querySelector('.badge.confirmed, .badge.possible, .badge.cleared');
      if(!status) return;

      let actions=card.querySelector('.operator-maintenance-actions');
      if(!actions) return;

      if(actions.querySelector('.replace-official-action')) return;

      const link=document.createElement('a');
      link.className='replace-official-action';
      link.href=REPLACE_URL;
      link.target='_blank';
      link.rel='noopener';
      link.textContent='公式情報を修正';
      link.title='誤登録した公式発表URLを正しいURLへ置き換えます';

      const resolve=actions.querySelector('.resolve-action');
      actions.insertBefore(link,resolve || null);
    });
  }

  function start(){
    addButtons();

    const cards=document.getElementById('cards');
    if(!cards) return;

    new MutationObserver(addButtons).observe(cards,{
      childList:true,
      subtree:true
    });
  }

  if(document.readyState==='loading'){
    window.addEventListener('DOMContentLoaded',start,{once:true});
  }else{
    start();
  }
})();
