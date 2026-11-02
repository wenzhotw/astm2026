# 英文旁白（每段整段一次合成，語氣連貫）＋中文字幕（依語音停頓對齊）
import os, numpy as np, soundfile as sf, sherpa_onnx
d = "models/kokoro-multi-lang-v1_0/"
cfg = sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(kokoro=sherpa_onnx.OfflineTtsKokoroModelConfig(
    model=d+"model.onnx", voices=d+"voices.bin", tokens=d+"tokens.txt", data_dir=d+"espeak-ng-data", dict_dir=d+"dict",
    lexicon="extra-en.txt,"+d+"lexicon-us-en.txt,"+d+"lexicon-zh.txt", lang="en-us"), num_threads=4))
tts = sherpa_onnx.OfflineTts(cfg)
SID = int(os.environ.get("SID", "3")); SR = 24000

# 每段：(秒數, [(中文字幕, 英文旁白)…])
SC = [
 (11, [("這是我們為 ASTM 2026 做的作業繳交系統", "This is the assignment system we built for A S T M twenty twenty six."),
       ("打開網址，第一眼就看到距離截止還有多久", "Open the link, and the first thing you see is how much time is left before the deadline.")]),
 (14, [("以前大家用 Word 交作業", "In the past, everyone handed in Word files,"),
       ("每個人的字型、行距都不一樣", "each with its own font and line spacing."),
       ("組長要一個個收分數，助教要幫忘記寫名字的人補上名字", "Group leaders chased scores one by one, teaching assistants filled in missing names,"),
       ("老師要讀各種格式", "and the professor had to read every format imaginable.")]),
 (14, [("首頁的倒數越接近截止，顏色越緊張", "As the deadline gets closer, the countdown on the home page turns more urgent."),
       ("截止前三天和前一天，系統還會自動寄信", "Three days and one day before the deadline, the system also sends emails automatically,"),
       ("提醒還沒交的同學", "reminding everyone who hasn't submitted yet.")]),
 (20.5, [("個人反思心得直接在網頁打字", "Students type their reflection paper right on the web page,"),
       ("系統自動排成統一的 A4 格式", "and the system lays it out in a uniform A4 format,"),
       ("大家省下排版時間，專心寫內容", "so no one wastes time on formatting, and everyone can focus on the writing."),
       ("繳交後會下載 PDF，也會收到附上 PDF 的確認信", "After submitting, a PDF downloads automatically, and a confirmation email arrives with the PDF attached."),
       ("想修改還可以重交", "Need a change? Just submit again.")]),
 (18, [("每份作業都是大字、兩倍行高，段落分明", "Every paper uses large type, double line spacing, and clear paragraphs,"),
       ("老師讀起來不吃力", "so they are easy to read, even for the professor."),
       ("後台可以一份接一份批改、一鍵下載全班作業", "In the dashboard, the professor can grade one paper after another, and download the whole class with one click,"),
       ("也能自己決定截止時間，要不要小組互評", "and can set the deadline, or turn peer review on and off.")]),
 (14, [("小組互評時，每個人各自打分，系統自動彙整", "For peer review, everyone scores on their own, and the system compiles the results."),
       ("組長不用再一個個收分數，助教也不用再整理總表", "Leaders no longer chase scores, and teaching assistants no longer build summary sheets."),
       ("所有資料都自動進到一份試算表", "All the data flows straight into one spreadsheet.")]),
 (12.5, [("整套系統開源在 GitHub，附有完整說明", "The whole system is open source on GitHub, with complete documentation."),
       ("下一屆助教只要請 AI 讀過", "The next teaching assistant can simply ask an A I to read it,"),
       ("就能照那一屆的安排，一步一步調整", "and adapt everything for their class, step by step.")]),
 (7, [("把文書工作交給系統，讓大家的時間回到學習本身", "Let the system handle the paperwork, and give our time back to learning.")]),
]

def silences(x, sr, thr=0.012, minlen=0.12):
    fr = int(0.01 * sr); e = np.array([np.sqrt((x[i:i+fr]**2).mean()) for i in range(0, len(x)-fr, fr)])
    quiet = e < thr; out = []; i = 0
    while i < len(quiet):
        if quiet[i]:
            j = i
            while j < len(quiet) and quiet[j]: j += 1
            if (j - i) * 0.01 >= minlen: out.append(((i + j) / 2) * 0.01)
            i = j
        else: i += 1
    return out

def ts(x): return f"{int(x//3600)}:{int(x%3600//60):02d}:{x%60:05.2f}"
total = sum(s[0] for s in SC)
track = np.zeros(int(total * SR), dtype=np.float32); cues = []; t0 = 0.0
for n, (dur, pairs) in enumerate(SC, 1):
    text = " ".join(e for _, e in pairs); speed = 1.0
    for _ in range(4):
        a = np.array(tts.generate(text, sid=SID, speed=speed).samples, dtype=np.float32)
        if len(a) / SR <= dur - 1.0: break
        speed *= len(a) / SR / (dur - 1.0) * 1.02
    # 去掉前後靜音
    nz = np.where(np.abs(a) > 0.01)[0]; a = a[max(0, nz[0]-600): nz[-1]+2400]
    L = len(a) / SR; st = t0 + (2.3 if n == 8 else 0.5)
    track[int(st*SR): int(st*SR)+len(a)] += a
    # 依字數估邊界，再對到最近的停頓
    w = np.array([len(e) for _, e in pairs], float); est = np.cumsum(w)[:-1] / w.sum() * L
    sil = silences(a, SR); bounds = [0.0]
    for b in est:
        cand = [s for s in sil if abs(s - b) < 0.9 and s > bounds[-1] + 0.5]
        bounds.append(min(cand, key=lambda s: abs(s - b)) if cand else b)
    bounds.append(L)
    for (zh, _), x, y in zip(pairs, bounds[:-1], bounds[1:]): cues.append((st + x, st + y, zh))
    print(f"s{n} speed={speed:.2f} speech={L:.1f}/{dur}")
    t0 += dur
track /= max(1e-6, np.abs(track).max()) / 0.89
sf.write("out/voice_en.wav", track, SR)
ass = [l for l in open("out/subs.ass").read().splitlines() if not l.startswith("Dialogue: 1")]
ass += [f"Dialogue: 1,{ts(a)},{ts(b)},Nar,,0,0,0,,{c}" for a, b, c in cues]
open("out/subs_en.ass", "w").write("\n".join(ass) + "\n")
def srt(x): return f"{int(x//3600):02d}:{int(x%3600//60):02d}:{int(x%60):02d},{int(round(x%1*1000))%1000:03d}"
open("out/ASTM2026_系統介紹_字幕.srt", "w").write(
    "\n".join(f"{i}\n{srt(a)} --> {srt(b)}\n{c}\n" for i, (a, b, c) in enumerate(cues, 1)))
