#!/usr/bin/env python3
"""Daily news detector for Japanese privacy/data-breach incidents.

This intentionally auto-adds discovered items as status='candidate'.
Exact affected counts and exposed fields should be promoted only after human/official verification.
"""
import json, re, hashlib, urllib.parse, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'incidents.json'
JST = timezone(timedelta(hours=9))

QUERIES = [
    '個人情報 漏えい OR 流出 不正アクセス',
    '情報漏えい 顧客情報 不正アクセス',
    'ランサムウェア 個人情報 漏えい',
]

def rss_url(q):
    return 'https://news.google.com/rss/search?' + urllib.parse.urlencode({
        'q': q + ' when:1d', 'hl': 'ja', 'gl': 'JP', 'ceid': 'JP:ja'
    })

def fetch(url):
    req=urllib.request.Request(url, headers={'User-Agent':'privacy-leak-tracker/1.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

def text(el, tag):
    n=el.find(tag); return (n.text or '').strip() if n is not None else ''

def company_from_title(title):
    # Conservative heuristic: take first phrase before common separators.
    s=re.sub(r'\s+-\s+.+$','',title).strip()
    for sep in ['、','：',':','「','で','が']:
        if sep in s:
            s=s.split(sep,1)[0].strip()
    return s[:80] or '要確認'

def main():
    db=json.loads(DATA.read_text(encoding='utf-8'))
    existing_urls={s.get('url') for x in db['incidents'] for s in x.get('sources',[]) if s.get('url')}
    existing_ids={x['id'] for x in db['incidents']}
    added=0

    for q in QUERIES:
        try:
            root=ET.fromstring(fetch(rss_url(q)))
        except Exception as e:
            print('feed error:', q, e); continue
        for item in root.findall('./channel/item'):
            title=text(item,'title'); link=text(item,'link'); pub=text(item,'pubDate')
            if not title or not link or link in existing_urls: continue
            if not re.search(r'(漏えい|漏洩|流出|不正アクセス|ランサムウェア)', title): continue
            key=hashlib.sha1((title+link).encode()).hexdigest()[:10]
            date=datetime.now(JST).date().isoformat()
            iid=f'{date}-auto-{key}'
            if iid in existing_ids: continue
            db['incidents'].append({
                'id':iid,
                'published':date,
                'company':company_from_title(title),
                'service':'',
                'affected_count':0,
                'status':'candidate',
                'cause':'報道自動検知',
                'summary':title,
                'exposed_data':'要確認',
                'sources':[{'name':'Googleニュース経由', 'url':link}],
                'auto_detected':True,
                'rss_pub_date':pub
            })
            existing_urls.add(link); existing_ids.add(iid); added += 1

    db['incidents'].sort(key=lambda x:x.get('published',''), reverse=True)
    db['last_updated']=datetime.now(JST).strftime('%Y-%m-%d %H:%M JST')
    DATA.write_text(json.dumps(db, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'added {added} candidate(s)')

if __name__=='__main__': main()
