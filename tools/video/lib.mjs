import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const NM=ROOT+"/node_modules/";  // 需先在 repo 根目錄 npm i --no-save pdfjs-dist@3.11.174 html2canvas@1.4.1 jspdf@2.5.1 jszip@3.10.1
const MAP={"pdf.worker.min.js":"pdfjs-dist/build/pdf.worker.min.js","pdf.min.js":"pdfjs-dist/build/pdf.min.js","html2canvas.min.js":"html2canvas/dist/html2canvas.min.js","jspdf.umd.min.js":"jspdf/dist/jspdf.umd.min.js","jszip.min.js":"jszip/dist/jszip.min.js"};
const FONTCSS=[400,500,700,900].map(w=>`@font-face{font-family:"Noto Sans TC";font-weight:${w};src:local("Noto Sans CJK TC")}@font-face{font-family:"Noto Serif TC";font-weight:${w};src:local("Noto Serif CJK TC")}`).join("");
export async function open(opts={}){
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1.5,acceptDownloads:true,...opts});
  await ctx.route("https://cdnjs.cloudflare.com/**",r=>{const f=Object.keys(MAP).find(k=>r.request().url().endsWith("/"+k));r.fulfill({contentType:"application/javascript",body:fs.readFileSync(NM+MAP[f])})});
  await ctx.route("https://fonts.googleapis.com/**",r=>r.fulfill({contentType:"text/css",body:FONTCSS}));
  const p=await ctx.newPage(); p.on("pageerror",e=>console.log("ERR",e.message));
  await p.goto(pathToFileURL(ROOT+"/index.html").href); await p.waitForTimeout(800);
  return {b,ctx,p};
}
