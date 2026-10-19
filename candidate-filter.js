(() => {
  function norm(v=''){
    return String(v).normalize('NFKC').toLowerCase()
      .replace(/株式会社|有限会社|合同会社|ホールディングス/g,'')
      .replace(/[「」『』【】（）()\[\]・／/｜|\s　,:：\-—_]/g,'')
      .trim();
  }

  function daysApart(a,b){
    const da=(a||'').slice(0,10), db=(b||'').slice(0,10);
    if(!da||!db)return 9999;
    return Math.abs((new Date(da+'T00:00:00')-new Date(db+'T00:00:00'))/86400000);
  }

  function countRatio(a,b){
    a=Number(a||0); b=Number(b||0);
    if(a<=0||b<=0)return 0;
    return Math.min(a,b)/Math.max(a,b);
  }

  function leakContext(x){
    const s=`${x.company||''} ${x.service||''} ${x.summary||''}`;
    return /(漏えい|漏洩|流出|不正アクセス|サイバー攻撃|ランサムウェア|個人情報|会員情報|顧客情報|クレジット|免許証)/i.test(s);
  }

  function verifiedTokens(v){
    const out=[];
    const c=norm(v.company||'');
    const s=norm(v.service||'');
    if(c.length>=2)out.push(c);
    if(s.length>=2)out.push(s);
    const quoted=[...(v.summary||'').matchAll(/[「『](.{2,30}?)[」』]/g)].map(m=>norm(m[1]));
    out.push(...quoted.filter(x=>x.length>=2));
    return [...new Set(out)];
  }

  function primaryText(x){
    return norm(`${x.company||''} ${x.service||''} ${x.summary||''}`);
  }

  function candidateDuplicatesVerified(c,v){
    if(!leakContext(c))return false;

    const cr=countRatio(c.affected_count,v.affected_count);
    const days=daysApart(c.published,v.published);
    const ca=Number(c.affected_count||0), va=Number(v.affected_count||0);

    if(ca>=100000 && va>=100000 && cr>=0.98 && days<=14)return true;

    const ct=primaryText(c);
    const tokenHit=verifiedTokens(v).some(t=>t&&ct.includes(t));
    if(!tokenHit)return false;

    if(cr>=0.75 && days<=120)return true;

    if(ca===0 && days<=60 &&
       /(続報|第\d+報|最終報|調査結果|再開|変更|会員|利用者|怒り|免許証|被害|流出|漏えい|漏洩|不正アクセス)/i
       .test(`${c.company||''} ${c.summary||''}`)) return true;

    return false;
  }

  function candidateDuplicatesCandidate(a,b){
    if(!leakContext(a)||!leakContext(b))return false;

    const ac=Number(a.affected_count||0), bc=Number(b.affected_count||0);
    const days=daysApart(a.published,b.published);
    const ratio=countRatio(ac,bc);

    if(ac>=100000 && bc>=100000 && days<=7 && ratio>=0.995)return true;
    if(ac>=1000000 && bc>=1000000 && days<=3 && ratio>=0.98)return true;

    const aa=norm(a.company||''), bb=norm(b.company||'');
    if(aa && bb && (aa.includes(bb)||bb.includes(aa)) && days<=30){
      if(ratio>=0.8 || ac===0 || bc===0)return true;
    }

    return false;
  }

  function uniqSources(arr=[]){
    const out=[], seen=new Set();
    for(const s of arr){
      const u=s?.url||'';
      if(!u||seen.has(u))continue;
      seen.add(u); out.push(s);
    }
    return out;
  }

  function mergeCandidate(a,b){
    const rep=(a.sources||[]).length >= (b.sources||[]).length ? a : b;
    const x={...rep};
    x.affected_count=Math.max(Number(a.affected_count||0),Number(b.affected_count||0));
    x.sources=uniqSources([...(a.sources||[]),...(b.sources||[])]);
    x.article_count=Number(a.article_count||1)+Number(b.article_count||1);

    const ranks={A:3,B:2,C:1};
    x.priority=(ranks[a.priority]||0)>=(ranks[b.priority]||0)?a.priority:b.priority;
    x.priority_score=Math.max(Number(a.priority_score||0),Number(b.priority_score||0));

    x._candidateMergedIds=[
      ...(a._candidateMergedIds||[a.id]).filter(Boolean),
      ...(b._candidateMergedIds||[b.id]).filter(Boolean)
    ];
    x._candidateMergedIds=[...new Set(x._candidateMergedIds)];
    x._candidateMergedCount=x._candidateMergedIds.length;
    return x;
  }

  function visibleCandidates(){
    // cleared も「既に結論が出ている案件」として扱い、
    // 同一事故を要確認候補に再表示しない。
    const verified=data.filter(x=>['confirmed','possible','cleared'].includes(x.status));

    const raw=data.filter(x=>x.status==='candidate')
      .filter(x=>!verified.some(v=>candidateDuplicatesVerified(x,v)));

    const merged=[];
    for(const row of raw){
      const idx=merged.findIndex(x=>candidateDuplicatesCandidate(x,row));
      if(idx<0){
        merged.push({...row,_candidateMergedIds:[row.id].filter(Boolean),_candidateMergedCount:1});
      }else{
        merged[idx]=mergeCandidate(merged[idx],row);
      }
    }
    return merged;
  }

  function patch(){
    if(typeof rowsForView!=='function'||typeof render!=='function')return false;
    if(window.__candidateFilterClearedV1Patched)return true;
    window.__candidateFilterClearedV1Patched=true;

    const originalRowsForView=rowsForView;
    rowsForView=function(){
      if(currentView==='candidate')return visibleCandidates();

      if(currentView==='all'){
        const base=originalRowsForView().filter(x=>x.status!=='candidate');
        return base.concat(visibleCandidates());
      }
      return originalRowsForView();
    };

    const originalRender=render;
    render=function(){
      originalRender();

      const candidates=visibleCandidates();
      if(els?.tabCandidateCount)els.tabCandidateCount.textContent=candidates.length;

      if(els?.tabAllCount){
        els.tabAllCount.textContent=
          data.filter(x=>x.status!=='candidate').length+candidates.length;
      }

      if(currentView==='candidate'){
        let rows=rowsForView();

        if(els.sort.value==='date-desc'){
          rows.sort((a,b)=>(b.published||'').localeCompare(a.published||''));
        }else if(els.sort.value==='date-asc'){
          rows.sort((a,b)=>(a.published||'').localeCompare(b.published||''));
        }else if(els.sort.value==='count-desc'){
          rows.sort((a,b)=>(b.affected_count||0)-(a.affected_count||0));
        }

        document.querySelectorAll('#cards .card').forEach((card,i)=>{
          const x=rows[i];
          if(!x||x._candidateMergedCount<=1)return;

          const meta=card.querySelector('.meta');
          if(meta&&!meta.querySelector('.candidate-merged')){
            const b=document.createElement('span');
            b.className='badge candidate-merged';
            b.textContent=`同一候補 ${x._candidateMergedCount}件を統合`;
            meta.appendChild(b);
          }
        });
      }
    };

    return true;
  }

  if(!patch()){
    window.addEventListener('DOMContentLoaded',()=>{
      if(patch())render();
    });
  }
})();
