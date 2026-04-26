// ============================================================
// ブラウザプレビューペイン
// ============================================================
function togglePreview(){
  document.body.classList.toggle('preview-open');
  var pane = document.getElementById('previewPane');
  pane.style.flex = '';
  var isOpen = document.body.classList.contains('preview-open');
  var chk = document.getElementById('previewToggleCheck');
  if (chk) chk.checked = isOpen;
  if (isOpen){
    var input = document.getElementById('previewUrl');
    if (input && !input.value){ setTimeout(function(){ input.focus(); }, 50); }
  }
}

(function(){
  var handle = document.getElementById('previewHandle');
  var pane   = document.getElementById('previewPane');
  var frame  = document.getElementById('previewFrame');
  var shell  = document.getElementById('appShell');
  var dragging = false, startPos = 0, startSize = 0;
  var MIN_SIZE = 280, HANDLE_SIZE = 6;

  handle.addEventListener('mousedown', function(e){
    dragging = true;
    var vertical = shell.classList.contains('vertical');
    startPos  = vertical ? e.clientY : e.clientX;
    startSize = vertical ? pane.offsetHeight : pane.offsetWidth;
    document.body.classList.add('resizing-preview');
    if (frame) frame.style.pointerEvents = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e){
    if (!dragging) return;
    var vertical = shell.classList.contains('vertical');
    var total = (vertical ? shell.offsetHeight : shell.offsetWidth) - HANDLE_SIZE;
    var delta = vertical ? (e.clientY - startPos) : (e.clientX - startPos);
    var newSize = Math.max(MIN_SIZE, Math.min(total - MIN_SIZE, startSize - delta));
    pane.style.flex = '0 0 ' + newSize + 'px';
  });

  document.addEventListener('mouseup', function(){
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing-preview');
    if (frame) frame.style.pointerEvents = '';
  });
})();
function normalizePreviewUrl(u){
  if (!u) return '';
  u = u.trim();
  if (!u) return '';
  // 危険なスキームを明示拒否（javascript:, data:, vbscript:, file:, blob:, about:）
  if (/^(javascript|data|vbscript|file|blob|about):/i.test(u)) return '';
  if (!/^https?:\/\//i.test(u)) u = 'http://' + u;
  try {
    var parsed = new URL(u);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.href;
  } catch(e){ return ''; }
}
function loadPreview(){
  var input = document.getElementById('previewUrl');
  var frame = document.getElementById('previewFrame');
  var empty = document.getElementById('previewEmpty');
  var blocked = document.getElementById('previewBlockedMsg');
  var url = normalizePreviewUrl(input.value);
  if (!url){ input.focus(); return; }
  input.value = url;
  empty.style.display = 'none';
  frame.style.display = 'block';
  if (blocked) blocked.style.display = 'block';
  // url は normalizePreviewUrl 内で http/https のみに制限済み
  frame.setAttribute('src', url);
}
function openPreviewInTab(){
  var url = normalizePreviewUrl(document.getElementById('previewUrl').value);
  if (!url) return false;
  window.open(url, '_blank', 'noopener,noreferrer');
  return false;
}
function reloadPreview(){
  var frame = document.getElementById('previewFrame');
  if (frame.src){ frame.contentWindow.location.replace(frame.src); }
}
function togglePreviewOrientation(){
  var shell = document.getElementById('appShell');
  shell.classList.toggle('vertical');
}
document.addEventListener('keydown', function(e){
  if (e.target && e.target.id === 'previewUrl' && e.key === 'Enter'){
    e.preventDefault();
    loadPreview();
  }
});
