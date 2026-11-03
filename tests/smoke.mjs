// 煙霧測試：確認主要流程沒有壞掉。
// 執行：npm install && npx playwright install chromium && npm test
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";

const file = pathToFileURL(path.resolve(process.argv[2] || "index.html")).href;
const errors = [];
const ok = (cond, msg) => { if (!cond) throw new Error("✗ " + msg); console.log("✓ " + msg); };

// Apps Script 會把 JS 裡 // 後面的內容當註解刪掉（連字串裡的網址也會被砍），所以字串裡的 :// 一律寫成 :\/\/
{
  const src = (await import("node:fs")).readFileSync(path.resolve(process.argv[2] || "index.html"), "utf8");
  const js = src.slice(src.lastIndexOf("\n<script>\n"));
  const bad = js.split("\n").filter(l => l.includes("//") && !l.trim().startsWith("//") && !/; \/\/ /.test(l));
  ok(bad.length === 0, "程式碼字串裡沒有 //（Apps Script 相容）" + (bad.length ? "：" + bad[0].trim().slice(0, 60) : ""));
  const body = src.match(/<script>([\s\S]*)<\/script>\s*<\/body>/)[1];
  const stripped = body.split("\n").map(l => { const i = l.indexOf("//"); return i < 0 ? l : l.slice(0, i); }).join("\n");
  let parses = true; try { new Function(stripped); } catch (e) { parses = false; }
  ok(parses, "模擬 Apps Script 刪掉 // 之後，程式仍能正常執行");
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
page.on("pageerror", e => errors.push(e.message));
await page.goto(file);

// 1. 不登入就能看首頁和作業說明
ok(await page.isVisible("[data-cdh]"), "公開首頁有大倒數");
ok(await page.isVisible(".brief h1") && !(await page.isVisible('[data-tab="brief"]')), "首頁就是作業說明，不用登入就能看");

// 2. 點寫心得會要求登入，登入後直接到我的作業
await page.click('[data-go="essay"]');
ok(await page.isVisible("#loginForm"), "點「去寫心得」會跳出登入");
await page.fill("#lid", "114900002"); await page.fill("#lpw", "0900000000");
await page.click("#loginForm button"); await page.waitForTimeout(300);
ok((await page.textContent("#lerr")).includes("手機"), "手機錯誤會被擋下");
await page.fill("#lpw", "0900-000-002"); await page.click("#loginForm button"); await page.waitForTimeout(400);
ok((await page.textContent(".tab.on")).includes("我的作業"), "登入後直接進到我的作業");

// 3. 排版：題目、學號、組別、姓名
await page.fill("#etitle", "測試題目"); await page.fill("#etext", "第一段。\n第二段。"); await page.waitForTimeout(500);
const meta = await page.innerText("#pages .meta");
ok(meta.includes("114900002") && meta.includes("第 1 組") && !meta.includes("學號："), "頁首只顯示學號、組別、姓名");
ok((await page.textContent("#fsinfo")).includes("14 pt"), "短文用 14pt");

// 4. 超過兩頁會被擋
await page.fill("#etext", Array(30).fill("測".repeat(90)).join("\n")); await page.waitForTimeout(600);
ok((await page.innerText("#fitwarn")).includes("超過兩頁"), "超過兩頁會顯示警告");

// 5. 老師登入與設定
await page.click("#logout"); await page.click("#tLogin");
await page.fill("#tid", "teacher"); await page.fill("#tpw", "1234"); await page.click("#tForm button"); await page.waitForTimeout(400);
ok(await page.isVisible('[data-tab="t-settings"]'), "老師可以登入並看到系統設定");
await page.click('[data-tab="t-settings"]'); await page.click("#peerOn"); await page.waitForTimeout(200);
const tabs = await page.$$eval(".tab", e => e.map(x => x.textContent).join("|"));
ok(!tabs.includes("互評結果"), "關閉組間互評後，互評分頁會隱藏");

ok(errors.length === 0, "沒有 JavaScript 錯誤" + (errors.length ? "：" + errors.join("; ") : ""));
await browser.close();
