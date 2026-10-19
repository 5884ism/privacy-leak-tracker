#!/usr/bin/env python3
"""Daily detector + candidate cleanup + priority scoring.

v1.6
- stronger verified/candidate duplicate suppression using count/date fingerprints
- preserve confirmed/possible records
- clean candidate rows every run
- normalize company/entity names
- remove commentary/noise
- merge likely duplicates
- remove candidates duplicating verified incidents
- assign candidate priority A/B/C based on evidence/impact signals
"""

import json
import re
import hashlib
import urllib.parse
import urllib.request
import unicodedata
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
from difflib import SequenceMatcher
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "incidents.json"
JST = timezone(timedelta(hours=9))

QUERIES = [
    "個人情報 漏えい OR 流出 不正アクセス",
    "情報漏えい 顧客情報 不正アクセス",
    "ランサムウェア 個人情報 漏えい",
]

NOISE_PATTERNS = [
    r"どう対処", r"対処法", r"対策(?:を|は|まとめ|方法)",
    r"注意(?:を|が必要|点)", r"使い回し", r"専門家",
    r"解説", r"基礎知識", r"とは[？?]?$", r"ランキング",
    r"まとめ記事", r"被害を防ぐ", r"身を守る",
    r"退会者らの情報削除", r"義務規定",
]

GENERIC_COMPANIES = {
    "", "要確認", "不正アクセス", "個人情報", "情報", "情報漏えい",
    "情報流出", "旅行予約", "サイバー攻撃", "ランサムウェア",
}

ENTITY_TRAILING_PATTERNS = [
    r"\s+(?:電話番号|メールアドレス|住所|氏名|顧客情報|会員情報|個人情報)(?:など)?(?:約?\d[\d,.]*万?\s*(?:件|人|名|アカウント)?)?.*$",
    r"\s+約?\d[\d,.]*万?\s*(?:件|人|名|アカウント).*$",
    r"\s+(?:最大|約)?\d[\d,.]*\s*(?:件|人|名|アカウント).*$",
]

def nfkc(s):
    return unicodedata.normalize("NFKC", s or "")

def rss_url(q):
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode({
        "q": q + " when:1d", "hl": "ja", "gl": "JP", "ceid": "JP:ja",
    })

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent":"privacy-leak-tracker/1.6"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

def text(el, tag):
    n = el.find(tag)
    return (n.text or "").strip() if n is not None else ""

def clean_title(title):
    s = nfkc(title)
    s = re.sub(r"\s+-\s+[^-]+$", "", s).strip()
    s = re.sub(r"^[【\[]\s*(?:速報|続報|独自|更新)[^】\]]*[】\]]\s*", "", s)
    return s.strip()

def strip_region_prefix(s):
    s = nfkc(s)
    s = re.sub(r"^[【\[]([^】\]]*(?:都|道|府|県|市|区|町|村))[^】\]]*[】\]]\s*", "", s)
    return s.strip()

def trim_entity_tail(s):
    s = nfkc(s).strip()
    for p in ENTITY_TRAILING_PATTERNS:
        s = re.sub(p, "", s).strip()
    s = re.sub(r"\s+(?:情報流出|情報漏えい|情報漏洩|漏えい|漏洩|流出|不正アクセス|調査結果を発表).*$", "", s)
    return s.strip(" -—:：")

def normalize(s):
    s = trim_entity_tail(strip_region_prefix(clean_title(s)))
    s = re.sub(r"[【\[].*?[】\]]", " ", s)
    s = re.sub(r"[「」『』（）()：:｜|／/・,，。!！?？]", " ", s)
    s = re.sub(
        r"(個人情報|顧客情報|会員情報|情報漏えい|情報漏洩|漏えい|漏洩|流出|"
        r"不正アクセス|ランサムウェア|サイバー攻撃|おそれ|可能性|被害|発表|調査結果|"
        r"約?\d+(?:\.\d+)?\s*万?\s*(?:件|人|名|アカウント)?)",
        " ", s)
    return re.sub(r"\s+"," ",s).strip().lower()

def company_from_title(title):
    s = strip_region_prefix(clean_title(title))
    s = re.sub(r"^(?:速報|続報)\s*", "", s)
    patterns = [
        r"^(.+?)(?:で|が|に|の)(?:個人情報|顧客情報|会員情報|情報漏えい|情報漏洩|情報流出|漏えい|漏洩|流出|不正アクセス|ランサムウェア)",
        r"^(.+?)(?:、|：|:)",
        r"^(.+?)\s+(?:個人情報|顧客情報|会員情報|情報漏えい|情報流出|漏えい|流出|不正アクセス|ランサムウェア)",
        r"^(.+?)\s+(?:電話番号|メールアドレス|住所|氏名|顧客|会員|個人情報).*?(?:漏えい|流出)",
    ]
    for p in patterns:
        m = re.search(p,s)
        if m:
            c = trim_entity_tail(m.group(1).strip(" 「」『』"))
            if 1 < len(c) <= 40:
                return c
    m = re.match(r"^(.{2,30}?)\s+(?:電話番号|メールアドレス|住所|氏名|顧客情報|会員情報|個人情報)", s)
    if m:
        return trim_entity_tail(m.group(1))
    c = trim_entity_tail(s)
    if 1 < len(c) <= 40:
        return c
    words = c.split()
    return " ".join(words[:2])[:40] if words else "要確認"

def looks_generic_company(s):
    s = nfkc((s or "").strip())
    return s in GENERIC_COMPANIES or len(s) < 2 or len(s) > 45

def extract_count(title):
    t = nfkc(title).replace(",","").replace("，","")
    m = re.search(r"約?\s*(\d+(?:\.\d+)?)\s*万\s*(\d{1,4})?\s*(?:件|人|名|アカウント)?", t)
    if m:
        return int(float(m.group(1))*10000) + int(m.group(2) or 0)
    m = re.search(r"約?\s*(\d{3,})\s*(?:件|人|名|アカウント)", t)
    return int(m.group(1)) if m else 0

def is_noise(title):
    t = nfkc(title)
    if not re.search(r"(漏えい|漏洩|流出|不正アクセス|ランサムウェア)", t):
        return True
    return any(re.search(p,t) for p in NOISE_PATTERNS)

def safe_date(s):
    try: return date.fromisoformat((s or "")[:10])
    except Exception: return None

def date_distance(a,b):
    da,db=safe_date(a),safe_date(b)
    return abs((da-db).days) if da and db else 9999

def entity_key(company,summary=""):
    c=normalize(company)
    if c and c not in GENERIC_COMPANIES and len(c)>=2:
        return " ".join(c.split()[:5])
    return " ".join(normalize(summary).split()[:5])

def title_similarity(a,b):
    a1,b1=normalize(a),normalize(b)
    if not a1 or not b1: return 0.0
    ratio=SequenceMatcher(None,a1,b1).ratio()
    ta,tb=set(a1.split()),set(b1.split())
    j=len(ta&tb)/max(1,len(ta|tb))
    return max(ratio,j)

def count_close(a,b):
    a,b=int(a or 0),int(b or 0)
    if a<=0 or b<=0: return False
    if a==b: return True
    return min(a,b)/max(a,b)>=0.97

def strong_count_fingerprint(a,b):
    """Large incidents can be matched safely even when media-derived entity names differ.

    Examples:
    E-store / BASE subsidiary / ShopServe: ~23.35M
    Nikkei / Nikkei Shimbun: 1.83M
    """
    ac=int(a.get("affected_count") or 0)
    bc=int(b.get("affected_count") or 0)
    if ac < 100_000 or bc < 100_000:
        return False
    ratio=min(ac,bc)/max(ac,bc)
    return ratio >= 0.98 and date_distance(a.get("published"),b.get("published")) <= 14

def incident_context(x):
    s=nfkc(" ".join([
        x.get("company",""),
        x.get("service",""),
        x.get("summary",""),
    ]))
    return bool(re.search(
        r"(漏えい|漏洩|流出|不正アクセス|サイバー攻撃|ランサムウェア|"
        r"個人情報|会員情報|顧客情報|クレジット|免許証)", s
    ))

def verified_duplicate(candidate, verified):
    # Strong numeric fingerprint first. This intentionally does not require entity-name equality.
    if incident_context(candidate) and incident_context(verified) and strong_count_fingerprint(candidate,verified):
        return True

    # Fall back to the existing entity/title similarity rule.
    return same_incident(candidate,verified)

def choose_company(a,b):
    vals=[]
    for x in (a,b):
        if not x: continue
        x2=trim_entity_tail(strip_region_prefix(x))
        if not looks_generic_company(x2): vals.append(x2)
    return min(vals,key=len) if vals else trim_entity_tail(a or b or "要確認")[:40]

def union_sources(a,b):
    out,seen=[],set()
    for s in (a or [])+(b or []):
        url=(s or {}).get("url")
        if not url or url in seen: continue
        seen.add(url)
        out.append({"name":(s or {}).get("name") or "参照元","url":url})
    return out

def merge_two(base,other):
    base["company"]=choose_company(base.get("company"),other.get("company"))
    base["affected_count"]=max(int(base.get("affected_count") or 0),int(other.get("affected_count") or 0))
    base["sources"]=union_sources(base.get("sources"),other.get("sources"))
    base["article_count"]=int(base.get("article_count") or 1)+int(other.get("article_count") or 1)
    if other.get("published") and (not base.get("published") or other["published"]<base["published"]):
        base["published"]=other["published"]
    if len(other.get("summary",""))>len(base.get("summary","")) and len(other.get("summary",""))<=180:
        base["summary"]=other["summary"]
    return base

def same_incident(a,b):
    ak=entity_key(a.get("company",""),a.get("summary",""))
    bk=entity_key(b.get("company",""),b.get("summary",""))
    if not ak or not bk or ak!=bk: return False
    dd=date_distance(a.get("published"),b.get("published"))
    ac,bc=int(a.get("affected_count") or 0),int(b.get("affected_count") or 0)
    sim=title_similarity(a.get("summary",""),b.get("summary",""))
    if count_close(ac,bc) and dd<=30: return True
    if dd<=7 and sim>=0.34: return True
    if ac==0 and bc==0 and dd<=3 and sim>=0.50: return True
    return False

def priority_for(x):
    """Candidate review priority only; not a confidence score."""
    score=0
    count=int(x.get("affected_count") or 0)
    sources=len(x.get("sources") or [])
    articles=max(int(x.get("article_count") or 0), sources)

    if count>=1_000_000: score+=5
    elif count>=100_000: score+=4
    elif count>=10_000: score+=3
    elif count>=1_000: score+=2
    elif count>0: score+=1

    if articles>=3: score+=3
    elif articles>=2: score+=2

    if sources>=2: score+=1

    company=(x.get("company") or "").strip()
    if company and not looks_generic_company(company) and len(company)<=30:
        score+=1

    summary=nfkc(x.get("summary",""))
    if re.search(r"(カード|クレジット|パスワード|免許証|口座|生年月日|住所)", summary):
        score+=2

    if score>=7: return "A",score
    if score>=4: return "B",score
    return "C",score

def assign_priorities(rows):
    for x in rows:
        if x.get("status")=="candidate":
            p,s=priority_for(x)
            x["priority"]=p
            x["priority_score"]=s
        else:
            x.pop("priority",None)
            x.pop("priority_score",None)

def cleanup_existing_candidates(incidents):
    verified=[x for x in incidents if x.get("status") in ("confirmed","possible")]
    raw=[x for x in incidents if x.get("status")=="candidate"]
    others=[x for x in incidents if x.get("status") not in ("confirmed","possible","candidate")]
    cleaned=[]; removed_noise=removed_verified=0
    for x in raw:
        y=dict(x)
        y["summary"]=clean_title(y.get("summary",""))
        if is_noise(y["summary"]):
            removed_noise+=1; continue
        inferred=company_from_title(y["summary"])
        current=trim_entity_tail(strip_region_prefix(y.get("company","")))
        y["company"]=inferred if looks_generic_company(current) or len(current)>28 else trim_entity_tail(current)
        y["affected_count"]=max(int(y.get("affected_count") or 0),extract_count(y["summary"]))
        y["sources"]=union_sources(y.get("sources"),[])
        y["article_count"]=max(int(y.get("article_count") or 0),len(y["sources"]) or 1)
        if any(verified_duplicate(y,v) for v in verified):
            removed_verified+=1; continue
        cleaned.append(y)

    merged=[]; merged_count=0
    cleaned.sort(key=lambda x:x.get("published",""))
    for x in cleaned:
        hit=None
        for i,m in enumerate(merged):
            if same_incident(x,m): hit=i; break
        if hit is None: merged.append(x)
        else:
            merged[hit]=merge_two(merged[hit],x); merged_count+=1

    assign_priorities(merged)
    stats={
        "candidate_before":len(raw),
        "removed_noise":removed_noise,
        "removed_verified_duplicates":removed_verified,
        "merged_candidate_records":merged_count,
        "candidate_after":len(merged),
    }
    return verified+others+merged,stats

def main():
    db=json.loads(DATA.read_text(encoding="utf-8"))
    incidents,cleanup_stats=cleanup_existing_candidates(db.get("incidents",[]))

    existing_urls={s.get("url") for x in incidents for s in x.get("sources",[]) if s.get("url")}
    existing_ids={x.get("id") for x in incidents if x.get("id")}
    verified=[x for x in incidents if x.get("status") in ("confirmed","possible")]
    candidates=[x for x in incidents if x.get("status")=="candidate"]

    today=datetime.now(JST).date().isoformat()
    added=merged_new=0

    for q in QUERIES:
        try:
            root=ET.fromstring(fetch(rss_url(q)))
        except Exception as e:
            print("feed error:",q,e); continue

        for item in root.findall("./channel/item"):
            title=text(item,"title"); link=text(item,"link"); pub=text(item,"pubDate")
            if not title or not link or link in existing_urls or is_noise(title): continue
            summary=clean_title(title)
            new_item={
                "id":"","published":today,"company":company_from_title(summary),"service":"",
                "affected_count":extract_count(summary),"status":"candidate","cause":"報道自動検知",
                "summary":summary,"exposed_data":"要確認",
                "sources":[{"name":"Googleニュース経由","url":link}],
                "auto_detected":True,"rss_pub_date":pub,"article_count":1,
            }
            if any(verified_duplicate(new_item,v) for v in verified):
                existing_urls.add(link); continue

            merged=False
            for i,old in enumerate(candidates):
                if same_incident(new_item,old):
                    candidates[i]=merge_two(old,new_item); merged_new+=1; merged=True; break

            if not merged:
                digest=hashlib.sha1((title+link).encode()).hexdigest()[:10]
                iid=f"{today}-auto-{digest}"
                if iid in existing_ids: continue
                new_item["id"]=iid
                candidates.append(new_item); existing_ids.add(iid); added+=1
            existing_urls.add(link)

    assign_priorities(candidates)
    non_candidates=[x for x in incidents if x.get("status")!="candidate"]
    incidents=non_candidates+candidates
    incidents.sort(key=lambda x:x.get("published",""),reverse=True)

    db["incidents"]=incidents
    db["last_updated"]=datetime.now(JST).strftime("%Y-%m-%d %H:%M JST")
    db["maintenance"]={
        "last_cleanup":db["last_updated"],**cleanup_stats,
        "new_candidates_added":added,"new_articles_merged":merged_new,
        "cleanup_version":"1.6",
    }
    DATA.write_text(json.dumps(db,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("cleanup:",json.dumps(cleanup_stats,ensure_ascii=False))
    print(f"added {added} candidate(s), merged {merged_new} new article(s)")

if __name__=="__main__":
    main()
