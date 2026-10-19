#!/usr/bin/env python3
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

DATA_PATH = Path("data/incidents.json")
UPDATE_PATH = Path("data/candidate-update.json")


def load_incidents():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return data.get("incidents", []) if isinstance(data, dict) else data


# ---- candidate-filter.js と同じ表示判定ロジック ----

def norm(v=""):
    s = unicodedata.normalize("NFKC", str(v or "")).lower()
    s = re.sub(r"株式会社|有限会社|合同会社|ホールディングス", "", s)
    s = re.sub(r'[「」『』【】（）()\[\]・／/｜|\s　,:：\-—_]', "", s)
    return s.strip()


def days_apart(a, b):
    da = str(a or "")[:10]
    db = str(b or "")[:10]
    if not da or not db:
        return 9999
    try:
        from datetime import date
        ya, ma, daa = map(int, da.split("-"))
        yb, mb, dab = map(int, db.split("-"))
        return abs((date(ya, ma, daa) - date(yb, mb, dab)).days)
    except Exception:
        return 9999


def count_ratio(a, b):
    try:
        a = float(a or 0)
        b = float(b or 0)
    except Exception:
        return 0
    if a <= 0 or b <= 0:
        return 0
    return min(a, b) / max(a, b)


def leak_context(x):
    s = f"{x.get('company','')} {x.get('service','')} {x.get('summary','')}"
    return bool(re.search(
        r"漏えい|漏洩|流出|不正アクセス|サイバー攻撃|ランサムウェア|個人情報|会員情報|顧客情報|クレジット|免許証",
        s, re.I
    ))


def verified_tokens(v):
    out = []
    c = norm(v.get("company", ""))
    s = norm(v.get("service", ""))
    if len(c) >= 2:
        out.append(c)
    if len(s) >= 2:
        out.append(s)

    summary = str(v.get("summary", "") or "")
    for m in re.finditer(r"[「『](.{2,30}?)[」』]", summary):
        q = norm(m.group(1))
        if len(q) >= 2:
            out.append(q)

    seen = set()
    result = []
    for x in out:
        if x not in seen:
            seen.add(x)
            result.append(x)
    return result


def primary_text(x):
    return norm(f"{x.get('company','')} {x.get('service','')} {x.get('summary','')}")


def candidate_duplicates_verified(c, v):
    if not leak_context(c):
        return False

    cr = count_ratio(c.get("affected_count"), v.get("affected_count"))
    days = days_apart(c.get("published"), v.get("published"))
    ca = float(c.get("affected_count") or 0)
    va = float(v.get("affected_count") or 0)

    if ca >= 100000 and va >= 100000 and cr >= 0.98 and days <= 14:
        return True

    ct = primary_text(c)
    token_hit = any(t and t in ct for t in verified_tokens(v))
    if not token_hit:
        return False

    if cr >= 0.75 and days <= 120:
        return True

    context = f"{c.get('company','')} {c.get('summary','')}"
    if ca == 0 and days <= 60 and re.search(
        r"続報|第\d+報|最終報|調査結果|再開|変更|会員|利用者|怒り|免許証|被害|流出|漏えい|漏洩|不正アクセス",
        context, re.I
    ):
        return True

    return False


def candidate_duplicates_candidate(a, b):
    if not leak_context(a) or not leak_context(b):
        return False

    ac = float(a.get("affected_count") or 0)
    bc = float(b.get("affected_count") or 0)
    days = days_apart(a.get("published"), b.get("published"))
    ratio = count_ratio(ac, bc)

    if ac >= 100000 and bc >= 100000 and days <= 7 and ratio >= 0.995:
        return True
    if ac >= 1000000 and bc >= 1000000 and days <= 3 and ratio >= 0.98:
        return True

    aa = norm(a.get("company", ""))
    bb = norm(b.get("company", ""))
    if aa and bb and (aa in bb or bb in aa) and days <= 30:
        if ratio >= 0.8 or ac == 0 or bc == 0:
            return True

    return False


def uniq_sources(arr):
    out = []
    seen = set()
    for s in arr or []:
        u = (s or {}).get("url", "")
        if not u or u in seen:
            continue
        seen.add(u)
        out.append(s)
    return out


def merge_candidate(a, b):
    rep = a if len(a.get("sources", [])) >= len(b.get("sources", [])) else b
    x = dict(rep)
    x["affected_count"] = max(
        int(a.get("affected_count") or 0),
        int(b.get("affected_count") or 0)
    )
    x["sources"] = uniq_sources(
        list(a.get("sources", [])) + list(b.get("sources", []))
    )
    x["article_count"] = int(a.get("article_count") or 1) + int(b.get("article_count") or 1)

    ranks = {"A": 3, "B": 2, "C": 1}
    x["priority"] = (
        a.get("priority")
        if ranks.get(a.get("priority"), 0) >= ranks.get(b.get("priority"), 0)
        else b.get("priority")
    )
    x["priority_score"] = max(
        float(a.get("priority_score") or 0),
        float(b.get("priority_score") or 0)
    )

    ids = list(a.get("_candidateMergedIds") or ([a.get("id")] if a.get("id") else []))
    ids += list(b.get("_candidateMergedIds") or ([b.get("id")] if b.get("id") else []))
    x["_candidateMergedIds"] = list(dict.fromkeys(i for i in ids if i))
    x["_candidateMergedCount"] = len(x["_candidateMergedIds"])
    return x


def visible_candidates(incidents):
    verified = [
        x for x in incidents
        if x.get("status") in {"confirmed", "possible", "cleared"}
    ]

    raw = [
        x for x in incidents
        if x.get("status") == "candidate"
        and not any(candidate_duplicates_verified(x, v) for v in verified)
    ]

    merged = []
    for row in raw:
        idx = next(
            (i for i, x in enumerate(merged) if candidate_duplicates_candidate(x, row)),
            -1
        )
        if idx < 0:
            x = dict(row)
            x["_candidateMergedIds"] = [row.get("id")] if row.get("id") else []
            x["_candidateMergedCount"] = 1
            merged.append(x)
        else:
            merged[idx] = merge_candidate(merged[idx], row)
    return merged


# ---- 差分記録 ----

def compact_visible(x):
    return {
        "id": x.get("id", ""),
        "member_ids": list(x.get("_candidateMergedIds", [])),
        "priority": x.get("priority", ""),
        "published": x.get("published", ""),
        "company": x.get("company", ""),
        "service": x.get("service", ""),
        "affected_count": x.get("affected_count", 0),
        "summary": x.get("summary", ""),
    }


def group_is_same(a, b):
    a_ids = set(a.get("member_ids", []))
    b_ids = set(b.get("member_ids", []))
    if a_ids and b_ids and a_ids.intersection(b_ids):
        return True
    aid = a.get("id")
    bid = b.get("id")
    return bool(aid and bid and aid == bid)


def raw_candidate_count(incidents):
    return sum(1 for x in incidents if x.get("status") == "candidate")


def label(x):
    c = x.get("company", "") or ""
    s = x.get("service", "") or ""
    return f"{c} / {s}" if s else c or "(企業名なし)"


def fmt_count(v):
    try:
        n = int(v or 0)
    except Exception:
        n = 0
    return f"{n:,}件" if n > 0 else "非公表/調査中"


def esc(v):
    return str(v or "").replace("|", "\\|").replace("\n", " ")


def make_state():
    incidents = load_incidents()
    visible = [compact_visible(x) for x in visible_candidates(incidents)]
    return {
        "visible": visible,
        "raw_count": raw_candidate_count(incidents),
    }


def write_update_file(before, after, new_rows, removed_rows):
    visible_before = len(before["visible"])
    visible_after = len(after["visible"])
    payload = {
        "version": "1.1",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),

        # メイン表示はサイトと同じ「表示候補」
        "before_count": visible_before,
        "after_count": visible_after,
        "net_change": visible_after - visible_before,
        "new_count": len(new_rows),
        "removed_count": len(removed_rows),

        "visible_before_count": visible_before,
        "visible_after_count": visible_after,
        "visible_net_change": visible_after - visible_before,

        # 内部の生 candidate 件数は補足
        "raw_before_count": before["raw_count"],
        "raw_after_count": after["raw_count"],
        "raw_net_change": after["raw_count"] - before["raw_count"],

        "new_candidate_ids": [x.get("id", "") for x in new_rows if x.get("id")],
        "new_candidates": new_rows,
        "removed_candidates": removed_rows,
    }
    UPDATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    UPDATE_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in {"snapshot", "report"}:
        print("Usage: report_candidate_changes.py {snapshot|report} <snapshot-file>")
        raise SystemExit(2)

    mode = sys.argv[1]
    snapfile = Path(sys.argv[2])

    if mode == "snapshot":
        state = make_state()
        snapfile.write_text(
            json.dumps(state, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        print(
            f"Snapshot saved: visible {len(state['visible'])}, "
            f"raw {state['raw_count']} candidates"
        )
        return

    before = json.loads(snapfile.read_text(encoding="utf-8"))
    after = make_state()

    before_rows = before["visible"]
    after_rows = after["visible"]

    new_rows = [
        x for x in after_rows
        if not any(group_is_same(x, old) for old in before_rows)
    ]
    removed_rows = [
        x for x in before_rows
        if not any(group_is_same(x, now) for now in after_rows)
    ]

    write_update_file(before, after, new_rows, removed_rows)

    vb, va = len(before_rows), len(after_rows)
    vnet = va - vb
    rnet = after["raw_count"] - before["raw_count"]
    vsign = "+" if vnet > 0 else ""
    rsign = "+" if rnet > 0 else ""

    headline = (
        f"新規表示候補 {len(new_rows)}件 / "
        f"表示候補総数 {vb} → {va}件 "
        f"(差分 {vsign}{vnet})"
    )
    rawline = (
        f"内部candidate生データ "
        f"{before['raw_count']} → {after['raw_count']}件 "
        f"(差分 {rsign}{rnet})"
    )

    print("\n=== 要確認候補 更新結果 ===")
    print(headline)
    print(rawline)

    if new_rows:
        print("\n新たに表示対象となった候補:")
        for i, x in enumerate(new_rows, 1):
            print(
                f"{i}. [{x.get('priority') or '-'}] "
                f"{x.get('published') or '-'} "
                f"{label(x)} ({fmt_count(x.get('affected_count'))})"
            )
            if x.get("id"):
                print(f"   ID: {x['id']}")
            if x.get("summary"):
                print(f"   {x['summary']}")
    else:
        print("\n新規の表示候補はありません。")

    if new_rows:
        print(f"::notice title=要確認候補::{headline}")
    else:
        print(
            f"::notice title=要確認候補::"
            f"新規表示候補なし / 表示候補総数 {va}件"
        )

    summary = os.getenv("GITHUB_STEP_SUMMARY")
    if summary:
        lines = [
            "## 要確認候補 更新結果",
            "",
            f"**{headline}**",
            "",
            f"補足：{rawline}",
            "",
        ]

        if new_rows:
            lines += [
                "### 新たに表示対象となった候補",
                "",
                "| 優先度 | 公表日 | 企業・サービス | 対象規模 | Incident ID |",
                "|---|---|---|---:|---|",
            ]
            for x in new_rows:
                lines.append(
                    f"| {esc(x.get('priority') or '-')} | "
                    f"{esc(x.get('published') or '-')} | "
                    f"{esc(label(x))} | "
                    f"{esc(fmt_count(x.get('affected_count')))} | "
                    f"`{esc(x.get('id') or '-')}` |"
                )
            lines += ["", "#### 概要", ""]
            for x in new_rows:
                lines.append(
                    f"- **{esc(label(x))}** — "
                    f"{esc(x.get('summary') or '概要なし')}"
                )
            lines.append("")
        else:
            lines += ["✅ 今回、新たな表示候補はありません。", ""]

        if removed_rows:
            lines += [
                f"### 表示候補から外れた案件：{len(removed_rows)}件",
                "",
            ]
            for x in removed_rows:
                lines.append(
                    f"- {esc(label(x))} (`{esc(x.get('id') or '-')}`)"
                )
            lines.append("")

        with open(summary, "a", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
