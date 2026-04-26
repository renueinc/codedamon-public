// ============================================================
//  ZUNDAMON AVATAR MODULE (Image switching + Spring Physics)
// ============================================================
var VTuberAV = (function() {
  var els = {};
  var t = 0, lastFrame = 0;
  var state = 'idle', stateTime = 0;
  var isMutedAv = false;
  var sp = {};
  var particleEls = [];
  var maxParticles = 20;
  var particleId = 0;

  function rng(lo, hi) { return lo + Math.random() * (hi - lo); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function init(containerEl) {
    els.container = containerEl;
    els.body = document.getElementById('vtuberBody');
    els.particles = document.getElementById('vtuberParticles');

    sp.floatX = makeSpring('bouncy'); sp.floatX.snap(0);
    sp.floatY = makeSpring('bouncy'); sp.floatY.snap(0);
    sp.headRot = makeSpring('gentle'); sp.headRot.snap(0);
    sp.breathe = makeSpring('gentle'); sp.breathe.snap(0);
    sp.squish = makeSpring('wobbly'); sp.squish.snap(0);

    els.container.dataset.state = state;
    lastFrame = performance.now();
    requestAnimationFrame(loop);
  }

  function updateImg() {
    // single image — no switching needed
  }

  function setState(s) {
    if (state === s) return;
    state = s;
    stateTime = 0;
    if (els.container) els.container.dataset.state = s;
    updateImg();
  }

  function setMuted(muted) {
    isMutedAv = muted;
    updateImg();
  }

  function setupAudioAnalysis(audioElement) {
    // No-op for image-based avatar
  }

  function updateState(dt) {
    stateTime += dt;
    var baseFloatY = Math.sin(t * 1.3) * 5 + Math.sin(t * 2.7) * 2;
    var baseFloatX = Math.sin(t * 0.9) * 3 + Math.cos(t * 1.8) * 1.5;
    var baseBreathe = Math.sin(t * 2.0) * 0.015;
    var baseHeadRot = Math.sin(t * 0.7) * 0.012;

    if (state === 'idle') {
      sp.floatX.set(baseFloatX);
      sp.floatY.set(baseFloatY);
      sp.breathe.set(baseBreathe);
      sp.headRot.set(baseHeadRot);
      sp.squish.set(0);
    }
    else if (state === 'thinking') {
      sp.floatX.set(baseFloatX * 0.6);
      sp.floatY.set(baseFloatY * 0.6);
      sp.breathe.set(baseBreathe * 1.3);
      sp.headRot.set(Math.sin(t * 0.8) * 0.04);
      sp.squish.set(0);
    }
    else if (state === 'talking') {
      // Big bounce: avatar hops up and down while speaking
      var hop = Math.abs(Math.sin(t * 4)) * -28;
      sp.floatX.set(baseFloatX * 0.8);
      sp.floatY.set(baseFloatY * 0.8 + hop);
      sp.breathe.set(baseBreathe + Math.sin(t * 6) * 0.005);
      sp.headRot.set(Math.sin(t * 1.5) * 0.02 + Math.sin(t * 3.1) * 0.008);
      // Stretch/squash synced with hop for a cartoon-bounce feel
      sp.squish.set(Math.sin(t * 8) * 0.035);
    }
    else if (state === 'happy') {
      sp.floatX.set(baseFloatX * 1.4);
      sp.floatY.set(baseFloatY * 1.2 + Math.sin(t * 4) * 4 * Math.max(0, 1 - stateTime * 0.3));
      sp.breathe.set(baseBreathe * 1.4);
      sp.headRot.set(Math.sin(t * 2.5) * 0.035);
      sp.squish.set(Math.sin(t * 5) * 0.03 * Math.max(0, 1 - stateTime * 0.5));
    }
    else if (state === 'error') {
      sp.floatX.set(baseFloatX * 0.3);
      sp.floatY.set(baseFloatY * 0.3);
      sp.breathe.set(baseBreathe * 0.5);
      sp.headRot.set(Math.sin(t * 0.5) * 0.008);
      sp.squish.set(0);
    }
  }

  function updateSprings(dt) {
    for (var k in sp) sp[k].update(dt);
  }

  function applyTransforms() {
    var fx = sp.floatX.value;
    var fy = sp.floatY.value;
    var rot = sp.headRot.value;
    var sc = 1 + sp.breathe.value;
    var sq = sp.squish.value;
    els.body.style.transform =
      'translate(' + fx.toFixed(2) + 'px,' + fy.toFixed(2) + 'px) ' +
      'rotate(' + rot.toFixed(4) + 'rad) ' +
      'scale(' + sc.toFixed(4) + ',' + (sc * (1 - sq)).toFixed(4) + ')';
  }

  function spawnParticle() {
    if (particleEls.length >= maxParticles) return;
    var angle = rng(0, Math.PI * 2);
    var dist = rng(50, 90);
    var px = Math.cos(angle) * dist + 120;
    var py = Math.sin(angle) * dist + 160;
    var vx = rng(-20, 20);
    var vy = rng(-40, -10);
    var size = rng(2, 6);
    var life = rng(1.2, 2.5);
    var hue = (state === 'happy' ? 130 : state === 'error' ? 0 : 140) + rng(-20, 20);

    var el = document.createElement('div');
    el.className = 'vtuber-particle';
    el.style.cssText =
      'width:' + size + 'px;height:' + size + 'px;' +
      'background:hsla(' + hue + ',55%,65%,0.6);' +
      'box-shadow:0 0 ' + (size * 2) + 'px hsla(' + hue + ',55%,65%,0.3);' +
      '--px:' + px.toFixed(0) + 'px;--py:' + py.toFixed(0) + 'px;' +
      '--pvx:' + vx.toFixed(0) + 'px;--pvy:' + vy.toFixed(0) + 'px;' +
      '--plife:' + life.toFixed(2) + 's;';

    var id = ++particleId;
    el._pid = id;
    els.particles.appendChild(el);
    particleEls.push({ el: el, id: id, endTime: t + life });
  }

  function updateParticles() {
    var rate = state === 'happy' ? 0.18 : state === 'thinking' ? 0.06 : 0.03;
    if (Math.random() < rate) spawnParticle();
    for (var i = particleEls.length - 1; i >= 0; i--) {
      if (t > particleEls[i].endTime) {
        particleEls[i].el.remove();
        particleEls.splice(i, 1);
      }
    }
  }

  function loop() {
    var now = performance.now();
    var dt = Math.min(0.05, (now - lastFrame) / 1000);
    t += dt;
    lastFrame = now;
    updateState(dt);
    updateSprings(dt);
    applyTransforms();
    updateParticles();
    requestAnimationFrame(loop);
  }

  return { init: init, setState: setState, setMuted: setMuted, setupAudioAnalysis: setupAudioAnalysis };
})();
