#!/usr/bin/env python3
"""把學員名單（CSV）和老師帳密套進 index.html，產生可以使用的網頁。

用法：
  # 公開範例（假名單、展示模式）：更新 repo 裡的 index.html
  python3 tools/build.py --roster data/roster.example.csv --out index.html

  # 真實名單（只在自己電腦產生，不要 commit）
  python3 tools/build.py --roster data/roster.csv --out dist/index.html \
      --no-demo --teacher-id teacher --teacher-password 你的密碼

名單 CSV 欄位（第一列是標題，順序不拘）：
  組別, 學號, 姓名, Email, 手機, 是否組長
  - 組別：1～7 的數字
  - 學號：特邀學員沒有學號時，用 GUEST01、GUEST02…
  - 手機：當作登入密碼，09 開頭 10 碼，可以有 - 或空白
  - 是否組長：填「是」代表組長，每組一位
手機號碼不會以明文寫進網頁，只存 SHA-256 雜湊（"hw:學號:手機"）。
"""
import argparse, csv, hashlib, json, re, sys
from pathlib import Path

BEGIN, END = "/*CONFIG:BEGIN*/", "/*CONFIG:END*/"

def sha(t): return hashlib.sha256(t.encode("utf-8")).hexdigest()

def load_roster(path):
    rows = list(csv.DictReader(open(path, encoding="utf-8-sig")))
    out, errors, ids = [], [], set()
    for n, r in enumerate(rows, start=2):
        r = {k.strip(): (v or "").strip() for k, v in r.items() if k}
        try: g = int(r["組別"])
        except Exception: errors.append(f"第 {n} 列：組別不是數字"); continue
        sid = r["學號"].upper(); phone = re.sub(r"\D", "", r.get("手機", ""))
        if not sid: errors.append(f"第 {n} 列：沒有學號"); continue
        if sid in ids: errors.append(f"第 {n} 列：學號 {sid} 重複")
        ids.add(sid)
        if not re.fullmatch(r"09\d{8}", phone): errors.append(f"第 {n} 列：{r['姓名']} 的手機不是 09 開頭 10 碼")
        out.append({"id": sid, "name": r["姓名"], "group": g, "email": r.get("Email", ""),
                    "leader": r.get("是否組長", "") in ("是", "Y", "y", "1", "TRUE", "true"),
                    "guest": not sid.isdigit(), "ph": sha(f"hw:{sid}:{phone}")})
    groups = sorted({s["group"] for s in out})
    for g in groups:
        lead = [s["name"] for s in out if s["group"] == g and s["leader"]]
        if len(lead) != 1: errors.append(f"第 {g} 組的組長有 {len(lead)} 位（應該剛好 1 位）")
    return out, errors

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--roster", required=True); ap.add_argument("--src", default="index.html")
    ap.add_argument("--out", required=True); ap.add_argument("--no-demo", action="store_true")
    ap.add_argument("--teacher-id", default="teacher"); ap.add_argument("--teacher-password", default="1234")
    a = ap.parse_args()
    roster, errors = load_roster(a.roster)
    if errors:
        print("名單有問題，請修正後再執行：", *errors, sep="\n  ", file=sys.stderr); sys.exit(1)
    if a.no_demo and a.teacher_password == "1234":
        print("正式模式請用 --teacher-password 設定自己的老師密碼", file=sys.stderr); sys.exit(1)
    src = Path(a.src).read_text(encoding="utf-8")
    i, j = src.index(BEGIN), src.index(END) + len(END)
    cfg = {"demo": not a.no_demo, "teacherId": a.teacher_id,
           "teacherPwHash": sha(f"teacher:{a.teacher_id}:{a.teacher_password}")}
    block = (f"{BEGIN}\nconst CONFIG={json.dumps(cfg, ensure_ascii=False)};\n"
             f"const ROSTER={json.dumps(roster, ensure_ascii=False)};\n{END}")
    out = Path(a.out); out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(src[:i] + block + src[j:], encoding="utf-8")
    print(f"完成：{out}（{len(roster)} 人，{len({s['group'] for s in roster})} 組，{'展示' if cfg['demo'] else '正式'}模式）")

if __name__ == "__main__": main()
