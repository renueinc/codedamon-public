// ============================================================
// マルチセッション分割（iframe）＋リレー会話
// ============================================================
var IS_EMBEDDED = /(\?|&)embed=1\b/.test(location.search);
if (IS_EMBEDDED) document.body.classList.add('embedded');

var Relay = { enabled: false, count: 0, max: 6 };

function relayPeer(){
  if (IS_EMBEDDED) return window.parent && window.parent !== window ? window.parent : null;
  var f = document.getElementById('panelB');
  return f && f.contentWindow ? f.contentWindow : null;
}

function toggleSplit(){
  var f = document.getElementById('panelB');
  var on = !document.body.classList.contains('split-mode');
  document.body.classList.toggle('split-mode', on);
  if (on){
    if (!f.src) f.src = '/?embed=1';
  } else {
    document.getElementById('panelA').style.flex = '';
    f.style.flex = '';
    if (Relay.enabled){
      Relay.enabled = false;
      var relayChk = document.getElementById('relayToggleCheck');
      if (relayChk) relayChk.checked = false;
    }
  }
  var splitChk = document.getElementById('splitToggleCheck');
  if (splitChk) splitChk.checked = on;
  updateRelayBtn();
}
document.addEventListener('DOMContentLoaded', updateRelayBtn);

(function(){
  var handle = document.getElementById('splitHandle');
  var panelA = document.getElementById('panelA');
  var panelB = document.getElementById('panelB');
  var dragging = false, startX = 0, startWA = 0;
  var HANDLE_W = 6, MIN_W = 280;

  handle.addEventListener('mousedown', function(e){
    dragging = true;
    startX = e.clientX;
    startWA = panelA.offsetWidth;
    document.body.classList.add('resizing');
    panelB.style.pointerEvents = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e){
    if (!dragging) return;
    var total = window.innerWidth - HANDLE_W;
    var newA = Math.max(MIN_W, Math.min(total - MIN_W, startWA + (e.clientX - startX)));
    panelA.style.flex = '0 0 ' + newA + 'px';
    panelB.style.flex = '0 0 ' + (total - newA) + 'px';
  });

  document.addEventListener('mouseup', function(){
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing');
    panelB.style.pointerEvents = '';
  });
})();

function updateRelayBtn(){
  var el = document.getElementById('relayToggle');
  if (!el) return;
  var inSplit = document.body.classList.contains('split-mode');
  el.classList.toggle('disabled', !inSplit);
}

function toggleRelay(){
  if (!document.body.classList.contains('split-mode')) return;
  Relay.enabled = !Relay.enabled;
  Relay.count = 0;
  var chk = document.getElementById('relayToggleCheck');
  if (chk) chk.checked = Relay.enabled;
  // 相手側にも同期
  var peer = relayPeer();
  if (peer){
    try { peer.postMessage({type:'zd-relay-set', enabled: Relay.enabled}, '*'); } catch(e){}
  }
}

function relaySendIfEnabled(text){
  if (!Relay.enabled || !text) return;
  if (Relay.count >= Relay.max){
    Relay.enabled = false;
    var chk = document.getElementById('relayToggleCheck');
    if (chk) chk.checked = false;
    addMessage('err','リレー上限('+Relay.max+'回)に達したのだ。停止したのだ。');
    var peer = relayPeer();
    if (peer){ try { peer.postMessage({type:'zd-relay-set', enabled:false}, '*'); } catch(e){} }
    return;
  }
  var peer = relayPeer();
  if (!peer) return;
  Relay.count++;
  try { peer.postMessage({type:'zd-relay-msg', text: text}, '*'); } catch(e){}
}

window.addEventListener('message', function(ev){
  var d = ev.data;
  if (!d || typeof d !== 'object') return;
  if (d.type === 'zd-relay-set'){
    Relay.enabled = !!d.enabled;
    Relay.count = 0;
    var chk = document.getElementById('relayToggleCheck');
    if (chk) chk.checked = Relay.enabled;
  } else if (d.type === 'zd-relay-msg'){
    if (!Relay.enabled) return;
    if (isProcessing) return;
    msgInput.value = String(d.text || '').slice(0, 4000);
    if (msgInput.value) doSend();
  }
});
