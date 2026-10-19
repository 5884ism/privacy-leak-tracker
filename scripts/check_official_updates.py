#!/usr/bin/env python3
import json, re, hashlib, html, urllib.parse, urllib.request, unicodedata
from html.parser import HTMLParser
from datetime import datetime, timezone, timedelta
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "incidents.json"
JST = timezone(timedelta(hours=9))

UPDATE_WORDS = re.compile(
    r"(第\s*\d+\s*報|続報|最終報|最終報告|更新|追加報告|調査結果|"
    r"個人情報|漏えい|漏洩|流出|不正アクセス|サイバー攻撃)", re.I
)
STRONG_FOLLOWUP = re.compile(r"(第\s*[2-9]\s*報|続報|最終報|最終報告|追加報告|調査結果)", re.I)

def now_jst():
    return datetime.now(JST).strftime("%Y-%m-%d %H:%M JST")

def nfkc(s):
    return unicodedata.normalize("NFKC", s or "")

def fetch(url, timeout=25):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "privacy-leak-tracker/2.3",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.headers.get("Content-Type",""), r.geturl()

def host(url):
    try:
        return (urllib.parse.urlparse(url).hostname or "").lower().removeprefix("www.")
    except Exception:
        return ""

def is_google_news(url):
    h = host(url)
    return h == "news.google.com" or h.endswith(".news.google.com")

def same_domain(a,b):
    ha,hb=host(a),host(b)
    return bool(ha and hb and (ha==hb or ha.endswith("."+hb) or hb.endswith("."+ha)))

def normalize_url(url):
    try:
        p=urllib.parse.urlsplit(url)
        q=[(k,v) for k,v in urllib.parse.parse_qsl(p.query,keep_blank_values=True)
           if not k.lower().startswith(("utm_","fbclid","gclid"))]
        path=p.path.rstrip("/") or "/"
        return urllib.parse.urlunsplit((p.scheme.lower(),p.netloc.lower(),path,urllib.parse.urlencode(q),""))
    except Exception:
        return url

class Parser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links=[]; self.visible=[]; self._href=None; self._txt=[]; self._skip=0
    def handle_starttag(self,tag,attrs):
        if tag in ("script","style","noscript","svg"): self._skip+=1
        if tag=="a":
            self._href=dict(attrs).get("href"); self._txt=[]
    def handle_endtag(self,tag):
        if tag in ("script","style","noscript","svg") and self._skip: self._skip-=1
        if tag=="a" and self._href:
            self.links.append((self._href," ".join(self._txt).strip()))
            self._href=None; self._txt=[]
    def handle_data(self,data):
        if self._skip: return
        t=re.sub(r"\s+"," ",data).strip()
        if not t: return
        self.visible.append(t)
        if self._href is not None: self._txt.append(t)

def parse_html(raw):
    p=Parser()
    try: p.feed(raw.decode("utf-8",errors="ignore"))
    except Exception: pass
    return p

def meaningful_fingerprint(p):
    relevant=[nfkc(t) for t in p.visible if UPDATE_WORDS.search(nfkc(t))]
    body=re.sub(r"\s+"," ","\n".join(relevant)).strip()
    if len(body)<30: return ""
    return hashlib.sha256(body.encode()).hexdigest()

def company_tokens(company):
    s=nfkc(company)
    s=re.sub(r"(株式会社|有限会社|合同会社|ホールディングス|HD)"," ",s,flags=re.I)
    return [x for x in re.split(r"[\s/／・|｜]+",s) if len(x)>=2][:4]

def relevant_title(title,incident):
    t=nfkc(title)
    if not UPDATE_WORDS.search(t): return False
    toks=company_tokens(incident.get("company",""))
    return (not toks) or any(tok in t for tok in toks) or bool(STRONG_FOLLOWUP.search(t))

def add_update(incident,url,title,kind):
    url=normalize_url(url)
    existing={normalize_url(u.get("url","")) for u in incident.get("official_updates",[]) if u.get("url")}
    current={normalize_url(s.get("url","")) for s in incident.get("sources",[])
             if s.get("url") and not is_google_news(s.get("url",""))}
    if kind!="page_changed" and (url in existing or url in current): return False
    if kind=="page_changed":
        today=now_jst()[:10]
        for u in incident.get("official_updates",[]):
            if normalize_url(u.get("url",""))==url and u.get("kind")==kind and str(u.get("detected_at","")).startswith(today):
                return False
    incident.setdefault("official_updates",[]).append({
        "detected_at":now_jst(),
        "title":title.strip() or "公式発表の更新",
        "url":url,
        "kind":kind,
        "reviewed":False,
    })
    incident["official_update_pending"]=True
    return True

def discover_links(seed_url,p,incident):
    n=0
    toks=company_tokens(incident.get("company",""))
    for href,title in p.links:
        if not href or not title: continue
        absolute=urllib.parse.urljoin(seed_url,html.unescape(href))
        if not same_domain(seed_url,absolute): continue
        tt=nfkc(title)
        likely=STRONG_FOLLOWUP.search(tt) or (
            re.search(r"(漏えい|漏洩|流出|不正アクセス)",tt,re.I)
            and (not toks or any(tok in tt for tok in toks))
        )
        if likely and relevant_title(title,incident):
            if add_update(incident,absolute,title,"new_official_page"): n+=1
    return n

def google_news_candidates(domain,company):
    q=f'site:{domain} "{company}" (個人情報 OR 漏えい OR 漏洩 OR 不正アクセス OR 最終報 OR 続報) when:30d'
    url="https://news.google.com/rss/search?"+urllib.parse.urlencode({
        "q":q,"hl":"ja","gl":"JP","ceid":"JP:ja"
    })
    try: raw,_,_=fetch(url,20)
    except Exception: return []
    try: root=ET.fromstring(raw)
    except Exception: return []
    return [((i.findtext("title") or "").strip(),(i.findtext("link") or "").strip())
            for i in root.findall("./channel/item") if i.findtext("title") and i.findtext("link")]

def resolve(link):
    try:
        req=urllib.request.Request(link,headers={"User-Agent":"Mozilla/5.0"})
        with urllib.request.urlopen(req,timeout=15) as r: return r.geturl()
    except Exception: return link

def monitor(incident):
    changed=0
    watch=incident.setdefault("official_watch",{})
    hashes=watch.setdefault("page_hashes",{})
    official=[s for s in incident.get("sources",[]) if s.get("url") and not is_google_news(s.get("url",""))]
    if not official: return 0
    domains=set()
    for s in official:
        url=s["url"]; domains.add(host(url))
        try: raw,ctype,final=fetch(url)
        except Exception as e:
            watch["last_error"]=f"{type(e).__name__}: {url}"
            continue
        if "html" not in ctype.lower(): continue
        p=parse_html(raw)
        fp=meaningful_fingerprint(p)
        key=normalize_url(final)
        if fp:
            old=hashes.get(key)
            if old and old!=fp:
                if add_update(incident,final,f'{incident.get("company","")} 公式ページ内容更新を検知',"page_changed"):
                    changed+=1
            hashes[key]=fp
        changed+=discover_links(final,p,incident)

    for domain in sorted(d for d in domains if d):
        for title,link in google_news_candidates(domain,incident.get("company","")):
            if not relevant_title(title,incident): continue
            final=resolve(link)
            if same_domain("https://"+domain+"/",final):
                if add_update(incident,final,title,"new_official_page"): changed+=1
    watch["last_checked"]=now_jst()
    return changed

def main():
    db=json.loads(DATA.read_text(encoding="utf-8"))
    changed=0; monitored=0
    for x in db.get("incidents",[]):
        if x.get("status") not in ("confirmed","possible"): continue
        monitored+=1
        try: changed+=monitor(x)
        except Exception as e:
            x.setdefault("official_watch",{})["last_error"]=type(e).__name__
    if changed: db["last_updated"]=now_jst()
    db["official_monitor"]={
        "last_checked":now_jst(),
        "monitored_incidents":monitored,
        "new_updates_detected":changed,
        "version":"2.3"
    }
    DATA.write_text(json.dumps(db,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"official monitor: {monitored} incidents, {changed} new update(s)")

if __name__=="__main__":
    main()
