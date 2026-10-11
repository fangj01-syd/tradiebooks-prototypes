(function () {
  const cloud = window.TradieCloud;
  const $ = id => document.getElementById(id);
  const next = cloud.safeNext(new URLSearchParams(location.search).get('next'));
  let user;
  let row;
  let localBook;
  let backedUp = false;
  let email = '';
  const money = value => '$' + Number(value).toFixed(2);
  const show = id => ['setup','emailStep','codeStep','migrationStep'].forEach(name => $(name).classList.toggle('hidden', name !== id));
  const status = (message, error = false) => { $('status').textContent = message; $('status').style.color = error ? '#a23e2b' : '#163028'; };
  function downloadBackup() {
    const blob = new Blob([JSON.stringify({ ...localBook, exported: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'tradiebooks-before-cloud-backup.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    backedUp = true;
    $('uploadButton').disabled = false;
    $('openCloudButton').disabled = false;
    status('Backup downloaded. Keep this file somewhere safe.');
  }
  function openCloud() {
    if (!backedUp || !user) return;
    cloud.clearLocal();
    localStorage.setItem(cloud.ownerKey, user.id);
    location.href = next;
  }
  async function upload() {
    if (!backedUp || !user) return;
    if (row && (row.data.invoices.length || row.data.receipts.length)) {
      status('This account already has a cloud book. Keep your downloaded backup and open the cloud book instead.', true);
      return;
    }
    $('uploadButton').disabled = true;
    status('Uploading and checking your book...');
    try {
      const expected = row ? Number(row.revision) : 0;
      const { data: newRevision, error } = await cloud.client.rpc('save_book', { p_expected: expected, p_data: localBook });
      if (error) throw error;
      const saved = await cloud.fetchBook(user);
      if (!saved || Number(saved.revision) !== Number(newRevision) || JSON.stringify(cloud.summary(saved.data)) !== JSON.stringify(cloud.summary(localBook))) {
        throw new Error('Cloud totals did not match the local book. Keep your backup and retry.');
      }
      localStorage.setItem(cloud.ownerKey, user.id);
      status('Verified. Opening your cloud book...');
      location.href = next;
    } catch (error) {
      status('Upload was not confirmed: ' + error.message + '. Your local data and backup remain available.', true);
      $('uploadButton').disabled = false;
    }
  }
  async function afterSignIn(signedInUser) {
    user = signedInUser;
    const owner = localStorage.getItem(cloud.ownerKey);
    if (owner && owner !== user.id && localStorage.getItem('tradiebooksPendingSave')) {
      await cloud.client.auth.signOut();
      user = null;
      show('emailStep');
      status('This browser has an unfinished save for another account. Sign in with that account first and recover it.', true);
      return;
    }
    if (owner && owner !== user.id) { cloud.clearLocal(); localStorage.removeItem(cloud.ownerKey); }
    row = await cloud.fetchBook(user);
    if (!cloud.hasUnownedBook()) { location.href = next; return; }
    localBook = cloud.readLocal();
    const totals = cloud.summary(localBook);
    const cloudTotals = row ? cloud.summary(row.data) : { invoices:0, receipts:0 };
    $('invoiceCount').textContent = String(totals.invoices);
    $('receiptCount').textContent = String(totals.receipts);
    $('invoiceTotal').textContent = money(totals.invoiceTotal);
    $('receiptTotal').textContent = money(totals.receiptTotal);
    $('migrationText').textContent = cloudTotals.invoices || cloudTotals.receipts
      ? 'This account already has a cloud book. Download a backup of this browser, then open the existing cloud book. Your local book will not replace it.'
      : 'This browser has an older local book. Download a backup, then upload it to your account.';
    $('uploadButton').classList.toggle('hidden', !!(cloudTotals.invoices || cloudTotals.receipts));
    $('openCloudButton').classList.toggle('hidden', !row);
    show('migrationStep');
  }
  async function start() {
    if (!cloud.enabled) { show('setup'); return; }
    try {
      await cloud.loadSdk();
      const { data, error } = await cloud.client.auth.getUser();
      if (error || !data.user) { show('emailStep'); return; }
      await afterSignIn(data.user);
    } catch (error) { show('emailStep'); status('Could not check your account: ' + error.message, true); }
  }
  $('emailForm').addEventListener('submit', async event => {
    event.preventDefault();
    email = $('email').value.trim().toLowerCase();
    status('Sending code...');
    const { error } = await cloud.client.auth.signInWithOtp({ email });
    if (error) { status(error.message, true); return; }
    $('sentTo').textContent = email;
    show('codeStep');
    status('Code sent. Check your inbox.');
  });
  $('codeForm').addEventListener('submit', async event => {
    event.preventDefault();
    status('Checking code...');
    const { data, error } = await cloud.client.auth.verifyOtp({ email, token: $('code').value.trim(), type: 'email' });
    if (error || !data.user) { status(error ? error.message : 'Could not sign in.', true); return; }
    try { await afterSignIn(data.user); } catch (problem) { status(problem.message, true); }
  });
  $('changeEmail').addEventListener('click', () => { show('emailStep'); status(''); });
  $('backupButton').addEventListener('click', downloadBackup);
  $('uploadButton').addEventListener('click', upload);
  $('openCloudButton').addEventListener('click', openCloud);
  start();
})();
