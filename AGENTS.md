# AGENTS.md：給 AI 助理與開發者的說明

這份文件寫給之後接手的助教，以及助教使用的 AI 助理（Claude、ChatGPT、Copilot 等）。動手改之前請先讀完。人類使用者看的說明在 `README.md`。

---

## 1. 專案一句話

課程作業繳交系統：學員寫個人心得（自動排成 A4 PDF）、組長上傳小組報告、組間互評、老師批改與下載。

同一份前端 `index.html` 有兩種模式，由 `BACKEND` 常數自動判斷：
- **展示模式**（直接用瀏覽器開）：沒有 `google.script.run`，資料只在記憶體 `DB`。
- **正式模式**（放進 Google Apps Script）：有 `google.script.run`，所有讀寫透過 `api()` 呼叫 `gas/Code.gs`，資料存在 Google 試算表和雲端硬碟。

部署步驟見 `docs/DEPLOY.md`，後端設計見 `docs/PRODUCTION.md`。需求與設計決定的來龍去脈見 `docs/REQUIREMENTS.md`。**改功能前先查 REQUIREMENTS.md，很多看起來奇怪的地方是使用者明確要求的。**

---

## 2. 一定要遵守的規則

1. **不准把真實個資放進 repo。** 真實學員名單（姓名、學號、Email、手機）只能在本機用 `tools/build.py` 產生到 `dist/`（已被 `.gitignore` 擋掉）。commit 前跑：
   ```bash
   git diff --cached | grep -nE "09[0-9]{8}|@gmail|@yahoo|@hotmail" && echo "疑似個資，先別 commit"
   ```
   範例名單只用 `data/roster.example.csv` 的假資料（`1149000xx`、`student01@example.com`、`09000000xx`）。
2. **介面文字用繁體中文，標點用全形**（，。：；（）？！「」）。**不要用破折號（——）**，改用逗號或冒號。
3. **使用者是 EMBA 學員和年長的老師。** 字要大（內文 17px 起跳、按鈕至少 44px 高），用白話，不要用技術詞（例如說「繳交」不說「submit」、說「上傳」不說「commit」）。
4. **保持單一 HTML 檔。** 不要拆成多個 JS/CSS 檔、不要引入打包工具。外部函式庫只能從 cdnjs 等 CDN 用 `<script src>` 載入（見第 8 節）。
5. **所有使用者輸入的文字放進 HTML 前都要經過 `esc()`。** 作業說明的 `md()` 已經先 `esc()` 再處理 `**粗體**`。
6. **`<script>` 裡的字串不可以出現 `//`。** Google Apps Script 會把 `//` 後面整行當註解刪掉，連字串裡的網址也會被砍斷，整個網頁就壞了。網址要寫成 `"https:\/\/example.com"`（JS 讀起來一樣是 `https://`）。行尾註解請用 `; // 說明` 的格式。`npm test` 會檢查。
7. **不要動 `/*CONFIG:BEGIN*/ … /*CONFIG:END*/` 這兩個標記。** `tools/build.py` 靠它們替換名單和設定。標記中間的內容由工具產生，不要手改。
8. **改完一定跑 `npm test`**，而且要實際打開頁面看一次（桌機與手機寬度各一次）。

---

## 3. 檔案結構

```
index.html              前端原始檔（HTML＋CSS＋JS），用假名單、展示模式。改前端只改這個檔
gas/Code.gs             Apps Script 後端（試算表讀寫、登入、寄信、提醒排程）
gas/index.html          由 index.html 產生（npm run build），不要手改
gas/appsscript.json     Apps Script 設定（時區、網頁應用程式權限）
tools/build.py          把名單 CSV 和老師帳密套進 index.html；--gas 產生 gas/index.html
data/roster.example.csv 範例名單（假資料）
tests/smoke.mjs         展示模式的煙霧測試
tests/gas-mock.cjs      在 Node 模擬 SpreadsheetApp、DriveApp、MailApp 等 Google 服務
tests/gas.mjs           正式模式整合測試：模擬 Google 環境跑 Code.gs＋gas/index.html 完整流程
tests/fixtures/         測試用 PDF
docs/REQUIREMENTS.md    需求紀錄與設計決定
docs/DEPLOY.md          部署教學
docs/PRODUCTION.md      正式版後端設計
docs/media/             系統介紹影片與 SRT 字幕
go/index.html           正式版入口轉址頁（GitHub Pages 的 /go/），裡面寫著 Apps Script 網址
tools/video/            介紹影片製作工具（錄展示版畫面、英文旁白、配樂、字幕），見其中的 README
```

**重新部署 Apps Script 時一律用「管理部署作業 → 編輯 → 新版本」**，網址才不會變。如果網址真的變了，要同步改 `go/index.html` 裡「進入作業系統」按鈕的網址（只有一個地方）。`/go/` 會先顯示 3 秒的入口頁，附「打不開怎麼辦」說明（同時登入多個 Google 帳號時 Apps Script 會打不開），再自動進入。

**改完 `index.html` 一定要跑 `npm run build`**，讓 `gas/index.html` 同步，再 commit 兩個檔案。

---

## 4. index.html 程式地圖

`<script>` 裡用 `/* ================= 區塊名稱 ================= */` 分段。用搜尋找區塊，不要靠行號（行號會變）。

| 區塊 | 內容 |
|---|---|
| 設定、名單與示範資料 | `CONFIG`、`ROSTER`（由 build.py 產生）、`DB`、`loadSampleData()` 示範資料、`clearAllData()` |
| 工具 | `$`、`$$`、`esc`、`fmtTime`、`fmtDue`、`syncEssay`、`statusPill`、大倒數 `bigCountdown()`、`PEER()` 互評開關 |
| 後端連線 | `BACKEND`、`api(fn,payload)`、`call()`（含錯誤對話框）、`applySnap()` 把伺服器資料放進 `DB`、`reportBlob(g)` 抓小組報告 PDF、`bgRefresh()` 切換頁面時背景更新 |
| 對話框與忙碌 | `dialog({title,body,buttons})` 回傳 Promise；`busy(msg,pct)` 全螢幕進度 |
| 狀態與導覽 | `S` 畫面狀態、`go(tab,sel)` 直接切換、`nav(tab,sel)` 會檢查「未儲存」和「需要登入」 |
| A4 排版引擎 | `layout()`／`layoutAt()` 算分頁、`renderPages()` 畫預覽 |
| PDF 與下載 | `essayBlob()`、`downloadOne()`、`exportMerged()`、`exportZip()`、`saveFile()`、`CSVS`、`downloadMenu()` |
| 登入 | `openLogin(after)` 登入視窗、`login(u)`、老師登入頁 |
| 外框 | `shell(tabs, body)` 登入後的頁首與分頁列 |
| 公開首頁 | `publicShell()`、`viewPublicHome()`：不用登入的首頁 |
| 學生：首頁／我的作業／幫各組評分／全組評分彙整 | 各頁的 `viewX()` 與 `bindX()` |
| 組長：送出小組評分／組員繳交狀況／上傳簡報 | 同上 |
| 作業說明 | `BRIEF_DEFAULT`（講義內容）、`BRIEF`（目前內容）、`viewBrief()` |
| 老師：首頁／系統設定／連續批改／小組簡報／互評結果 | 同上 |
| 路由 | `render()`：依登入身分組出分頁列與 `V` 對照表，呼叫 view 再呼叫 bind |

### 畫面的寫法（每一頁都一樣）

```js
function viewXxx(){ return `...HTML 字串...`; }   // 只產生 HTML，不綁事件
function bindXxx(){ $("#btn").onclick = ...; }     // 畫面放進 DOM 之後才綁事件
```

在 `render()` 的 `tabs`（分頁列）和 `V`（分頁代號 → [view, bind]）各加一筆就能新增一頁。改資料後呼叫 `render()` 或 `go(tab)` 重畫整頁，這個專案不用框架，也不做局部更新（拖曳排名的 `renderRank()` 是唯一例外）。

### 導覽守門

- `nav(tab)`：沒登入且不是 `PUBLIC_TABS`（首頁、作業說明）就跳登入視窗，登入後回到原本要去的頁（`S.after`）。
- 組長專用頁 `LEADER_TABS`：一般組員登入後會被帶回首頁。
- 互評關閉時（`PEER()` 為 false），`peer`、`gsubmit`、`matrix` 會被擋下並隱藏。
- 有未儲存評分時，頁面會設定 `S.leave`，`nav()` 會先跳出「評分還沒儲存」。`render()` 每次都會清掉 `S.leave`。

---

## 5. 資料模型（`DB`）

| 欄位 | 形狀 | 說明 |
|---|---|---|
| `students` | `[{id,name,group,email,leader,guest,ph}]` | 來自 `ROSTER`。`ph` 是 `sha256("hw:"+學號+":"+手機)` |
| `versions[學號]` | `[{title,text,at}]` | 個人作業**已繳交**的版本，只新增不覆蓋，v1 = index 0 |
| `drafts[學號]` | `{title,text,at}` | 自動儲存的草稿 |
| `essays[學號]` | `{title,text,at,status,v}` | 衍生資料：最新版本或草稿。改了 versions／drafts 後一定要呼叫 `syncEssay(學號)` |
| `pdfs[組別]` | `{kind,name,orig,blob,url,pages,at}` | 小組報告。`kind:"sample"` 是示範簡報 |
| `peer[學號][組別]` | `{score,comment}` | 個人的組間評分 |
| `finals[組別]` | `{scores,ranks,comments,overall,at}` | 組長送出的小組評分 |
| `tEssay[學號]`、`tGroup[組別]` | `{score,comment}` | 老師評分 |
| `settings` | `{deadline,peerOn}` | 截止時間（毫秒）、組間互評開關 |

---

## 5.5 正式模式（Apps Script）怎麼運作

- 每個會改資料的動作都長這樣：`if(BACKEND){ await call("後端函式", 參數) } else { 直接改 DB }`。新增功能時兩條路都要寫。
- 後端唯一入口是 `Code.gs` 的 `api(fn, token, p)`，實際處理在物件 `H` 裡（`login`、`saveDraft`、`submitEssay`、`savePeer`、`submitFinal`、`uploadReport`、`getReport`、`gradeEssay`、`gradeGroup`、`saveSettings`、`refresh`、`publicInfo`）。
- 權限檢查一律在後端：`student_()`、`teacher_()`、組長判斷、互評開關、七組都上傳才能送出等。前端隱藏按鈕只是介面。
- `snapshot_(sess)` 決定前端拿得到什麼：學員只拿得到全班姓名與組別、自己的作業全文、同組的繳交狀態與互評、本組小組評分；老師拿全部。**手機號碼永遠不回傳。** 新增欄位時要想清楚誰該看到。
- 登入用 `CacheService` 存 6 小時的 token，前端存在 `sessionStorage`，重新整理不會登出。
- 草稿：本機 1.2 秒自動存，5 秒沒動作才送到伺服器，離開頁面時立刻送。
- 個人作業 PDF 在瀏覽器產生（html2canvas＋jsPDF），base64 傳到後端存進雲端硬碟，並當作確認信附件。不要改成伺服器端產生 PDF，中文字型會壞。
- 自動提醒信：`sendReminders()` 由每天 9 點的排程觸發，截止前三天、前一天寄給沒交的人，用 `PropertiesService` 記錄避免重寄。
- 試算表結構（分頁名稱、欄位）定義在 `Code.gs` 最上面的 `SH`、`HEAD`。改欄位時，`rows_()` 是用標題名稱讀資料，所以**標題文字不能隨便改**。

## 6. 個人作業排版（最容易改壞的地方）

常數在「A4 排版引擎」區塊：

```js
const PAGE={w:794,h:1123,m:76};   // A4 在 96dpi 的像素，m = 邊界 2cm
FS_MAX=14, FS_MIN=13.5, FS_STEP=0.25  // 先用 14pt，排不下才逐步縮小
LINE=2                               // 兩倍行高
PGAP=0.5                             // 段落間距 = 半行
const LIMIT=1500;                    // 字數上限（在「工具」區塊，不含空白）
```

- 分頁做法：先在看不見的 `measurer` 排好整篇，逐行量位置，整行放不下才換頁，所以不會切到字。頁碼放在下邊界裡，不佔內文空間。
- 「最多兩頁」是硬性規定：13.5pt 還超過兩頁就不能繳交。使用者已確認接受「1500 字有時會超過兩頁，請學員刪減」。
- 頁首格式（使用者指定）：題目置中 → 水平線 → 「學號　第 N 組　姓名」，**不加「學號：」這類標籤**。特邀學員學號欄顯示「特邀」。
- PDF 用 html2canvas 把每頁畫成圖再放進 jsPDF（`scale:1.7`、JPEG 0.82）。好處是跟預覽一模一樣，缺點是文字不能選取。
- 改了任何排版常數，請用 `npm test` 並手動測 1000、1300、1500 字各一次，確認分頁正常。

---

## 7. 作業說明（`BRIEF`）

講義內容存成資料，老師可以在「⚙ 系統設定」編輯，不需要改程式。格式規則（編輯器上方也有寫）：

- 一行一段；`**文字**` 變螢光筆重點；`{截止}` 換成截止時間；老師的話裡單獨一行 `[ABC]` 顯示 ABC 三格。
- 補充資料：一行一筆 `標題 | 來源 | 網址`（來源可省略），`## 小標` 分類。
- 討論問題：一行一題，開頭寫題號，例如 `1.1 題目`。含「（1 到 5 分…）」會自動顯示量表；結尾「（提醒：…）」會變成提示框；長題目會在「？」處斷行。
- `cases[].pages` 加總就是小組報告的頁數上限（`maxPages()`），上傳檢查會用到。

換學期或換課程時，改 `BRIEF_DEFAULT` 就是改預設內容。

---

## 8. 外部依賴（都從 CDN 載入）

| 函式庫 | 用途 |
|---|---|
| pdf.js 3.11.174 | 顯示和計算上傳的 PDF 頁數（也載入 worker 讓它在主執行緒跑） |
| html2canvas 1.4.1 | 把 A4 預覽畫成圖片 |
| jsPDF 2.5.1 | 產生 PDF |
| JSZip 3.10.1 | 「每人一份」打包成 ZIP |
| Google Fonts：Noto Sans TC、Noto Serif TC | 介面與作業字型 |

下載檔案：如果頁面放在 Claude 的 artifact 裡，`saveFile()` 會用 `window.claude.use("downloads")`；一般瀏覽器（GitHub Pages、本機）會自動改用 `<a download>`。兩條路都要保留。

---

## 9. 常見修改對照表

| 想做的事 | 改哪裡 |
|---|---|
| 換名單 | 不改程式，用 `tools/build.py --roster` |
| 改截止時間的預設值 | `DB.settings.deadline`（老師也能在後台改） |
| 改字數上限 | `LIMIT` |
| 改字級、行高、段距、邊界 | 「A4 排版引擎」的常數（見第 6 節） |
| 改作業 PDF 頁首 | `flowHTML()` |
| 改 PDF 檔名 | `pdfName()`；小組報告檔名在 `bindUpload()` |
| 改作業說明的預設內容 | `BRIEF_DEFAULT` |
| 改大倒數的顏色門檻或提醒句 | `cdLevel()`、`cdMsg()` |
| 改組數（不是 7 組） | `ALLG` 和名單；很多畫面寫死「/ 7」，搜尋 `7` 和 `ALLG` 一起改 |
| 互評分數範圍（不是 0～100） | 搜尋 `0 到 100` 和 `max="100"` |
| 加新的老師設定 | `DB.settings` 加欄位 → `viewTSettings()` 加控制項 → `bindTSettings()` 存值 |
| 新增一頁 | 寫 `viewX`／`bindX` → `render()` 的 `tabs` 和 `V` 各加一筆 → 要登入才看的頁不要放進 `PUBLIC_TABS` |

---

## 10. 測試

```bash
npm install
npx playwright install chromium
npm run build      # index.html → gas/index.html
npm test           # 兩組測試都跑
```

- `tests/smoke.mjs`（展示模式）：公開首頁、登入攔截、密碼錯誤、排版頁首、14pt、超過兩頁警告、老師登入、互評開關。
- `tests/gas.mjs`（正式模式）：初始化、名單檢查、草稿存雲端、繳交寫入試算表與雲端、確認信附 PDF、重新整理保持登入、組長上傳、個人互評、小組評分、老師評分、設定同步、作業說明儲存、提醒信只寄給沒交的人且不重寄。

模擬環境不是真的 Google，部署到真的帳號後仍要照 `docs/DEPLOY.md` 第 11 步手動測一次（特別是 PDF 下載在 Apps Script 頁面裡是否正常）。新增功能時請一起補測試。

---

## 11. 已知限制與待辦

- 展示模式沒有後端：資料不會保存；確認信只是模擬畫面。正式模式沒有這個問題。
- 展示模式的老師帳密和學員手機雜湊都在前端，懂技術的人可以繞過，所以展示模式不能拿來正式收作業。正式模式在伺服器端驗證。
- 正式模式在 Apps Script 的網頁裡，瀏覽器自動下載 PDF 的行為尚未在真實環境確認；就算沒有自動下載，確認信也會附 PDF。
- 簡體字、全形英數會照原樣排版，沒有自動轉換。
- 尚未做「組內成員 ABC 互評」（作業 3.8 提到第二次領袖營要用），見 REQUIREMENTS.md 的待辦。
