// ============================================================
//  AUTH & USAGE MANAGEMENT
// ============================================================
var ZC_KEY_PREFIX = 'zc_v1:';
function encodeKey(raw) {
  if (!raw) return '';
  try { return ZC_KEY_PREFIX + btoa(unescape(encodeURIComponent(raw))); } catch(e) { return ''; }
}
function decodeKey(stored) {
  if (!stored) return '';
  try {
    if (stored.indexOf(ZC_KEY_PREFIX) === 0) stored = stored.substring(ZC_KEY_PREFIX.length);
    return decodeURIComponent(escape(atob(stored)));
  } catch(e) { return stored; }
}
var authApiKey = decodeKey(localStorage.getItem('zc_api_key') || '');
var authEmail = localStorage.getItem('zc_email') || '';
var authBackendUrl = localStorage.getItem('zc_backend_url') || '';
var authTab = 'register';
var pendingLoginEmail = '';

function isLoggedIn() { return !!authApiKey; }

function getAuthHeaders() {
  if (!authApiKey) return {};
  return { 'Authorization': 'Bearer ' + authApiKey };
}

function updateAuthUI() {
  var authBtn = document.getElementById('authBtn');
  var headerDivider = document.getElementById('headerDivider');
  var userAvatar = document.getElementById('userAvatar');
  var dropdownEmail = document.getElementById('dropdownEmail');

  if (isLoggedIn()) {
    authBtn.style.display = 'none';
    headerDivider.style.display = '';
    userAvatar.style.display = 'flex';
    userAvatar.textContent = authEmail ? authEmail[0].toUpperCase() : '?';
    dropdownEmail.textContent = authEmail;
    fetchUsage();
    document.body.classList.remove('guest');
    msgInput.disabled = false;
    msgInput.placeholder = 'メッセージを入力するなのだ... (Ctrl+Enter で送信)';
    sendBtn.disabled = false;
  } else {
    authBtn.style.display = '';
    headerDivider.style.display = 'none';
    userAvatar.style.display = 'none';
    closeUserDropdown();
    document.body.classList.add('guest');
    msgInput.disabled = true;
    msgInput.placeholder = 'ログインしてずんだもんとお話しするのだ...';
    sendBtn.disabled = true;
  }
}

function toggleUserDropdown() {
  var dd = document.getElementById('userDropdown');
  dd.classList.toggle('open');
  if (dd.classList.contains('open') && isLoggedIn()) fetchUsage();
}
function closeUserDropdown() {
  document.getElementById('userDropdown').classList.remove('open');
}
document.addEventListener('click', function(e) {
  var av = document.getElementById('userAvatar');
  var dd = document.getElementById('userDropdown');
  if (av && dd && !av.contains(e.target) && !dd.contains(e.target)) closeUserDropdown();
  var navBtn = document.getElementById('navMenuBtn');
  var navAct = document.getElementById('navActions');
  if (navBtn && navAct && !navBtn.contains(e.target) && !navAct.contains(e.target)) {
    navAct.classList.remove('open');
  }
});

function toggleNavMenu() {
  document.getElementById('navActions').classList.toggle('open');
}

function fetchUsage() {
  fetch('/api/usage', { headers: getAuthHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.request_count !== undefined) {
        var count = d.request_count;
        var limit = d.request_limit;
        var pct = limit > 0 ? Math.min(100, Math.round(count / limit * 100)) : 0;
        document.getElementById('dropdownUsageText').textContent = count + ' / ' + limit + ' 回（今月）';
        document.getElementById('usageBarFill').style.width = pct + '%';
      }
      if (d.tier) {
        var tier = d.tier;
        var tierEl = document.getElementById('dropdownTier');
        var tierBadge = document.getElementById('dropdownTierBadge');
        var upgradeBtn = document.getElementById('dropdownUpgradeBtn');
        var manageBtn = document.getElementById('dropdownManageBtn');
        if (tierEl) tierEl.textContent = tier === 'plus' ? 'Plus' : (tier === 'free' ? 'Free' : tier);
        if (tier === 'plus') {
          if (upgradeBtn) upgradeBtn.style.display = 'none';
          if (manageBtn) { manageBtn.style.display = ''; manageBtn.disabled = false; manageBtn.textContent = 'プランを管理'; }
          if (tierBadge) tierBadge.style.display = '';
        } else {
          if (upgradeBtn) { upgradeBtn.style.display = ''; upgradeBtn.disabled = false; upgradeBtn.textContent = 'Plusにする'; }
          if (manageBtn) manageBtn.style.display = 'none';
          if (tierBadge) tierBadge.style.display = 'none';
        }
      }
    })
    .catch(function() {});
}

function showAuthModal(message) {
  var modal = document.getElementById('authModal');
  var desc = document.getElementById('authModalDesc');
  var closeBtn = document.getElementById('authModalClose');
  var perks = document.getElementById('authModalPerks');
  if (message) {
    desc.textContent = message;
    if (perks) perks.style.display = 'none';
  } else {
    desc.textContent = 'はじめての方は無料アカウント登録でずんだもんとの会話がはじめられるのだ！';
    if (perks) perks.style.display = '';
  }
  if (closeBtn) closeBtn.style.display = '';
  document.getElementById('authError').textContent = '';
  switchAuthTab(isLoggedIn() ? 'login' : 'register');
  modal.classList.add('active');
}

function hideAuthModal() {
  document.getElementById('authModal').classList.remove('active');
}

function switchAuthTab(tab) {
  authTab = tab;
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
  document.getElementById('authSubmit').textContent = tab === 'login' ? 'ログインする' : '無料で登録する';
  document.getElementById('authError').textContent = '';
  var legal = document.getElementById('authLegalSection');
  if (legal) legal.style.display = tab === 'register' ? '' : 'none';
  updateAuthSubmitState();
}

function updateAuthSubmitState() {
  var submitBtn = document.getElementById('authSubmit');
  if (!submitBtn) return;
  if (authTab === 'register') {
    var agree = document.getElementById('authAgree');
    submitBtn.disabled = !(agree && agree.checked);
  } else {
    submitBtn.disabled = false;
  }
}

function doAuth() {
  var email = document.getElementById('authEmail').value.trim();
  var password = document.getElementById('authPassword').value;
  var errorEl = document.getElementById('authError');
  var submitBtn = document.getElementById('authSubmit');

  if (!email || !password) { errorEl.textContent = 'メールアドレスとパスワードを入力してください'; return; }
  if (authTab === 'register' && password.length < 12) { errorEl.textContent = 'パスワードは12文字以上必要です（現在 ' + password.length + ' 文字）'; return; }
  if (authTab === 'register') {
    var agree = document.getElementById('authAgree');
    if (!agree || !agree.checked) { errorEl.textContent = '利用規約とプライバシーポリシーへの同意が必要です'; return; }
  }

  submitBtn.disabled = true;
  errorEl.textContent = '';

  var endpoint = authTab === 'login' ? '/api/auth/login' : '/api/auth/register';
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: password })
  })
  .then(function(r) { return r.json().then(function(d) { return { status: r.status, data: d }; }); })
  .then(function(res) {
    submitBtn.disabled = false;
    if (res.status >= 400) {
      var msg = res.data.message || res.data.error || 'エラーが発生しました';
      if (/email and password/i.test(msg)) msg = 'メールアドレスとパスワードを入力してください';
      else if (/invalid credentials|unauthorized/i.test(msg)) msg = 'メールアドレスまたはパスワードが違います';
      else if (/rate limit|too many/i.test(msg)) msg = 'リクエストが多すぎます。しばらく待ってから再度お試しください';
      errorEl.textContent = msg;
      return;
    }
    if (authTab === 'register') {
      // Don't auto-login after register. Show a success popup and switch to
      // the login tab so the user explicitly signs in with the new account.
      pendingLoginEmail = email;
      document.getElementById('authPassword').value = '';
      hideAuthModal();
      showRegisterSuccessModal();
      return;
    }
    authApiKey = res.data.api_key || '';
    authEmail = email;
    authBackendUrl = res.data.backend_url || '';
    localStorage.setItem('zc_api_key', encodeKey(authApiKey));
    localStorage.setItem('zc_email', authEmail);
    localStorage.setItem('zc_backend_url', authBackendUrl);
    hideAuthModal();
    updateAuthUI();
    // Login rotates the API key — show account modal so the user can copy
    // the new key into their .env.
    if (res.data.api_key) {
      showAccountModal();
    }
  })
  .catch(function(err) {
    submitBtn.disabled = false;
    errorEl.textContent = '接続エラーなのだ: ' + err.message;
  });
}

function doLogout() {
  clearAuthState();
  showAuthModal();
}

function clearAuthState() {
  authApiKey = '';
  authEmail = '';
  authBackendUrl = '';
  localStorage.removeItem('zc_api_key');
  localStorage.removeItem('zc_email');
  localStorage.removeItem('zc_backend_url');
  updateAuthUI();
}

function showRegisterSuccessModal() {
  document.getElementById('registerSuccessModal').classList.add('active');
}

function hideRegisterSuccessModal() {
  document.getElementById('registerSuccessModal').classList.remove('active');
}

function onRegisterSuccessDone() {
  hideRegisterSuccessModal();
  var emailInput = document.getElementById('authEmail');
  if (emailInput && pendingLoginEmail) emailInput.value = pendingLoginEmail;
  pendingLoginEmail = '';
  showAuthModal();
  switchAuthTab('login');
  var pwInput = document.getElementById('authPassword');
  if (pwInput) { pwInput.value = ''; pwInput.focus(); }
}

function doChangePassword() {
  var current = document.getElementById('currentPassword').value;
  var next = document.getElementById('newPassword').value;
  var confirm = document.getElementById('newPasswordConfirm').value;
  var errorEl = document.getElementById('changePasswordError');
  var successEl = document.getElementById('changePasswordSuccess');
  var btn = document.getElementById('changePasswordBtn');
  errorEl.textContent = '';
  successEl.textContent = '';

  if (!current || !next || !confirm) {
    errorEl.textContent = 'すべての欄を入力してください';
    return;
  }
  if (next.length < 12) {
    errorEl.textContent = '新しいパスワードは12文字以上必要です';
    return;
  }
  if (next !== confirm) {
    errorEl.textContent = '新しいパスワードと確認用が一致していません';
    return;
  }
  if (current === next) {
    errorEl.textContent = '新しいパスワードは現在のパスワードと異なる必要があります';
    return;
  }

  btn.disabled = true;
  fetch('/api/auth/change-password', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
    body: JSON.stringify({ current_password: current, new_password: next })
  })
    .then(function(r) { return r.json().then(function(d) { return { status: r.status, data: d }; }); })
    .then(function(res) {
      btn.disabled = false;
      if (res.status >= 400) {
        var msg = res.data.error || res.data.message || 'パスワード変更に失敗しました';
        if (/current password is incorrect/i.test(msg)) msg = '現在のパスワードが正しくありません';
        else if (/rate limit|too many/i.test(msg)) msg = 'リクエストが多すぎます。しばらく待ってから再度お試しください';
        errorEl.textContent = msg;
        return;
      }
      successEl.textContent = 'パスワードを変更しました';
      document.getElementById('currentPassword').value = '';
      document.getElementById('newPassword').value = '';
      document.getElementById('newPasswordConfirm').value = '';
    })
    .catch(function(err) {
      btn.disabled = false;
      errorEl.textContent = '接続エラーなのだ: ' + err.message;
    });
}

function showDeleteAccountModal() {
  document.getElementById('deleteAccountPassword').value = '';
  document.getElementById('deleteAccountError').textContent = '';
  document.getElementById('deleteAccountModal').classList.add('active');
}

function hideDeleteAccountModal() {
  document.getElementById('deleteAccountModal').classList.remove('active');
}

function doDeleteAccount() {
  var password = document.getElementById('deleteAccountPassword').value;
  var errorEl = document.getElementById('deleteAccountError');
  var btn = document.getElementById('deleteAccountConfirmBtn');
  errorEl.textContent = '';

  if (!password) {
    errorEl.textContent = 'パスワードを入力してください';
    return;
  }

  btn.disabled = true;
  fetch('/api/auth/account', {
    method: 'DELETE',
    headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
    body: JSON.stringify({ password: password })
  })
    .then(function(r) { return r.json().then(function(d) { return { status: r.status, data: d }; }); })
    .then(function(res) {
      btn.disabled = false;
      if (res.status >= 400) {
        var msg = res.data.error || res.data.message || 'アカウント削除に失敗しました';
        if (/password is incorrect/i.test(msg)) msg = 'パスワードが正しくありません';
        else if (/rate limit|too many/i.test(msg)) msg = 'リクエストが多すぎます。しばらく待ってから再度お試しください';
        errorEl.textContent = msg;
        return;
      }
      hideDeleteAccountModal();
      hideAccountModal();
      clearAuthState();
      showAuthModal('アカウントを削除しました。ご利用ありがとうございました。');
    })
    .catch(function(err) {
      btn.disabled = false;
      errorEl.textContent = '接続エラーなのだ: ' + err.message;
    });
}

function showAccountModal() {
  var modal = document.getElementById('accountModal');
  document.getElementById('accountEmail').textContent = authEmail;
  document.getElementById('accountApiKey').textContent = authApiKey || '(ログイン時のみ表示)';
  document.getElementById('accountUsage').textContent = '読み込み中なのだ...';
  document.getElementById('accountTier').textContent = '-';
  ['currentPassword', 'newPassword', 'newPasswordConfirm'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var cpErr = document.getElementById('changePasswordError');
  var cpOk = document.getElementById('changePasswordSuccess');
  if (cpErr) cpErr.textContent = '';
  if (cpOk) cpOk.textContent = '';
  modal.classList.add('active');

  fetch('/api/usage', { headers: getAuthHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d.request_count !== undefined) {
        document.getElementById('accountUsage').textContent = d.request_count + ' / ' + d.request_limit + ' 回（今月）';
        // Keep dropdown in sync with the latest usage data
        var pct = d.request_limit > 0 ? Math.min(100, Math.round(d.request_count / d.request_limit * 100)) : 0;
        document.getElementById('dropdownUsageText').textContent = d.request_count + ' / ' + d.request_limit + ' 回';
        document.getElementById('usageBarFill').style.width = pct + '%';
      }
      if (d.tier) {
        var tierLabel = d.tier === 'plus' ? 'Plus' : (d.tier === 'free' ? 'Free' : d.tier);
        document.getElementById('accountTier').textContent = tierLabel;
        var tierBadge = document.getElementById('accountTierBadge');
        var manageBtn = document.getElementById('managePlanBtn');
        var upgradeBtn = document.getElementById('accountUpgradeBtn');
        if (d.tier === 'plus') {
          if (tierBadge) tierBadge.style.display = '';
          if (manageBtn) { manageBtn.style.display = ''; manageBtn.disabled = false; manageBtn.textContent = 'プランを管理'; }
          if (upgradeBtn) upgradeBtn.style.display = 'none';
        } else {
          if (tierBadge) tierBadge.style.display = 'none';
          if (manageBtn) manageBtn.style.display = 'none';
          if (upgradeBtn) { upgradeBtn.style.display = ''; upgradeBtn.disabled = false; upgradeBtn.textContent = 'Plusにする'; }
        }
      }
    })
    .catch(function() {
      document.getElementById('accountUsage').textContent = '読み込みに失敗したのだ';
    });
}

function hideAccountModal() {
  document.getElementById('accountModal').classList.remove('active');
}

function showHelpModal() {
  document.getElementById('helpModal').classList.add('active');
}
function hideHelpModal() {
  document.getElementById('helpModal').classList.remove('active');
}

function copyApiKey() {
  navigator.clipboard.writeText(authApiKey).then(function() {
    var btn = document.getElementById('copyKeyBtn');
    btn.textContent = 'コピーしたのだ!';
    setTimeout(function() { btn.textContent = 'コピー'; }, 2000);
  });
}

function buildEnvBlock() {
  return 'CLOUD_BACKEND_URL=' + (authBackendUrl || '') + '\n';
}

function copyEnvBlock() {
  navigator.clipboard.writeText(buildEnvBlock()).then(function() {
    var btn = document.getElementById('copyEnvBtn');
    if (!btn) return;
    btn.textContent = 'コピーしたのだ!';
    setTimeout(function() { btn.textContent = '.env 形式でコピー'; }, 2000);
  });
}

function downloadEnvBlock() {
  var blob = new Blob([buildEnvBlock()], { type: 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '.env.zundamon';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function showUpgradeModal() {
  document.getElementById('upgradeModal').classList.add('active');
}

function hideUpgradeModal() {
  document.getElementById('upgradeModal').classList.remove('active');
}

function doUpgrade(tier) {
  if (tier !== 'plus') return;
  var modalBtn = document.getElementById('upgradeBtnPlus');
  var accountBtn = document.getElementById('accountUpgradeBtn');
  var dropdownBtn = document.getElementById('dropdownUpgradeBtn');
  var buttons = [modalBtn, accountBtn, dropdownBtn].filter(Boolean);
  var originals = buttons.map(function(b) { return b.textContent; });
  var errorEls = [document.getElementById('upgradeError'), document.getElementById('accountPlanError')].filter(Boolean);
  errorEls.forEach(function(el) { el.textContent = ''; });
  buttons.forEach(function(b) { b.disabled = true; b.textContent = '準備してるのだ...'; });

  function restore() {
    buttons.forEach(function(b, i) { b.disabled = false; b.textContent = originals[i]; });
  }

  function showErr(msg) {
    errorEls.forEach(function(el) { el.textContent = msg; });
  }

  fetch('/api/billing/checkout', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
    body: JSON.stringify({ tier: tier })
  })
    .then(function(r) { return r.json().then(function(d) { return { status: r.status, data: d }; }); })
    .then(function(res) {
      if (res.status === 401) {
        restore();
        showAuthModal();
        return;
      }
      if (res.status >= 400 || !res.data.checkout_url) {
        restore();
        showErr('アップグレードに失敗したのだ。もう一度試してほしいのだ。');
        return;
      }
      window.location.href = res.data.checkout_url;
    })
    .catch(function() {
      restore();
      showErr('アップグレードに失敗したのだ。もう一度試してほしいのだ。');
    });
}

function openBillingPortal() {
  var accountBtn = document.getElementById('managePlanBtn');
  var dropdownBtn = document.getElementById('dropdownManageBtn');
  var buttons = [accountBtn, dropdownBtn].filter(Boolean);
  var originals = buttons.map(function(b) { return b.textContent; });
  buttons.forEach(function(b) { b.disabled = true; b.textContent = '準備してるのだ...'; });

  function restore() {
    buttons.forEach(function(b, i) { b.disabled = false; b.textContent = originals[i]; });
  }

  fetch('/api/billing/portal', {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders())
  })
    .then(function(r) { return r.json().then(function(d) { return { status: r.status, data: d }; }); })
    .then(function(res) {
      if (res.status === 401) {
        restore();
        showAuthModal();
        return;
      }
      if (res.status >= 400 || !res.data.portal_url) {
        restore();
        var msg = (res.data && res.data.error) || 'プラン管理画面を開けなかったのだ。';
        alert(msg);
        return;
      }
      window.location.href = res.data.portal_url;
    })
    .catch(function() {
      restore();
      alert('プラン管理画面を開けなかったのだ。');
    });
}

function checkTtsAllowed() {
  if (!isLoggedIn()) {
    showAuthModal();
    return false;
  }
  return true;
}

// Init auth UI on load
updateAuthUI();
if (!isLoggedIn()) {
  showAuthModal();
}

function cleanForTTS(t){
  return t.replace(/```[\s\S]*?```/g,' ').replace(/`[^`]+`/g,'').replace(/https?:\/\/\S+/g,'').replace(/[#*_~|>]/g,'').replace(/\s+/g,' ').trim();
}

function ttsResumeRecognition(){
  if(micPausedForTTS&&recognition&&isRecording){
    setTimeout(function(){
      if(micPausedForTTS&&recognition&&isRecording){
        try{recognition.start();}catch(e){}
        micPausedForTTS=false;
      }
    }, 600);
  }
}

var TTSQueue = (function(){
  var gen = 0;
  var queue = [];
  var inflight = null;
  var running = false;
  var onFinishCb = null;

  function authHeaders(){
    var headers = {'Content-Type':'application/json'};
    var ah = getAuthHeaders();
    if (ah.Authorization) headers.Authorization = ah.Authorization;
    return headers;
  }

  function splitLong(text, max){
    var out = [];
    var s = text;
    while (s.length > max){
      var cut = s.lastIndexOf(' ', max);
      if (cut < Math.floor(max/4)) cut = max;
      out.push(s.substring(0, cut));
      s = s.substring(cut).trimStart();
    }
    if (s) out.push(s);
    return out;
  }

  function pushText(text){
    var clean = cleanForTTS(text);
    if (!clean) return '';
    var re = /[^。！？!?\n]+[。！？!?\n]/g;
    var m, lastEnd = 0, sent;
    while ((m = re.exec(clean)) !== null){
      sent = m[0].trim();
      lastEnd = re.lastIndex;
      if (sent.length >= 2){
        splitLong(sent, 200).forEach(function(c){ enqueue(c); });
      }
    }
    return clean.substring(lastEnd);
  }

  function enqueue(chunk){
    if (isMuted || !chunk) return;
    queue.push({text: chunk, gen: gen});
    if (!running) loop();
  }

  function flushTail(text){
    var clean = cleanForTTS(text || '');
    if (clean && clean.length >= 2){
      splitLong(clean, 200).forEach(function(c){ enqueue(c); });
    }
  }

  function cancel(){
    gen++;
    queue = [];
    if (inflight){ try { inflight.abort(); } catch(e){} inflight = null; }
    if (currentAudio){ try { currentAudio.pause(); } catch(e){} currentAudio = null; }
    running = false;
    isSpeaking = false;
  }

  function fetchBlob(chunk, myGen){
    var ctrl = new AbortController();
    inflight = ctrl;
    return fetch('/api/tts', {
      method:'POST', headers: authHeaders(),
      body: JSON.stringify({text: chunk}), signal: ctrl.signal
    }).then(function(res){
      if (myGen !== gen) return null;
      if (res.status === 401){ showAuthModal(); return null; }
      if (res.status === 429){ res.json().then(function(){ showUpgradeModal(); }); return null; }
      if (!res.ok) return null;
      return res.blob();
    }).catch(function(){ return null; });
  }

  function playBlob(blob, myGen){
    return new Promise(function(resolve){
      if (!blob || isMuted || myGen !== gen){ resolve(); return; }
      setAvState('talking','しゃべってるなのだ...');
      var url = URL.createObjectURL(blob);
      var audio = new Audio(url);
      audio.playbackRate = ttsSpeed;
      currentAudio = audio;
      audio.onended = function(){ URL.revokeObjectURL(url); if (currentAudio === audio) currentAudio = null; resolve(); };
      audio.onerror = function(){ URL.revokeObjectURL(url); if (currentAudio === audio) currentAudio = null; resolve(); };
      audio.play().catch(function(){ if (currentAudio === audio) currentAudio = null; resolve(); });
    });
  }

  async function loop(){
    if (running) return;
    running = true;
    if (!checkTtsAllowed()){ running = false; return; }
    if (recognition && isRecording && !micPausedForTTS){
      micPausedForTTS = true;
      try { recognition.stop(); } catch(e){}
    }
    isSpeaking = true;
    var nextBlob = null;
    while (queue.length > 0){
      var item = queue.shift();
      if (item.gen !== gen) continue;
      if (!nextBlob) nextBlob = fetchBlob(item.text, item.gen);
      var blob = await nextBlob;
      if (queue.length > 0 && queue[0].gen === gen){
        nextBlob = fetchBlob(queue[0].text, queue[0].gen);
      } else {
        nextBlob = null;
      }
      if (item.gen !== gen) continue;
      await playBlob(blob, item.gen);
    }
    isSpeaking = false;
    running = false;
    ttsResumeRecognition();
    if (!isProcessing) setAvState('idle','入力待ちなのだ');
    if (onFinishCb){ var cb = onFinishCb; onFinishCb = null; cb(); }
  }

  function whenDone(cb){
    if (!isSpeaking){ cb(); } else { onFinishCb = cb; }
  }

  return { pushText: pushText, flushTail: flushTail, cancel: cancel, enqueue: enqueue, whenDone: whenDone };
})();

function ttsSpeak(text){
  if (isMuted || !text) return;
  TTSQueue.flushTail(text);
}

function stopAudio(){
  TTSQueue.cancel();
}
function toggleMute() {
  isMuted=!isMuted;
  muteBtn.textContent=isMuted ? '🔇' : '🔊';
  muteBtn.classList.toggle('muted',isMuted);
  if(isMuted) stopAudio();
  VTuberAV.setMuted(isMuted);
  var speedBtn=document.getElementById('speedBtn');
  if(speedBtn) speedBtn.disabled=isMuted;
}
function cycleTTSSpeed() {
  var idx=(TTS_SPEEDS.indexOf(ttsSpeed)+1)%TTS_SPEEDS.length;
  ttsSpeed=TTS_SPEEDS[idx];
  var labels=['1×','1.25×','1.5×'];
  document.getElementById('speedBtn').textContent=labels[idx];
}

// Voice Input
var micBtn=document.getElementById('micBtn');
var recognition=null, isRecording=false, micPausedForTTS=false;

if(window.SpeechRecognition||window.webkitSpeechRecognition){
  var SpeechRec=window.SpeechRecognition||window.webkitSpeechRecognition;
  recognition=new SpeechRec();
  recognition.lang='ja-JP';
  recognition.continuous=true;
  recognition.interimResults=true;

  var finalTranscript='', interimTranscript='', autoSendTimer=null;

  function voiceAutoSend(){
    clearTimeout(autoSendTimer);autoSendTimer=null;
    var txt=finalTranscript.trim();
    if(txt.length>=1){ msgInput.value=txt; doSend(); }
    finalTranscript='';interimTranscript='';
    msgInput.value='';
  }

  recognition.onresult=function(e){
    clearTimeout(autoSendTimer);autoSendTimer=null;
    interimTranscript='';
    for(var i=e.resultIndex;i<e.results.length;i++){
      if(e.results[i].isFinal){ finalTranscript+=e.results[i][0].transcript; }
      else { interimTranscript+=e.results[i][0].transcript; }
    }
    msgInput.value=finalTranscript+interimTranscript;
    msgInput.style.height='auto';
    msgInput.style.height=Math.min(msgInput.scrollHeight,200)+'px';
    if(finalTranscript && /[。！？\!\?]$/.test(finalTranscript.trim())){
      autoSendTimer=setTimeout(voiceAutoSend, 400);
    } else if(finalTranscript && !interimTranscript){
      autoSendTimer=setTimeout(voiceAutoSend, 1500);
    }
  };

  recognition.onend=function(){
    if(isRecording){
      clearTimeout(autoSendTimer);autoSendTimer=null;
      if(finalTranscript.trim()){ msgInput.value=finalTranscript.trim(); doSend(); finalTranscript='';interimTranscript=''; }
      try{recognition.start();}catch(e){ isRecording=false; micBtn.classList.remove('recording'); micBtn.textContent='🎤'; }
    }
  };

  recognition.onerror=function(e){
    if(e.error==='no-speech'||e.error==='aborted') return;
    isRecording=false; micBtn.classList.remove('recording'); micBtn.textContent='🎤';
    clearTimeout(autoSendTimer);autoSendTimer=null; finalTranscript='';interimTranscript='';
  };
} else { micBtn.style.display='none'; }

micBtn.addEventListener('click',function(){
  if(!recognition) return;
  if(isRecording){
    isRecording=false; clearTimeout(autoSendTimer);autoSendTimer=null;
    recognition.stop(); micBtn.classList.remove('recording'); micBtn.textContent='🎤';
    if(finalTranscript.trim()){ msgInput.value=finalTranscript.trim(); doSend(); }
    finalTranscript='';interimTranscript='';
  } else {
    finalTranscript='';interimTranscript=''; msgInput.value='';
    isRecording=true; micBtn.classList.add('recording'); micBtn.textContent='⏹';
    recognition.start();
  }
});

// Re-prompt login when clicking locked elements
['inputWrap', 'previewToggleBtn', 'splitToggleBtn', 'newChatBtn', 'relayToggle', 'micBtn', 'navMenuBtn'].forEach(function(id) {
  var el = document.getElementById(id);
  if (el) el.addEventListener('click', function(e) {
    if (!isLoggedIn()) { e.stopImmediatePropagation(); showAuthModal(); }
  }, true);
});

// Modal: click-outside and Escape to close
document.getElementById('authModal').addEventListener('click', function(e){
  if (e.target === this) hideAuthModal();
});
document.getElementById('newChatModal').addEventListener('click', function(e){
  if (e.target === this) hideNewChatModal();
});
document.getElementById('deleteAccountModal').addEventListener('click', function(e){
  if (e.target === this) hideDeleteAccountModal();
});
document.addEventListener('keydown', function(e){
  if (e.key !== 'Escape') return;
  if (document.getElementById('authModal').classList.contains('active')) hideAuthModal();
  if (document.getElementById('accountModal').classList.contains('active')) hideAccountModal();
  if (document.getElementById('deleteAccountModal').classList.contains('active')) hideDeleteAccountModal();
  if (document.getElementById('registerSuccessModal').classList.contains('active')) onRegisterSuccessDone();
  if (document.getElementById('helpModal').classList.contains('active')) hideHelpModal();
  if (document.getElementById('newChatModal').classList.contains('active')) hideNewChatModal();
  if (document.getElementById('userDropdown').classList.contains('open')) closeUserDropdown();
  if (document.getElementById('navActions').classList.contains('open')) document.getElementById('navActions').classList.remove('open');
});

// Input
msgInput.addEventListener('input',function(){msgInput.style.height='auto';msgInput.style.height=Math.min(msgInput.scrollHeight,200)+'px';});
msgInput.addEventListener('keydown',function(e){
  if(e.isComposing||e.keyCode===229) return;
  if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();doSend();}
});
sendBtn.addEventListener('click',function(){doSend();});

function doSend(){
  if(isProcessing){
    var abortHeaders={'Content-Type':'application/json'};
    var ah=getAuthHeaders();
    if(ah.Authorization) abortHeaders.Authorization=ah.Authorization;
    fetch('/api/abort',{method:'POST',headers:abortHeaders,body:JSON.stringify({clientId:clientId})});
    if(currentEventSource){currentEventSource.close();currentEventSource=null;}
    finishProcessing(); return;
  }
  if(!isLoggedIn()){ showAuthModal(); return; }
  sendMessage();
}
function sendMessage(){
  var c=msgInput.value.trim();
  if(!c) return;
  addMessage('user',c);
  isProcessing=true; lastResponseText=''; ttsPendingTail='';
  stopAudio();
  sendBtn.textContent='停止'; sendBtn.classList.add('abort');
  setStatus('busy','考えてるなのだ...');
  setAvState('thinking','考え中なのだ...');

  var chatHeaders={'Content-Type':'application/json'};
  var ah=getAuthHeaders();
  if(ah.Authorization) chatHeaders.Authorization=ah.Authorization;
  fetch('/api/chat',{
    method:'POST',
    headers:chatHeaders,
    body:JSON.stringify({content:c,cwd:configCwd||undefined,permissionMode:currentMode,sessionId:sessionId||undefined,clientId:clientId})
  }).then(function(response){
    if(response.status===401){ showAuthModal(); throw new Error('login_required'); }
    if(!response.ok) throw new Error('HTTP '+response.status);
    var reader=response.body.getReader();
    var decoder=new TextDecoder();
    var buf='';
    function pump(){
      return reader.read().then(function(result){
        if(result.done){return;}
        buf+=decoder.decode(result.value,{stream:true});
        var lines=buf.split('\n');
        buf=lines.pop()||'';
        for(var i=0;i<lines.length;i++){
          var line=lines[i];
          if(line.startsWith('data: ')){
            try{handleEvent(JSON.parse(line.substring(6)));}catch(err){dbg('parse:'+err.message);}
          }
        }
        return pump();
      });
    }
    return pump();
  }).catch(function(err){
    dbg('SSE error: '+err.message);
    setStatus('err','エラーなのだ...');
    finishProcessing();
  });
  msgInput.value=''; msgInput.style.height='auto'; scrollBottom();
}

setStatus('ok','つながったなのだ!');
function setStatus(type,text){
  var dot=statusText.querySelector('.dot');
  if(dot) dot.className='dot '+esc(type);
  var label=statusText.querySelector('.status-label');
  if(label) label.textContent=text;
}

function handleEvent(ev){
  if(ev.type==='system'){
    if(ev.session_id) saveSession(ev.session_id);
    setAvState('thinking','準備してるなのだ...');
  }
  else if(ev.type==='assistant') handleAssistant(ev);
  else if(ev.type==='result'){
    if(ev.session_id) saveSession(ev.session_id);
    var mood=detectMood(lastResponseText);
    if(!isSpeaking) setAvState(mood, mood==='happy'?'できたなのだ!':mood==='error'?'まずいなのだ...':'おわったなのだ');
  }
  else if(ev.type==='done'){
    if(ev.sessionId) saveSession(ev.sessionId);
    setStatus('ok','つながってるなのだ');
    if (!isMuted && ttsPendingTail){
      TTSQueue.flushTail(ttsPendingTail);
      ttsPendingTail='';
    }
    if (!ev.awaitingApproval){ var _relayText = lastResponseText; TTSQueue.whenDone(function(){ relaySendIfEnabled(_relayText); }); }
    if(ev.awaitingApproval){
      if(!isSpeaking) setAvState('idle','まってるなのだ...');
      showApprovalBar();
    } else {
      if(!isSpeaking) setAvState('idle','入力待ちなのだ');
      finishProcessing();
    }
  }
  else if(ev.type==='error'){
    setAvState('error','エラーなのだ...');
    addMessage('err',ev.content||'Unknown error');
  }
}

function handleAssistant(ev){
  var msg=ev.message;
  if(!msg||!msg.content) return;
  var hasToolUse=false;
  for(var i=0;i<msg.content.length;i++){
    var b=msg.content[i];
    if(b.type==='tool_use'){hasToolUse=true;var f=false;for(var j=0;j<toolsUsed.length;j++)if(toolsUsed[j].id===b.id){f=true;break;}if(!f)toolsUsed.push(b);}
  }
  var newText='';
  var html='';
  for(var i=0;i<msg.content.length;i++){var b=msg.content[i];if(b.type==='text'&&b.text){newText+=b.text;html+='<div>'+esc(b.text)+'</div>';}}
  // Only create/show the bubble if there is visible text
  if(html){
    setAvState('talking','おはなし中なのだ...');
    if(!currentMsgEl){
      currentMsgEl=document.createElement('div');currentMsgEl.className='msg assistant';
      var lb=document.createElement('div');lb.className='msg-label';lb.textContent='ずんだもん';
      currentBodyEl=document.createElement('div');currentBodyEl.className='msg-body';
      currentMsgEl.appendChild(lb);currentMsgEl.appendChild(currentBodyEl);
      chatInner.appendChild(currentMsgEl); toolsUsed=[];
    }
    currentBodyEl.innerHTML=html;
    var delta = newText.length > lastResponseText.length && newText.indexOf(lastResponseText) === 0
      ? newText.substring(lastResponseText.length)
      : newText;
    lastResponseText = newText;
    if (!isMuted && delta){
      ttsPendingTail = TTSQueue.pushText(ttsPendingTail + delta);
    }
    scrollBottom();
  }
  if(hasToolUse) setAvState('thinking','ツールつかってるなのだ...');
}

function renderTool(b){
  var icons={Read:'📄',Write:'📝',Edit:'✏️',Bash:'💻',Glob:'📂',Grep:'🔎',Task:'🤖'};
  var ic=icons[b.name]||'🔧',d='';
  if(b.input) d=b.input.file_path||(b.input.command||'').substring(0,80)||b.input.pattern||b.input.query||'';
  return '<div class="tool-use"><span>'+ic+'</span> <span class="tool-name">'+esc(b.name)+'</span> <span class="tool-detail">'+esc(d)+'</span></div>';
}
function addMessage(role,text){
  var el=document.createElement('div');el.className='msg '+role;
  if(role==='user'){var lb=document.createElement('div');lb.className='msg-label';lb.textContent='YOU';el.appendChild(lb);}
  var bd=document.createElement('div');bd.className='msg-body';bd.textContent=text;el.appendChild(bd);
  chatInner.appendChild(el);scrollBottom();
}
function finishProcessing(){isProcessing=false;currentMsgEl=null;currentBodyEl=null;sendBtn.textContent='送信';sendBtn.classList.remove('abort');setStatus('ok','つながってるなのだ');msgInput.focus();}
function newChat(){
  if(!chatInner || !chatInner.children.length){
    doNewChat(); return;
  }
  document.getElementById('newChatModal').classList.add('active');
}
function hideNewChatModal(){
  document.getElementById('newChatModal').classList.remove('active');
}
function confirmNewChat(){
  hideNewChatModal();
  doNewChat();
}
function doNewChat(){
  if(isProcessing){
    fetch('/api/abort',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:clientId})});
    if(currentEventSource){currentEventSource.close();currentEventSource=null;}
  }
  sessionId=null;chatInner.innerHTML='';
  clientId=Math.random().toString(36).slice(2);
  setAvState('idle','入力待ちなのだ');
  stopAudio();isSpeaking=false;
  lastResponseText=''; ttsPendingTail='';
  finishProcessing();
  // reset relay in both panels
  if(Relay.enabled){
    Relay.enabled=false; Relay.count=0;
    var chk=document.getElementById('relayToggleCheck');
    if(chk) chk.checked=false;
    var peer=relayPeer();
    if(peer){ try{ peer.postMessage({type:'zd-relay-set',enabled:false},'*'); }catch(e){} }
  }
}
function saveSession(id){sessionId=id;}
function scrollBottom(){chatArea.scrollTop=chatArea.scrollHeight;}
function esc(s){return s?s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'):''}
