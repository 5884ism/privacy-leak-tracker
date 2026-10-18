const ids=['q','month','status','sort','cards','empty','lastUpdated','statCases','statConfirmed','statLargest','statRange','tabVerifiedCount','tabCandidateCount','tabAllCount','viewNotice'];
const els=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));
let data=[], currentView='verified';

const statusLabel={confirmed:'漏えい確認',possible:'漏えいの可能性',candidate:'報道検知・要確認'};
const priorityLabel={A:'優先確認 A',B:'優先確認 B',C:'優先確認 C'};
const fmt=n=>Number.isFinite(Number(n))&&Number(n)>0?new Intl.NumberFormat('ja-JP').format(Number(n))+'件':'非公表/調査中';

async function init(){
  const res=await fetch('data/incidents.json',{cache:'no-store'});
  const json=await res.json();
  data=json.incidents||[];
  els.lastUpdated.textContent=json.last_updated||'-';

  const months=[...new Set(data.map(x=>x.published?.slice(0,7)).filter(Boolean))].sort().reverse();
  months.forEach(m=>els.month.insertAdjacentHTML('beforeend',`<option value="${m}">${m.replace('-','年')}月</option>`));

  ['q','month','status','sort'].forEach(k=>els[k].addEventListener(k==='q'?'input':'change',render));
  document.querySelectorAll('.view-tab').forEach(btn=>btn.addEventListener('click',()=>{
    currentView=btn.dataset.view;
    document.querySelectorAll('.view-tab').forEach(b=>b.classList.toggle('active',b===btn));
    els.status.value='';
    render();
  }));

  document.addEventListener('click',e=>{
    const copy=e.target.closest('[data-copy-id]');
    if(copy){
      navigator.clipboard.writeText(copy.dataset.copyId).then(()=>{
        const old=copy.textContent;
        copy.textContent='コピーしました';
        setTimeout(()=>copy.textContent=old,1200);
      });
    }
  });

  render();
}

function rowsForView(){
  if(currentView==='verified') return data.filter(x=>x.status==='confirmed'||x.status==='possible');
  if(currentView==='candidate') return data.filter(x=>x.status==='candidate');
  return data.slice();
}

function render(){
  els.tabVerifiedCount.textContent=data.filter(x=>x.status==='confirmed'||x.status==='possible').length;
  els.tabCandidateCount.textContent=data.filter(x=>x.status==='candidate').length;
  els.tabAllCount.textContent=data.length;

  const notices={
    verified:'公式発表・報道で内容を整理した案件を表示しています。',
    candidate:'ニュースから自動検知した未確認候補です。A→B→Cの順に確認優先度が高くなります。',
    all:'確認済み案件と自動検知候補をすべて表示しています。'
  };
  els.viewNotice.textContent=notices[currentView];

  const q=els.q.value.trim().toLowerCase(), month=els.month.value, status=els.status.value;
  let rows=rowsForView().filter(x=>{
    const hay=[x.company,x.service,x.summary,x.exposed_data,x.id].join(' ').toLowerCase();
    return (!q||hay.includes(q))&&(!month||x.published?.startsWith(month))&&(!status||x.status===status);
  });

  if(currentView==='candidate' && els.sort.value==='date-desc'){
    rows.sort((a,b)=>(b.priority_score||0)-(a.priority_score||0)||(b.affected_count||0)-(a.affected_count||0)||(b.published||'').localeCompare(a.published||''));
  }else if(els.sort.value==='date-desc'){
    rows.sort((a,b)=>(b.published||'').localeCompare(a.published||''));
  }
  if(els.sort.value==='date-asc') rows.sort((a,b)=>(a.published||'').localeCompare(b.published||''));
  if(els.sort.value==='count-desc') rows.sort((a,b)=>(b.affected_count||0)-(a.affected_count||0));

  els.cards.innerHTML=rows.map(card).join('');
  els.empty.hidden=rows.length>0;
  els.statCases.textContent=rows.length;
  els.statConfirmed.textContent=rows.filter(x=>x.status==='confirmed').length;

  const largest=rows.reduce((m,x)=>(x.affected_count||0)>(m.affected_count||0)?x:m,{affected_count:0});
  els.statLargest.textContent=largest.affected_count?fmt(largest.affected_count):'-';
  const dates=rows.map(x=>x.published).filter(Boolean).sort();
  els.statRange.textContent=dates.length?`${dates[0].slice(0,7)}〜${dates.at(-1).slice(0,7)}`:'-';
}

function sourceHost(url=''){
  try{
    const u=new URL(url);
    if(u.hostname.includes('news.google.com')) return 'Googleニュース';
    return u.hostname.replace(/^www\./,'');
  }catch{return '参照元'}
}

function sourceBlock(x){
  const sources=x.sources||[];
  if(!sources.length) return '';
  const preview=sources.slice(0,3).map(s=>sourceHost(s.url)).join(' / ');
  const more=sources.length>3?` / ほか${sources.length-3}件`:'';
  const links=sources.map((s,i)=>`<li><a href="${s.url}" target="_blank" rel="noopener">${escapeHtml(s.name||sourceHost(s.url)||`情報源${i+1}`)}</a></li>`).join('');
  return `<details class="source-details">
    <summary>情報源：${sources.length}件 <span>${escapeHtml(preview+more)}</span></summary>
    <ul>${links}</ul>
  </details>`;
}

function officialSearchUrl(x){
  const company=(x.company||'').trim();
  const service=(x.service||'').trim();
  const q=[company,service,'個人情報 漏えい 公式'].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

function card(x){
  const priority=x.status==='candidate'&&x.priority?`<span class="badge priority priority-${x.priority}">${priorityLabel[x.priority]||x.priority}</span>`:'';
  const articles=x.status==='candidate'&&Number(x.article_count)>1?`<span class="badge merged">${x.article_count}記事</span>`:'';
  const officialButton=x.status==='candidate'&&x.priority==='A'
    ?`<a class="review-search-btn" href="${officialSearchUrl(x)}" target="_blank" rel="noopener">公式発表を検索</a>`
    :'';
  const idTools=x.status==='candidate'
    ?`<div class="incident-tools">
        ${officialButton}
        <code>${escapeHtml(x.id||'')}</code>
        <button type="button" data-copy-id="${escapeHtml(x.id||'')}">案件IDをコピー</button>
      </div>`
    :'';
  const reviewMeta=x.reviewed_at?`<p class="review-meta">確認日: ${escapeHtml(x.reviewed_at)}${x.review_note?` / ${escapeHtml(x.review_note)}`:''}</p>`:'';

  return `<article class="card">
    <div>
      <div class="date">${escapeHtml(x.published||'-')}</div>
      <div class="meta">
        <span class="badge ${x.status}">${statusLabel[x.status]||x.status}</span>
        ${priority}
        ${articles}
        ${x.cause?`<span class="badge">${escapeHtml(x.cause)}</span>`:''}
      </div>
    </div>
    <div>
      <h3>${escapeHtml(x.company||'要確認')}${x.service?` / ${escapeHtml(x.service)}`:''}</h3>
      <p class="count">対象規模: ${fmt(x.affected_count)}</p>
      <p>${escapeHtml(x.summary||'')}</p>
      ${x.exposed_data?`<p><strong>情報:</strong> ${escapeHtml(x.exposed_data)}</p>`:''}
      ${reviewMeta}
      ${sourceBlock(x)}
      ${idTools}
    </div>
  </article>`;
}

function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
init().catch(e=>{els.cards.innerHTML=`<p>データの読み込みに失敗しました: ${escapeHtml(e.message)}</p>`});
