import json, os, re, subprocess
os.makedirs("out", exist_ok=True)
SC = [  # (名稱, 秒數, 字幕關鍵詞, 旁白)
 ("s1", 11, "", "這是我們為 ASTM 2026 做的作業繳交系統。打開網址，第一眼就看到距離截止還有多久。"),
 ("s2", 14, "排版不一／收資料／整理總表", "以前大家用 Word 交作業，每個人的字型、行距都不一樣；組長要一個個收分數，助教要幫忘記寫名字的人補上名字，老師要讀各種格式。"),
 ("s3", 14, "倒數＋自動提醒信", "首頁的倒數越接近截止，顏色越緊張。截止前三天和前一天，系統還會自動寄信，提醒還沒交的同學。"),
 ("s4", 20.5, "統一模板，專心寫內容", "個人反思心得直接在網頁打字，系統自動排成統一的 A4 格式，大家省下排版時間，專心寫內容。繳交後會下載 PDF，也會收到附上 PDF 的確認信，想修改還可以重交。"),
 ("s5", 18, "閱讀友善＋老師可自訂", "每份作業都是大字、兩倍行高，段落分明，老師讀起來不吃力。後台可以一份接一份批改、一鍵下載全班作業，也能自己決定截止時間，要不要小組互評。"),
 ("s6", 14, "各自評分，自動彙整", "小組互評時，每個人各自打分，系統自動彙整。組長不用再一個個收分數，助教也不用再整理總表，所有資料都自動進到一份試算表。"),
 ("s7", 12.5, "開源，下一屆接得住", "整套系統開源在 GitHub，附有完整說明。下一屆助教只要請 AI 讀過，就能照那一屆的安排，一步一步調整。"),
 ("s8", 7, "", "把文書工作交給系統，讓大家的時間回到學習本身。"),
]
CARDS = {"s2": [("pain1", 2.5), ("pain2", 2.5), ("pain3", 3), ("pain4", 6)],
         "s7": [("repo1", 4), ("repo2", 4), ("repo3", 4.5)]}

def frames(name, target):
    if name in CARDS: l = [[f"cards/{f}.jpg", d] for f, d in CARDS[name]]
    else: l = json.load(open(f"frames/{name}.json"))
    tot = sum(d for _, d in l)
    if tot > target: l = [[f, d * target / tot] for f, d in l]
    else: l[-1][1] += target - tot
    return l

def enc(name, target):
    l = frames(name, target)
    with open(f"out/{name}.txt", "w") as fh:
        fh.write("ffconcat version 1.0\n")
        for f, d in l: fh.write(f"file '../{f}'\nduration {d:.4f}\n")
        fh.write(f"file '../{l[-1][0]}'\n")
    vf = f"fps=30,scale=1920:1080,format=yuv420p,trim=duration={target}"
    if name == "s1": vf += ",fade=in:st=0:d=0.6"
    if name == "s8": vf += f",fade=out:st={target-1.2}:d=1.2"
    tmp = f"out/{name}.tmp.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", f"out/{name}.txt", "-vf", vf,
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-r", "30", "-pix_fmt", "yuv420p", tmp], check=True)
    os.replace(tmp, f"out/{name}.mp4")

def chunks(t, maxn=24):
    parts = re.findall(r"[^，；。]+[，；。]?", t)
    out, cur = [], ""
    for p in parts:
        if cur and len(cur + p) > maxn: out.append(cur); cur = p
        else: cur += p
    if cur: out.append(cur)
    return [c.rstrip("，；。") for c in out]

def ts(x): h = int(x // 3600); m = int(x % 3600 // 60); s = x % 60; return f"{h}:{m:02d}:{s:05.2f}"

ass = ["[Script Info]", "ScriptType: v4.00+", "PlayResX: 1920", "PlayResY: 1080", "WrapStyle: 2", "",
       "[V4+ Styles]",
       "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
       "Style: Nar,Noto Sans CJK TC,54,&H00FFFFFF,&H00FFFFFF,&H33141414,&H33141414,1,0,0,0,100,100,2,0,3,18,0,2,80,80,46,1",
       "Style: Key,Noto Sans CJK TC,40,&H00FFFFFF,&H00FFFFFF,&H005B5F1F,&H005B5F1F,1,0,0,0,100,100,3,0,3,14,0,2,80,80,170,1",
       "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
t0 = 0
for name, dur, key, nar in SC:
    enc(name, dur)
    if key: ass.append(f"Dialogue: 0,{ts(t0+0.4)},{ts(t0+dur-0.2)},Key,,0,0,0,,{{\\fad(300,200)}}{key}")
    cs = chunks(nar); n = sum(len(c) for c in cs)
    a, b = t0 + 0.6, t0 + dur - 0.5
    x = a
    for c in cs:
        y = x + (b - a) * len(c) / n
        ass.append(f"Dialogue: 1,{ts(x)},{ts(y-0.08)},Nar,,0,0,0,,{c}")
        x = y
    t0 += dur
open("out/subs.ass", "w").write("\n".join(ass) + "\n")
with open("out/all.txt", "w") as fh:
    for name, *_ in SC: fh.write(f"file '{name}.mp4'\n")
subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", "out/all.txt", "-c", "copy", "out/nosub.mp4"], check=True)
print("ok", t0)
