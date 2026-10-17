#!/usr/bin/env python3
"""Daily detector + stronger cleanup for Japanese privacy/data-breach incidents.

v1.3
- confirmed / possible rows are preserved.
- candidate rows are cleaned every run.
- advice/commentary articles are removed.
- company/entity names are normalized more aggressively.
- candidate duplicates are merged using entity/date/count/title similarity.
- candidates duplicating verified incidents are removed using entity/date/count rules.
- new discoveries are added only as candidate.
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

MEDIA_SUFFIXES = [
    "nhk", "nhkニュース", "itmedia", "itmedia news", "itmedia ビジネスオンライン",
    "日本経済新聞", "朝日新聞", "読売新聞", "毎日新聞", "産経新聞",
    "47news", "共同通信", "時事通信", "abema", "abema times",
    "yahoo!ニュース", "yahooニュース", "河北新報オンライン",
    "西日本新聞me", "stV札幌テレビ", "テレビ朝日", "tbs news dig",
]

LEGAL_SUFFIXES = (
    "株式会社", "有限会社", "合同会社", "一般社団法人", "公益社団法人",
    "一般財団法人", "公益財団法人", "社会福祉法人", "学校法人",
)

def nfkc(s):
    return unicodedata.normalize("NFKC", s or "")

def rss_url(q):
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode({
        "q": q + " when:1d",
        "hl": "ja", "gl": "JP", "ceid": "JP:ja",
    })

def fetch(url):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "privacy-leak-tracker/1.3"}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

def text(el, tag):
    n = el.find(tag)
    return (n.text or "").strip() if n is not None else ""

def clean_title(title):
    s = nfkc(title)
    # Google News: headline - media
    s = re.sub(r"\s+-\s+[^-]+$", "", s).strip()
    s = re.sub(r"^[【\[]\s*(?:速報|続報|独自|更新)[^】\]]*[】\]]\s*", "", s)
    return s.strip()

def strip_region_prefix(s):
    s = nfkc(s)
    s = re.sub(r"^[【\[]([^】\]]*(?:都|道|府|県|市|区|町|村))[^】\]]*[】\]]\s*", "", s)
    return s.strip()

def strip_media_suffix(s):
    t = nfkc(s).strip()
    low = t.lower()
    for m in MEDIA_SUFFIXES:
        ml = nfkc(m).lower()
        if low.endswith(" " + ml):
            t = t[:-(len(m)+1)].strip()
            break
    return t

def normalize(s):
    s = strip_region_prefix(strip_media_suffix(clean_title(s)))
    s = re.sub(r"[【\[].*?[】\]]", " ", s)
    s = re.sub(r"[「」『』（）()：:｜|／/・,，。!！?？]", " ", s)
    s = re.sub(
        r"(個人情報|顧客情報|会員情報|情報漏えい|情報漏洩|漏えい|漏洩|流出|"
        r"不正アクセス|ランサムウェア|サイバー攻撃|おそれ|可能性|被害|"
        r"発表|調査結果|約?\d+(?:\.\d+)?\s*万?\s*(?:件|人|名|アカウント)?)",
        " ",
        s,
    )
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s

def company_from_title(title):
    s = strip_region_prefix(clean_title(title))
    s = re.sub(r"^(?:速報|続報)\s*", "", s)

    # 先頭の主体を抜く。典型的なニュース表現をかなり広く吸収する。
    patterns = [
        r"^(.+?)(?:で|が|に|の)(?:個人情報|顧客情報|会員情報|情報漏えい|情報漏洩|情報流出|漏えい|漏洩|流出|不正アクセス|ランサムウェア)",
        r"^(.+?)(?:、|：|:)",
        r"^(.+?)\s+(?:個人情報|顧客情報|会員情報|情報漏えい|情報流出|漏えい|流出|不正アクセス|ランサムウェア)",
        r"^(.+?)\s+(?:電話番号|メールアドレス|住所|氏名|会員情報).*?(?:漏えい|流出)",
    ]

    for p in patterns:
        m = re.search(p, s)
        if m:
            candidate = m.group(1).strip(" 「」『』")
            candidate = re.sub(r"^(?:速報|続報)\s*", "", candidate)
            # 見出しの修飾語を削る
            candidate = re.sub(r"\s+(?:電話番号など|メールアドレスなど|約?\d.*)$", "", candidate)
            if 1 < len(candidate) <= 40:
                return candidate

    # 「ヤマト運輸 電話番号など約531万件...」型
    m = re.match(r"^(.{2,25}?)\s+(?:電話番号|メールアドレス|住所|氏名|顧客|会員|個人情報)", s)
    if m:
        return m.group(1).strip()

    # 法人格があればそこまで優先
    for suffix in LEGAL_SUFFIXES:
        pos = s.find(suffix)
        if 0 <= pos <= 25:
            end = pos + len(suffix)
            return s[:end].strip()

    # 最後の手段: 最初の空白区切り2語まで
    words = s.split()
    if words:
        return " ".join(words[:2])[:40]
    return "要確認"

def looks_generic_company(s):
    s = nfkc((s or "").strip())
    return s in GENERIC_COMPANIES or len(s) < 2 or len(s) > 45

def extract_count(title):
    t = nfkc(title).replace(",", "").replace("，", "")

    m = re.search(
        r"約?\s*(\d+(?:\.\d+)?)\s*万\s*(\d{1,4})?\s*(?:件|人|名|アカウント)?",
        t
    )
    if m:
        return int(float(m.group(1))*10000) + int(m.group(2) or 0)

    m = re.search(r"約?\s*(\d{3,})\s*(?:件|人|名|アカウント)", t)
    return int(m.group(1)) if m else 0

def is_noise(title):
    t = nfkc(title)
    if not re.search(r"(漏えい|漏洩|流出|不正アクセス|ランサムウェア)", t):
        return True
    return any(re.search(p, t) for p in NOISE_PATTERNS)

def safe_date(s):
    try:
        return date.fromisoformat((s or "")[:10])
    except Exception:
        return None

def date_distance(a, b):
    da, db = safe_date(a), safe_date(b)
    if not da or not db:
        return 9999
    return abs((da - db).days)

def entity_key(company, summary=""):
    c = normalize(company)
    if c and c not in GENERIC_COMPANIES and len(c) >= 2:
        return " ".join(c.split()[:5])

    t = normalize(summary)
    return " ".join(t.split()[:5])

def title_similarity(a, b):
    a1, b1 = normalize(a), normalize(b)
    if not a1 or not b1:
        return 0.0
    ratio = SequenceMatcher(None, a1, b1).ratio()
    ta, tb = set(a1.split()), set(b1.split())
    jaccard = len(ta & tb) / max(1, len(ta | tb))
    return max(ratio, jaccard)

def choose_company(a, b):
    vals = []
    for x in (a, b):
        if not x:
            continue
        x2 = company_from_title(x) if len(x) > 40 else strip_region_prefix(x)
        if not looks_generic_company(x2):
            vals.append(x2)
    if vals:
        return min(vals, key=len)
    return (a or b or "要確認")[:40]

def union_sources(a, b):
    out, seen = [], set()
    for s in (a or []) + (b or []):
        url = (s or {}).get("url")
        if not url or url in seen:
            continue
        seen.add(url)
        out.append({"name": (s or {}).get("name") or "参照元", "url": url})
    return out

def merge_two(base, other):
    base["company"] = choose_company(base.get("company"), other.get("company"))
    base["affected_count"] = max(
        int(base.get("affected_count") or 0),
        int(other.get("affected_count") or 0),
    )
    base["sources"] = union_sources(base.get("sources"), other.get("sources"))
    base["article_count"] = int(base.get("article_count") or 1) + int(other.get("article_count") or 1)

    if other.get("published") and (
        not base.get("published") or other["published"] < base["published"]
    ):
        base["published"] = other["published"]

    bs, os = base.get("summary", ""), other.get("summary", "")
    if len(os) > len(bs) and len(os) <= 180:
        base["summary"] = os

    return base

def same_incident(a, b):
    """Candidate/verified or candidate/candidate incident matcher."""
    ak = entity_key(a.get("company",""), a.get("summary",""))
    bk = entity_key(b.get("company",""), b.get("summary",""))
    if not ak or not bk or ak != bk:
        return False

    dd = date_distance(a.get("published"), b.get("published"))
    ac, bc = int(a.get("affected_count") or 0), int(b.get("affected_count") or 0)
    sim = title_similarity(a.get("summary",""), b.get("summary",""))

    # 同じ対象・同じ件数はかなり強い
    if ac > 0 and bc > 0 and ac == bc and dd <= 21:
        return True

    # 一方だけ件数判明でも日付が近くタイトルも似る
    if dd <= 5 and sim >= 0.38:
        return True

    # 件数不明同士は少し厳しめ
    if ac == 0 and bc == 0 and dd <= 3 and sim >= 0.52:
        return True

    return False

def cleanup_existing_candidates(incidents):
    verified = [x for x in incidents if x.get("status") in ("confirmed","possible")]
    raw_candidates = [x for x in incidents if x.get("status") == "candidate"]
    others = [x for x in incidents if x.get("status") not in ("confirmed","possible","candidate")]

    cleaned = []
    removed_noise = removed_verified_dupes = 0

    for x in raw_candidates:
        y = dict(x)
        y["summary"] = clean_title(y.get("summary",""))

        if is_noise(y["summary"]):
            removed_noise += 1
            continue

        inferred = company_from_title(y["summary"])
        current = y.get("company","")
        if looks_generic_company(current) or len(current) > 32:
            y["company"] = inferred
        else:
            # 地域タグや速報語だけは既存名からも除去
            y["company"] = strip_region_prefix(current)

        y["affected_count"] = max(
            int(y.get("affected_count") or 0),
            extract_count(y["summary"])
        )
        y["sources"] = union_sources(y.get("sources"), [])
        y["article_count"] = max(int(y.get("article_count") or 0), len(y["sources"]) or 1)

        if any(same_incident(y, v) for v in verified):
            removed_verified_dupes += 1
            continue

        cleaned.append(y)

    merged = []
    merged_count = 0
    cleaned.sort(key=lambda x: x.get("published",""))

    for x in cleaned:
        hit = None
        for i, m in enumerate(merged):
            if same_incident(x, m):
                hit = i
                break
        if hit is None:
            merged.append(x)
        else:
            merged[hit] = merge_two(merged[hit], x)
            merged_count += 1

    stats = {
        "candidate_before": len(raw_candidates),
        "removed_noise": removed_noise,
        "removed_verified_duplicates": removed_verified_dupes,
        "merged_candidate_records": merged_count,
        "candidate_after": len(merged),
    }
    return verified + others + merged, stats

def main():
    db = json.loads(DATA.read_text(encoding="utf-8"))
    incidents = db.get("incidents", [])

    incidents, cleanup_stats = cleanup_existing_candidates(incidents)

    existing_urls = {
        s.get("url")
        for x in incidents
        for s in x.get("sources", [])
        if s.get("url")
    }
    existing_ids = {x.get("id") for x in incidents if x.get("id")}
    verified = [x for x in incidents if x.get("status") in ("confirmed","possible")]
    candidates = [x for x in incidents if x.get("status") == "candidate"]

    today = datetime.now(JST).date().isoformat()
    added = merged_new_articles = 0

    for q in QUERIES:
        try:
            root = ET.fromstring(fetch(rss_url(q)))
        except Exception as e:
            print("feed error:", q, e)
            continue

        for item in root.findall("./channel/item"):
            title = text(item, "title")
            link = text(item, "link")
            pub = text(item, "pubDate")

            if not title or not link or link in existing_urls or is_noise(title):
                continue

            summary = clean_title(title)
            company = company_from_title(summary)
            count = extract_count(summary)

            new_item = {
                "id": "",
                "published": today,
                "company": company,
                "service": "",
                "affected_count": count,
                "status": "candidate",
                "cause": "報道自動検知",
                "summary": summary,
                "exposed_data": "要確認",
                "sources": [{"name":"Googleニュース経由","url":link}],
                "auto_detected": True,
                "rss_pub_date": pub,
                "article_count": 1,
            }

            if any(same_incident(new_item, v) for v in verified):
                existing_urls.add(link)
                continue

            merged = False
            for i, old in enumerate(candidates):
                if same_incident(new_item, old):
                    candidates[i] = merge_two(old, new_item)
                    merged_new_articles += 1
                    merged = True
                    break

            if not merged:
                digest = hashlib.sha1((title+link).encode()).hexdigest()[:10]
                iid = f"{today}-auto-{digest}"
                if iid in existing_ids:
                    continue
                new_item["id"] = iid
                candidates.append(new_item)
                existing_ids.add(iid)
                added += 1

            existing_urls.add(link)

    non_candidates = [x for x in incidents if x.get("status") != "candidate"]
    incidents = non_candidates + candidates
    incidents.sort(key=lambda x: x.get("published",""), reverse=True)

    db["incidents"] = incidents
    db["last_updated"] = datetime.now(JST).strftime("%Y-%m-%d %H:%M JST")
    db["maintenance"] = {
        "last_cleanup": db["last_updated"],
        **cleanup_stats,
        "new_candidates_added": added,
        "new_articles_merged": merged_new_articles,
        "cleanup_version": "1.3",
    }

    DATA.write_text(
        json.dumps(db, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )

    print("cleanup:", json.dumps(cleanup_stats, ensure_ascii=False))
    print(f"added {added} candidate(s), merged {merged_new_articles} new article(s)")

if __name__ == "__main__":
    main()
