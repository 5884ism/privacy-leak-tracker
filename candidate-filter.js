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
    return Math.abs(
      (new Date(da+'T00:00:00')-new Date(db+'T00:00:00'))/86400000
    );
  }

  function countRatio(a,b){
    a=Number(a||0); b=Number(b||0);
    if(a<=0||b<=0)return 0;
    return Math.min(a,b)/Math.max(a,b);
  }

  function leakContext(x){
    const s=`${x.company||''} ${x.service||''} ${x.summary||''}`;
    return /(漏えい|漏洩|流出|不正アクセス|サイバー攻撃|ランサムウェア|個人情報|会員情報|顧客情報|免許証)/i.test(s);
  }

  function verifiedTokens(v){
    const out=[];
    const c=norm(v.company||'');
    const s=norm(v.service||'');
    if(c.length>=3)out.push(c);
    if(s.length>=3)out.push(s);
    return [...new Set(out)];
  }

  function primaryText(x){
    return norm(`${x.company||''} ${(x.summary||'').slice(0,80)}`);
  }

  function candidateDuplicatesVerified(c,v){
    const ct=primaryText(c);
    const tokens=verifiedTokens(v);
    if(!tokens.length||!leakContext(c))return false;

    const tokenHit=tokens.some(t=>ct.includes(t));
    if(!tokenHit)return false;

    const days=daysApart(c.published,v.published);
    const ratio=countRatio(c.affected_count,v.affected_count);

    if(ratio>=0.75 && days<=120)return true;

    if(Number(c.affected_count||0)===0 && days<=60){
      const s=`${c.company||''} ${c.summary||''}`;
      if(/(続報|第\d+報|最終報|調査結果|再開|変更|会員|利用者|怒り|免許証|被害|流出|漏えい|漏洩|不正アクセス)/i.test(s)){
        return true;
      }
    }

    const vs=norm(v.service||'');
    if(vs.length>=3 && ct.includes(vs) && days<=90)return true;

    return false;
  }

  function visibleCandidates(){
    const verified=data.filter(x=>x.status==='confirmed'||x.status==='possible');
    return data.filter(x=>{
      if(x.status!=='candidate')return false;
      return !verified.some(v=>candidateDuplicatesVerified(x,v));
    });
  }

  function patch(){
    if(typeof rowsForView!=='function'||typeof render!=='function')return false;
    if(window.__candidateFilterV27Patched)return true;
    window.__candidateFilterV27Patched=true;

    const originalRowsForView=rowsForView;
    rowsForView=function(){
      if(currentView==='candidate') return visibleCandidates();
      return originalRowsForView();
    };

    const originalRender=render;
    render=function(){
      originalRender();

      const candidates=visibleCandidates();
      if(els?.tabCandidateCount) els.tabCandidateCount.textContent=candidates.length;

      if(els?.tabAllCount){
        const verifiedCount=data.filter(x=>x.status==='confirmed'||x.status==='possible').length;
        const otherCount=data.filter(x=>!['confirmed','possible','candidate'].includes(x.status)).length;
        els.tabAllCount.textContent=verifiedCount+candidates.length+otherCount;
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
