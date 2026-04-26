// ============================================================
//  CHAT ENGINE
// ============================================================
function dbg(m) { console.log(m); }
window.onerror = function(m,s,l) { console.error('ERR: '+m+' L'+l); };

var sessionId=null, isProcessing=false, currentEventSource=null, clientId=Math.random().toString(36).slice(2);
var currentMsgEl=null, currentBodyEl=null, toolsUsed=[];
var lastResponseText='', isMuted=false, isSpeaking=false, currentAudio=null;
var ttsSpeed=1.0;
var TTS_SPEEDS=[1.0,1.25,1.5];
var ttsPendingTail='';

var chatArea=document.getElementById('chatArea');
var chatInner=document.getElementById('chatInner');
var msgInput=document.getElementById('msgInput');
var sendBtn=document.getElementById('sendBtn');
var statusText=document.getElementById('statusText');
var configCwd='';
var currentMode = 'default';
var modeLabels = { default: '確認', plan: 'プラン', full: '自動' };
var pendingApproval = false;
var approvalBarEl = null;

function describeToolUse(tool) {
  if (!tool) return null;
  var name = tool.name || '?';
  var inp = tool.input || {};
  var detail = inp.file_path || inp.command || inp.pattern || inp.url || inp.query || inp.path || null;
  if (detail && detail.length > 60) detail = detail.slice(0, 57) + '…';
  return detail ? name + ' → ' + detail : name;
}

function showApprovalBar() {
  pendingApproval = true;
  var last = toolsUsed.length ? toolsUsed[toolsUsed.length - 1] : null;
  var desc = describeToolUse(last);
  var label = desc
    ? '🔐 <strong>' + esc(desc) + '</strong>'
    : '🔐 ずんだもんが操作の許可を求めています';
  approvalBarEl = document.createElement('div');
  approvalBarEl.className = 'approval-bar';
  approvalBarEl.innerHTML =
    '<span>' + label + '</span>' +
    '<button class="btn-reject" onclick="doReject()">キャンセル</button>' +
    '<button class="btn-approve" onclick="doApprove()">承認</button>';
  chatInner.appendChild(approvalBarEl);
  scrollBottom();
}

function removeApprovalBar() {
  if (approvalBarEl) { approvalBarEl.remove(); approvalBarEl = null; }
  pendingApproval = false;
}

function doReject() {
  removeApprovalBar();
  finishProcessing();
}

function doApprove() {
  removeApprovalBar();
  isProcessing = true;
  sendBtn.textContent = '停止'; sendBtn.classList.add('abort');
  setStatus('busy', '実行中なのだ...');
  setAvState('thinking', '実行してるなのだ...');
  var headers = Object.assign({'Content-Type':'application/json'}, getAuthHeaders());
  fetch('/api/approve', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({clientId: clientId})
  }).then(function(response) {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var buf = '';
    function pump() {
      return reader.read().then(function(result) {
        if (result.done) return;
        buf += decoder.decode(result.value, {stream: true});
        var lines = buf.split('\n');
        buf = lines.pop() || '';
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (line.startsWith('data: ')) {
            try { handleEvent(JSON.parse(line.substring(6))); } catch(e) {}
          }
        }
        return pump();
      });
    }
    return pump();
  }).catch(function() { finishProcessing(); });
}

function setMode(mode) {
  currentMode = mode;
  document.getElementById('modePickerLabel').textContent = modeLabels[mode];
  document.querySelectorAll('.mode-menu-item').forEach(function(btn) {
    var active = btn.dataset.mode === mode;
    btn.classList.toggle('active', active);
    btn.querySelector('.mode-menu-check').textContent = active ? '✓' : '';
  });
  closeModeMenu();
}
function toggleModeMenu() {
  document.getElementById('modeMenu').classList.toggle('open');
}
function closeModeMenu() {
  document.getElementById('modeMenu').classList.remove('open');
}
document.addEventListener('click', function(e) {
  var picker = document.getElementById('modePicker');
  if (picker && !picker.contains(e.target)) closeModeMenu();
});
var avStatusEl=document.getElementById('avStatus');
var muteBtn=document.getElementById('muteBtn');

// Load config from server
fetch('/api/config').then(function(r){return r.json();}).then(function(cfg){
  if(cfg.cwd) configCwd=cfg.cwd;
  if(cfg.tts_provider==='none'){
    muteBtn.textContent='🔇';
    muteBtn.classList.add('muted');
    muteBtn.disabled=true;
    muteBtn.title='TTS が設定されていません（config/settings.yaml を確認してください）';
    var speedBtn=document.getElementById('speedBtn');
    if(speedBtn){ speedBtn.disabled=true; speedBtn.title=muteBtn.title; }
    isMuted=true;
    avStatusEl.textContent='音声未設定なのだ';
  }
}).catch(function(){});

function setAvState(s, label) {
  VTuberAV.setState(s);
  avStatusEl.textContent = label || s;
  avStatusEl.className = 'av-status' + (s !== 'idle' ? ' active' : '');
  var toast = document.getElementById('thinkingToast');
  if (toast) {
    toast.classList.toggle('visible', s === 'thinking');
    if (s === 'thinking') document.getElementById('thinkingLabel').textContent = label || s;
  }
}

function detectMood(text) {
  if (!text) return 'talking';
  if (/エラー|error|失敗|fail|問題|bug|exception/i.test(text)) return 'error';
  if (/完了|成功|done|success|ありがとう|できました|作成しました|修正しました/i.test(text)) return 'happy';
  return 'talking';
}
