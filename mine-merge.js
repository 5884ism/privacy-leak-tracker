(() => {
  function norm(v=''){
    return String(v).normalize('NFKC').toLowerCase()
      .replace(/株式会社|有限会社|合同会社|ホールディングス/g,'')
      .replace(/[\s　・／/（）()「」『』【】\-—_]/g,'')
      .trim();
  }
  function daysApart(a,b){
    const da=(a||'').slice(0,10), db=(b||'').slice(0,10);
    if(!da||!db)return 9999;
    return Math.abs((new Date(da+'T00:00:00')-new Date(db+'T00:00:00'))/86400000);
  }
  function relationInfo(x){ try{return relationFor(x)||null}catch{return null} }
  function relationKey(x){ const r=relationInfo(x); return norm(r?.selected || x.company || ''); }
  function selectedTokens(x){
    const r=relationInfo(x);
    return (r?.selected||'').split(/\s*\/\s*/).map(norm).filter(v=>v.length>=2);
  }
  function textBlob(x){ return norm(`${x.company||''} ${x.service||''} ${x.summary||''}`); }
  function mentionsSelection(x){ const b=textBlob(x); return selectedTokens(x).some(t=>b.includes(t)); }
  function hasLeakContext(x){
    const raw=`${x.company||''} ${x.service||''} ${x.summary||''}`;
    return /(漏えい|漏洩|流出|不正アクセス|サイバー攻撃|免許証|個人情報|会員情報|顧客情報)/i.test(raw);
  }
  function countRatio(a,b){
    a=Number(a||0); b=Number(b||0);
    if(a<=0||b<=0)return 0;
    return Math.min(a,b)/Math.max(a,b);
  }
  function statusRank(s){ return s==='confirmed'?3:s==='possible'?2:s==='candidate'?1:0; }
  function isVerified(x){ return x.status==='confirmed'||x.status==='possible'; }
  function explicitService(x){ return norm(x.service||''); }

  function sameLikelyIncident(a,b){
    const ka=relationKey(a), kb=relationKey(b);
    if(!ka||!kb||ka!==kb)return false;
    const da=daysApart(a.published,b.published);
    const sa=explicitService(a), sb=explicitService(b);

    if(sa && sb && sa!==sb && !(sa.includes(sb)||sb.includes(sa))) return false;
    if(sa && sb && (sa===sb||sa.includes(sb)||sb.includes(sa)) && da<=120) return true;
    if(countRatio(a.affected_count,b.affected_count)>=0.80 && da<=90) return true;

    if((isVerified(a)||isVerified(b)) && da<=60){
      const candidate=isVerified(a)?b:a;
      if(mentionsSelection(candidate) && hasLeakContext(candidate)) return true;
    }
    if(!isVerified(a)&&!isVerified(b) && da<=14){
      if(mentionsSelection(a)&&mentionsSelection(b)&&hasLeakContext(a)&&hasLeakContext(b)) return true;
    }
    return false;
  }

  function uniqByUrl(arr=[]){
    const out=[],seen=new Set();
    for(const s of arr){
      const u=s?.url||'';
      if(!u||seen.has(u))continue;
      seen.add(u); out.push(s);
    }
    return out;
  }

  function chooseRepresentative(a,b){
    if(statusRank(b.status)>statusRank(a.status))return [b,a];
    if(statusRank(a.status)>statusRank(b.status))return [a,b];
    if(a.service&&!b.service)return [a,b];
    if(b.service&&!a.service)return [b,a];
    return (b.sources||[]).length>(a.sources||[]).length?[b,a]:[a,b];
  }

  function mergeIncident(a,b){
    const [rep]=chooseRepresentative(a,b);
    const x={...rep};
    x.affected_count=Math.max(Number(a.affected_count||0),Number(b.affected_count||0));
    x.sources=uniqByUrl([...(a.sources||[]),...(b.sources||[])]);
    x.official_updates=uniqByUrl([...(a.official_updates||[]),...(b.official_updates||[])]);
    x.official_update_pending=
      a.official_update_pending===true ||
      b.official_update_pending===true ||
      x.official_updates.some(u=>u.reviewed!==true);
    x.article_count=Number(a.article_count||1)+Number(b.article_count||1);
    x.id=rep.id; x.company=rep.company; x.service=rep.service;
    x.summary=rep.summary; x.exposed_data=rep.exposed_data;
    x.status=rep.status; x.cause=rep.cause;
    x._mergedIds=[...(a._mergedIds||[a.id]).filter(Boolean),...(b._mergedIds||[b.id]).filter(Boolean)];
    x._mergedIds=[...new Set(x._mergedIds)];
    x._mergedCount=x._mergedIds.length;
    return x;
  }

  function mergeMineRows(rows){
    const ordered=[...rows].sort((a,b)=>
      statusRank(b.status)-statusRank(a.status) ||
      (a.published||'').localeCompare(b.published||'') ||
      (b.sources||[]).length-(a.sources||[]).length
    );
    const out=[];
    for(const row of ordered){
      let idx=out.findIndex(x=>sameLikelyIncident(x,row));
      if(idx<0){
        out.push({...row,_mergedIds:[row.id].filter(Boolean),_mergedCount:1});
      }else{
        out[idx]=mergeIncident(out[idx],row);
        let changed=true;
        while(changed){
          changed=false;
          for(let j=0;j<out.length;j++){
            if(j===idx)continue;
            if(sameLikelyIncident(out[idx],out[j])){
              out[idx]=mergeIncident(out[idx],out[j]);
              out.splice(j,1);
              if(j<idx)idx--;
              changed=true;
              break;
            }
          }
        }
      }
    }
    return out;
  }

  function allMergedMineRows(){
    return mergeMineRows(data.filter(x=>{try{return !!relationFor(x)}catch{return false}}));
  }

  function patch(){
    if(typeof rowsForView!=='function'||typeof render!=='function')return false;
    if(window.__mineMergeV261Patched)return true;
    window.__mineMergeV261Patched=true;

    const originalRowsForView=rowsForView;
    rowsForView=function(){
      const rows=originalRowsForView();
      return currentView==='mine'?mergeMineRows(rows):rows;
    };

    const originalRender=render;
    render=function(){
      originalRender();

      // Always show the merged count, regardless of the active tab.
      const mergedMine=allMergedMineRows();
      if(els?.tabMineCount) els.tabMineCount.textContent=mergedMine.length;

      if(currentView!=='mine') return;

      let merged=rowsForView();
      if(els.sort.value==='date-desc') merged.sort((a,b)=>(b.published||'').localeCompare(a.published||''));
      else if(els.sort.value==='date-asc') merged.sort((a,b)=>(a.published||'').localeCompare(b.published||''));
      else if(els.sort.value==='count-desc') merged.sort((a,b)=>(b.affected_count||0)-(a.affected_count||0));

      document.querySelectorAll('#cards .card').forEach((card,i)=>{
        const x=merged[i];
        if(!x||x._mergedCount<=1)return;
        const meta=card.querySelector('.meta');
        if(meta&&!meta.querySelector('.same-incident-merged')){
          const badge=document.createElement('span');
          badge.className='badge same-incident-merged';
          badge.textContent=`同一案件 ${x._mergedCount}件を統合`;
          meta.appendChild(badge);
        }
      });
    };
    return true;
  }

  if(!patch()){
    window.addEventListener('DOMContentLoaded',()=>{ if(patch()) render(); });
  }
})();
