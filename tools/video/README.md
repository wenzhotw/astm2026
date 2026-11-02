# 介紹影片製作工具

`docs/media/ASTM2026_系統介紹.mp4` 就是用這個資料夾的程式做的：自動操作展示版錄下畫面，再合成英文旁白、配樂和中文字幕。系統改版後想更新影片，照下面步驟重跑即可。

**全程只用展示版和假名單，不會碰到學員的真實資料。**

## 需要的工具

- Node.js 與 Playwright（repo 根目錄 `npm install` 後就有）
- Python 3、ffmpeg（要有 libass，才能燒字幕）
- 展示版用到的函式庫，錄影時從本機載入，不連 CDN：
  ```bash
  # 在 repo 根目錄執行
  npm i --no-save pdfjs-dist@3.11.174 html2canvas@1.4.1 jspdf@2.5.1 jszip@3.10.1
  ```
- 語音合成（開源的 Kokoro 模型，約 350 MB，不放進 repo）：
  ```bash
  pip install sherpa-onnx soundfile numpy pillow
  mkdir -p models && cd models
  curl -LO https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_0.tar.bz2
  tar xjf kokoro-multi-lang-v1_0.tar.bz2 && cd ..
  ```
- 中文字型：Noto Sans CJK TC（Linux 裝 `fonts-noto-cjk`）

## 步驟（都在 `tools/video/` 裡執行）

| 步驟 | 指令 | 做什麼 |
|---|---|---|
| 1 | `node cards.mjs` | 把 `cards.html` 畫成片頭、痛點、提醒信、確認信、開源、片尾等示意畫面（`cards/`） |
| 2 | `node capture.mjs` | 自動操作展示版，逐格截圖（`frames/`），約 2 分鐘 |
| 3 | `python3 build.py` | 每段畫面各編成一個影片檔，接成 `out/nosub.mp4`，並產生關鍵詞字幕 |
| 4 | `python3 voice_en.py` | 每段英文旁白整段一次合成，依停頓對齊中文字幕，產生 `out/voice_en.wav`、字幕和 SRT |
| 5 | `python3 music.py 111` | 用程式合成背景音樂（數字是影片秒數），沒有版權問題 |
| 6 | `sh final.sh` | 合併畫面、旁白、配樂，燒入字幕，輸出 `out/ASTM2026_系統介紹.mp4` |

## 常見修改

- **改旁白或字幕**：改 `voice_en.py` 裡的 `SC`，每段是「（秒數，[（中文字幕，英文旁白）…]）」，然後重跑步驟 4 和 6。
- **改每段長度**：`build.py` 和 `voice_en.py` 的秒數要一起改，重跑步驟 3 到 6，`music.py` 的秒數改成新的總長。
- **英文字念錯或被跳過**：執行時出現 `OOV word skipped` 代表模型字典裡沒有這個字，把它加進 `extra-en.txt`（格式參考裡面的例子），或在旁白裡換個說法。
- **換聲音**：`SID=數字 python3 voice_en.py`，預設 3 是英文女聲，可以換其他數字試聽。
- **改操作流程**：改 `capture.mjs`，每段由 `begin("s4")` 開始、`end()` 結束；`snap(秒數)` 拍一格並決定這格停多久。
