/* Saves projects (answers, chosen colors, photos, masks) in this browser's
   IndexedDB, and settings in localStorage. Everything stays on this device. */
(function (root) {
  'use strict';
  var DB = 'ft-color-consultant', STORE = 'projects', dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      try {
        var req = indexedDB.open(DB, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
        req.onsuccess = function () { res(req.result); };
        req.onerror = function () { rej(req.error); };
      } catch (e) { rej(e); }
    });
    return dbp;
  }
  function tx(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(STORE, mode), st = t.objectStore(STORE), out;
        var r = fn(st);
        if (r) r.onsuccess = function () { out = r.result; };
        t.oncomplete = function () { res(out); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function save(p) { p.updated = new Date().toISOString(); return tx('readwrite', function (s) { return s.put(p); }); }
  function load(id) { return tx('readonly', function (s) { return s.get(id); }); }
  function remove(id) { return tx('readwrite', function (s) { return s.delete(id); }); }
  function list() {
    return tx('readonly', function (s) { return s.getAll(); }).then(function (all) {
      return (all || []).map(function (p) {
        return { id: p.id, client: p.client && p.client.name, town: p.client && p.client.town, updated: p.updated, photos: (p.photos || []).length };
      }).sort(function (a, b) { return (b.updated || '').localeCompare(a.updated || ''); });
    });
  }

  var SKEY = 'ft-cc-settings';
  var DEFAULT_SETTINGS = {
    company: 'Final Touch Painters LLC',
    address: '69 Broad St, Red Bank, NJ 07701',
    phone: '848-248-1021',
    email: 'contact@finaltouchpainters.com',
    web: 'finaltouchpainters.com',
    hic: '',
    consultant: '',
    tagline: 'Painting is our passion, making people happy is our mission.',
    logo: '',
    geminiKey: '',
    geminiModel: 'gemini-2.5-flash-image'
  };
  function getSettings() {
    try { return Object.assign({}, DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(SKEY) || '{}')); }
    catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
  }
  function setSettings(s) {
    try { localStorage.setItem(SKEY, JSON.stringify(s)); return true; } catch (e) { return false; }
  }

  root.FTStore = { save: save, load: load, remove: remove, list: list, getSettings: getSettings, setSettings: setSettings, DEFAULT_SETTINGS: DEFAULT_SETTINGS };
})(typeof window !== 'undefined' ? window : globalThis);
