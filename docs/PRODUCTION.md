# 正式版設計：Google 試算表＋Apps Script

已實作在 `gas/` 資料夾，部署步驟見 `docs/DEPLOY.md`。這份文件說明設計：為什麼這樣做、資料怎麼存、API 有哪些。

## 為什麼選 Google 試算表＋Apps Script

- 免費，不用架伺服器，資料放在助教或老師自己的 Google 帳號。
- 資料庫就是試算表，老師打開就看得懂，系統出問題時也能直接查。
- 驗證在伺服器端做，學員的瀏覽器拿不到名單和手機號碼。
- Apps Script 內建寄信（`MailApp`），可以附上雲端硬碟裡的 PDF。

## 部署方式（詳見 DEPLOY.md）

1. 建 Google 試算表 → 擴充功能 → Apps Script，貼上 `gas/Code.gs`、`gas/index.html`、`gas/appsscript.json`。
2. 執行 `setup()` 建立分頁與資料夾，匯入名單，改設定。
3. 部署為網頁應用程式：**執行身分選「我」，存取權選「所有人」**。學員不需要 Google 帳號。
4. 建議用學校的 Google Workspace 帳號部署，寄信額度比一般 Gmail 帳號高（可用選單「寄一封測試信給自己」查看剩餘額度）。

## 試算表分頁

欄位以 `Code.gs` 的 `HEAD` 為準：

| 分頁 | 一列代表 | 欄位 |
|---|---|---|
| 學生名單 | 一位學員 | 組別、學號、姓名、Email、手機、是否組長 |
| 個人作業 | 一次繳交（一個版本） | 學號、姓名、組別、版本、題目、內文、字數、繳交時間、PDF檔案ID、確認信 |
| 草稿 | 一位學員 | 學號、題目、內文、更新時間 |
| 個人互評 | 一人對一組 | 評分人學號、評分人、評分人組別、被評組、分數、評語、更新時間 |
| 小組互評 | 評分組對被評組（每組 7 列） | 評分組、被評組、分數、名次、評語、整體評語、送出人、送出時間 |
| 小組報告 | 一組 | 組別、檔案ID、檔名、原始檔名、頁數、上傳人、上傳時間 |
| 老師評分 | 一筆評分 | 類型（個人／小組）、對象、分數、評語、更新時間 |
| 設定 | 一個設定值 | 截止時間、組間互評、自動提醒信、老師帳號、老師密碼、作業說明（JSON）、寄件人名稱、檔案資料夾ID |

原則：
- **個人作業只新增不覆蓋**，每交一次多一列，保留所有版本。
- 設定集中在一個分頁，老師改試算表就生效。

## 雲端硬碟資料夾

```
ASTM2026 作業系統/
├── 作業系統資料庫（試算表）
├── 個人作業/第1組/第1組_姓名_學號_v1.pdf …
└── 小組報告/第1組_簡報.pdf（重新上傳時舊檔移到「舊版」資料夾）
```

## 後端 API

前端呼叫 `google.script.run.api(函式名稱, token, 參數)`，對應 `Code.gs` 的物件 `H`：

| 函式 | 誰能用 | 做什麼 |
|---|---|---|
| `publicInfo` | 所有人 | 截止時間、開關、作業說明（公開首頁用） |
| `login {id,pw}` | 所有人 | 學號＋手機驗證，回傳 token（`CacheService`，6 小時）與資料 |
| `teacherLogin {id,pw}` | 所有人 | 老師登入 |
| `refresh` | 已登入 | 重新抓資料 |
| `saveDraft {title,text,clear}` | 學員 | 存草稿 |
| `submitEssay {title,text,pdf}` | 學員 | 新增版本、存 PDF、寄確認信（附 PDF） |
| `uploadReport {data,orig,pages}` | 組長 | 存檔、改名，舊檔移到「小組報告舊版」 |
| `getReport {g}` | 已登入 | 取得某組報告 PDF |
| `savePeer {g,score,comment}` | 學員 | 個人互評（互評開啟且本組已上傳才允許） |
| `submitFinal {scores,ranks,comments,overall}` | 組長 | 小組互評（七組都上傳才允許） |
| `gradeEssay`、`gradeGroup` | 老師 | 評分 |
| `saveSettings {deadline,peerOn,remindOn,brief}` | 老師 | 系統設定 |

另有排程函式 `sendReminders()`（截止前三天、前一天寄提醒信），以及試算表選單用的 `setup()`、`checkRoster()`、`installReminderTrigger()`、`removeReminderTrigger()`、`sendTestMail()`。

全部權限檢查都在後端做，前端的隱藏只是介面。

## 注意事項

- **PDF 在學員瀏覽器產生**（沿用原型的 html2canvas＋jsPDF），再上傳到後端。Apps Script 伺服器端轉 PDF 對中文字型支援很差，不要在那邊做。
- 寫入試算表時用 `LockService`，避免截止前很多人同時送出互相覆蓋。
- 透過 `google.script.run` 上傳檔案，建議限制 20 MB 以內。
- 試算表裡有學員手機和 Email，只分享給老師和助教。
