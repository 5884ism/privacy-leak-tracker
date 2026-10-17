# 個人情報漏えいトラッカー

静的Webサイト + JSONデータ + GitHub Actionsで動く、国内の個人情報漏えい案件トラッカーです。

## 構成
- `index.html` : 一覧画面
- `styles.css` : デザイン
- `app.js` : 検索・絞り込み・統計
- `data/incidents.json` : 公開データ本体
- `scripts/update.py` : 毎日の報道候補収集
- `.github/workflows/daily-update.yml` : 毎日06:10 JSTに自動実行

## 公開方法（おすすめ）
### Cloudflare Pages
1. このフォルダをGitHubリポジトリにpush
2. Cloudflare Pages → Git連携 → 対象リポジトリを選択
3. Framework preset: `None`
4. Build command: 空欄
5. Build output directory: `/`
6. 保存してデプロイ

GitHub Actionsが `data/incidents.json` を更新してpushすると、Cloudflare Pages側が自動的に再デプロイします。

### GitHub Pages
Settings → Pages → Deploy from a branch → `main` / root を指定します。

## 自動更新仕様
GoogleニュースRSSを3種類の検索語で毎日確認します。
新規検出記事は `status: candidate`（報道検知・要確認）として自動追加します。

> 重要: ニュース記事タイトルだけでは、正確な漏えい件数・対象データ・確定/可能性の判定ができません。そのため自動検知段階では件数0・要確認で登録します。公式発表確認後にJSONを編集し `confirmed` / `possible` に昇格させる運用を推奨します。

## incidents.json の主要項目
```json
{
  "id": "一意ID",
  "published": "2026-10-15",
  "company": "ソースネクスト",
  "service": "会員情報取得API",
  "affected_count": 22519960,
  "status": "confirmed",
  "cause": "API不正利用",
  "summary": "概要",
  "exposed_data": "漏えい情報",
  "sources": [{"name":"公式", "url":"https://..."}]
}
```

## 運用上のおすすめ
- `candidate` は毎朝確認する
- 企業公式発表がある場合は必ず公式URLを第一ソースにする
- 件数は「人数」「アカウント数」「レコード数」を混在させず、注記する
- 同一インシデントが複数社に波及した場合、親案件IDを追加すると後で集計しやすい
- 6か月より古い案件を非表示にしたい場合は、表示側で日付フィルタを追加可能
