(function () {
  'use strict';
  const config = window.TRADIEBOOKS_SUPABASE || {};
  const enabled = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.url || '') && !!config.publishableKey;
  const keys = ['invoices', 'receipts', 'lastInvoiceNumber', 'gstBasis'];
  const ownerKey = 'tradiebooksAccountOwner';
  const pendingKey = 'tradiebooksPendingSave';
  let client;
  let user;
  let revision = 0;
  let busy = false;

  function readLocal() {
    const invoices = JSON.parse(localStorage.getItem('invoices') || '[]');
    const receipts = JSON.parse(localStorage.getItem('receipts') || '[]');
    if (!Array.isArray(invoices) || !Array.isArray(receipts)) throw new Error('Local book data is invalid. Export a backup before continuing.');
    return {
      invoices,
      receipts,
      lastInvoiceNumber: Number(localStorage.getItem('lastInvoiceNumber')) || 1000,
      gstBasis: localStorage.getItem('gstBasis') === 'cash' ? 'cash' : 'noncash'
    };
  }
  function writeLocal(book) {
    localStorage.setItem('invoices', JSON.stringify(book.invoices || []));
    localStorage.setItem('receipts', JSON.stringify(book.receipts || []));
    localStorage.setItem('lastInvoiceNumber', String(book.lastInvoiceNumber || 1000));
    localStorage.setItem('gstBasis', book.gstBasis === 'cash' ? 'cash' : 'noncash');
  }
  function clearLocal() { keys.forEach(key => localStorage.removeItem(key)); }
  function hasUnownedBook() { return !localStorage.getItem(ownerKey) && keys.some(key => localStorage.getItem(key) !== null); }
  function summary(book) {
    const sum = (rows, key) => rows.reduce((value, row) => value + (Number(row[key]) || 0), 0);
    return {
      invoices: book.invoices.length,
      receipts: book.receipts.length,
      invoiceTotal: Math.round(sum(book.invoices, 'total') * 100) / 100,
      receiptTotal: Math.round(sum(book.receipts, 'amount') * 100) / 100
    };
  }
  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
    return JSON.stringify(value);
  }
  function nextPage() {
    const page = location.pathname.split('/').pop() || 'index.html';
    return page === 'login.html' ? 'index.html' : page + location.search;
  }
  function safeNext(value) {
    if (!value || !/^[a-z-]+\.html(?:\?[\w=&%-]*)?$/.test(value) || value.startsWith('login.html')) return 'index.html';
    return value;
  }
  function loginUrl() { return 'login.html?next=' + encodeURIComponent(nextPage()); }
  function loadSdk() {
    if (client) return Promise.resolve(client);
    if (!enabled) return Promise.reject(new Error('Supabase is not configured.'));
    if (window.supabase && window.supabase.createClient) {
      client = window.supabase.createClient(config.url.replace(/\/$/, ''), config.publishableKey);
      return Promise.resolve(client);
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.0/dist/umd/supabase.min.js';
      script.onload = () => {
        if (!window.supabase || !window.supabase.createClient) return reject(new Error('Could not load Supabase.'));
        client = window.supabase.createClient(config.url.replace(/\/$/, ''), config.publishableKey);
        resolve(client);
      };
      script.onerror = () => reject(new Error('Could not load Supabase. Check your connection.'));
      document.head.appendChild(script);
    });
  }
  function showBlock(message) {
    document.documentElement.classList.remove('tradiebooks-loading');
    document.body.innerHTML = '<main style="max-width:430px;margin:12vh auto;padding:28px;font:16px/1.5 system-ui;color:#163028"><h1>TradieBooks</h1><p id="cloudError"></p><button id="retryCloud" style="padding:12px 20px;border:0;border-radius:10px;background:#163028;color:white">Retry</button> <button id="backupLocal" style="padding:12px 20px;border:0;border-radius:10px;background:#e7eee8;color:#163028">Download local backup</button></main>';
    document.getElementById('cloudError').textContent = message;
    document.getElementById('retryCloud').onclick = () => location.reload();
    document.getElementById('backupLocal').onclick = () => {
      try {
        const blob = new Blob([JSON.stringify(readLocal(), null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'tradiebooks-local-recovery.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      } catch (error) { alert('Could not export local data: ' + error.message); }
    };
  }
  async function fetchBook(currentUser) {
    const { data, error } = await client.from('books').select('data, revision').eq('user_id', currentUser.id).maybeSingle();
    if (error) throw error;
    return data;
  }
  async function recoverPending(row) {
    const raw = localStorage.getItem(pendingKey);
    if (!raw) return row;
    const pending = JSON.parse(raw);
    if (pending.owner !== user.id) throw new Error('An unsaved change belongs to another account. Sign in with that account on this browser to recover it.');
    if (row && stable(row.data) === stable(pending.data)) {
      localStorage.removeItem(pendingKey);
      return row;
    }
    if (Number(row ? row.revision : 0) !== Number(pending.expected)) {
      throw new Error('This browser has an unsaved change that conflicts with a newer cloud book. Export a local backup before retrying.');
    }
    const { error } = await client.rpc('save_book', { p_expected: pending.expected, p_data: pending.data });
    if (error) throw error;
    const saved = await fetchBook(user);
    if (!saved || stable(saved.data) !== stable(pending.data)) throw new Error('Could not verify the interrupted save.');
    localStorage.removeItem(pendingKey);
    return saved;
  }
  async function boot() {
    try {
      await loadSdk();
      const response = await client.auth.getUser();
      if (response.error || !response.data.user) { location.replace(loginUrl()); return; }
      user = response.data.user;
      const owner = localStorage.getItem(ownerKey);
      if (owner && owner !== user.id && localStorage.getItem(pendingKey)) {
        throw new Error('This browser has an unfinished save for another account. Sign in with that account to recover it.');
      }
      if (owner && owner !== user.id) { clearLocal(); localStorage.removeItem(ownerKey); }
      if (hasUnownedBook()) { location.replace(loginUrl()); return; }
      const row = await recoverPending(await fetchBook(user));
      const remote = row ? row.data : { invoices: [], receipts: [], lastInvoiceNumber: 1000, gstBasis: 'noncash' };
      const before = JSON.stringify(readLocal());
      revision = row ? Number(row.revision) : 0;
      writeLocal(remote);
      localStorage.setItem(ownerKey, user.id);
      if (before !== JSON.stringify(readLocal())) { location.reload(); return; }
      document.documentElement.classList.remove('tradiebooks-loading');
      const accountEl = document.getElementById('accountIdentity');
      if (accountEl) accountEl.textContent = user.email || user.id;
      document.dispatchEvent(new Event('tradiebooks:ready'));
    } catch (error) { showBlock('Could not open your cloud book: ' + error.message); }
  }
  async function commit(mutator) {
    if (!enabled) { mutator(); return true; }
    if (!user || busy) return false;
    busy = true;
    let before;
    try {
      before = readLocal();
      mutator();
      const after = readLocal();
      localStorage.setItem(pendingKey, JSON.stringify({ owner: user.id, expected: revision, data: after }));
      document.body.classList.add('tradiebooks-saving');
      const { data, error } = await client.rpc('save_book', { p_expected: revision, p_data: after });
      if (error) throw error;
      revision = Number(data);
      localStorage.removeItem(pendingKey);
      return true;
    } catch (error) {
      if (before) writeLocal(before);
      localStorage.removeItem(pendingKey);
      alert('Cloud save failed. Your last change was not saved. ' + error.message + (error.message.includes('revision_conflict') ? ' Reload to get the latest book.' : ' Please try again.'));
      return false;
    } finally { busy = false; document.body.classList.remove('tradiebooks-saving'); }
  }
  async function signOut() {
    if (!enabled) return;
    const { error } = await client.auth.signOut();
    if (error) { alert('Could not sign out: ' + error.message); return; }
    clearLocal();
    localStorage.removeItem(ownerKey);
    localStorage.removeItem(pendingKey);
    location.href = 'login.html';
  }
  window.TradieCloud = { enabled, readLocal, writeLocal, clearLocal, hasUnownedBook, summary, safeNext, loadSdk, fetchBook, commit, signOut, get client() { return client; }, get user() { return user; }, get revision() { return revision; }, setRevision(value) { revision = Number(value); }, ownerKey };
  if (enabled && !location.pathname.endsWith('/login.html')) {
    document.documentElement.classList.add('tradiebooks-loading');
    const style = document.createElement('style');
    style.textContent = 'html.tradiebooks-loading body { visibility: hidden !important; } html.tradiebooks-loading::before { content:"Opening your book..."; position:fixed; inset:0; display:grid; place-items:center; background:#f4f7f3; color:#163028; font:600 16px system-ui; z-index:9999; } body.tradiebooks-saving::after { content:"Saving to cloud..."; position:fixed; inset:0; display:grid; place-items:center; background:#f4f7f3dd; color:#163028; font:600 16px system-ui; z-index:9999; }';
    document.head.appendChild(style);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }
})();
