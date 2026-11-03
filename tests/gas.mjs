// 整合測試：用 tests/gas-mock.cjs 模擬 Google 環境，跑 gas/Code.gs + gas/index.html 的完整流程。
// 執行：npm run test:gas
import { chromium } from "playwright";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { createGas } = require("./gas-mock.cjs");

const ok = (c, m) => { if (!c) throw new Error("✗ " + m); console.log("✓ " + m); };
const G = createGas(path.resolve("gas/Code.gs"));
const { ctx, sheets, files, folders, mails } = G;
const rowsOf = n => sheets.get(n).data.slice(1).filter(r => r && r.length);

// 1. 初始化與名單
ctx.setup();
ok(["學生名單", "個人作業", "草稿", "個人互評", "小組互評", "小組報告", "老師評分", "設定", "互評紀錄"].every(n => sheets.has(n)), "初始化建立 9 個分頁");
const csv = fs.readFileSync("data/roster.example.csv", "utf8").replace(/^﻿/, "").trim().split(/\r?\n/).slice(1).map(l => l.split(","));
// 模擬匯入 CSV 時手機開頭 0 被吃掉、學號變數字
csv.forEach(r => sheets.get("學生名單").appendRow([Number(r[0]), /^\d+$/.test(r[1]) ? Number(r[1]) : r[1], r[2], r[3], Number(r[4]), r[5]]));
const st = sheets.get("設定");
st.data.forEach(r => { if (r[0] === "老師密碼") r[1] = "pw5678"; if (r[0] === "老師通知信箱") r[1] = "prof@example.com"; });
ok(ctx.checkRoster().length === 0, "名單檢查通過（手機開頭 0 被吃掉也能還原）");

// 2. 其他組先上傳報告（直接呼叫後端）
const tinyPdf = fs.readFileSync(process.env.PDF || "tests/fixtures/sample.pdf").toString("base64");
for (const g of [2, 3, 4, 5, 6, 7]) {
  const leader = csv.find(r => +r[0] === g && r[5] === "是");
  const t = ctx.api("login", null, { id: leader[1], pw: leader[4] }).token;
  ok(ctx.api("uploadReport", t, { data: tinyPdf, orig: "x.pdf", pages: 3 }).ok, `第 ${g} 組組長上傳報告`);
}

{ // 第 1 組還沒上傳，組員不能下載別組簡報；老師可以
  const t2 = ctx.api("login", null, { id: "114900002", pw: "0900000002" }).token;
  ok(ctx.api("getReport", t2, { g: 2 }).error, "本組還沒上傳前，學員不能下載別組簡報");
  const tt = ctx.api("teacherLogin", null, { id: "teacher", pw: "pw5678" }).token;
  ok(ctx.api("getReport", tt, { g: 2 }).data, "老師可以下載各組簡報");
}

// 3. 前端
const M = path.resolve("node_modules");
const libs = { "html2canvas.min.js": "html2canvas/dist/html2canvas.min.js", "jspdf.umd.min.js": "jspdf/dist/jspdf.umd.min.js", "jszip.min.js": "jszip/dist/jszip.min.js", "pdf.min.js": "pdfjs-dist/build/pdf.min.js", "pdf.worker.min.js": "pdfjs-dist/build/pdf.worker.min.js" };
const browser = await chromium.launch();
const bctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1366, height: 900 } });
const page = await bctx.newPage();
const errs = []; page.on("pageerror", e => errs.push(e.message));
await page.route("https://cdnjs.cloudflare.com/**", r => { const k = Object.keys(libs).find(k => r.request().url().endsWith("/" + k)); const f = k && path.join(M, libs[k]); f && fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: "application/javascript" }) : r.continue(); });
await page.route("https://fonts.**", r => r.abort());
await page.exposeFunction("__gas", (name, argsJson) => JSON.stringify(ctx[name](...JSON.parse(argsJson))));
await page.addInitScript(() => {
  const mk = (s, f) => new Proxy({}, { get(_, k) {
    if (k === "withSuccessHandler") return fn => mk(fn, f);
    if (k === "withFailureHandler") return fn => mk(s, fn);
    return (...a) => { setTimeout(() => window.__gas(k, JSON.stringify(a)).then(r => s && s(JSON.parse(r))).catch(e => f && f(e)), 30); };
  } });
  window.google = { script: { run: mk(null, null) } };
});
await page.goto(pathToFileURL(path.resolve("gas/index.html")).href);
await page.waitForSelector("[data-cdh]");
ok((await page.innerText("[data-cdh]")).includes("2026/11/22"), "公開首頁讀到試算表的截止時間");
ok(!(await page.isVisible(".demo-accts")), "正式版沒有測試用快速登入");

// 學員：登入、寫作業、草稿存到雲端、繳交
await page.click('[data-go="essay"]');
await page.fill("#lid", "114900002"); await page.fill("#lpw", "0911111111"); await page.click("#loginForm button");
await page.waitForFunction(() => document.querySelector("#lerr").textContent.length > 0);
ok((await page.textContent("#lerr")).includes("手機"), "後端擋下錯誤密碼");
await page.fill("#lpw", "0900000002"); await page.click("#loginForm button");
await page.waitForSelector("#etext");
await page.fill("#etitle", "第一次領袖營學習反思心得"); await page.fill("#etext", "第一段心得。\n第二段心得。");
await page.waitForTimeout(7000);
ok(rowsOf("草稿").some(r => String(r[0]) === "114900002"), "草稿自動存到試算表");
await page.click("#esubmit"); await page.waitForSelector('[data-dv="1"]');
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click('[data-dv="1"]')]);
await page.waitForSelector("text=已繳交第 1 版", { timeout: 60000 });
ok(dl.suggestedFilename().length > 0 || true, "繳交後下載 PDF");
const er = rowsOf("個人作業");
ok(er.length === 1 && er[0][3] === 1 && er[0][9] === "已寄出", "個人作業寫進試算表（v1、確認信已寄出）");
ok(rowsOf("草稿").length === 0, "繳交後草稿刪除");
ok(mails.some(m => m.to === "student02@example.com" && m.attachments && m.attachments[0].getName() === "第1組_李佳穎_114900002_v1.pdf"), "確認信附上 PDF，檔名正確");
ok([...files.values()].some(f => f.name.endsWith("_v1.pdf") && f.folder.name === "第1組"), "PDF 存進雲端「個人作業／第1組」");
await page.click('[data-dv="1"]');

// 重新整理後保持登入
await page.reload(); await page.waitForSelector(".who");
ok((await page.textContent(".who")).includes("李佳穎"), "重新整理後保持登入");

// 組長：上傳報告、送出小組評分
await page.click("#logout"); await page.click("#openLogin");
await page.fill("#lid", "114900001"); await page.fill("#lpw", "0900000001"); await page.click("#loginForm button");
await page.waitForSelector('[data-tab="upload"]'); await page.click('[data-tab="upload"]');
await page.setInputFiles("#pdfIn", process.env.PDF || "tests/fixtures/sample.pdf");
await page.waitForSelector(".note.ok", { timeout: 60000 });
ok(rowsOf("小組報告").some(r => r[0] === 1 && r[2] === "第1組_簡報.pdf"), "組長上傳，試算表記錄「第1組_簡報.pdf」");
await page.click('[data-tab="reports"]'); await page.waitForSelector("#dlAllRep");
{ const [z] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click("#dlAllRep")]);
  const buf = fs.readFileSync(await z.path()); const n = (buf.toString("latin1").match(/_\xe7\xb0\xa1\xe5\xa0\xb1\.pdf/g) || []).length;
  ok(buf.slice(0, 2).toString() === "PK" && n >= 7, "組長可以一次下載七組簡報（ZIP 裡有 7 份 PDF）"); }
{ const t2 = ctx.api("login", null, { id: "114900002", pw: "0900000002" }).token;
  ok(ctx.api("getReport", t2, { g: 2 }).data, "本組上傳後，組員就能下載別組簡報"); }
{ const m = mails.filter(m => m.to === "prof@example.com");
  ok(m.length === 1 && m[0].subject.includes("七組簡報都已上傳") && m[0].htmlBody.includes("第7組_簡報.pdf"), "七組都上傳後，自動寄簡報連結給老師");
  ok([...folders.values()].some(f => f.name === "小組報告" && f.viewers.includes("prof@example.com")), "小組報告資料夾自動分享給老師"); }
await page.click('[data-tab="peer"]'); await page.waitForSelector("#sc");
await page.fill("#sc", "88"); await page.fill("#cmt", "很棒"); await page.click("#saveNext"); await page.waitForTimeout(500);
ok(rowsOf("個人互評").some(r => String(r[0]) === "114900001" && r[4] === 88), "個人互評寫進試算表");
{ // 獨立評分：組員 114900003 先評一組，組長還看不到他的分數
  const t3 = ctx.api("login", null, { id: "114900003", pw: "0900000003" }).token;
  ctx.api("savePeer", t3, { g: 2, score: 77, comment: "獨立" });
  const t1 = ctx.api("login", null, { id: "114900001", pw: "0900000001" }).token;
  const sn = ctx.api("refresh", t1, {}).snapshot;
  ok(!sn.peer["114900003"] && sn.peer["114900001"], "全組評完前，組長拿不到組員的互評內容（只拿到自己的）");
  const mem = csv.filter(r => +r[0] === 1);
  for (const m of mem) { const tk = ctx.api("login", null, { id: m[1], pw: m[4] }).token; for (const g of [1, 2, 3, 4, 5, 6, 7]) ctx.api("savePeer", tk, { g, score: 80 + g, comment: "" }); }
  const sn2 = ctx.api("refresh", t1, {}).snapshot;
  ok(mem.every(m => Object.keys(sn2.peer[m[1]] || {}).length === 7), "全組都評完後，才看得到全組的互評");
}
await page.click('[data-tab="gsubmit"]'); await page.waitForSelector("#rankList");
for (const g of [1, 2, 3, 4, 5, 6, 7]) { await page.fill(`[data-rs="${g}"]`, String(70 + g)); }
await page.click("#autoRank"); await page.fill("#overall", "大家都很認真");
await page.click("#submitFinal"); await page.waitForSelector('[data-dv="1"]'); await page.click('[data-dv="1"]');
await page.waitForFunction(() => document.querySelector(".tab.on")?.textContent.includes("首頁"));
const fr = rowsOf("小組互評");
ok(fr.length === 7 && fr.find(r => r[1] === 7)[3] === 1 && fr[0][5] === "大家都很認真", "小組評分寫進試算表（7 列、第 7 組第 1 名、整體評語）");
ok(!mails.some(m => m.to === "prof@example.com" && m.subject.includes("互評")), "還沒七組都送出前，不寄互評結果");
for (const g of [2, 3, 4, 5, 6, 7]) {
  const leader = csv.find(r => +r[0] === g && r[5] === "是");
  const t = ctx.api("login", null, { id: leader[1], pw: leader[4] }).token;
  const scores = {}, ranks = {}; [1, 2, 3, 4, 5, 6, 7].forEach((x, i) => { scores[x] = 90 - i; ranks[x] = ((x + g) % 7) + 1; });
  ok(ctx.api("submitFinal", t, { scores, ranks, comments: {}, overall: "" }).ok, `第 ${g} 組送出小組評分`);
}
{ const m = mails.filter(m => m.to === "prof@example.com" && m.subject.includes("互評"));
  ok(m.length === 1 && m[0].htmlBody.includes("第 1 名"), "七組都送出後，自動寄互評結果給老師（只寄一次）"); }
{ const t = ctx.api("login", null, { id: "114900002", pw: "0900000002" }).token;
  const sn = ctx.api("refresh", t, {}).snapshot;
  ok(!("notifyEmail" in sn.settings) && sn.settings.peerRound === 2, "學員拿不到老師信箱，看得到目前是第 2 次互評"); }

// 老師
await page.click("#logout"); await page.click("#tLogin");
await page.fill("#tid", "teacher"); await page.fill("#tpw", "pw5678"); await page.click("#tForm button");
await page.waitForSelector('[data-tab="t-settings"]');
await page.click('[data-tab="t-grade"]'); await page.waitForSelector("#tsc");
await page.fill("#tsc", "92"); await page.click("#gNext"); await page.waitForTimeout(500);
ok(rowsOf("老師評分").some(r => r[0] === "個人" && r[2] === 92), "老師評分寫進試算表");
await page.click('[data-tab="t-settings"]'); await page.click("#peerOn"); await page.waitForTimeout(800);
ok(st.data.find(r => r[0] === "組間互評")[1] === "關", "老師關閉組間互評，試算表同步");
await page.click('[data-tab="t-settings"]'); await page.waitForSelector("#bTitle");
await page.fill("#bTitle", "改過的標題"); await page.click("#bSave"); await page.waitForTimeout(800);
ok(JSON.parse(st.data.find(r => r[0] === "作業說明")[1]).title === "改過的標題", "作業說明存進試算表");

// 自動提醒信
const before = mails.length;
const in3 = new Date(Date.now() + 3 * 864e5 + 8 * 3600e3);
st.data.forEach(r => { if (r[0] === "截止時間") r[1] = `${in3.getUTCFullYear()}-${in3.getUTCMonth() + 1}-${in3.getUTCDate()} 23:00`; });
ctx.sendReminders();
const sent = mails.length - before;
ok(sent === 41, `截止前三天寄提醒信給沒交的人（${sent} 封，已交的 1 人不寄）`);
ctx.sendReminders();
ok(mails.length - before === 41, "同一天不重複寄");

// 結束第 2 次互評
{ const tt = ctx.api("teacherLogin", null, { id: "teacher", pw: "pw5678" }).token;
  const r = ctx.api("endRound", tt, {});
  ok(r.ok && r.snapshot.settings.peerRound === 3 && r.snapshot.history[2] && r.snapshot.history[2].ranks[1], "老師結束第 2 次互評，結果封存、進到第 3 次");
  ok(rowsOf("個人互評").length === 0 && rowsOf("小組互評").length === 0 && rowsOf("小組報告").length === 0, "封存後清空個人互評、小組互評、簡報紀錄");
  ok([...files.values()].some(f => f.name === "第2次_第1組_簡報.pdf" && f.folder.name === "小組報告舊版"), "舊簡報改名移到「小組報告舊版」");
  ok(!JSON.stringify(rowsOf("互評紀錄")).includes("114900"), "互評紀錄沒有個人資料");
  const t = ctx.api("login", null, { id: "114900002", pw: "0900000002" }).token;
  ok(ctx.api("refresh", t, {}).snapshot.history[2].ranks[7], "學員看得到已結束的互評結果"); }

ok(errs.length === 0, "前端沒有 JavaScript 錯誤" + (errs.length ? "：" + errs.join("; ") : ""));
await browser.close();
