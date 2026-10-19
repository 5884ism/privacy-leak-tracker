name: Daily privacy incident update

on:
  schedule:
    # GitHub Actions uses UTC.
    # 21:10 UTC = 06:10 JST
    - cron: '10 21 * * *'

  workflow_dispatch:

permissions:
  contents: write

jobs:
  update:
    runs-on: ubuntu-slim

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Update incidents
        run: python scripts/update.py

      - name: Check official follow-up announcements
        run: python scripts/check_official_updates.py

      - name: Commit changes
        run: |
          git config user.name "privacy-leak-bot"
          git config user.email "github-actions[bot]@users.noreply.github.com"

          git add data/incidents.json

          if git diff --cached --quiet; then
            echo "No changes"
            exit 0
          fi

          git commit -m "chore: daily incident and official update check"
          git push
