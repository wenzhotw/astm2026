# 自己合成的背景音樂：輕快、溫暖的鋼琴琶音＋柔和和弦墊底＋低音，無版權問題
import numpy as np, soundfile as sf, sys
SR = 44100; DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 111.0
BPM = 100; beat = 60 / BPM; bar = 4 * beat
rng = np.random.default_rng(7)
N = int((DUR + 4) * SR); L = np.zeros(N); R = np.zeros(N)
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
# C – G/B – Am – F，每個和弦兩小節
PROG = [(48, [60, 64, 67, 72]), (47, [59, 62, 67, 71]), (45, [57, 60, 64, 69]), (41, [57, 60, 65, 69])]

def add(sig, t, pan=0.0, g=1.0):
    i = int(t * SR); j = min(N, i + len(sig)); s = sig[:j - i] * g
    L[i:j] += s * (1 - pan) ** .5 * .9; R[i:j] += s * (1 + pan) ** .5 * .9

def pluck(m, d=1.6):  # 類鋼琴音色：幾個泛音＋指數衰減
    t = np.arange(int(d * SR)) / SR; f = hz(m)
    s = sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (2.2 + k * 1.3)) for k, a in [(1, 1), (2, .45), (3, .18), (4, .08)])
    return s * np.minimum(1, t / .004)

def pad(ms, d):
    t = np.arange(int(d * SR)) / SR
    env = np.minimum(1, t / 1.2) * np.minimum(1, (d - t) / 1.2)
    s = sum(np.sin(2 * np.pi * hz(m) * (1 + det) * t + rng.random() * 6) for m in ms for det in (-.0015, .0015))
    return s * env / (2 * len(ms))

def bass(m, d):
    t = np.arange(int(d * SR)) / SR
    return (np.sin(2 * np.pi * hz(m) * t) + .25 * np.sin(4 * np.pi * hz(m) * t)) * np.exp(-t * 1.5) * np.minimum(1, t / .01)

def shaker(d=.06):
    t = np.arange(int(d * SR)) / SR; n = rng.standard_normal(len(t))
    n = np.diff(n, prepend=0)  # 高頻
    return n * np.exp(-t * 60)

t = 0.0; k = 0
ARP = [0, 1, 2, 3, 2, 1, 2, 3]
while t < DUR:
    root, ch = PROG[k % 4]
    intro = t < 2 * bar  # 前兩小節只有和弦，慢慢進來
    add(pad([m - 12 for m in ch[:3]] + ch[:2], 2 * bar + 1.2), t, 0, .55)
    for b in range(2):
        tb = t + b * bar
        add(bass(root - 12, 2 * beat), tb, 0, .55); add(bass(root - 12, 2 * beat), tb + 2 * beat, 0, .4)
        if not intro:
            for e in range(8):
                m = ch[ARP[e]] + (12 if (e == 3 and b == 1) else 0)
                add(pluck(m), tb + e * beat / 2, (-.35 if e % 2 else .35), .22 if e % 2 else .3)
            for e in range(8):
                add(shaker(), tb + e * beat / 2 + .01, .2, .05 if e % 2 else .025)
    t += 2 * bar; k += 1

mix = np.stack([L, R], 1)[:int(DUR * SR)]
# 簡單殘響
for dly, g in [(.083, .25), (.131, .18), (.197, .12), (.271, .08)]:
    s = int(dly * SR); mix[s:] += mix[:-s][:, ::-1] * g
n = len(mix); tt = np.arange(n) / SR
mix *= np.minimum(1, tt / 2.0)[:, None] * np.minimum(1, (DUR - tt) / 3.5)[:, None]
mix /= np.abs(mix).max() / .8
sf.write("out/music.wav", mix.astype(np.float32), SR)
print("music", DUR)
