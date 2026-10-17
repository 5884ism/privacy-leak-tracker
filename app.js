const ids=['q','month','status','sort','cards','empty','lastUpdated','statCases','statConfirmed','statLargest','statRange','tabVerifiedCount','tabCandidateCount','tabAllCount','viewNotice'];
const els=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));
let data=[], currentView='verified';

const statusLabel={confirmed:'漏えい確認',possible:'漏えいの可能性',candidate:'報道検知・要確認'};
const fmt=n=>Number.isFinite(Number(n))&&Number(n)>0?new Intl.NumberFormat('ja-JP').format(Number(n))+'件':'非公表/調査中';

function normalizeText(v=''){
  return String(v).normalize('NFKC').toLowerCase()
    .replace(/【[^】]*】|\[[^\]]*\]|［[^］]*］/g,' ')
    .replace(/[-‐‑‒–—―|｜:："'“”‘’「」『』（）()]/g,' ')
    .replace(/\b(速報|更新中|続報)\b/g,' ')
    .replace(/\s+/g,' ').trim();
}
function entityKey(x){
  const base=normalizeText(x.company||'');
  if(base && !['不正アクセス','情報漏えい','個人情報','旅行予約','要確認'].includes(base)) return base;
  const t=normalizeText(x.summary||'')
    .replace(/個人情報|情報漏えい|情報流出|漏えい|漏洩|流出|不正アクセス|ランサムウェア|おそれ|可能性/g,' ')
    .replace(/\s+/g,' ').trim();
  return t.split(' ').slice(0,4).join(' ');
}
function mergeCandidates(rows){
  const map=new Map();
  for(const x of rows){
    if(x.status!=='candidate'){ map.set(`id:${x.id}`,structuredClone(x)); continue; }
    const k=`cand:${entityKey(x)}:${(x.published||'').slice(0,10)}`;
    if(!map.has(k)){
      const clone=structuredClone(x); clone._mergedCount=1; map.set(k,clone);
    }else{
      const m=map.get(k); m._mergedCount=(m._mergedCount||1)+1;
      m.affected_count=Math.max(Number(m.affected_count||0),Number(x.affected_count||0));
      const existing=new Set((m.sources||[]).map(s=>s.url));
      for(const s of (x.sources||[])) if(s.url&&!existing.has(s.url)){m.sources.push(s);existing.add(s.url)}
      if((x.company||'').length && (m.company||'').length>x.company.length) m.company=x.company;
    }
  }
  return [...map.values()];
}
async function init(){
  const res=await fetch('data/incidents.json',{cache:'no-store'});
  const json=await res.json();
  data=mergeCandidates(json.incidents||[]);
  els.lastUpdated.textContent=json.last_updated||'-';
  const months=[...new Set(data.map(x=>x.published?.slice(0,7)).filter(Boolean))].sort().reverse();
  months.forEach(m=>els.month.insertAdjacentHTML('beforeend',`<option value="${m}">${m.replace('-','年')}月</option>`));
  ['q','month','status','sort'].forEach(k=>els[k].addEventListener(k==='q'?'input':'change',render));
  document.querySelectorAll('.view-tab').forEach(btn=>btn.addEventListener('click',()=>{
    currentView=btn.dataset.view;
    document.querySelectorAll('.view-tab').forEach(b=>b.classList.toggle('active',b===btn));
    if(currentView==='verified') els.status.value='';
    render();
  }));
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
  const notices={verified:'公式発表・報道で内容を整理した案件を表示しています。',candidate:'ニュースから自動検知した未確認候補です。同一案件の記事は可能な範囲でまとめています。',all:'確認済み案件と自動検知候補をすべて表示しています。'};
  els.viewNotice.textContent=notices[currentView];
  const q=els.q.value.trim().toLowerCase(),month=els.month.value,status=els.status.value;
  let rows=rowsForView().filter(x=>{
    const hay=[x.company,x.service,x.summary,x.exposed_data].join(' ').toLowerCase();
    return (!q||hay.includes(q))&&(!month||x.published?.startsWith(month))&&(!status||x.status===status);
  });
  if(els.sort.value==='date-desc') rows.sort((a,b)=>(b.published||'').localeCompare(a.published||''));
  if(els.sort.value==='date-asc') rows.sort((a,b)=>(a.published||'').localeCompare(b.published||''));
  if(els.sort.value==='count-desc') rows.sort((a,b)=>(b.affected_count||0)-(a.affected_count||0));
  els.cards.innerHTML=rows.map(card).join(''); els.empty.hidden=rows.length>0;
  els.statCases.textContent=rows.length;
  els.statConfirmed.textContent=rows.filter(x=>x.status==='confirmed').length;
  const largest=rows.reduce((m,x)=>(x.affected_count||0)>(m.affected_count||0)?x:m,{affected_count:0});
  els.statLargest.textContent=largest.affected_count?fmt(largest.affected_count):'-';
  const dates=rows.map(x=>x.published).filter(Boolean).sort();
  els.statRange.textContent=dates.length?`${dates[0].slice(0,7)}〜${dates.at(-1).slice(0,7)}`:'-';
}
function card(x){
  const sources=(x.sources||[]).map(s=>`<a href="${s.url}" target="_blank" rel="noopener">${escapeHtml(s.name)}</a>`).join('');
  const merged=x._mergedCount>1?`<span class="badge merged">${x._mergedCount}記事を統合</span>`:'';
  return `<article class="card"><div><div class="date">${escapeHtml(x.published||'-')}</div><div class="meta"><span class="badge ${x.status}">${statusLabel[x.status]||x.status}</span>${x.cause?`<span class="badge">${escapeHtml(x.cause)}</span>`:''}${merged}</div></div><div><h3>${escapeHtml(x.company||'要確認')}${x.service?` / ${escapeHtml(x.service)}`:''}</h3><p class="count">対象規模: ${fmt(x.affected_count)}</p><p>${escapeHtml(x.summary||'')}</p>${x.exposed_data?`<p><strong>情報:</strong> ${escapeHtml(x.exposed_data)}</p>`:''}<div class="sources">${sources}</div></div></article>`;
}
function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
init().catch(e=>{els.cards.innerHTML=`<p>データの読み込みに失敗しました: ${escapeHtml(e.message)}</p>`});
