#!/usr/bin/env python3
import argparse,json,re
from datetime import datetime,timezone,timedelta
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];DATA=ROOT/'data/incidents.json';JST=timezone(timedelta(hours=9))
def count(raw):
    s=(raw or '').strip().translate(str.maketrans('０１２３４５６７８９，','0123456789,')).replace(',','').replace(' ','').replace('　','')
    if not s:return 0
    for u in ('アカウント','レコード','ユーザー','ユーザ','名','人','件','社','団体'):
        if s.endswith(u):s=s[:-len(u)];break
    if not re.fullmatch(r'\d+',s):raise SystemExit(f'対象規模の形式が不正です: {raw}')
    return int(s)
def sources(raw):
    a=json.loads(raw or '[]');out=[];seen=set()
    for x in a:
        if not isinstance(x,dict):continue
        u=str(x.get('url') or '').strip()
        if not u or u in seen:continue
        seen.add(u);out.append({'name':str(x.get('name') or '情報源').strip() or '情報源','url':u,'official':bool(x.get('official'))})
    return out
def main():
    p=argparse.ArgumentParser();p.add_argument('--id',required=True)
    for n in ('published','company','service','affected-count','cause','summary','exposed-data','sources-json','note'):p.add_argument('--'+n,default='')
    a=p.parse_args();db=json.loads(DATA.read_text(encoding='utf-8'));x=next((r for r in db.get('incidents',[]) if r.get('id')==a.id),None)
    if not x:raise SystemExit(f'incident not found: {a.id}')
    if x.get('status')!='candidate':raise SystemExit(f'candidate以外はニュース修正できません: {x.get("status")}')
    before={k:x.get(k) for k in ('published','company','service','affected_count','cause','summary','exposed_data','sources')}
    after={'published':a.published.strip(),'company':a.company.strip(),'service':a.service.strip(),'affected_count':count(a.affected_count),'cause':a.cause.strip(),'summary':a.summary.strip(),'exposed_data':a.exposed_data.strip(),'sources':sources(a.sources_json)}
    labels={'published':'公表日','company':'企業・団体名','service':'サービス名','affected_count':'対象規模','cause':'原因・分類','summary':'ニュース概要','exposed_data':'対象情報','sources':'情報源'}
    changed=[labels[k] for k in after if before.get(k)!=after[k]]
    if not changed and not a.note.strip():raise SystemExit('変更内容がありません')
    x.update(after);now=datetime.now(JST).strftime('%Y-%m-%d %H:%M JST');x['news_updated_at']=now;x['news_update_note']=a.note.strip() or ('更新：'+'、'.join(changed));x['news_updated_fields']=changed;db['last_updated']=now
    DATA.write_text(json.dumps(db,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(f'updated candidate news {a.id}')
if __name__=='__main__':main()
