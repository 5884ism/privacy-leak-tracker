const ids=['q','month','status','sort','cards','empty','lastUpdated','statCases','statConfirmed','statTodayReviewed','statLargest','statRange','tabVerifiedCount','tabMineCount','tabCandidateCount','tabAllCount','viewNotice','myServices','saveMyServices','clearMyServices'];
const els=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));
let data=[], currentView='verified', myKeywords=[];

const STORAGE_KEY='privacyLeakTracker.myServices.v1';
const statusLabel={confirmed:'漏えい確認',possible:'漏えいの可能性',candidate:'報道検知・要確認'};
const priorityLabel={A:'優先確認 A',B:'優先確認 B',C:'優先確認 C'};
const fmt=n=>Number.isFinite(Number(n))&&Number(n)>0?new Intl.NumberFormat('ja-JP').format(Number(n))+'件':'非公表/調査中';

function norm(v=''){
  return String(v).normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
}
function parseKeywords(v=''){
  return [...new Set(String(v).split(/[\n,、]+/).map(norm).filter(x=>x.length>=2))];
}
function loadMyServices(){
  try{
    const saved=localStorage.getItem(STORAGE_KEY)||'';
    els.myServices.value=saved;
    myKeywords=parseKeywords(saved);
  }catch{ myKeywords=[]; }
}
function saveMyServices(){
  const value=els.myServices.value.trim();
  try{ localStorage.setItem(STORAGE_KEY,value); }catch{}
  myKeywords=parseKeywords(value);
  render();
}
function clearMyServices(){
  els.myServices.value='';
  try{ localStorage.removeItem(STORAGE_KEY); }catch{}
  myKeywords=[];
  if(currentView==='mine'){
    currentView='verified';
    document.querySelectorAll('.view-tab').forEach(b=>b.classList.toggle('active',b.dataset.view==='verified'));
  }
  render();
}

function relationFor(x){
  if(!myKeywords.length) return null;
  const company=norm(x.company);
  const service=norm(x.service);
  const summary=norm(x.summary);
  const exposed=norm(x.exposed_data);

  let best=null;
  for(const k of myKeywords){
    let level=0, reason='';
    if(company===k || service===k){
      level=3; reason='企業・サービス名が一致';
    }else if(company.includes(k) || service.includes(k) || k.includes(company) && company.length>=3){
      level=3; reason='企業・サービス名に一致';
    }else if(summary.includes(k)){
      level=2; reason='概要に利用サービス名が含まれる';
    }else if(exposed.includes(k)){
      level=1; reason='関連情報にキーワードが含まれる';
    }
    if(level && (!best || level>best.level)) best={level,keyword:k,reason};
  }
  if(!best) return null;
  best.label=best.level>=3?'関連度 高':best.level===2?'関連度 中':'関連度 低';
  return best;
}

async function init(){
  loadMyServices();
  const res=await fetch('data/incidents.json',{cache:'no-store'});
  const json=await res.json();
  data=json.incidents||[];
  els.lastUpdated.textContent=json.last_updated||'-';

  const months=[...new Set(data.map(x=>x.published?.slice(0,7)).filter(Boolean))].sort().reverse();
  months.forEach(m=>els.month.insertAdjacentHTML('beforeend',`<option value="${m}">${m.replace('-','年')}月</option>`));

  ['q','month','status','sort'].forEach(k=>els[k].addEventListener(k==='q'?'input':'change',render));
  els.saveMyServices.addEventListener('click',saveMyServices);
  els.clearMyServices.addEventListener('click',clearMyServices);

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
  if(currentView==='mine') return data.filter(x=>relationFor(x));
  if(currentView==='candidate') return data.filter(x=>x.status==='candidate');
  return data.slice();
}

function todayJst(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=t=>parts.find(p=>p.type===t)?.value||'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function render(){
  const mine=data.filter(x=>relationFor(x));
  els.tabVerifiedCount.textContent=data.filter(x=>x.status==='confirmed'||x.status==='possible').length;
  els.tabMineCount.textContent=mine.length;
  els.tabCandidateCount.textContent=data.filter(x=>x.status==='candidate').length;
  els.tabAllCount.textContent=data.length;

  const notices={
    verified:'公式発表・報道で内容を整理した案件を表示しています。',
    mine:myKeywords.length
      ?'登録した利用サービスと一致・関連する案件です。関連度は利用サービス名との文字列照合であり、実際の漏えい対象者であることを保証しません。'
      :'利用サービスを登録すると、自分に関連する可能性のある案件を表示できます。',
    candidate:'ニュースから自動検知した未確認候補です。A→B→Cの順に確認優先度が高くなります。',
    all:'確認済み案件と自動検知候補をすべて表示しています。'
  };
  els.viewNotice.textContent=notices[currentView];

  const q=els.q.value.trim().toLowerCase(), month=els.month.value, status=els.status.value;
  let rows=rowsForView().filter(x=>{
    const hay=[x.company,x.service,x.summary,x.exposed_data,x.id].join(' ').toLowerCase();
    return (!q||hay.includes(q))&&(!month||x.published?.startsWith(month))&&(!status||x.status===status);
  });

  if(currentView==='mine'){
    rows.sort((a,b)=>{
      const ra=relationFor(a)?.level||0, rb=relationFor(b)?.level||0;
      return rb-ra || (b.status==='confirmed')-(a.status==='confirmed') || (b.affected_count||0)-(a.affected_count||0) || (b.published||'').localeCompare(a.published||'');
    });
  }else if(currentView==='candidate' && els.sort.value==='date-desc'){
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
  const today=todayJst();
  els.statTodayReviewed.textContent=data.filter(x=>String(x.reviewed_at||'').startsWith(today)).length;

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
  return `<details class="source-details"><summary>情報源：${sources.length}件 <span>${escapeHtml(preview+more)}</span></summary><ul>${links}</ul></details>`;
}
function officialSearchUrl(x){
  const q=[(x.company||'').trim(),(x.service||'').trim(),'個人情報 漏えい 公式'].filter(Boolean).join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

function card(x){
  const relation=relationFor(x);
  const relationBadge=relation?`<span class="badge relation relation-${relation.level}">${relation.label}：${escapeHtml(relation.keyword)}</span>`:'';
  const relationInfo=relation?`<p class="relation-note"><strong>${relation.label}</strong> — ${escapeHtml(relation.reason)}。実際の対象者かどうかは公式発表の対象条件を確認してください。</p>`:'';
  const priority=x.status==='candidate'&&x.priority?`<span class="badge priority priority-${x.priority}">${priorityLabel[x.priority]||x.priority}</span>`:'';
  const articles=x.status==='candidate'&&Number(x.article_count)>1?`<span class="badge merged">${x.article_count}記事</span>`:'';
  const officialButton=x.status==='candidate'&&x.priority==='A'?`<a class="review-search-btn" href="${officialSearchUrl(x)}" target="_blank" rel="noopener">公式発表を検索</a>`:'';
  const promoteUrl='https://github.com/5884ism/privacy-leak-tracker/actions/workflows/promote-incident.yml';
  const reviewHelp=x.status==='candidate'&&x.priority==='A'?`<details class="review-help"><summary>昇格手順を見る</summary><ol><li>「公式発表を検索」で公式情報を確認</li><li>「案件IDをコピー」を押す</li><li><a href="${promoteUrl}" target="_blank" rel="noopener">GitHubの Promote incident を開く</a></li><li>incident_idを貼り付け、confirmed / possible を選択し、公式URLを入力して実行</li></ol></details>`:'';
  const idTools=x.status==='candidate'?`<div class="incident-tools">${officialButton}${reviewHelp}<code>${escapeHtml(x.id||'')}</code><button type="button" data-copy-id="${escapeHtml(x.id||'')}">案件IDをコピー</button></div>`:'';
  const reviewMeta=x.reviewed_at?`<p class="review-meta">確認日: ${escapeHtml(x.reviewed_at)}${x.review_note?` / ${escapeHtml(x.review_note)}`:''}</p>`:'';

  return `<article class="card ${relation?'card-related':''}">
    <div>
      <div class="date">${escapeHtml(x.published||'-')}</div>
      <div class="meta">
        <span class="badge ${x.status}">${statusLabel[x.status]||x.status}</span>
        ${relationBadge}${priority}${articles}${x.cause?`<span class="badge">${escapeHtml(x.cause)}</span>`:''}
      </div>
    </div>
    <div>
      <h3>${escapeHtml(x.company||'要確認')}${x.service?` / ${escapeHtml(x.service)}`:''}</h3>
      <p class="count">対象規模: ${fmt(x.affected_count)}</p>
      <p>${escapeHtml(x.summary||'')}</p>
      ${x.exposed_data?`<p><strong>情報:</strong> ${escapeHtml(x.exposed_data)}</p>`:''}
      ${relationInfo}${reviewMeta}${sourceBlock(x)}${idTools}
    </div>
  </article>`;
}

function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
init().catch(e=>{els.cards.innerHTML=`<p>データの読み込みに失敗しました: ${escapeHtml(e.message)}</p>`});
