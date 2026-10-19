#!/usr/bin/env python3
import json, os, sys
from pathlib import Path

DATA_PATH = Path("data/incidents.json")

def load_incidents():
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return data.get("incidents", []) if isinstance(data, dict) else data

def key(x):
    if x.get("id"):
        return "id:" + str(x["id"])
    return "fallback:" + "|||".join(str(x.get(k,"")) for k in ("company","service","published","summary"))

def compact(x):
    return {
        "key": key(x),
        "id": x.get("id",""),
        "priority": x.get("priority",""),
        "published": x.get("published",""),
        "company": x.get("company",""),
        "service": x.get("service",""),
        "affected_count": x.get("affected_count",0),
        "summary": x.get("summary",""),
    }

def candidates():
    return [compact(x) for x in load_incidents() if x.get("status") == "candidate"]

def label(x):
    return f'{x.get("company","")} / {x.get("service","")}' if x.get("service") else x.get("company","(企業名なし)")

def fmt_count(v):
    try:
        n = int(v or 0)
    except Exception:
        n = 0
    return f"{n:,}件" if n > 0 else "非公表/調査中"

def esc(v):
    return str(v or "").replace("|","\\|").replace("\n"," ")

mode, snapfile = sys.argv[1], Path(sys.argv[2])

if mode == "snapshot":
    rows = candidates()
    snapfile.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Snapshot saved: {len(rows)} candidates")
    raise SystemExit

before = json.loads(snapfile.read_text(encoding="utf-8"))
after = candidates()
bm = {x["key"]: x for x in before}
am = {x["key"]: x for x in after}

new_rows = [am[k] for k in am if k not in bm]
removed_rows = [bm[k] for k in bm if k not in am]

before_count, after_count = len(before), len(after)
net = after_count - before_count
sign = "+" if net > 0 else ""
headline = f"新規候補 {len(new_rows)}件 / 候補総数 {before_count} → {after_count}件 (差分 {sign}{net})"

print("\n=== 要確認候補 更新結果 ===")
print(headline)

if new_rows:
    print("\n新たに追加された候補:")
    for i, x in enumerate(new_rows, 1):
        print(f"{i}. [{x.get('priority') or '-'}] {x.get('published') or '-'} {label(x)} ({fmt_count(x.get('affected_count'))})")
        if x.get("id"): print(f"   ID: {x['id']}")
        if x.get("summary"): print(f"   {x['summary']}")
else:
    print("\n新規候補はありません。")

if removed_rows:
    print(f"\n候補から外れた案件: {len(removed_rows)}件")
    for x in removed_rows:
        print(f"- {label(x)} [{x.get('id') or '-'}]")

if new_rows:
    print(f"::notice title=要確認候補::{headline}")
else:
    print(f"::notice title=要確認候補::新規候補なし / 候補総数 {after_count}件")

summary = os.getenv("GITHUB_STEP_SUMMARY")
if summary:
    lines = ["## 要確認候補 更新結果", "", f"**{headline}**", ""]
    if new_rows:
        lines += [
            "### 新たに追加された候補", "",
            "| 優先度 | 公表日 | 企業・サービス | 対象規模 | Incident ID |",
            "|---|---|---|---:|---|"
        ]
        for x in new_rows:
            lines.append(f"| {esc(x.get('priority') or '-')} | {esc(x.get('published') or '-')} | {esc(label(x))} | {esc(fmt_count(x.get('affected_count')))} | `{esc(x.get('id') or '-')}` |")
        lines += ["", "#### 概要", ""]
        for x in new_rows:
            lines.append(f"- **{esc(label(x))}** — {esc(x.get('summary') or '概要なし')}")
        lines.append("")
    else:
        lines += ["✅ 今回、新たな要確認候補はありません。", ""]
    if removed_rows:
        lines += [f"### 候補から外れた案件：{len(removed_rows)}件", ""]
        for x in removed_rows:
            lines.append(f"- {esc(label(x))} (`{esc(x.get('id') or '-')}`)")
        lines.append("")
    with open(summary, "a", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
