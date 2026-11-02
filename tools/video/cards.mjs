import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
fs.mkdirSync("cards",{recursive:true});
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1920,height:1080}});
await p.goto(pathToFileURL("cards.html").href); await p.waitForTimeout(500);
const L=[["title",0],["pain",1],["pain",2],["pain",3],["pain",4],["remind",0],["confirm",0],["repo",1],["repo",2],["repo",3],["closing",0]];
for(const [id,s] of L){await p.evaluate(([i,s])=>show(i,s),[id,s]); await p.screenshot({path:`cards/${id}${s||""}.jpg`,quality:92});}
await b.close();
