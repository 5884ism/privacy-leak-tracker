const els = Object.fromEntries(['q','month','status','sort','cards','empty','lastUpdated','statCases','statConfirmed','statLargest','statRange'].map(id=>[id,document.getElementById(id)]));
let data=[];
const statusLabel={confirmed:'漏えい確認',possible:'漏えいの可能性',candidate:'報道検知・要確認'};
const fmt=n=>Number.isFinite(n)&&n>0?new Intl.NumberFormat('ja-JP').format(n)+'件':'非公表/調査中';

async function init(){
  const res=await fetch('data/incidents.json',{cache:'no-store'});
  const json=await res.json();
  data=json.incidents||[];
  els.lastUpdated.textContent=json.last_updated||'-';
  const months=[...new Set(data.map(x=>x.published?.slice(0,7)).filter(Boolean))].sort().reverse();
  months.forEach(m=>els.month.insertAdjacentHTML('beforeend',`<option value="${m}">${m.replace('-','年')}月</option>`));
  ['q','month','status','sort'].forEach(k=>els[k].addEventListener(k==='q'?'input':'change',render));
  render();
}
function render(){
  const q=els.q.value.trim().toLowerCase(), month=els.month.value, status=els.status.value;
  let rows=data.filter(x=>{
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
  const dates=rows.map(x=>x.published).filter(Boolean).sort(); els.statRange.textContent=dates.length?`${dates[0].slice(0,7)}〜${dates.at(-1).slice(0,7)}`:'-';
}
function card(x){
  const sources=(x.sources||[]).map(s=>`<a href="${s.url}" target="_blank" rel="noopener">${escapeHtml(s.name)}</a>`).join('');
  return `<article class="card"><div><div class="date">${escapeHtml(x.published||'-')}</div><div class="meta"><span class="badge ${x.status}">${statusLabel[x.status]||x.status}</span>${x.cause?`<span class="badge">${escapeHtml(x.cause)}</span>`:''}</div></div><div><h3>${escapeHtml(x.company)}${x.service?` / ${escapeHtml(x.service)}`:''}</h3><p class="count">対象規模: ${fmt(x.affected_count)}</p><p>${escapeHtml(x.summary||'')}</p>${x.exposed_data?`<p><strong>情報:</strong> ${escapeHtml(x.exposed_data)}</p>`:''}<div class="sources">${sources}</div></div></article>`;
}
function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
init().catch(e=>{els.cards.innerHTML=`<p>データの読み込みに失敗しました: ${escapeHtml(e.message)}</p>`});
