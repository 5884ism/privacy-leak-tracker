const ids=[
  'q','month','sort','cards','empty','lastUpdated',
  'statCases','statConfirmed','statLargest','statRange',
  'tabVerifiedCount','tabMineCount','viewNotice',
  'myServiceSearch','servicePickerVerified','selectedServiceCount',
  'saveMyServices','clearMyServices'
];
const els=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));

const STORAGE_KEY='privacyLeakTracker.public.selectedServices.v1';
const PAGE_SIZE=10;
const statusLabel={
  confirmed:'漏えい確認',
  possible:'漏えいの可能性'
};

let data=[];
let currentView='verified';
let selectedServices=[];
let pageByView={verified:1,mine:1};

const fmt=n=>Number.isFinite(Number(n))&&Number(n)>0
  ?new Intl.NumberFormat('ja-JP').format(Number(n))+'件'
  :'非公表/調査中';

function norm(v=''){
  return String(v).normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
}
function compact(v=''){
  return norm(v)
    .replace(/株式会社|有限会社|合同会社|ホールディングス/g,'')
    .replace(/[\s　・／/（）()「」『』【】\-—_]/g,'');
}
function escapeHtml(v=''){
  return String(v).replace(/[&<>'"]/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[c]));
}
function serviceKey(company='',service=''){
  return `${norm(company)}|||${norm(service)}`;
}
function serviceLabel(company='',service=''){
  return service ? `${company} / ${service}` : company;
}
function sourceHost(url=''){
  try{
    const u=new URL(url);
    if(u.hostname.includes('news.google.com')) return 'Googleニュース';
    return u.hostname.replace(/^www\./,'');
  }catch{return '参照元'}
}

function loadSelections(){
  try{
    const v=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
    selectedServices=Array.isArray(v)?v:[];
  }catch{selectedServices=[]}
}
function updateSelectedCount(){
  els.selectedServiceCount.textContent=
    document.querySelectorAll('.service-choice input:checked').length;
}
function saveSelections(){
  selectedServices=[...document.querySelectorAll('.service-choice input:checked')]
    .map(input=>({
      key:input.value,
      company:input.dataset.company||'',
      service:input.dataset.service||'',
      label:input.dataset.label||''
    }));
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(selectedServices))}catch{}
  pageByView.mine=1;
  updateSelectedCount();
  render();
}
function clearSelections(){
  selectedServices=[];
  try{localStorage.removeItem(STORAGE_KEY)}catch{}
  document.querySelectorAll('.service-choice input').forEach(x=>x.checked=false);
  updateSelectedCount();
  if(currentView==='mine'){
    currentView='verified';
    document.querySelectorAll('.view-tab').forEach(
      b=>b.classList.toggle('active',b.dataset.view==='verified')
    );
  }
  render();
}

function buildServiceChoices(){
  const map=new Map();
  for(const x of data){
    const company=(x.company||'').trim();
    const service=(x.service||'').trim();
    if(!company)continue;
    const key=serviceKey(company,service);
    if(!map.has(key)){
      map.set(key,{key,company,service,label:serviceLabel(company,service)});
    }
  }

  const selectedKeys=new Set(selectedServices.map(x=>x.key));
  const filter=norm(els.myServiceSearch?.value||'');

  const items=[...map.values()]
    .filter(x=>!filter||norm(x.label).includes(filter))
    .sort((a,b)=>a.label.localeCompare(b.label,'ja'));

  els.servicePickerVerified.innerHTML=items.length
    ?items.map(x=>`
      <label class="service-choice">
        <input type="checkbox"
          value="${escapeHtml(x.key)}"
          data-company="${escapeHtml(x.company)}"
          data-service="${escapeHtml(x.service)}"
          data-label="${escapeHtml(x.label)}"
          ${selectedKeys.has(x.key)?'checked':''}>
        <span class="service-choice-name">${escapeHtml(x.label)}</span>
      </label>`).join('')
    :'<p class="picker-empty">該当する企業・サービスはありません。</p>';

  document.querySelectorAll('.service-choice input').forEach(
    x=>x.addEventListener('change',updateSelectedCount)
  );
  updateSelectedCount();
}

function relationFor(x){
  if(!selectedServices.length)return null;
  const xc=norm(x.company), xs=norm(x.service), summary=norm(x.summary);
  let best=null;

  for(const sel of selectedServices){
    const sc=norm(sel.company), ss=norm(sel.service);
    let level=0, reason='';

    if((sc&&xc===sc)||(ss&&xs===ss)){
      level=3; reason='選択した企業・サービス名が一致';
    }else if((sc&&xc.includes(sc))||(ss&&xs.includes(ss))){
      level=3; reason='選択した企業・サービス名に一致';
    }else if((sc&&summary.includes(sc))||(ss&&summary.includes(ss))){
      level=2; reason='案件概要に選択した企業・サービス名が含まれる';
    }

    if(level&&(!best||level>best.level)){
      best={
        level,
        label:level>=3?'関連度 高':'関連度 中',
        reason,
        selected:sel.label
      };
    }
  }
  return best;
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
function relationKey(x){
  const r=relationFor(x);
  return compact(r?.selected||x.company||'');
}
function sameMineIncident(a,b){
  const ka=relationKey(a), kb=relationKey(b);
  if(!ka||!kb||ka!==kb)return false;

  const sa=compact(a.service||''), sb=compact(b.service||'');
  if(sa&&sb&&sa!==sb&&!(sa.includes(sb)||sb.includes(sa)))return false;
  if(sa&&sb&&(sa===sb||sa.includes(sb)||sb.includes(sa))&&daysApart(a.published,b.published)<=120)return true;
  if(countRatio(a.affected_count,b.affected_count)>=0.80&&daysApart(a.published,b.published)<=90)return true;
  return false;
}
function uniqSources(arr=[]){
  const out=[], seen=new Set();
  for(const s of arr){
    if(!s?.url||seen.has(s.url))continue;
    seen.add(s.url); out.push(s);
  }
  return out;
}
function mergeMineRows(rows){
  const out=[];
  for(const row of rows){
    const idx=out.findIndex(x=>sameMineIncident(x,row));
    if(idx<0){
      out.push({...row});
    }else{
      const a=out[idx], b=row;
      const rep=(a.sources||[]).length>=(b.sources||[]).length?a:b;
      out[idx]={
        ...rep,
        affected_count:Math.max(Number(a.affected_count||0),Number(b.affected_count||0)),
        sources:uniqSources([...(a.sources||[]),...(b.sources||[])]),
        official_updates:uniqSources([...(a.official_updates||[]),...(b.official_updates||[])])
      };
    }
  }
  return out;
}
function mineRows(){
  return mergeMineRows(data.filter(x=>relationFor(x)));
}

function rowsForView(){
  return currentView==='mine'?mineRows():data.slice();
}

function sourceBlock(x){
  const sources=x.sources||[];
  if(!sources.length)return '';
  const preview=sources.slice(0,3).map(s=>sourceHost(s.url)).join(' / ');
  const more=sources.length>3?` / ほか${sources.length-3}件`:'';
  const links=sources.map((s,i)=>`
    <li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">
      ${escapeHtml(s.name||sourceHost(s.url)||`情報源${i+1}`)}
    </a></li>`).join('');
  return `<details class="source-details">
    <summary>情報源：${sources.length}件 <span>${escapeHtml(preview+more)}</span></summary>
    <ul>${links}</ul>
  </details>`;
}

function officialUpdateBlock(x){
  const updates=x.official_updates||[];
  if(!updates.length)return '';
  return `<details class="official-updates public-official-updates">
    <summary>公式発表の更新履歴：${updates.length}件</summary>
    <ul>${updates.slice().reverse().map(u=>`
      <li>
        <span class="official-update-date">${escapeHtml(u.published||u.detected_at||'')}</span>
        <a href="${escapeHtml(u.url||'#')}" target="_blank" rel="noopener">
          ${escapeHtml(u.title||'公式発表の更新')}
        </a>
      </li>`).join('')}
    </ul>
  </details>`;
}

function card(x){
  const relation=relationFor(x);
  const relationBadge=relation
    ?`<span class="badge relation relation-${relation.level}">${relation.label}</span>`:'';
  const relationInfo=relation
    ?`<p class="relation-note"><strong>${relation.label}</strong> — 「${escapeHtml(relation.selected)}」と関連。${escapeHtml(relation.reason)}。実際の対象者かどうかは公式発表の対象条件を確認してください。</p>`:'';

  return `<article class="card ${relation?'card-related':''}">
    <div>
      <div class="date">${escapeHtml(x.published||'-')}</div>
      <div class="meta">
        <span class="badge ${x.status}">${statusLabel[x.status]||x.status}</span>
        ${relationBadge}
        ${x.cause?`<span class="badge">${escapeHtml(x.cause)}</span>`:''}
      </div>
    </div>
    <div>
      <h3>${escapeHtml(x.company||'')}${x.service?` / ${escapeHtml(x.service)}`:''}</h3>
      <p class="count">対象規模: ${fmt(x.affected_count)}</p>
      <p>${escapeHtml(x.summary||'')}</p>
      ${x.exposed_data?`<p><strong>情報:</strong> ${escapeHtml(x.exposed_data)}</p>`:''}
      ${relationInfo}
      ${officialUpdateBlock(x)}
      ${sourceBlock(x)}
    </div>
  </article>`;
}

function filteredRows(){
  const q=els.q.value.trim().toLowerCase();
  const month=els.month.value;
  let rows=rowsForView().filter(x=>{
    const hay=[x.company,x.service,x.summary,x.exposed_data].join(' ').toLowerCase();
    return (!q||hay.includes(q))&&(!month||x.published?.startsWith(month));
  });

  if(currentView==='mine'){
    rows.sort((a,b)=>
      (relationFor(b)?.level||0)-(relationFor(a)?.level||0)||
      (b.affected_count||0)-(a.affected_count||0)||
      (b.published||'').localeCompare(a.published||'')
    );
  }else if(els.sort.value==='date-desc'){
    rows.sort((a,b)=>(b.published||'').localeCompare(a.published||''));
  }

  if(els.sort.value==='date-asc'){
    rows.sort((a,b)=>(a.published||'').localeCompare(b.published||''));
  }
  if(els.sort.value==='count-desc'){
    rows.sort((a,b)=>(b.affected_count||0)-(a.affected_count||0));
  }
  return rows;
}

function render(){
  const verifiedCount=data.length;
  const mineCount=mineRows().length;
  els.tabVerifiedCount.textContent=verifiedCount;
  els.tabMineCount.textContent=mineCount;

  els.viewNotice.textContent=currentView==='verified'
    ?'公式発表・報道で内容を確認できた案件を表示しています。'
    :(selectedServices.length
      ?'選択した企業・サービスに関連する案件です。実際に漏えい対象者であるかは、各企業の公式発表を確認してください。'
      :'上の一覧から利用している企業・サービスを選択してください。');

  const rows=filteredRows();
  const total=rows.length;

  let page=pageByView[currentView]||1;
  const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));
  if(page>pages)page=pages;
  pageByView[currentView]=page;

  const start=(page-1)*PAGE_SIZE;
  const pageRows=rows.slice(start,start+PAGE_SIZE);

  els.cards.innerHTML=pageRows.map(card).join('');
  els.empty.hidden=total>0;

  els.statCases.textContent=total;
  els.statConfirmed.textContent=rows.filter(x=>x.status==='confirmed').length;

  const largest=rows.reduce((m,x)=>
    (x.affected_count||0)>(m.affected_count||0)?x:m,{affected_count:0});
  els.statLargest.textContent=largest.affected_count?fmt(largest.affected_count):'-';

  const dates=rows.map(x=>x.published).filter(Boolean).sort();
  els.statRange.textContent=dates.length
    ?`${dates[0].slice(0,7)}〜${dates.at(-1).slice(0,7)}`:'-';

  document.getElementById('publicPager')?.remove();
  if(total>PAGE_SIZE){
    const nav=document.createElement('nav');
    nav.id='publicPager';
    nav.className='incident-pager';
    const end=Math.min(start+PAGE_SIZE,total);
    nav.innerHTML=`
      <div class="incident-pager-info">${start+1}〜${end}件 / 全${total}件</div>
      <div class="incident-pager-actions">
        <button class="pager-btn" data-move="-1" ${page<=1?'disabled':''}>前の10件</button>
        <span class="pager-page">${page} / ${pages}ページ</span>
        <button class="pager-btn" data-move="1" ${page>=pages?'disabled':''}>次の10件</button>
      </div>`;
    els.cards.insertAdjacentElement('afterend',nav);
    nav.querySelectorAll('[data-move]').forEach(btn=>btn.addEventListener('click',()=>{
      pageByView[currentView]+=Number(btn.dataset.move);
      render();
      document.querySelector('.section-head')?.scrollIntoView({behavior:'smooth'});
    }));
  }
}

async function init(){
  loadSelections();

  const res=await fetch('data/public-incidents.json',{cache:'no-store'});
  const json=await res.json();
  data=(json.incidents||[]).filter(x=>x.status==='confirmed'||x.status==='possible');
  els.lastUpdated.textContent=json.last_updated||'-';

  const months=[...new Set(
    data.map(x=>x.published?.slice(0,7)).filter(Boolean)
  )].sort().reverse();
  months.forEach(m=>els.month.insertAdjacentHTML(
    'beforeend',`<option value="${m}">${m.replace('-','年')}月</option>`
  ));

  ['q','month','sort'].forEach(k=>els[k].addEventListener(
    k==='q'?'input':'change',()=>{
      pageByView[currentView]=1;
      render();
    }
  ));

  els.myServiceSearch.addEventListener('input',buildServiceChoices);
  els.saveMyServices.addEventListener('click',saveSelections);
  els.clearMyServices.addEventListener('click',clearSelections);

  document.querySelectorAll('.view-tab').forEach(btn=>btn.addEventListener('click',()=>{
    currentView=btn.dataset.view;
    pageByView[currentView]=1;
    document.querySelectorAll('.view-tab').forEach(
      b=>b.classList.toggle('active',b===btn)
    );
    render();
  }));

  buildServiceChoices();
  render();
}

init().catch(err=>{
  console.error(err);
  els.empty.hidden=false;
  els.empty.textContent='データの読み込みに失敗しました。時間をおいて再度お試しください。';
});
