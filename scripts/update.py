#!/usr/bin/env python3
"""Daily detector + cleanup for Japanese privacy/data-breach incidents.

Policy:
- confirmed / possible rows are preserved as-is.
- candidate rows are automatically cleaned on every run.
- obvious advice/commentary articles are removed from candidates.
- candidate company names and affected counts are normalized from headlines.
- similar candidate articles are merged.
- candidates that appear to duplicate an already verified incident are removed.
- new discoveries are always stored as status='candidate'.
"""

import json
import re
import hashlib
import urllib.parse
import urllib.request
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

# 解説・一般論・注意喚起など、個別事件でない記事を候補から除外する。
NOISE_PATTERNS = [
    r"どう対処",
    r"対処法",
    r"対策(?:を|は|まとめ|方法)",
    r"注意(?:を|が必要|点)",
    r"使い回し",
    r"専門家",
    r"解説",
    r"基礎知識",
    r"とは[？?]?$",
    r"ランキング",
    r"まとめ記事",
    r"被害を防ぐ",
    r"身を守る",
    r"退会者らの情報削除",
    r"義務規定",
]

GENERIC_COMPANIES = {
    "", "要確認", "不正アクセス", "個人情報", "情報", "情報漏えい",
    "情報流出", "旅行予約", "サイバー攻撃", "ランサムウェア",
}

INCIDENT_WORDS = (
    "個人情報", "顧客情報", "会員情報", "情報漏えい", "情報漏洩",
    "漏えい", "漏洩", "流出", "不正アクセス", "ランサムウェア",
)

def rss_url(q):
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode({
        "q": q + " when:1d",
        "hl": "ja",
        "gl": "JP",
        "ceid": "JP:ja",
    })

def fetch(url):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "privacy-leak-tracker/1.2"}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()

def text(el, tag):
    n = el.find(tag)
    return (n.text or "").strip() if n is not None else ""

def clean_title(title):
    """Remove trailing media name from Google News style titles."""
    title = re.sub(r"\s+-\s+[^-]+$", "", title or "").strip()
    return title

def normalize_text(s):
    s = clean_title(s or "")
    s = s.normalize("NFKC") if hasattr(s, "normalize") else s
    # Python str has no normalize; kept below using unicodedata.
    return s

def nfkc(s):
    import unicodedata
    return unicodedata.normalize("NFKC", s or "")

def normalize(s):
    s = nfkc(clean_title(s))
    s = re.sub(r"^[【\[].*?[】\]]\s*", "", s)
    s = re.sub(r"[【\[].*?[】\]]", " ", s)
    s = re.sub(r"[「」『』（）()：:｜|／/・,，。!！?？]", " ", s)
    s = re.sub(
        r"(個人情報|顧客情報|会員情報|情報漏えい|情報漏洩|漏えい|漏洩|流出|"
        r"不正アクセス|ランサムウェア|サイバー攻撃|おそれ|可能性|被害|発表|調査結果)",
        " ",
        s,
    )
    s = re.sub(r"約?\d+(?:\.\d+)?\s*万?\s*(?:件|人|名|アカウント)?", " ", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s

def looks_generic_company(s):
    s = nfkc((s or "").strip())
    return s in GENERIC_COMPANIES or len(s) < 2 or len(s) > 55

def company_from_title(title):
    """Conservative Japanese headline entity extraction."""
    s = nfkc(clean_title(title))
    s = re.sub(r"^[【\[].*?[】\]]\s*", "", s)
    s = re.sub(r"^(?:速報|続報)\s*", "", s)

    patterns = [
        r"^(.+?)(?:で|が|に|の)(?:個人情報|顧客情報|会員情報|情報|不正アクセス|漏えい|漏洩|流出)",
        r"^(.+?)(?:、|：|:)",
        r"^(.+?)\s+(?:個人情報|顧客情報|会員情報|不正アクセス|漏えい|漏洩|流出)",
    ]
    for p in patterns:
        m = re.search(p, s)
        if m:
            candidate = m.group(1).strip(" 「」『』")
            candidate = re.sub(r"^(?:速報|続報)\s*", "", candidate)
            if 1 < len(candidate) <= 55:
                return candidate
    return s[:55].strip() or "要確認"

def extract_count(title):
    """Only extract explicit headline counts. No inference."""
    t = nfkc(title).replace(",", "").replace("，", "")

    # 例: 531万件 / 22.5万人 / 2251万9960件
    m = re.search(
        r"約?\s*(\d+(?:\.\d+)?)\s*万\s*(\d{1,4})?\s*(?:件|人|名|アカウント)?",
        t
    )
    if m:
        return int(float(m.group(1)) * 10000) + int(m.group(2) or 0)

    # 例: 6176件 / 180人
    m = re.search(r"約?\s*(\d{3,})\s*(?:件|人|名|アカウント)", t)
    if m:
        return int(m.group(1))

    return 0

def is_noise(title):
    t = nfkc(title)
    if not any(w in t for w in ("漏えい", "漏洩", "流出", "不正アクセス", "ランサムウェア")):
        return True
    if any(re.search(p, t) for p in NOISE_PATTERNS):
        return True
    return False

def safe_date(s):
    try:
        return date.fromisoformat((s or "")[:10])
    except Exception:
        return None

def date_distance(a, b):
    da, db = safe_date(a), safe_date(b)
    if da is None or db is None:
        return 9999
    return abs((da - db).days)

def entity_key(company, summary=""):
    c = normalize(company)
    if c and c not in GENERIC_COMPANIES and len(c) >= 2:
        # 企業名の過剰な記事文言を抑える
        return " ".join(c.split()[:6])

    t = normalize(summary)
    return " ".join(t.split()[:6])

def title_similarity(a, b):
    a1, b1 = normalize(a), normalize(b)
    if not a1 or not b1:
        return 0.0

    ratio = SequenceMatcher(None, a1, b1).ratio()
    ta, tb = set(a1.split()), set(b1.split())
    jaccard = len(ta & tb) / max(1, len(ta | tb))
    return max(ratio, jaccard)

def choose_company(a, b):
    """Prefer a short plausible entity over a headline-like long value."""
    candidates = [x for x in (a, b) if x and not looks_generic_company(x)]
    if not candidates:
        candidates = [x for x in (a, b) if x]
    if not candidates:
        return "要確認"
    return min(candidates, key=len)

def union_sources(a, b):
    out = []
    seen = set()
    for s in (a or []) + (b or []):
        url = (s or {}).get("url")
        if not url or url in seen:
            continue
        seen.add(url)
        out.append({
            "name": (s or {}).get("name") or "参照元",
            "url": url
        })
    return out

def merge_two(base, other):
    base["company"] = choose_company(base.get("company"), other.get("company"))
    base["affected_count"] = max(
        int(base.get("affected_count") or 0),
        int(other.get("affected_count") or 0),
    )
    base["sources"] = union_sources(base.get("sources"), other.get("sources"))
    base["article_count"] = int(base.get("article_count") or 1) + int(other.get("article_count") or 1)

    # 最初に公表された日を残す
    if other.get("published") and (
        not base.get("published") or other["published"] < base["published"]
    ):
        base["published"] = other["published"]

    # 情報量が多い方のsummaryを残す。ただし異常に長いものは避ける。
    bs, os = base.get("summary", ""), other.get("summary", "")
    if len(os) > len(bs) and len(os) <= 180:
        base["summary"] = os

    return base

def candidate_duplicate_of_verified(candidate, verified_rows):
    ck = entity_key(candidate.get("company", ""), candidate.get("summary", ""))
    if not ck:
        return False

    for v in verified_rows:
        vk = entity_key(v.get("company", ""), v.get("summary", ""))
        if not vk or ck != vk:
            continue
        if date_distance(candidate.get("published"), v.get("published")) <= 14:
            return True

        # 同名でも日付が離れる場合は、タイトル類似が高い時だけ重複扱い
        if title_similarity(candidate.get("summary", ""), v.get("summary", "")) >= 0.72:
            return True

    return False

def cleanup_existing_candidates(incidents):
    verified = [x for x in incidents if x.get("status") in ("confirmed", "possible")]
    raw_candidates = [x for x in incidents if x.get("status") == "candidate"]
    others = [x for x in incidents if x.get("status") not in ("confirmed", "possible", "candidate")]

    cleaned = []
    removed_noise = 0
    removed_verified_dupes = 0

    for x in raw_candidates:
        y = dict(x)
        y["summary"] = clean_title(y.get("summary", ""))

        if is_noise(y["summary"]):
            removed_noise += 1
            continue

        # 既存候補の企業名を補正
        current_company = y.get("company", "")
        inferred_company = company_from_title(y["summary"])
        if looks_generic_company(current_company) or len(current_company) > 45:
            y["company"] = inferred_company

        # 見出しで明示された件数を補完
        y["affected_count"] = max(
            int(y.get("affected_count") or 0),
            extract_count(y["summary"])
        )

        y["sources"] = union_sources(y.get("sources"), [])
        y["article_count"] = max(
            int(y.get("article_count") or 0),
            len(y["sources"]) or 1
        )

        if candidate_duplicate_of_verified(y, verified):
            removed_verified_dupes += 1
            continue

        cleaned.append(y)

    # 候補同士の重複統合:
    # 同一企業/対象で公表日が3日以内、かつタイトル類似度が一定以上なら統合。
    merged = []
    merged_count = 0

    cleaned.sort(key=lambda x: x.get("published", ""))
    for x in cleaned:
        matched = False
        x_key = entity_key(x.get("company", ""), x.get("summary", ""))

        for i, m in enumerate(merged):
            m_key = entity_key(m.get("company", ""), m.get("summary", ""))
            if not x_key or x_key != m_key:
                continue
            if date_distance(x.get("published"), m.get("published")) > 3:
                continue

            sim = title_similarity(x.get("summary", ""), m.get("summary", ""))
            same_count = (
                int(x.get("affected_count") or 0) > 0
                and int(x.get("affected_count") or 0) == int(m.get("affected_count") or 0)
            )

            if sim >= 0.48 or same_count:
                merged[i] = merge_two(m, x)
                merged_count += 1
                matched = True
                break

        if not matched:
            merged.append(x)

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

    # 1) 既存候補を先に清掃
    incidents, cleanup_stats = cleanup_existing_candidates(incidents)

    existing_urls = {
        s.get("url")
        for x in incidents
        for s in x.get("sources", [])
        if s.get("url")
    }
    existing_ids = {x.get("id") for x in incidents if x.get("id")}
    verified = [x for x in incidents if x.get("status") in ("confirmed", "possible")]
    candidates = [x for x in incidents if x.get("status") == "candidate"]

    today = datetime.now(JST).date().isoformat()

    added = 0
    merged_new_articles = 0

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
                "sources": [{"name": "Googleニュース経由", "url": link}],
                "auto_detected": True,
                "rss_pub_date": pub,
                "article_count": 1,
            }

            # すでに確認済み案件とみなせるなら候補を追加しない
            if candidate_duplicate_of_verified(new_item, verified):
                existing_urls.add(link)
                continue

            # 既存候補へ統合できるか
            nk = entity_key(company, summary)
            merged = False
            for idx, old in enumerate(candidates):
                ok = entity_key(old.get("company", ""), old.get("summary", ""))
                if not nk or nk != ok:
                    continue
                if date_distance(today, old.get("published")) > 3:
                    continue

                sim = title_similarity(summary, old.get("summary", ""))
                same_count = (
                    count > 0
                    and count == int(old.get("affected_count") or 0)
                )
                if sim >= 0.48 or same_count:
                    candidates[idx] = merge_two(old, new_item)
                    merged_new_articles += 1
                    merged = True
                    break

            if not merged:
                digest = hashlib.sha1((title + link).encode()).hexdigest()[:10]
                iid = f"{today}-auto-{digest}"
                if iid in existing_ids:
                    continue
                new_item["id"] = iid
                candidates.append(new_item)
                existing_ids.add(iid)
                added += 1

            existing_urls.add(link)

    # confirmed/possible/other は保持し、清掃後の candidates を戻す
    non_candidates = [x for x in incidents if x.get("status") != "candidate"]
    incidents = non_candidates + candidates
    incidents.sort(key=lambda x: x.get("published", ""), reverse=True)

    db["incidents"] = incidents
    db["last_updated"] = datetime.now(JST).strftime("%Y-%m-%d %H:%M JST")
    db["maintenance"] = {
        "last_cleanup": db["last_updated"],
        **cleanup_stats,
        "new_candidates_added": added,
        "new_articles_merged": merged_new_articles,
    }

    DATA.write_text(
        json.dumps(db, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )

    print("cleanup:", json.dumps(cleanup_stats, ensure_ascii=False))
    print(f"added {added} candidate(s), merged {merged_new_articles} new article(s)")

if __name__ == "__main__":
    main()
