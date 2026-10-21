const REPO = '5884ism/privacy-leak-tracker';
const WORKFLOW = 'edit-reviewed-incident.yml';
const REF = 'main';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
  });
}
const emails=raw=>String(raw||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
function clean(v,max=5000){
  const s=String(v??'');
  if(s.length>max) throw new Error(`入力値が長すぎます（最大 ${max} 文字）`);
  return s;
}
function validateSources(items){
  if(!Array.isArray(items)) throw new Error('情報源データが不正です');
  return items.filter(x=>x?.url).map((x,i)=>{
    const url=clean(x.url,2048).trim();
    try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol)) throw new Error();}
    catch{throw new Error(`情報源 ${i+1} のURL形式が不正です`);}
    return {name:clean(x.name||'情報源',200).trim()||'情報源',url,official:Boolean(x.official)};
  });
}

export async function onRequestPost({request,env}){
  if(!env.GITHUB_TOKEN||!env.OPERATOR_HOST||!env.OPERATOR_EMAIL){
    return json({ok:false,error:'Cloudflare環境変数が不足しています。'},503);
  }
  const host=new URL(request.url).hostname.toLowerCase();
  if(host!==String(env.OPERATOR_HOST).trim().toLowerCase()){
    return json({ok:false,error:'このホストからの実行は許可されていません。'},403);
  }
  const email=String(request.headers.get('CF-Access-Authenticated-User-Email')||'').trim().toLowerCase();
  if(!email||!emails(env.OPERATOR_EMAIL).includes(email)){
    return json({ok:false,error:'Cloudflare Accessで認証された運営者のみ実行できます。'},403);
  }

  let body;
  try{body=await request.json();}catch{return json({ok:false,error:'JSONリクエストが不正です。'},400);}

  try{
    const incidentId=clean(body.incident_id,200).trim();
    if(!incidentId) throw new Error('案件IDは必須です');

    const status=clean(body.status,30).trim();
    if(status&&!['confirmed','possible'].includes(status)) throw new Error('確認状況が不正です');

    const sources=validateSources(body.sources||[]);
    const mergeIds=Array.isArray(body.merge_ids)?[...new Set(body.merge_ids.map(String).filter(Boolean))]:[];
    const orgs=Array.isArray(body.affected_organizations)?body.affected_organizations:[];

    const inputs={
      incident_id:incidentId,
      published:clean(body.published,30),
      company:clean(body.company,500),
      service:clean(body.service,500),
      affected_count:clean(body.affected_count,100),
      status,
      cause:clean(body.cause,500),
      summary:clean(body.summary,5000),
      exposed_data:clean(body.exposed_data,5000),
      sources_json:JSON.stringify(sources),
      note:clean(body.note,2000),
      merge_ids_json:JSON.stringify(mergeIds),
      affected_organizations_json:JSON.stringify(orgs),
    };

    const gh=await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,{
      method:'POST',
      headers:{
        authorization:`Bearer ${env.GITHUB_TOKEN}`,
        accept:'application/vnd.github+json',
        'x-github-api-version':'2022-11-28',
        'user-agent':'privacy-leak-tracker-operator',
        'content-type':'application/json'
      },
      body:JSON.stringify({ref:REF,inputs})
    });

    if(!gh.ok){
      console.error('edit reviewed dispatch failed',gh.status,await gh.text());
      return json({ok:false,error:`GitHub Actionsの起動に失敗しました（HTTP ${gh.status}）。`},502);
    }

    return json({
      ok:true,
      message:mergeIds.length
        ? `更新処理を開始しました。候補 ${mergeIds.length}件も親案件へ紐づけます。`
        : '更新処理を開始しました。GitHub Actionsで反映されます。'
    });
  }catch(e){
    return json({ok:false,error:e?.message||'入力内容が不正です。'},400);
  }
}
export function onRequestGet(){return json({ok:false,error:'POST only'},405);}
