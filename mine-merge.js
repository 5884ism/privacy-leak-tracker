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
    const x=new Date(da+'T00:00:00'), y=new Date(db+'T00:00:00');
    return Math.abs((x-y)/86400000);
  }

  function relationKey(x){
    try{
      const r=relationFor(x);
      if(r?.selected) return norm(r.selected);
    }catch{}
    return norm(x.company||'');
  }

  function countRatio(a,b){
    a=Number(a||0); b=Number(b||0);
    if(a<=0||b<=0)return 0;
    return Math.min(a,b)/Math.max(a,b);
  }

  function incidentWords(x){
    const s=norm(`${x.company||''} ${x.service||''} ${x.summary||''}`);
    const words=[
      '不正アクセス','漏えい','漏洩','流出','ランサムウェア',
      '後払い','クロネコ','会員情報','顧客情報','個人情報'
    ];
    return new Set(words.filter(w=>s.includes(norm(w))));
  }

  function keywordOverlap(a,b){
    const aa=incidentWords(a), bb=incidentWords(b);
    for(const x of aa) if(bb.has(x)) return true;
    return false;
  }

  function sameLikelyIncident(a,b){
    // 「自分に関連」で同じ選択サービスに紐づくことを最優先
    const ka=relationKey(a), kb=relationKey(b);
    if(!ka||!kb||ka!==kb)return false;

    // サービス名が明確に一致
    const sa=norm(a.service||''), sb=norm(b.service||'');
    if(sa && sb && sa===sb)return true;

    // 対象件数が近ければ同一事故とみなす
    if(countRatio(a.affected_count,b.affected_count)>=0.85 &&
       daysApart(a.published,b.published)<=45){
      return true;
    }

    // 件数不明でも、日付が近く事故キーワードが重なる場合
    if(daysApart(a.published,b.published)<=14 && keywordOverlap(a,b)){
      return true;
    }

    return false;
  }

  function uniqByUrl(arr=[]){
    const out=[], seen=new Set();
    for(const s of arr){
      const u=s?.url||'';
      if(!u||seen.has(u))continue;
      seen.add(u);
      out.push(s);
    }
    return out;
  }

  function statusRank(s){
    return s==='confirmed'?3:s==='possible'?2:s==='candidate'?1:0;
  }

  function chooseRepresentative(a,b){
    // 確認済みを代表カードとして優先
    if(statusRank(b.status)>statusRank(a.status)) return [b,a];
    if(statusRank(a.status)>statusRank(b.status)) return [a,b];

    // 同ステータスなら情報源の多い方を代表
    const as=(a.sources||[]).length, bs=(b.sources||[]).length;
    if(bs>as)return [b,a];
    return [a,b];
  }

  function mergeIncident(a,b){
    const [rep,other]=chooseRepresentative(a,b);
    const x={...rep};

    x.affected_count=Math.max(
      Number(a.affected_count||0),
      Number(b.affected_count||0)
    );

    x.sources=uniqByUrl([
      ...(a.sources||[]),
      ...(b.sources||[])
    ]);

    x.official_updates=uniqByUrl([
      ...(a.official_updates||[]),
      ...(b.official_updates||[])
    ]);

    const hasUnreviewed=x.official_updates.some(u=>u.reviewed!==true);
    x.official_update_pending=
      a.official_update_pending===true ||
      b.official_update_pending===true ||
      hasUnreviewed;

    x.article_count=
      Number(a.article_count||1)+
      Number(b.article_count||1);

    // confirmed/possible の内容を優先して残す
    if(statusRank(rep.status)<statusRank(other.status)){
      x.status=other.status;
    }

    x._mergedIds=[
      ...(a._mergedIds||[a.id]).filter(Boolean),
      ...(b._mergedIds||[b.id]).filter(Boolean)
    ];
    x._mergedIds=[...new Set(x._mergedIds)];
    x._mergedCount=x._mergedIds.length || ((a._mergedCount||1)+(b._mergedCount||1));

    // 表示上の代表IDは確認済み案件のIDを維持
    x.id=rep.id;

    return x;
  }

  function mergeMineRows(rows){
    // confirmed を先に処理して代表カードになりやすくする
    const ordered=[...rows].sort((a,b)=>
      statusRank(b.status)-statusRank(a.status) ||
      (b.sources||[]).length-(a.sources||[]).length
    );

    const out=[];
    for(const row of ordered){
      const idx=out.findIndex(x=>sameLikelyIncident(x,row));
      if(idx<0){
        out.push({...row,_mergedIds:[row.id].filter(Boolean),_mergedCount:1});
      }else{
        out[idx]=mergeIncident(out[idx],row);
      }
    }
    return out;
  }

  function patch(){
    if(typeof rowsForView!=='function' || typeof render!=='function')return false;
    if(window.__mineMergeV25Patched)return true;
    window.__mineMergeV25Patched=true;

    const originalRowsForView=rowsForView;
    rowsForView=function(){
      const rows=originalRowsForView();
      return currentView==='mine' ? mergeMineRows(rows) : rows;
    };

    const originalRender=render;
    render=function(){
      originalRender();

      if(currentView!=='mine')return;

      const merged=rowsForView();

      // タブ件数も統合後の件数へ
      if(els?.tabMineCount) els.tabMineCount.textContent=merged.length;

      // 表示カードに統合件数バッジ
      document.querySelectorAll('#cards .card').forEach((card,i)=>{
        const x=merged[i];
        if(!x || x._mergedCount<=1)return;

        const meta=card.querySelector('.meta');
        if(meta && !meta.querySelector('.same-incident-merged')){
          const badge=document.createElement('span');
          badge.className='badge same-incident-merged';
          badge.textContent=`同一案件 ${x._mergedCount}件を統合`;
          meta.appendChild(badge);
        }
      });
    };

    return true;
  }

  // app.js の後に読み込まれる想定。念のため遅延でも再試行。
  if(!patch()){
    window.addEventListener('DOMContentLoaded',()=>{
      if(patch()) render();
    });
  }else{
    // app.js の非同期fetch完了後のrenderから自動的に利用される
  }
})();
