# AGENTS.md：給 AI 助理與開發者的說明

這份文件寫給之後接手的助教，以及助教使用的 AI 助理（Claude、ChatGPT、Copilot 等）。動手改之前請先讀完。人類使用者看的說明在 `README.md`。

---

## 1. 專案一句話

`index.html` 是一個**單一檔案、純前端**的課程作業繳交系統：學員寫個人心得（自動排成 A4 PDF）、組長上傳小組報告、組間互評、老師批改與下載。沒有後端，資料存在瀏覽器記憶體（`DB` 物件），重新整理就清空。

正式上線需要後端，規劃見 `docs/PRODUCTION.md`。需求與設計決定的來龍去脈見 `docs/REQUIREMENTS.md`。**改功能前先查 REQUIREMENTS.md，很多看起來奇怪的地方是使用者明確要求的。**

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
6. **不要動 `/*CONFIG:BEGIN*/ … /*CONFIG:END*/` 這兩個標記。** `tools/build.py` 靠它們替換名單和設定。標記中間的內容由工具產生，不要手改。
7. **改完一定跑 `npm test`**，而且要實際打開頁面看一次（桌機與手機寬度各一次）。

---

## 3. 檔案結構

```
index.html              整個系統（HTML＋CSS＋JS），用假名單、展示模式
tools/build.py          把名單 CSV 和老師帳密套進 index.html，產生正式用網頁
data/roster.example.csv 範例名單（假資料）
tests/smoke.mjs         Playwright 煙霧測試
docs/REQUIREMENTS.md    需求紀錄與設計決定
docs/PRODUCTION.md      正式版後端規劃
```

---

## 4. index.html 程式地圖

`<script>` 裡用 `/* ================= 區塊名稱 ================= */` 分段。用搜尋找區塊，不要靠行號（行號會變）。

| 區塊 | 內容 |
|---|---|
| 設定、名單與示範資料 | `CONFIG`、`ROSTER`（由 build.py 產生）、`DB`、`loadSampleData()` 示範資料、`clearAllData()` |
| 工具 | `$`、`$$`、`esc`、`fmtTime`、`fmtDue`、`syncEssay`、`statusPill`、大倒數 `bigCountdown()`、`PEER()` 互評開關 |
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
npm test                      # 測 index.html
node tests/smoke.mjs dist/index.html   # 測自己產生的正式版（測試用的帳密要改）
```

`tests/smoke.mjs` 用範例名單的帳號登入，檢查：公開首頁、登入攔截、密碼錯誤、排版頁首、14pt、超過兩頁警告、老師登入、互評開關。新增功能時請一起補測試。

---

## 11. 已知限制與待辦

- 沒有後端：資料不會保存、不會跨裝置共享；確認信只是模擬畫面。→ `docs/PRODUCTION.md`
- 老師帳密和學員手機雜湊都在前端，懂技術的人可以繞過。正式版必須改成伺服器端驗證。
- 簡體字、全形英數會照原樣排版，沒有自動轉換。
- 尚未做「組內成員 ABC 互評」（作業 3.8 提到第二次領袖營要用），見 REQUIREMENTS.md 的待辦。
