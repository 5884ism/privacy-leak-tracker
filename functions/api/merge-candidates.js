const REPO='5884ism/privacy-leak-tracker';
const WORKFLOW='merge-candidates.yml';
const REF='main';

const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
const emails=raw=>String(raw||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
const clean=(v,max=5000)=>{
  const s=String(v??'');
  if(s.length>max) throw new Error(`入力値が長すぎます（最大 ${max} 文字）`);
  return s;
};

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
  try{body=await request.json();}catch{return json({ok:false,error:'JSONが不正です。'},400);}

  try{
    const mode=String(body.mode||'');
    if(!['existing','new'].includes(mode)) throw new Error('親案件モードが不正です');

    const ids=Array.isArray(body.merge_ids)?body.merge_ids.map(String).filter(Boolean):[];
    if(ids.length<1) throw new Error('紐づける候補を1件以上選択してください。');

    const parentId=String(body.parent_id||'').trim();
    if(mode==='existing'&&!parentId) throw new Error('既存の親案件を選択してください。');
    if(mode==='new'&&!String(body.company||'').trim()) throw new Error('新規親案件の企業・委託先名は必須です。');

    const inputs={
      mode,
      parent_id:clean(parentId,200),
      merge_ids_json:JSON.stringify(ids),
      company:clean(body.company,500),
      service:clean(body.service,500),
      published:clean(body.published,30),
      affected_count:clean(body.affected_count,100),
      cause:clean(body.cause,500),
      summary:clean(body.summary,5000),
      exposed_data:clean(body.exposed_data,5000),
      affected_organizations_json:JSON.stringify(Array.isArray(body.affected_organizations)?body.affected_organizations:[]),
      note:clean(body.note,2000)
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
      console.error('merge dispatch failed',gh.status,await gh.text());
      return json({ok:false,error:`GitHub Actionsの起動に失敗しました（HTTP ${gh.status}）。`},502);
    }

    return json({
      ok:true,
      message:mode==='existing'
        ? '既存案件への紐づけ処理を開始しました。'
        : '新しい親候補の作成・統合処理を開始しました。'
    });
  }catch(e){
    return json({ok:false,error:e?.message||'入力内容が不正です。'},400);
  }
}

export function onRequestGet(){return json({ok:false,error:'POST only'},405);}
