(() => {
  const PROMOTE_URL='https://github.com/5884ism/privacy-leak-tracker/actions/workflows/promote-incident.yml';
  const RESOLVE_URL='https://github.com/5884ism/privacy-leak-tracker/actions/workflows/resolve-incident.yml';
  const SOURCE_URL='https://github.com/5884ism/privacy-leak-tracker/actions/workflows/add-official-source.yml';

  let started=false;
  let observer=null;

  function todayJstLocal(){
    const parts=new Intl.DateTimeFormat('en-CA',{
      timeZone:'Asia/Tokyo',
      year:'numeric',
      month:'2-digit',
      day:'2-digit'
    }).formatToParts(new Date());
    const get=t=>parts.find(p=>p.type===t)?.value||'';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function updateWorkSummary(){
    if(typeof data==='undefined' || !Array.isArray(data)) return;

    const candidates=data.filter(x=>x.status==='candidate');
    const verified=data.filter(x=>x.status==='confirmed'||x.status==='possible');
    const today=todayJstLocal();

    const set=(id,value)=>{
      const el=document.getElementById(id);
      if(el) el.textContent=value;
    };

    set('opCandidateCount',candidates.length);
    set('opPriorityACount',candidates.filter(x=>x.priority==='A').length);
    set('opTodayReviewed',data.filter(x=>String(x.reviewed_at||'').startsWith(today)).length);
    set('opVerifiedCount',verified.length);
  }

  function updateSectionCopy(view){
    const title=document.getElementById('operatorListTitle');
    const help=document.getElementById('operatorListHelp');
    if(!title||!help) return;

    const copy={
      candidate:[
        '要確認候補',
        '公式発表を確認し、confirmed / possible へ昇格してください。優先度Aから確認するのがおすすめです。'
      ],
      verified:[
        '確認済み案件',
        '公開中の confirmed / possible 案件です。追加の公式情報や、漏えいなし判明後のステータス変更を管理します。'
      ],
      all:[
        '全案件',
        '候補・確認済み案件を横断して確認します。'
      ]
    }[view]||['案件一覧',''];

    title.textContent=copy[0];
    help.textContent=copy[1];
  }

  function currentVisibleView(){
    return document.querySelector('.operator-tabs .view-tab.active')?.dataset.view || 'candidate';
  }

  function enhanceCards(){
    const cards=document.getElementById('cards');
    if(!cards) return;

    cards.querySelectorAll('.card').forEach(card=>{
      if(card.querySelector('.operator-maintenance-actions')) return;

      const statusBadge=card.querySelector('.badge.confirmed, .badge.possible');
      if(!statusBadge) return;

      const id=card.querySelector('.incident-tools code')?.textContent?.trim();
      if(!id) return;

      const actions=document.createElement('div');
      actions.className='operator-maintenance-actions';
      actions.innerHTML=`
        <a href="${SOURCE_URL}" target="_blank" rel="noopener">公式情報を追加</a>
        <a class="resolve-action" href="${RESOLVE_URL}" target="_blank" rel="noopener">漏えいなしへ変更</a>
      `;

      const tools=card.querySelector('.incident-tools');
      if(tools) tools.insertAdjacentElement('afterend',actions);
      else card.appendChild(actions);
    });
  }

  function activateCandidateDefault(){
    const candidate=document.querySelector('.operator-tabs .view-tab[data-view="candidate"]');
    if(!candidate) return;

    candidate.click();
    updateSectionCopy('candidate');
  }

  function bindTabs(){
    document.querySelectorAll('.operator-tabs .view-tab').forEach(btn=>{
      btn.addEventListener('click',()=>{
        updateSectionCopy(btn.dataset.view);
        setTimeout(enhanceCards,0);
      });
    });
  }

  function waitForApp(){
    if(
      typeof data!=='undefined' &&
      Array.isArray(data) &&
      data.length &&
      document.getElementById('cards')
    ){
      if(started) return;
      started=true;

      updateWorkSummary();
      bindTabs();

      const cards=document.getElementById('cards');
      observer=new MutationObserver(enhanceCards);
      observer.observe(cards,{childList:true,subtree:true});

      activateCandidateDefault();
      enhanceCards();
      return;
    }
    setTimeout(waitForApp,80);
  }

  if(document.readyState==='loading'){
    window.addEventListener('DOMContentLoaded',waitForApp,{once:true});
  }else{
    waitForApp();
  }
})();
