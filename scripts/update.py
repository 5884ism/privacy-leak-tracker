#!/usr/bin/env python3
import json, re, hashlib, urllib.parse, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data' / 'incidents.json'
JST = timezone(timedelta(hours=9))
QUERIES = ['個人情報 漏えい OR 流出 不正アクセス','情報漏えい 顧客情報 不正アクセス','ランサムウェア 個人情報 漏えい']
NOISE_PATTERNS=[r'どう対処',r'対策(?:を|は)',r'注意(?:を|が)',r'使い回し',r'専門家',r'解説',r'基礎知識',r'とは',r'ランキング',r'まとめ']

def rss_url(q):
    return 'https://news.google.com/rss/search?' + urllib.parse.urlencode({'q':q+' when:1d','hl':'ja','gl':'JP','ceid':'JP:ja'})
def fetch(url):
    req=urllib.request.Request(url,headers={'User-Agent':'privacy-leak-tracker/1.1'})
    with urllib.request.urlopen(req,timeout=30) as r:return r.read()
def text(el,tag):
    n=el.find(tag);return (n.text or '').strip() if n is not None else ''
def clean_title(title):return re.sub(r'\s+-\s+[^-]+$','',title).strip()
def normalize(s):
    s=clean_title(s)
    s=re.sub(r'[【\[].*?[】\]]',' ',s)
    s=re.sub(r'[「」『』（）()：:｜|／/・,，。]',' ',s)
    s=re.sub(r'(個人情報|情報漏えい|情報漏洩|漏えい|漏洩|流出|不正アクセス|ランサムウェア|おそれ|可能性|被害|発表)',' ',s)
    return re.sub(r'\s+',' ',s).strip().lower()
def company_from_title(title):
    s=clean_title(title);s=re.sub(r'^[【\[].*?[】\]]\s*','',s)
    for p in [r'^(.+?)(?:で|が|に|の)(?:個人情報|情報|顧客情報|不正アクセス|漏えい|漏洩|流出)',r'^(.+?)[、：:]']:
        m=re.search(p,s)
        if m:
            c=m.group(1).strip()
            if 1<len(c)<=80:return c
    return s[:80] or '要確認'
def entity_key(title,company):
    c=normalize(company);generic={'不正アクセス','情報','個人情報','旅行予約','要確認',''}
    if c not in generic and len(c)>=2:return c
    return ' '.join(normalize(title).split()[:5])
def extract_count(title):
    t=title.replace(',','').replace('，','')
    m=re.search(r'約?\s*(\d+(?:\.\d+)?)\s*万\s*(\d+)?\s*(?:件|人|アカウント|名)?',t)
    if m:return int(float(m.group(1))*10000)+int(m.group(2) or 0)
    m=re.search(r'約?\s*(\d{3,})\s*(?:件|人|アカウント|名)',t)
    return int(m.group(1)) if m else 0
def is_noise(title):
    if not re.search(r'(漏えい|漏洩|流出|不正アクセス|ランサムウェア)',title):return True
    return any(re.search(p,title) for p in NOISE_PATTERNS)
def main():
    db=json.loads(DATA.read_text(encoding='utf-8'));incidents=db.get('incidents',[])
    existing_urls={s.get('url') for x in incidents for s in x.get('sources',[]) if s.get('url')}
    existing_ids={x.get('id') for x in incidents};today=datetime.now(JST).date().isoformat();entity_index={}
    for x in incidents:
        if x.get('status')=='candidate':
            k=(entity_key(x.get('summary',''),x.get('company','')),x.get('published',''))
            if k[0]:entity_index[k]=x
    added=merged=0
    for q in QUERIES:
        try:root=ET.fromstring(fetch(rss_url(q)))
        except Exception as e:print('feed error:',q,e);continue
        for item in root.findall('./channel/item'):
            title=text(item,'title');link=text(item,'link');pub=text(item,'pubDate')
            if not title or not link or link in existing_urls or is_noise(title):continue
            company=company_from_title(title);key=(entity_key(title,company),today);count=extract_count(title)
            if key in entity_index:
                x=entity_index[key];urls={s.get('url') for s in x.get('sources',[])}
                if link not in urls:x.setdefault('sources',[]).append({'name':'Googleニュース経由','url':link})
                if count>int(x.get('affected_count') or 0):x['affected_count']=count
                x['article_count']=int(x.get('article_count') or 1)+1;merged+=1
            else:
                digest=hashlib.sha1((title+link).encode()).hexdigest()[:10];iid=f'{today}-auto-{digest}'
                if iid in existing_ids:continue
                x={'id':iid,'published':today,'company':company,'service':'','affected_count':count,'status':'candidate','cause':'報道自動検知','summary':clean_title(title),'exposed_data':'要確認','sources':[{'name':'Googleニュース経由','url':link}],'auto_detected':True,'rss_pub_date':pub,'article_count':1}
                incidents.append(x);entity_index[key]=x;existing_ids.add(iid);added+=1
            existing_urls.add(link)
    incidents.sort(key=lambda x:x.get('published',''),reverse=True);db['incidents']=incidents;db['last_updated']=datetime.now(JST).strftime('%Y-%m-%d %H:%M JST')
    DATA.write_text(json.dumps(db,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(f'added {added} candidate(s), merged {merged} article(s)')
if __name__=='__main__':main()
