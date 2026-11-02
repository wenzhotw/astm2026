// 照分鏡錄展示版畫面：每段輸出 frames/<段>.json（[檔名, 秒數]）
import {open} from "./lib.mjs";
import fs from "node:fs";
fs.rmSync("frames",{recursive:true,force:true}); fs.mkdirSync("frames");
const {b,p}=await open();
const sleep=ms=>p.waitForTimeout(ms);
let cur, list, n=0;
const begin=name=>{cur=name;list=[];};
const end=()=>fs.writeFileSync(`frames/${cur}.json`,JSON.stringify(list));
async function snap(d){const f=`frames/${cur}_${String(n++).padStart(5,"0")}.jpg`;await p.screenshot({path:f,quality:92});list.push([f,d]);}
const card=(f,d)=>list.push([`cards/${f}.jpg`,d]);

// 假游標
await p.addStyleTag({content:`#fcur{position:fixed;z-index:99999;left:0;top:0;width:28px;height:28px;pointer-events:none;transform:translate(-3px,-2px)}
#fcur svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}#fcur.clk::after{content:"";position:absolute;left:-18px;top:-18px;width:40px;height:40px;border-radius:50%;background:rgba(31,95,91,.35);border:3px solid rgba(31,95,91,.8)}
#demoBar{display:none!important}`});
await p.evaluate(()=>{const d=document.createElement("div");d.id="fcur";d.innerHTML='<svg width="28" height="28" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.7L21 10.6z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';document.documentElement.appendChild(d);});
let cx=900,cy=500;
const setCur=(x,y,clk=false)=>p.evaluate(([x,y,c])=>{const e=document.getElementById("fcur");e.style.left=x+"px";e.style.top=y+"px";e.classList.toggle("clk",c)},[x,y,clk]);
const hideCur=()=>p.evaluate(()=>document.getElementById("fcur").style.left="-100px");
async function moveTo(sel,steps=7){
  const el=typeof sel==="string"?await p.$(sel):sel; await el.scrollIntoViewIfNeeded();
  const bb=await el.boundingBox(); const tx=bb.x+bb.width/2, ty=bb.y+bb.height/2;
  for(let i=1;i<=steps;i++){const t=i/steps,e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;await setCur(cx+(tx-cx)*e,cy+(ty-cy)*e);await snap(1/30*2);}
  cx=tx;cy=ty; return el;
}
async function click(sel,hold=.4,after=500){const el=await moveTo(sel);await setCur(cx,cy,true);await snap(.25);await el.click();await sleep(after);await setCur(cx,cy,false);await snap(hold);}
async function type(sel,text,per=2,d=.07,wait=0){await moveTo(sel,5);await p.click(sel);
  for(let i=per;i<text.length+per;i+=per){await p.fill(sel,text.slice(0,i));if(wait)await sleep(wait);await snap(d);}}
async function ticking(secs,first=0){ // 真實時間每秒拍一張
  for(let i=0;i<secs;i++){const t0=Date.now();await snap(1);const w=1000-(Date.now()-t0);if(w>0)await sleep(w);}
}
const login=async(id,pw)=>{await type("#lid",id,3,.06);await type("#lpw",pw,4,.06);await click("#loginForm button",.6,700);};
const logout=async()=>{await p.evaluate(()=>{document.querySelector("#logout").click()});await sleep(300);};

// 資料：第 6 組也上傳，七組都有小組評分，讓互評畫面有內容
await p.evaluate(()=>{
  loadSampleData(); DB.pdfs[6]={kind:"sample",name:"第6組_簡報.pdf",orig:"簡報.pdf",at:Date.now()-3600e3};
  const OV=["各組都很用心，第 3 組的資料最完整","整體水準很高，建議時間控制再精準一點","第 5 組的提案最有說服力"];
  for(const g of [2,3,4,5,6,7]){const scores={},ranks={},comments={};const order=[3,5,1,7,2,4,6].sort((a,b)=>((a*g)%7)-((b*g)%7));
    order.forEach((t,i)=>{ranks[t]=i+1;scores[t]=94-i*3;comments[t]=["架構清楚","數據完整","表達流暢","創意十足","可行性高","結論明確","回答問題到位"][(t+g)%7]});
    DB.finals[g]={scores,ranks,comments,overall:OV[g%3],at:Date.now()-g*3600e3};}
  window.scrollTo(0,0);
});
await p.evaluate(()=>{const _n=Date.now.bind(Date);window.__off=0;Date.now=()=>_n()+window.__off;});
const DL=d=>p.evaluate(d=>{window.__off=0;window.__off=DB.settings.deadline-Date.now()-d;},d);
const home=()=>p.evaluate(()=>{go("home");window.scrollTo(0,0)});

// ===== S1 開場 15s =====
begin("s1"); await home(); await hideCur(); await sleep(300);
card("title",4.5); await ticking(11); end();

// ===== S3 倒數變色 + 提醒信 20s =====
begin("s3"); await DL(12*86400e3+5*3600e3+3); await home(); await sleep(1100); await ticking(3);
await DL(6*86400e3+9*3600e3+41*60e3); await sleep(1100); await ticking(3);
await DL(2*86400e3+7*3600e3+12*60e3); await sleep(1100); await ticking(5);
card("remind",9); end();
await p.evaluate(()=>{window.__off=0});

// ===== S4 學員寫作 25s =====
const P=["在第一次領袖營中，我最大的收穫是學會把策略和人才放在一起思考。過去我習慣先定目標再找人，課堂上的案例讓我發現，能不能找到並留住對的人，往往決定了策略能不能落地。",
"小組討論時，大家來自不同產業，一開始意見很分歧。後來我們決定先各自整理資料，再一起比對，才發現彼此的觀點其實可以互補。",
"回到工作上，我開始調整與團隊溝通的方式，先聽完再下判斷，也更願意把責任交給同事。這次的反思讓我更清楚，領導者的任務是讓每個人的長處被看見。"];
begin("s4"); await home(); await sleep(200); cx=900;cy=600; await snap(.6);
await click('[data-go="essay"]',.5,500);
await login("114900004","0900-000-004");
await type("#etitle","從策略與人才看見的自己",2,.08,0);
await moveTo("#etext",5); await p.click("#etext");
const full=P.join("\n");
for(let i=4;i<P[0].length+4;i+=4){await p.fill("#etext",full.slice(0,i));await sleep(160);await snap(.08);}
await p.fill("#etext",full); await sleep(400); await snap(1.6);
await click("#esubmit",1.8,900);
const okBtn=await p.$("#modal button.primary")||(await p.$$("#modal button")).pop();
await click(okBtn,.2,1500); await hideCur(); await snap(2.2);
card("confirm",4.5); end();

// ===== S5 老師後台 25s =====
begin("s5"); await logout(); await home(); await p.evaluate(()=>{const s=document.querySelector("#tLogin");s.scrollIntoView({block:"center"})}); await sleep(200);
await click("#tLogin",.3,400); await type("#tid","teacher",3,.06); await type("#tpw","1234",4,.06); await click("#tForm button",1.2,700);
await click('[data-tab="t-grade"]',1.5,800);
await click('[data-z="1"]',.6,600); await click('[data-z="1"]',1.6,700);
await click('[data-z="0"]',.3,500);
await type("#tsc","88",1,.15); await type("#tcm","反思深入，例子具體",2,.08);
await click("#gNext",1.4,800);
await click(".menu summary",1.8,400); await p.evaluate(()=>document.querySelector(".menu").open=false);
await click('[data-tab="t-settings"]',1.5,700);
await click("#peerOn",1.4,500); await click("#peerOn",.6,500); await hideCur(); await snap(1.5); end();

// ===== S6 互評 25s =====
begin("s6"); await logout(); await home(); await sleep(200);
await click('[data-go="peer"]',.3,500); await login("114900002","0900-000-002");
await p.evaluate(()=>window.scrollTo(0,0));
await click('[data-pg="2"]',.8,500); await click('[data-adj="5"]',.4,300); await click('[data-adj="5"]',.6,300);
await type("#cmt","案例分析很完整，結論清楚",2,.07); await click("#saveNext",1.5,600);
await logout(); await home(); await click('[data-go="upload"]',.3,500); await login("114900001","0900-000-001");
await click('[data-tab="gsubmit"]',2.5,700);
await p.evaluate(()=>document.querySelector("#rankList").scrollIntoView({block:"start"}));await p.evaluate(()=>window.scrollBy(0,-90));await sleep(300);await snap(.6);
for(const [i,v] of [88,84,92,79,86,81,90].entries()){const el=(await p.$$("[data-rs]"))[i];const bb=await el.boundingBox();if(bb&&bb.y>660)break;await setCur(bb.x+bb.width/2,bb.y+bb.height/2);cx=bb.x+bb.width/2;cy=bb.y+bb.height/2;await el.fill(String(v));await el.dispatchEvent("input");await sleep(150);await snap(.35);}
await p.evaluate(()=>{const v=[88,84,92,79,86,81,90];document.querySelectorAll("[data-rs]").forEach((e,i)=>{e.value=v[i];e.dispatchEvent(new Event("input",{bubbles:true}))})});await sleep(200);await snap(.5);
await click("#autoRank",.3,600);await p.evaluate(()=>{document.querySelector("#rankList").scrollIntoView({block:"start"});window.scrollBy(0,-90)});await sleep(200);await snap(2.4);
await logout(); await p.evaluate(()=>{document.querySelector("#tLogin").click()}); await sleep(300);
await p.fill("#tid","teacher"); await p.fill("#tpw","1234"); await p.click("#tForm button"); await sleep(600);
await p.evaluate(()=>{go("t-peer");window.scrollTo(0,0)}); await sleep(600); await hideCur(); await snap(4); end();

// ===== S8 結尾 15s =====
begin("s8"); await logout(); await home(); await hideCur(); await sleep(600); await ticking(2); card("closing",5); end();
await b.close();
