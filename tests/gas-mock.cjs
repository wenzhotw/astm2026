// 在 Node 裡模擬 Google Apps Script 的服務（試算表、雲端硬碟、寄信…），
// 讓 gas/Code.gs 可以在本機跑，配合 tests/gas.mjs 做整合測試。
const fs = require("fs");
const vm = require("vm");
const crypto = require("crypto");

function createGas(codePath) {
  const sheets = new Map(); const files = new Map(); const folders = new Map();
  const mails = []; const cache = new Map(); const props = new Map();
  let idSeq = 1; const nid = p => `${p}${idSeq++}`;

  class Range {
    constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
    getValues() { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push((this.sh.data[this.r - 1 + i] || [])[this.c - 1 + j] ?? ""); out.push(row); } return out; }
    getValue() { return this.getValues()[0][0]; }
    setValues(v) { v.forEach((row, i) => row.forEach((x, j) => { const R = this.r - 1 + i; this.sh.data[R] = this.sh.data[R] || []; this.sh.data[R][this.c - 1 + j] = x; })); return this; }
    setValue(x) { return this.setValues([[x]]); }
    setFontWeight() { return this; } setBackground() { return this; } setNumberFormat() { return this; }
  }
  class Sheet {
    constructor(name) { this.name = name; this.data = []; }
    getLastRow() { while (this.data.length && !(this.data[this.data.length - 1] || []).some(x => x !== "" && x != null)) this.data.pop(); return this.data.length; }
    getLastColumn() { return Math.max(0, ...this.data.map(r => (r || []).length)); }
    getRange(a, b, c, d) { if (typeof a === "string") return new Range(this, 1, 1, 0, 0); return new Range(this, a, b, c || 1, d || 1); }
    getDataRange() { return new Range(this, 1, 1, this.getLastRow(), this.getLastColumn()); }
    appendRow(row) { this.getLastRow(); this.data.push([...row]); }
    deleteRow(r) { this.data.splice(r - 1, 1); }
    setFrozenRows() {}
  }
  const ss = {
    getSheetByName: n => sheets.get(n) || null,
    insertSheet: n => { const s = new Sheet(n); sheets.set(n, s); return s; },
    getSheets: () => [...sheets.values()], deleteSheet: s => sheets.delete(s.name), getId: () => "SS1"
  };
  const iter = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  function mkFolder(name, parent) {
    const f = { id: nid("F"), name, parent, viewers: [], getId() { return this.id; }, getUrl() { return "https://drive.google.com/drive/folders/" + this.id; }, addViewer(e) { this.viewers.push(e); return this; },
      createFolder(n) { return mkFolder(n, this); },
      getFoldersByName(n) { return iter([...folders.values()].filter(x => x.parent === this && x.name === n)); },
      createFile(blob) { const id = nid("D"); const file = { id, name: blob.getName(), bytes: blob.getBytes(), folder: this,
        getId() { return id; }, getName() { return this.name; }, getUrl() { return "https://drive.google.com/file/d/" + id; }, getBlob() { return mkBlob(this.bytes, "application/pdf", this.name); },
        setName(n) { this.name = n; }, moveTo(f2) { this.folder = f2; } }; files.set(id, file); return file; } };
    folders.set(f.id, f); return f;
  }
  const root = mkFolder("我的雲端硬碟", null);
  function mkBlob(bytes, type, name) { return { bytes, type, name, getBytes: () => bytes, getName: () => name }; }
  const pad = n => String(n).padStart(2, "0");
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => { throw new Error("no ui"); } },
    DriveApp: { getFileById: id => id === "SS1" ? { getParents: () => iter([root]) } : files.get(id), getRootFolder: () => root, getFolderById: id => folders.get(id) },
    Utilities: {
      newBlob: (bytes, type, name) => mkBlob(bytes, type, name),
      base64Decode: s => [...Buffer.from(s, "base64")], base64Encode: b => Buffer.from(b).toString("base64"),
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, f) => { const t = new Date(d.getTime() + 8 * 3600e3);
        const m = { yyyy: t.getUTCFullYear(), MM: pad(t.getUTCMonth() + 1), dd: pad(t.getUTCDate()), HH: pad(t.getUTCHours()), mm: pad(t.getUTCMinutes()), M: t.getUTCMonth() + 1, d: t.getUTCDate() };
        return f.replace(/yyyy|MM|dd|HH|mm|M|d/g, k => m[k]); }
    },
    MailApp: { sendEmail: (o, subj, body) => { mails.push(typeof o === "object" ? o : { to: o, subject: subj, body }); }, getRemainingDailyQuota: () => 100 },
    CacheService: { getScriptCache: () => ({ put: (k, v) => cache.set(k, v), get: k => cache.get(k) ?? null }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props.get(k) ?? null, setProperty: (k, v) => props.set(k, v) }) },
    ScriptApp: { getService: () => ({ getUrl: () => "https://script.google.com/macros/s/TEST/exec" }), getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ inTimezone: () => ({ create() {} }) }) }) }) }), deleteTrigger() {} },
    Session: { getActiveUser: () => ({ getEmail: () => "ta@example.com" }) },
    HtmlService: { createHtmlOutputFromFile: () => ({}) , XFrameOptionsMode: {} },
    Date, JSON, Math, Number, String, Object, Array, RegExp, isNaN, Error, Buffer
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(codePath, "utf8") + "\nthis.api=api;this.setup=setup;this.sendReminders=sendReminders;this.checkRoster=checkRoster;", ctx);
  return { ctx, sheets, files, folders, mails, props, Sheet };
}
module.exports = { createGas };
