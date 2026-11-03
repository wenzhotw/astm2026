/**
 * ASTM 2026 課程作業繳交系統：Google Apps Script 後端
 *
 * 這個檔案貼在「Google 試算表 → 擴充功能 → Apps Script」裡。
 * 部署步驟見 docs/DEPLOY.md。
 *
 * 資料都存在這份試算表（8 個分頁）和雲端硬碟資料夾。
 * 前端 index.html 透過 google.script.run.api(函式名稱, token, 參數) 呼叫這裡。
 */

// ================= 基本設定 =================
const APP_TITLE = 'ASTM 2026 課程作業繳交系統';
const LIMIT = 1500;                 // 個人作業字數上限（不含空白），要跟前端一致
const GROUPS = [1, 2, 3, 4, 5, 6, 7];
const SESSION_SECONDS = 6 * 60 * 60; // 登入有效 6 小時
const TZ = 'Asia/Taipei';

const SH = {
  roster: '學生名單', essays: '個人作業', drafts: '草稿', peer: '個人互評',
  finals: '小組互評', reports: '小組報告', grades: '老師評分', settings: '設定', history: '互評紀錄'
};
const HEAD = {
  roster: ['組別', '學號', '姓名', 'Email', '手機', '是否組長'],
  essays: ['學號', '姓名', '組別', '版本', '題目', '內文', '字數', '繳交時間', 'PDF檔案ID', '確認信'],
  drafts: ['學號', '題目', '內文', '更新時間'],
  peer: ['評分人學號', '評分人', '評分人組別', '被評組', '分數', '評語', '更新時間'],
  finals: ['評分組', '被評組', '分數', '名次', '評語', '整體評語', '送出人', '送出時間'],
  reports: ['組別', '檔案ID', '檔名', '原始檔名', '頁數', '上傳人', '上傳時間'],
  grades: ['類型', '對象', '分數', '評語', '更新時間'],
  settings: ['項目', '值', '說明'],
  history: ['次數', '名稱', '結果（系統用，請不要手改）', '封存時間']
};
const DEFAULT_SETTINGS = [
  ['截止時間', '2026-11-22 23:00', '格式：YYYY-MM-DD HH:mm（台北時間）'],
  ['組間互評', '開', '開／關'],
  ['自動提醒信', '開', '開／關：截止前三天、前一天早上 9 點寄給還沒交個人作業的人'],
  ['老師帳號', 'teacher', ''],
  ['老師密碼', '請改成你自己的密碼', '老師登入用，部署前一定要改'],
  ['作業說明', '', '由系統後台編輯，請不要手動改這格'],
  ['寄件人名稱', 'ASTM 課程助教', '確認信與提醒信的寄件人名稱'],
  ['檔案資料夾ID', '', '初始化時自動建立'],
  ['目前互評次數', '2', '第幾次組間互評。老師在後台按「結束這次互評」時會自動加 1；第 1 次的結果已內建在網頁裡'],
  ['全學期互評次數', '3', ''],
  ['老師通知信箱', '', '七組都上傳簡報、七組都送出互評時，自動寄信到這裡（多個用逗號隔開）。可在網頁後台修改']
];

// ================= 網頁入口 =================
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 試算表上方的選單，方便助教操作
function onOpen() {
  SpreadsheetApp.getUi().createMenu('ASTM 系統')
    .addItem('① 初始化（第一次使用）', 'setup')
    .addItem('② 檢查名單', 'checkRoster')
    .addSeparator()
    .addItem('開啟自動提醒排程', 'installReminderTrigger')
    .addItem('關閉自動提醒排程', 'removeReminderTrigger')
    .addItem('寄一封測試信給自己', 'sendTestMail')
    .addToUi();
}

// ================= 初始化 =================
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SH).forEach(k => {
    let sh = ss.getSheetByName(SH[k]);
    if (!sh) sh = ss.insertSheet(SH[k]);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, HEAD[k].length).setValues([HEAD[k]]).setFontWeight('bold').setBackground('#e3efec');
      sh.setFrozenRows(1);
    }
  });
  // 學號、手機欄設成純文字，避免開頭的 0 被吃掉
  ss.getSheetByName(SH.roster).getRange('B:B').setNumberFormat('@');
  ss.getSheetByName(SH.roster).getRange('E:E').setNumberFormat('@');
  // 預設設定
  const st = ss.getSheetByName(SH.settings);
  const have = st.getLastRow() > 1 ? st.getRange(2, 1, st.getLastRow() - 1, 1).getValues().map(r => r[0]) : [];
  DEFAULT_SETTINGS.forEach(r => { if (have.indexOf(r[0]) < 0) st.appendRow(r); });
  st.getRange('B:B').setNumberFormat('@');
  // 雲端資料夾
  let folderId = getSetting_('檔案資料夾ID');
  if (!folderId) {
    const parent = DriveApp.getFileById(ss.getId()).getParents();
    const base = parent.hasNext() ? parent.next() : DriveApp.getRootFolder();
    const root = base.createFolder('ASTM2026 作業檔案');
    root.createFolder('個人作業'); root.createFolder('小組報告'); root.createFolder('小組報告舊版');
    setSetting_('檔案資料夾ID', root.getId());
  }
  const def = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  safeAlert_('初始化完成！\n\n下一步：\n1. 到「學生名單」分頁匯入名單\n2. 到「設定」分頁改老師密碼和截止時間\n3. 選單「ASTM 系統 → ② 檢查名單」');
}

function checkRoster() {
  const list = roster_();
  const msgs = [];
  const ids = {};
  list.forEach((s, i) => {
    if (!s.id) msgs.push(`第 ${i + 2} 列沒有學號`);
    if (ids[s.id]) msgs.push(`學號 ${s.id} 重複`); ids[s.id] = 1;
    if (!/^09\d{8}$/.test(s.phone)) msgs.push(`${s.name}（${s.id}）的手機不是 09 開頭 10 碼`);
    if (GROUPS.indexOf(s.group) < 0) msgs.push(`${s.name} 的組別不是 1～7`);
    if (!/@/.test(s.email)) msgs.push(`${s.name} 沒有 Email`);
  });
  GROUPS.forEach(g => {
    const n = list.filter(s => s.group === g && s.leader).length;
    if (n !== 1) msgs.push(`第 ${g} 組的組長有 ${n} 位（應該剛好 1 位）`);
  });
  if (getSetting_('老師密碼') === DEFAULT_SETTINGS[4][1]) msgs.push('還沒改老師密碼（設定分頁）');
  safeAlert_(msgs.length ? '名單有問題：\n\n' + msgs.join('\n') : `名單沒問題：共 ${list.length} 人，${GROUPS.length} 組。`);
  return msgs;
}

// ================= 前端呼叫入口 =================
function api(fn, token, p) {
  try {
    const PUBLIC = { publicInfo: 1, login: 1, teacherLogin: 1 };
    let sess = null;
    if (!PUBLIC[fn]) {
      sess = getSession_(token);
      if (!sess) return { error: '登入已過期，請重新登入', expired: true };
    }
    if (!H[fn]) return { error: '未知的動作：' + fn };
    return H[fn](p || {}, sess);
  } catch (e) {
    console.error(fn, e);
    return { error: String(e && e.message || e) };
  }
}

const H = {
  publicInfo() {
    return { snapshot: { settings: publicSettings_(), brief: brief_(), history: history_() } };
  },

  login(p) {
    const id = String(p.id || '').trim().toUpperCase();
    const phone = digits_(p.pw);
    const s = roster_().find(x => x.id === id);
    if (!s) return { error: '找不到這個學號，請再確認一次（特邀學員請輸入 GUEST01 或 GUEST02）' };
    if (s.phone !== phone) return { error: '手機號碼不正確，請輸入 09 開頭的 10 碼' };
    const token = newSession_({ role: 'student', id: s.id });
    const sess = { role: 'student', id: s.id };
    return { token, user: publicStudent_(s, true), snapshot: snapshot_(sess) };
  },

  teacherLogin(p) {
    if (String(p.id || '').trim() !== getSetting_('老師帳號') || String(p.pw || '') !== getSetting_('老師密碼'))
      return { error: '帳號或密碼錯誤' };
    if (getSetting_('老師密碼') === DEFAULT_SETTINGS[4][1]) return { error: '請先到試算表的「設定」分頁改老師密碼' };
    const sess = { role: 'teacher' };
    return { token: newSession_(sess), user: { teacher: true }, snapshot: snapshot_(sess) };
  },

  refresh(p, sess) { return { snapshot: snapshot_(sess), user: sess.role === 'teacher' ? { teacher: true } : publicStudent_(student_(sess), true) }; },

  saveDraft(p, sess) {
    student_(sess);
    const sh = sheet_(SH.drafts);
    const r = findRow_(sh, row => String(row[0]) === sess.id);
    if (p.clear) { if (r) sh.deleteRow(r); return { ok: true }; }
    const vals = [[sess.id, String(p.title || ''), String(p.text || ''), new Date()]];
    if (r) sh.getRange(r, 1, 1, 4).setValues(vals); else sh.appendRow(vals[0]);
    return { ok: true };
  },

  submitEssay(p, sess) {
    const s = student_(sess);
    const title = String(p.title || '').trim(), text = String(p.text || '');
    const n = text.replace(/\s/g, '').length;
    if (!title) return { error: '還沒填題目' };
    if (!n) return { error: '內文是空的' };
    if (n > LIMIT) return { error: `超過字數上限 ${n - LIMIT} 字` };
    if (!p.pdf) return { error: '沒有收到 PDF' };
    return withLock_(() => {
      const sh = sheet_(SH.essays);
      const v = rows_(SH.essays).filter(r => String(r['學號']) === s.id).length + 1;
      const name = `第${s.group}組_${s.name}_${s.id}_v${v}.pdf`;
      const blob = Utilities.newBlob(Utilities.base64Decode(p.pdf), 'application/pdf', name);
      const file = subFolder_('個人作業', `第${s.group}組`).createFile(blob);
      const now = new Date();
      sh.appendRow([s.id, s.name, s.group, v, title, text, n, now, file.getId(), '寄送中']);
      const row = sh.getLastRow();
      // 刪草稿
      const d = sheet_(SH.drafts), dr = findRow_(d, r => String(r[0]) === s.id);
      if (dr) d.deleteRow(dr);
      // 確認信
      let mailed = false;
      try {
        if (s.email) {
          MailApp.sendEmail({
            to: s.email,
            subject: `【作業繳交確認】第${s.group}組 ${s.name} 個人作業 v${v}`,
            htmlBody: `<p>${esc_(s.name)} 同學你好：</p>
              <p>系統已收到你的個人作業（第 ${v} 版），繳交時間 ${fmt_(now)}，共 ${n} 字。排版好的 PDF 附在這封信裡。</p>
              <p>需要修改的話，可以再登入系統重新繳交，老師會以最新版本為準。</p>
              <p style="color:#888">${esc_(getSetting_('寄件人名稱') || '')}</p>`,
            name: getSetting_('寄件人名稱') || APP_TITLE,
            attachments: [blob]
          });
          mailed = true;
        }
      } catch (e) { console.error('mail', e); }
      sh.getRange(row, 10).setValue(mailed ? '已寄出' : '寄送失敗');
      return { ok: true, v, mailed, email: s.email, snapshot: snapshot_(sess) };
    });
  },

  savePeer(p, sess) {
    const s = student_(sess);
    const S = settings_();
    if (!S.peerOn) return { error: '老師目前沒有開放組間互評' };
    const reports = reportsMap_();
    if (!reports[s.group]) return { error: '本組簡報還沒上傳，暫時不能評分' };
    const g = Number(p.g), score = Math.round(Number(p.score));
    if (GROUPS.indexOf(g) < 0 || !reports[g]) return { error: '這組還沒上傳簡報' };
    if (!(score >= 0 && score <= 100)) return { error: '分數要在 0 到 100 之間' };
    return withLock_(() => {
      const sh = sheet_(SH.peer);
      const vals = [[s.id, s.name, s.group, g, score, String(p.comment || ''), new Date()]];
      const r = findRow_(sh, row => String(row[0]) === s.id && Number(row[3]) === g);
      if (r) sh.getRange(r, 1, 1, 7).setValues(vals); else sh.appendRow(vals[0]);
      return { ok: true };
    });
  },

  submitFinal(p, sess) {
    const s = student_(sess);
    if (!s.leader) return { error: '只有組長可以送出小組評分' };
    if (!settings_().peerOn) return { error: '老師目前沒有開放組間互評' };
    const reports = reportsMap_();
    const missing = GROUPS.filter(g => !reports[g]);
    if (missing.length) return { error: `第 ${missing.join('、')} 組還沒上傳簡報` };
    const ranks = GROUPS.map(g => Number(p.ranks[g])).sort((a, b) => a - b).join(',');
    if (ranks !== GROUPS.join(',')) return { error: '名次要剛好是第 1 到第 7 名，不能重複' };
    for (const g of GROUPS) { const v = Number(p.scores[g]); if (!(v >= 0 && v <= 100)) return { error: `第 ${g} 組的分數要在 0 到 100 之間` }; }
    return withLock_(() => {
      const sh = sheet_(SH.finals);
      for (let r = sh.getLastRow(); r >= 2; r--) if (Number(sh.getRange(r, 1).getValue()) === s.group) sh.deleteRow(r);
      const now = new Date();
      GROUPS.forEach(g => sh.appendRow([s.group, g, Math.round(Number(p.scores[g])), Number(p.ranks[g]),
        String((p.comments || {})[g] || ''), String(p.overall || ''), s.name, now]));
      notifyTeacher_('finals');
      return { ok: true, snapshot: snapshot_(sess) };
    });
  },

  uploadReport(p, sess) {
    const s = student_(sess);
    if (!s.leader) return { error: '只有組長可以上傳小組報告' };
    if (!p.data) return { error: '沒有收到檔案' };
    return withLock_(() => {
      const name = `第${s.group}組_簡報.pdf`;
      const sh = sheet_(SH.reports);
      const r = findRow_(sh, row => Number(row[0]) === s.group);
      if (r) { // 舊檔移到「小組報告舊版」
        try {
          const old = DriveApp.getFileById(String(sh.getRange(r, 2).getValue()));
          old.setName(`第${s.group}組_簡報_${Utilities.formatDate(new Date(), TZ, 'MMdd_HHmm')}被取代.pdf`);
          old.moveTo(subFolder_('小組報告舊版'));
        } catch (e) { console.error(e); }
      }
      const blob = Utilities.newBlob(Utilities.base64Decode(p.data), 'application/pdf', name);
      const file = subFolder_('小組報告').createFile(blob);
      const vals = [[s.group, file.getId(), name, String(p.orig || ''), Number(p.pages) || '', s.name, new Date()]];
      if (r) sh.getRange(r, 1, 1, 7).setValues(vals); else sh.appendRow(vals[0]);
      notifyTeacher_('reports');
      return { ok: true, snapshot: snapshot_(sess) };
    });
  },

  getReport(p, sess) {
    const rep = reportsMap_()[Number(p.g)];
    if (!rep) return { error: '這組還沒上傳' };
    const blob = DriveApp.getFileById(rep.fileId).getBlob();
    return { data: Utilities.base64Encode(blob.getBytes()), name: rep.name };
  },

  gradeEssay(p, sess) {
    teacher_(sess);
    upsertGrade_('個人', String(p.id), p.score, p.comment);
    return { ok: true };
  },

  gradeGroup(p, sess) {
    teacher_(sess);
    upsertGrade_('小組', String(p.g), p.score, p.comment);
    return { ok: true };
  },

  saveSettings(p, sess) {
    teacher_(sess);
    if (p.deadline != null) setSetting_('截止時間', Utilities.formatDate(new Date(Number(p.deadline)), TZ, 'yyyy-MM-dd HH:mm'));
    if (p.peerOn != null) setSetting_('組間互評', p.peerOn ? '開' : '關');
    if (p.remindOn != null) setSetting_('自動提醒信', p.remindOn ? '開' : '關');
    if (p.brief != null) setSetting_('作業說明', p.brief ? JSON.stringify(p.brief) : '');
    if (p.notifyEmail != null) setSetting_('老師通知信箱', String(p.notifyEmail).trim());
    return { ok: true, snapshot: snapshot_(sess) };
  }
};

// 結束這一次互評：把各組送出的小組評分封存到「互評紀錄」（不留個人評分），
// 清空個人互評、小組互評，簡報移到「小組報告舊版」，次數加 1
H.endRound = function (p, sess) {
  teacher_(sess);
  return withLock_(() => {
    const S = settings_(), cur = S.peerRound;
    if (cur >= S.peerRounds) return { error: `全學期共 ${S.peerRounds} 次互評，已經是最後一次` };
    const R = finalsResult_();
    let hs = sheet_(SH.history);
    if (!hs) { hs = SpreadsheetApp.getActiveSpreadsheet().insertSheet(SH.history); hs.appendRow(HEAD.history); hs.setFrozenRows(1); }
    hs.appendRow([cur, `第 ${cur} 次小組作業互評`, JSON.stringify({ ranks: R.ranks, scores: R.scores, comments: R.comments, overall: R.overall, at: R.at }), new Date()]);
    const clear = name => { const sh = sheet_(name); for (let r = sh.getLastRow(); r >= 2; r--) sh.deleteRow(r); };
    rows_(SH.reports).forEach(r => {
      try { const f = DriveApp.getFileById(String(r['檔案ID'])); f.setName(`第${cur}次_第${r['組別']}組_簡報.pdf`); f.moveTo(subFolder_('小組報告舊版')); } catch (e) { console.error(e); }
    });
    clear(SH.peer); clear(SH.finals); clear(SH.reports);
    setSetting_('目前互評次數', String(cur + 1));
    return { ok: true, snapshot: snapshot_(sess) };
  });
};

// ================= 回傳給前端的資料 =================
// 學員只拿得到：全班姓名與組別、自己的作業、同組的繳交狀態與互評、本組的小組評分。
// 老師拿得到全部。手機號碼永遠不回傳。
function snapshot_(sess) {
  const isT = sess.role === 'teacher';
  const R = roster_();
  const me = isT ? null : R.find(x => x.id === sess.id);
  const sameGroup = id => { const x = R.find(r => r.id === id); return me && x && x.group === me.group; };
  const snap = { students: R.map(s => publicStudent_(s, isT || (me && s.id === me.id))), versions: {}, drafts: {},
    pdfs: {}, peer: {}, finals: {}, tEssay: {}, tGroup: {}, settings: publicSettings_(isT), brief: brief_(), history: history_() };

  rows_(SH.essays).sort((a, b) => a['版本'] - b['版本']).forEach(r => {
    const id = String(r['學號']);
    if (!isT && !sameGroup(id)) return;
    const full = isT || id === me.id;
    (snap.versions[id] = snap.versions[id] || []).push({ title: full ? String(r['題目']) : '', text: full ? String(r['內文']) : '', at: ms_(r['繳交時間']) });
  });
  rows_(SH.drafts).forEach(r => {
    const id = String(r['學號']);
    if (isT || id === me.id) snap.drafts[id] = { title: String(r['題目']), text: String(r['內文']), at: ms_(r['更新時間']) };
    else if (sameGroup(id)) snap.drafts[id] = { title: '', text: '', at: ms_(r['更新時間']) };
  });
  rows_(SH.reports).forEach(r => {
    snap.pdfs[Number(r['組別'])] = { kind: 'pdf', name: String(r['檔名']), orig: String(r['原始檔名']), pages: Number(r['頁數']) || null, at: ms_(r['上傳時間']), remote: true };
  });
  // 獨立評分：全組每個人都評完七組之前，學員只拿得到自己的互評
  const peerRows = rows_(SH.peer), cnt = {};
  peerRows.forEach(r => { const id = String(r['評分人學號']); (cnt[id] = cnt[id] || {})[Number(r['被評組'])] = 1; });
  const groupDone = !isT && R.filter(x => x.group === me.group).every(x => Object.keys(cnt[x.id] || {}).length === GROUPS.length);
  peerRows.forEach(r => {
    const id = String(r['評分人學號']);
    if (!isT && id !== me.id && !(groupDone && sameGroup(id))) return;
    (snap.peer[id] = snap.peer[id] || {})[Number(r['被評組'])] = { score: Number(r['分數']), comment: String(r['評語'] || '') };
  });
  rows_(SH.finals).forEach(r => {
    const g = Number(r['評分組']);
    if (!isT && g !== me.group) return;
    const f = snap.finals[g] = snap.finals[g] || { scores: {}, ranks: {}, comments: {}, overall: String(r['整體評語'] || ''), at: ms_(r['送出時間']) };
    const t = Number(r['被評組']);
    f.scores[t] = Number(r['分數']); f.ranks[t] = Number(r['名次']);
    if (r['評語']) f.comments[t] = String(r['評語']);
  });
  if (isT) rows_(SH.grades).forEach(r => {
    const o = { score: Number(r['分數']), comment: String(r['評語'] || '') };
    if (r['類型'] === '個人') snap.tEssay[String(r['對象'])] = o; else snap.tGroup[Number(r['對象'])] = o;
  });
  return snap;
}

// ================= 截止前自動提醒信 =================
function installReminderTrigger() {
  removeReminderTrigger(true);
  ScriptApp.newTrigger('sendReminders').timeBased().everyDays(1).atHour(9).inTimezone(TZ).create();
  safeAlert_('已開啟：每天早上 9 點檢查，截止前三天、前一天會寄提醒信給還沒交個人作業的人。\n（「設定」分頁的「自動提醒信」要是「開」）');
}
function removeReminderTrigger(silent) {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sendReminders').forEach(t => ScriptApp.deleteTrigger(t));
  if (silent !== true) safeAlert_('已關閉自動提醒排程。');
}
function sendReminders() {
  const S = settings_();
  if (!S.remindOn) return;
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const dueDay = Utilities.formatDate(new Date(S.deadline), TZ, 'yyyy-MM-dd');
  const daysLeft = Math.round((Date.parse(dueDay) - Date.parse(today)) / 864e5);
  if (daysLeft !== 3 && daysLeft !== 1) return;
  const key = `remind_${dueDay}_${daysLeft}`;
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(key)) return; // 同一天不重複寄
  const done = {}; rows_(SH.essays).forEach(r => { done[String(r['學號'])] = 1; });
  const todo = roster_().filter(s => !done[s.id] && s.email);
  todo.forEach(s => {
    try {
      MailApp.sendEmail({
        to: s.email,
        subject: `【提醒】個人反思心得還有 ${daysLeft} 天截止`,
        htmlBody: `<p>${esc_(s.name)} 同學你好：</p>
          <p>個人反思心得將在 <b>${fmt_(new Date(S.deadline))}</b> 截止，系統顯示你還沒有繳交。</p>
          <p>登入系統直接打字即可，會自動排版成 A4：<br><a href="${ScriptApp.getService().getUrl()}">${ScriptApp.getService().getUrl()}</a></p>
          <p>帳號是學號，密碼是手機號碼。</p>
          <p style="color:#888">${esc_(getSetting_('寄件人名稱') || '')}</p>`,
        name: getSetting_('寄件人名稱') || APP_TITLE
      });
    } catch (e) { console.error('remind', s.id, e); }
  });
  props.setProperty(key, String(todo.length));
}
function sendTestMail() {
  const me = Session.getActiveUser().getEmail();
  MailApp.sendEmail(me, '【測試】ASTM 作業系統寄信正常', '如果你收到這封信，代表系統可以正常寄信。');
  safeAlert_('已寄出測試信到 ' + me + '\n今天剩餘寄信額度：' + MailApp.getRemainingDailyQuota());
}

// ================= 小工具 =================
function sheet_(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }
function rows_(name) {
  const sh = sheet_(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getDataRange().getValues(); const h = v.shift();
  return v.filter(r => r.join('') !== '').map(r => { const o = {}; h.forEach((k, i) => o[k] = r[i]); return o; });
}
function findRow_(sh, pred) {
  if (sh.getLastRow() < 2) return 0;
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  for (let i = 0; i < v.length; i++) if (pred(v[i])) return i + 2;
  return 0;
}
function digits_(x) { let d = String(x == null ? '' : x).replace(/\D/g, ''); if (d.length === 9 && d[0] === '9') d = '0' + d; return d; }
function roster_() {
  return rows_(SH.roster).map(r => {
    const id = String(r['學號']).trim().toUpperCase();
    return { id, name: String(r['姓名']).trim(), group: Number(r['組別']), email: String(r['Email'] || '').trim(),
      phone: digits_(r['手機']), leader: /^(是|y|yes|1|true)$/i.test(String(r['是否組長']).trim()), guest: !/^\d+$/.test(id) };
  }).filter(s => s.id);
}
function publicStudent_(s, withEmail) { return { id: s.id, name: s.name, group: s.group, leader: s.leader, guest: s.guest, email: withEmail ? s.email : '' }; }
function student_(sess) { if (!sess || sess.role !== 'student') throw new Error('請用學員帳號登入'); const s = roster_().find(x => x.id === sess.id); if (!s) throw new Error('名單裡找不到你'); return s; }
function teacher_(sess) { if (!sess || sess.role !== 'teacher') throw new Error('只有老師可以做這件事'); }
function newSession_(o) { const t = Utilities.getUuid(); CacheService.getScriptCache().put('s_' + t, JSON.stringify(o), SESSION_SECONDS); return t; }
function getSession_(t) { if (!t) return null; const v = CacheService.getScriptCache().get('s_' + t); return v ? JSON.parse(v) : null; }
function withLock_(fn) { const lock = LockService.getScriptLock(); lock.waitLock(30000); try { return fn(); } finally { lock.releaseLock(); } }
function getSetting_(k) { const r = rows_(SH.settings).find(x => x['項目'] === k); return r ? String(r['值']).trim() : ''; }
function setSetting_(k, v) {
  const sh = sheet_(SH.settings); const r = findRow_(sh, row => row[0] === k);
  if (r) sh.getRange(r, 2).setValue(v); else sh.appendRow([k, v, '']);
}
function settings_() {
  const d = getSetting_('截止時間').replace(/\//g, '-');
  const m = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  const deadline = m ? Date.parse(`${m[1]}-${('0' + m[2]).slice(-2)}-${('0' + m[3]).slice(-2)}T${('0' + (m[4] || 23)).slice(-2)}:${m[5] || '00'}:00+08:00`) : Date.now() + 7 * 864e5;
  return { deadline, peerOn: getSetting_('組間互評') !== '關', remindOn: getSetting_('自動提醒信') !== '關',
    peerRound: Number(getSetting_('目前互評次數')) || 2, peerRounds: Number(getSetting_('全學期互評次數')) || 3 };
}
function publicSettings_(isT) { const o = settings_(); if (isT) o.notifyEmail = getSetting_('老師通知信箱'); return o; }
// 已結束的互評（只有小組層級：名次、分數、評語），每個人都能看
function history_() {
  const h = {};
  rows_(SH.history).forEach(r => { try { h[Number(r['次數'])] = Object.assign({ title: String(r['名稱']) }, JSON.parse(r['結果（系統用，請不要手改）'])); } catch (e) {} });
  return h;
}
function finalsResult_() {
  const R = { ranks: {}, scores: {}, comments: {}, overall: {}, at: {} };
  rows_(SH.finals).forEach(r => {
    const g = Number(r['評分組']), t = Number(r['被評組']);
    (R.ranks[g] = R.ranks[g] || {})[t] = Number(r['名次']);
    (R.scores[g] = R.scores[g] || {})[t] = Number(r['分數']);
    if (r['評語']) (R.comments[g] = R.comments[g] || {})[t] = String(r['評語']);
    R.overall[g] = String(r['整體評語'] || ''); R.at[g] = ms_(r['送出時間']);
  });
  return R;
}
// 依各組給的名次取平均，算出綜合排名
function ranking_(R) {
  return GROUPS.map(t => {
    const rk = GROUPS.map(g => R.ranks[g] && R.ranks[g][t]).filter(x => x != null);
    const sc = GROUPS.map(g => R.scores[g] && R.scores[g][t]).filter(x => x != null);
    return { t, avgRank: rk.length ? rk.reduce((a, b) => a + b, 0) / rk.length : 99, avgScore: sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : 0 };
  }).sort((a, b) => a.avgRank - b.avgRank || b.avgScore - a.avgScore);
}

// ================= 自動通知老師 =================
// 七組都上傳簡報、七組都送出小組互評時各寄一次（每一次互評各一次）
function notifyTeacher_(kind) {
  const to = getSetting_('老師通知信箱'); if (!to) return;
  const round = settings_().peerRound, key = `notify_${kind}_r${round}`;
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(key)) return;
  const url = ScriptApp.getService().getUrl(), name = getSetting_('寄件人名稱') || APP_TITLE;
  let subject, html;
  if (kind === 'reports') {
    if (!GROUPS.every(g => reportsMap_()[g])) return;
    const folder = subFolder_('小組報告');
    to.split(/[,，\s]+/).filter(Boolean).forEach(e => { try { folder.addViewer(e); } catch (err) { console.error('share', e, err); } });
    const list = GROUPS.map(g => { const f = DriveApp.getFileById(reportsMap_()[g].fileId); return `<li><a href="${f.getUrl()}">${esc_(f.getName())}</a></li>`; }).join('');
    subject = `【ASTM】七組簡報都已上傳（第 ${round} 次）`;
    html = `<p>老師您好：</p><p>七組的小組簡報都已經上傳完成，可以開始看各組報告了。</p>
      <p><b>雲端資料夾：</b><a href="${folder.getUrl()}">小組報告</a></p><ul>${list}</ul>
      <p>也可以登入作業系統的「小組報告評分」直接看並評分：<br><a href="${url}">${url}</a></p>`;
  } else {
    const R = finalsResult_();
    if (!GROUPS.every(g => R.ranks[g])) return;
    const rows = ranking_(R).map((x, i) => `<tr><td style="padding:4px 12px">第 ${i + 1} 名</td><td style="padding:4px 12px">第 ${x.t} 組</td><td style="padding:4px 12px;text-align:right">平均名次 ${Math.round(x.avgRank * 100) / 100}</td><td style="padding:4px 12px;text-align:right">平均 ${Math.round(x.avgScore * 10) / 10} 分</td></tr>`).join('');
    subject = `【ASTM】七組都已送出第 ${round} 次小組互評`;
    html = `<p>老師您好：</p><p>七組都已經送出第 ${round} 次小組互評，綜合排名如下（依各組給的名次取平均，數字越小越好）：</p>
      <table style="border-collapse:collapse;border:1px solid #ddd">${rows}</table>
      <p>各組給的名次、分數與評語，請登入作業系統的「互評結果」查看：<br><a href="${url}">${url}</a></p>`;
  }
  try {
    MailApp.sendEmail({ to, subject, htmlBody: html + `<p style="color:#888">${esc_(name)}（系統自動寄出）</p>`, name });
    props.setProperty(key, String(Date.now()));
  } catch (e) { console.error('notify', e); }
}
function brief_() { const j = getSetting_('作業說明'); if (!j) return null; try { return JSON.parse(j); } catch (e) { return null; } }
function reportsMap_() { const m = {}; rows_(SH.reports).forEach(r => { m[Number(r['組別'])] = { fileId: String(r['檔案ID']), name: String(r['檔名']) }; }); return m; }
function rootFolder_() { return DriveApp.getFolderById(getSetting_('檔案資料夾ID')); }
function subFolder_(name, child) {
  const pick = (parent, n) => { const it = parent.getFoldersByName(n); return it.hasNext() ? it.next() : parent.createFolder(n); };
  const f = pick(rootFolder_(), name); return child ? pick(f, child) : f;
}
function upsertGrade_(type, target, score, comment) {
  const sc = Math.round(Number(score)); if (!(sc >= 0 && sc <= 100)) throw new Error('分數要在 0 到 100 之間');
  withLock_(() => {
    const sh = sheet_(SH.grades); const vals = [[type, target, sc, String(comment || ''), new Date()]];
    const r = findRow_(sh, row => row[0] === type && String(row[1]) === target);
    if (r) sh.getRange(r, 1, 1, 5).setValues(vals); else sh.appendRow(vals[0]);
  });
}
function ms_(v) { if (v instanceof Date) return v.getTime(); const n = Number(v); return isNaN(n) ? Date.parse(v) : n; }
function fmt_(d) { return Utilities.formatDate(d, TZ, 'M/d HH:mm'); }
function esc_(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function safeAlert_(msg) { try { SpreadsheetApp.getUi().alert(msg); } catch (e) { console.log(msg); } }
