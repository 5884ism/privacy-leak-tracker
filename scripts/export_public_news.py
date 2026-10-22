#!/usr/bin/env python3
import json
from datetime import datetime,timezone,timedelta
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];SRC=ROOT/'data/incidents.json';OUT=ROOT/'data/public-news.json';JST=timezone(timedelta(hours=9))
FIELDS=('id','published','company','service','affected_count','cause','summary','exposed_data','sources','news_updated_at','news_update_note')
def src(s):
    if not isinstance(s,dict) or not str(s.get('url') or '').strip():return None
    return {'name':str(s.get('name') or '情報源').strip() or '情報源','url':str(s.get('url')).strip(),'official':bool(s.get('official'))}
def row(x):
    r={k:x.get(k) for k in FIELDS if k in x};r['sources']=[y for y in (src(s) for s in x.get('sources') or []) if y];return r
def main():
    db=json.loads(SRC.read_text(encoding='utf-8'));now=datetime.now(JST);today=now.strftime('%Y-%m-%d')
    news=[row(x) for x in db.get('incidents',[]) if x.get('status')=='candidate'];news.sort(key=lambda x:(x.get('published') or '',x.get('id') or ''),reverse=True)
    updates=[row(x) for x in db.get('incidents',[]) if str(x.get('news_updated_at') or '').startswith(today)];updates.sort(key=lambda x:x.get('news_updated_at') or '',reverse=True)
    OUT.write_text(json.dumps({'version':'1.0','generated_at':now.isoformat(timespec='minutes'),'news_count':len(news),'news':news,'updates':updates},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'exported public news: {len(news)} candidates, {len(updates)} updates')
if __name__=='__main__':main()
