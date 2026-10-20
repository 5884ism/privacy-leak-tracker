#!/usr/bin/env python3
"""
Normalize source display names.

Goals:
- Google News RSS sources display the publisher/media name where available.
- Existing generic "Googleニュース経由" rows are enriched best-effort.
- Duplicate sources from the same publisher are reduced to one representative link.
- If the publisher cannot be identified, keep at most one "Googleニュース" link.

Usage:
  python scripts/normalize_source_names.py
  python scripts/normalize_source_names.py --full
"""
import argparse
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "incidents.json"

QUERIES = [
    "個人情報 漏えい OR 流出 不正アクセス",
    "情報漏えい 顧客情報 不正アクセス",
    "ランサムウェア 個人情報 漏えい",
]

GENERIC_NAMES = {
    "", "参照元", "情報源", "Googleニュース経由", "Googleニュース", "Google News"
}

DOMAIN_NAMES = {
    "itmedia.co.jp": "ITmedia NEWS",
    "internet.watch.impress.co.jp": "INTERNET Watch",
    "watch.impress.co.jp": "Impress Watch",
    "security-next.com": "Security NEXT",
    "scan.netsecurity.ne.jp": "ScanNetSecurity",
    "nhk.or.jp": "NHK",
    "news.ntv.co.jp": "日テレNEWS",
    "news.tv-asahi.co.jp": "テレビ朝日（ANN）",
    "newsdig.tbs.co.jp": "TBS NEWS DIG",
    "fnn.jp": "FNNプライムオンライン",
    "news.yahoo.co.jp": "Yahoo!ニュース",
    "nikkei.com": "日本経済新聞",
    "asahi.com": "朝日新聞",
    "yomiuri.co.jp": "読売新聞",
    "mainichi.jp": "毎日新聞",
    "jiji.com": "時事通信",
    "kyodonews.jp": "共同通信",
    "47news.jp": "47NEWS",
    "sankei.com": "産経新聞",
    "iza.ne.jp": "iza",
    "nordot.app": "共同通信系ニュース",
}

MEDIA_HINTS = [
    "ITmedia NEWS", "INTERNET Watch", "Impress Watch", "Security NEXT",
    "ScanNetSecurity", "NHK", "日テレNEWS", "テレビ朝日", "ANN",
    "TBS NEWS DIG", "FNNプライムオンライン", "日本経済新聞", "日経",
    "朝日新聞", "読売新聞", "毎日新聞", "時事通信", "共同通信",
    "47NEWS", "産経新聞", "Yahoo!ニュース", "ASCII.jp", "ZDNET Japan",
]

def text(el, tag):
    n = el.find(tag)
    return (n.text or "").strip() if n is not None else ""

def rss_url(q, days):
    return "https://news.google.com/rss/search?" + urllib.parse.urlencode({
        "q": f"{q} when:{days}d",
        "hl": "ja",
        "gl": "JP",
        "ceid": "JP:ja",
    })

def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 privacy-leak-tracker/1.4"
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read(), r.geturl()

def publisher_from_rss(days):
    mapping = {}
    for q in QUERIES:
        try:
            body, _ = fetch(rss_url(q, days), timeout=30)
            root = ET.fromstring(body)
        except Exception as e:
            print("rss mapping error:", q, e)
            continue

        for item in root.findall("./channel/item"):
            link = text(item, "link")
            source = text(item, "source")
            if link and source:
                mapping[link] = clean_name(source)
    return mapping

def clean_name(name):
    s = re.sub(r"\s+", " ", str(name or "")).strip()
    if s in {"Googleニュース経由", "Google News", "Googleニュース"}:
        return "Googleニュース"
    return s or "Googleニュース"

def domain_name(url):
    try:
        host = urlparse(url).hostname or ""
        host = host.lower().removeprefix("www.")
    except Exception:
        return ""

    for domain, name in DOMAIN_NAMES.items():
        if host == domain or host.endswith("." + domain):
            return name

    if host and "news.google.com" not in host:
        # Last-resort readable domain label.
        parts = host.split(".")
        if len(parts) >= 2:
            return ".".join(parts[-2:])
        return host
    return ""

def resolve_google(url):
    try:
        _, final_url = fetch(url, timeout=8)
    except Exception:
        return "", ""

    name = domain_name(final_url)
    if name:
        return name, final_url
    return "", ""

def infer_from_summary(summary):
    s = str(summary or "").strip()

    # Prefer known media hints.
    for hint in MEDIA_HINTS:
        if hint.lower() in s.lower():
            if hint == "ANN":
                return "テレビ朝日（ANN）"
            if hint == "日経":
                return "日本経済新聞"
            return hint

    # Fallback: a short final parenthetical often contains the publisher.
    m = re.search(r"[（(]([^（）()]{2,40})[）)]\s*$", s)
    if m:
        candidate = m.group(1).strip()
        bad = ("件", "人", "漏えい", "漏洩", "不正アクセス", "可能性", "調査中")
        if not any(x in candidate for x in bad):
            return candidate
    return ""

def source_key(name):
    return re.sub(r"[\s　・／/（）()\[\]【】\-—_:：]+", "", clean_name(name)).lower()

def normalize_sources(incident, rss_map, resolve_unknown=False):
    sources = incident.get("sources") or []
    summary = incident.get("summary") or ""
    summary_media = infer_from_summary(summary)

    normalized = []
    generic_google_seen = False

    generic_google_count = sum(
        1 for s in sources
        if clean_name((s or {}).get("name")) in {"Googleニュース", "Googleニュース経由"}
        or "news.google.com" in str((s or {}).get("url") or "")
    )

    for idx, src in enumerate(sources):
        if not isinstance(src, dict):
            continue
        url = str(src.get("url") or "").strip()
        if not url:
            continue

        official = bool(src.get("official"))
        old_name = clean_name(src.get("name"))

        if official:
            name = old_name if old_name not in GENERIC_NAMES else "公式発表"
            normalized.append({**src, "name": name, "url": url, "official": True})
            continue

        name = old_name
        is_google = "news.google.com" in url or old_name in {"Googleニュース", "Googleニュース経由"}

        if is_google:
            if url in rss_map:
                name = rss_map[url]
            else:
                mapped = domain_name(url)
                if mapped:
                    name = mapped
                elif resolve_unknown:
                    resolved_name, resolved_url = resolve_google(url)
                    if resolved_name:
                        name = resolved_name
                        # Keep the original Google News URL so stored links remain stable.
                elif generic_google_count == 1 and summary_media:
                    # With one Google source, the summary's publisher is a safe label.
                    name = summary_media
                else:
                    name = "Googleニュース"
        elif old_name in GENERIC_NAMES:
            name = domain_name(url) or summary_media or "情報源"

        normalized.append({**src, "name": clean_name(name), "url": url})

    # One representative link per publisher/media. Keep all official URLs.
    out = []
    seen_media = set()
    for src in normalized:
        if src.get("official"):
            out.append(src)
            continue

        k = source_key(src.get("name"))
        if not k:
            k = source_key(domain_name(src.get("url")) or "Googleニュース")
        if k in seen_media:
            continue
        seen_media.add(k)
        out.append(src)

    return out

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--full", action="store_true",
                   help="Broader RSS lookup + best-effort Google News redirects for existing data")
    args = p.parse_args()

    db = json.loads(DATA.read_text(encoding="utf-8"))
    incidents = db.get("incidents", [])

    days = 365 if args.full else 7
    rss_map = publisher_from_rss(days)

    changed_incidents = 0
    source_before = source_after = 0

    for x in incidents:
        before = x.get("sources") or []
        source_before += len(before)
        after = normalize_sources(
            x,
            rss_map,
            resolve_unknown=args.full,
        )
        source_after += len(after)
        if after != before:
            x["sources"] = after
            changed_incidents += 1

    DATA.write_text(
        json.dumps(db, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8"
    )
    print(
        f"source normalization: incidents changed={changed_incidents}, "
        f"sources {source_before} -> {source_after}, rss mappings={len(rss_map)}"
    )

if __name__ == "__main__":
    main()
