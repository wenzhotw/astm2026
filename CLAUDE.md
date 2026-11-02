# CLAUDE.md

這個專案的完整開發說明在 [`AGENTS.md`](AGENTS.md)，請先讀它，再讀 [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md)。

最重要的四條：
1. 真實學員名單（姓名、學號、Email、手機）絕對不能 commit，只能用 `tools/build.py` 產生到 `dist/`。
2. 介面用繁體中文、全形標點，不要用破折號。
3. 保持 `index.html` 單一檔案，不要動 `/*CONFIG:BEGIN*/`、`/*CONFIG:END*/` 標記。
4. 改完跑 `npm test`，並實際打開頁面看桌機與手機畫面。
