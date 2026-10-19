(() => {
  function n(v=''){
    return String(v).normalize('NFKC').toLowerCase()
      .replace(/株式会社|有限会社|合同会社|ホールディングス/g,'')
      .replace(/[\s　・／/（）()「」『』【】\-—_]/g,'')
      .trim();
  }

  function companyKey(x){
    return n(x.company||'');
  }

  function sameLikelyIncident(a,b){
    const ca=companyKey(a), cb=companyKey(b);
    if(!ca||!cb||ca!==cb)return false;

    const sa=n(a.service||''), sb=n(b.service||'');
    if(sa && sb && sa===sb)return true;

    const aa=Number(a.affected_count||0), bb=Number(b.affected_count||0);
    if(aa>0 && bb>0 && Math.min(aa,bb)/Math.max(aa,bb)>=0.90)return true;

    const da=(a.published||'').slice(0,10), db=(b.published||'').slice(0,10);
    if(da && db){
      const days=Math.abs((new Date(da)-new Date(db))/86400000);
      if(days<=30)return true;
    }
    return false;
  }

  function uniqByUrl(arr=[]){
    const out=[], seen=new Set();
    for(const s of arr){
      const u=s?.url||'';
      if(!u||seen.has(u))continue;
      seen.add(u); out.push(s);
    }
    return out;
  }

  function mergeIncident(a,b){
    const x={...a};

    x.affected_count=Math.max(Number(a.affected_count||0),Number(b.affected_count||0));

    x.sources=uniqByUrl([...(a.sources||[]),...(b.sources||[])]);

    x.official_updates=uniqByUrl([...(a.official_updates||[]),...(b.official_updates||[])]);
    if((a.official_updates||[]).some(u=>u.reviewed!==true)||(b.official_updates||[]).some(u=>u.reviewed!==true)){
      x.official_update_pending=true;
    }

    x.article_count=(a.article_count||1)+(b.article_count||1);

    if((b.summary||'').length>(a.summary||'').length) x.summary=b.summary;
    if((b.exposed_data||'').length>(a.exposed_data||'').length) x.exposed_data=b.exposed_data;

    if(b.status==='confirmed') x.status='confirmed';
    if(a.status!=='confirmed'&&b.status==='possible') x.status='possible';

    if((b.published||'')>(a.published||'')) x.published=b.published;

    x._mergedIds=[...(a._mergedIds||[a.id]).filter(Boolean),...(b._mergedIds||[b.id]).filter(Boolean)];
    x._mergedCount=(a._mergedCount||1)+(b._mergedCount||1);
    return x;
  }

  function mergeMineRows(rows){
    const out=[];
    for(const row of rows){
      let idx=out.findIndex(x=>sameLikelyIncident(x,row));
      if(idx<0) out.push({...row,_mergedIds:[row.id].filter(Boolean),_mergedCount:1});
      else out[idx]=mergeIncident(out[idx],row);
    }
    return out;
  }

  window.addEventListener('DOMContentLoaded',()=>{
    if(typeof rowsForView!=='function')return;

    const originalRowsForView=rowsForView;
    rowsForView=function(){
      const rows=originalRowsForView();
      return currentView==='mine' ? mergeMineRows(rows) : rows;
    };

    const originalRender=render;
    render=function(){
      originalRender();
      if(currentView==='mine'){
        const merged=rowsForView();
        if(els?.tabMineCount) els.tabMineCount.textContent=merged.length;
        document.querySelectorAll('.card').forEach((card,i)=>{
          const x=merged[i];
          if(x && x._mergedCount>1){
            const meta=card.querySelector('.meta');
            if(meta && !meta.querySelector('.same-incident-merged')){
              const badge=document.createElement('span');
              badge.className='badge same-incident-merged';
              badge.textContent=`同一案件 ${x._mergedCount}件を統合`;
              meta.appendChild(badge);
            }
          }
        });
      }
    };

    render();
  });
})();
