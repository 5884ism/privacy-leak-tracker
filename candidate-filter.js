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
    return /(漏えい|漏洩|流出|不正アクセス|サイバー攻撃|ランサムウェア|個人情報|会員情報|顧客情報|免許証|クレジット)/i.test(s);
  }

  function verifiedTokens(v){
    const out=[];
    const c=norm(v.company||'');
    const s=norm(v.service||'');
    if(c.length>=2)out.push(c);
    if(s.length>=2)out.push(s);

    // 確定案件のsummaryに出る固有サービス名も補助トークンにする
    const raw=v.summary||'';
    const quoted=[...raw.matchAll(/[「『](.{2,30}?)[」』]/g)].map(m=>norm(m[1]));
    out.push(...quoted.filter(x=>x.length>=2));

    return [...new Set(out)];
  }

  function primaryText(x){
    return norm(`${x.company||''} ${x.service||''} ${x.summary||''}`);
  }

  function strongCountMatch(c,v){
    const ca=Number(c.affected_count||0);
    const va=Number(v.affected_count||0);
    if(ca<100000 || va<100000) return false;
    return countRatio(ca,va)>=0.98 && daysApart(c.published,v.published)<=14;
  }

  function candidateDuplicatesVerified(c,v){
    if(!leakContext(c)) return false;

    // 1) 大規模案件は件数+日付を強い指紋として扱う。
    // Eストアー 23,356,000 vs 23,350,000、日経 1,830,000等。
    if(strongCountMatch(c,v)) return true;

    const ct=primaryText(c);
    const tokens=verifiedTokens(v);
    const tokenHit=tokens.some(t=>t && ct.includes(t));
    if(!tokenHit)return false;

    const days=daysApart(c.published,v.published);
    const ratio=countRatio(c.affected_count,v.affected_count);

    // 2) 名称一致 + 件数が近い
    if(ratio>=0.75 && days<=120)return true;

    // 3) 件数不明の続報・反応記事
    if(Number(c.affected_count||0)===0 && days<=60){
      const s=`${c.company||''} ${c.summary||''}`;
      if(/(続報|第\d+報|最終報|調査結果|再開|変更|会員|利用者|怒り|免許証|被害|流出|漏えい|漏洩|不正アクセス)/i.test(s)){
        return true;
      }
    }

    // 4) サービス名が一致
    const vs=norm(v.service||'');
    if(vs.length>=2 && ct.includes(vs) && days<=90)return true;

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
    if(window.__candidateFilterV29Patched)return true;
    window.__candidateFilterV29Patched=true;

    const originalRowsForView=rowsForView;
    rowsForView=function(){
      if(currentView==='candidate') return visibleCandidates();
      if(currentView==='all'){
        const nonCandidates=originalRowsForView().filter(x=>x.status!=='candidate');
        return nonCandidates.concat(visibleCandidates());
      }
      return originalRowsForView();
    };

    const originalRender=render;
    render=function(){
      originalRender();

      const candidates=visibleCandidates();
      if(els?.tabCandidateCount) els.tabCandidateCount.textContent=candidates.length;

      if(els?.tabAllCount){
        const nonCandidateCount=data.filter(x=>x.status!=='candidate').length;
        els.tabAllCount.textContent=nonCandidateCount+candidates.length;
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
