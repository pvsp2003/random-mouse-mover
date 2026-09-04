/* Random Mouse Mover
 *
 * Zero setup. The button takes the page fullscreen, hides the real cursor and
 * flies a drawn pointer around the screen in random hops of up to half a screen.
 *
 * A page cannot move the OS cursor - no browser exposes that, deliberately - so
 * "hide the real one and own the whole screen" is as close as a website gets.
 * The footer link explains that and hands over the out-of-browser scripts.
 */

(function () {
  'use strict';

  var JUMP = 0.5;      // max hop, as a fraction of the screen
  var REST = 1100;     // ms between hops
  var TRAVEL = 950;    // ms a hop takes

  var home = document.getElementById('home');
  var go = document.getElementById('go');
  var label = go.querySelector('.go-label');
  var status = document.getElementById('status');
  var hopsEl = document.getElementById('hops');
  var stage = document.getElementById('stage');
  var canvas = document.getElementById('trail');
  var ptr = document.getElementById('ptr');
  var ctx = canvas.getContext('2d');

  var running = false;
  var hops = 0;
  var timer = null;
  var frame = null;
  var pos = { x: 0, y: 0 };

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- canvas -------------------------------------------------------------

  function sizeCanvas() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(stage.clientWidth * dpr);
    canvas.height = Math.floor(stage.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function fadeTrail() {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    ctx.fillRect(0, 0, stage.clientWidth, stage.clientHeight);
    ctx.restore();
  }

  function drawSegment(from, to) {
    ctx.strokeStyle = 'rgba(110,168,254,0.45)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  function drawLanding(p) {
    ctx.fillStyle = 'rgba(183,140,255,0.8)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- movement -----------------------------------------------------------

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function place(p) {
    // the pointer tip sits at roughly (7, 4) inside the 36px box
    ptr.style.transform = 'translate(' + (p.x - 7) + 'px,' + (p.y - 4) + 'px)';
  }

  function hop() {
    if (!running) return;

    var w = stage.clientWidth;
    var h = stage.clientHeight;
    var pad = 10;
    var from = { x: pos.x, y: pos.y };
    var to = {
      x: clamp(pos.x + (Math.random() * 2 - 1) * w * JUMP, pad, w - pad),
      y: clamp(pos.y + (Math.random() * 2 - 1) * h * JUMP, pad, h - pad)
    };
    var dist = Math.round(Math.hypot(to.x - from.x, to.y - from.y));
    var t0 = performance.now();
    var duration = reduceMotion ? 1 : TRAVEL;

    function step(now) {
      if (!running) return;
      var t = Math.min(1, (now - t0) / duration);
      var next = {
        x: from.x + (to.x - from.x) * easeInOut(t),
        y: from.y + (to.y - from.y) * easeInOut(t)
      };
      fadeTrail();
      drawSegment(pos, next);
      pos = next;
      place(pos);

      if (t < 1) {
        frame = requestAnimationFrame(step);
      } else {
        drawLanding(pos);
        hops++;
        hopsEl.textContent = hops + (hops === 1 ? ' hop' : ' hops');
        status.textContent = 'Last hop: ' + dist + 'px.';
        timer = setTimeout(hop, REST);
      }
    }

    frame = requestAnimationFrame(step);
  }

  // --- fullscreen + hiding the real cursor --------------------------------

  function enterFullscreen(el) {
    var fn = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (!fn) return Promise.reject(new Error('no fullscreen'));
    try {
      return Promise.resolve(fn.call(el));
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function lockPointer(el) {
    // Pointer Lock keeps the real cursor pinned and invisible. `cursor: none`
    // in CSS already hides it, so a refusal here is not fatal.
    var fn = el.requestPointerLock || el.mozRequestPointerLock;
    if (!fn) return;
    try {
      var r = fn.call(el);
      if (r && typeof r.catch === 'function') r.catch(function () {});
    } catch (e) { /* CSS handles it */ }
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement ||
           document.msFullscreenElement || null;
  }

  function start() {
    stage.hidden = false;
    home.hidden = true;

    enterFullscreen(stage).catch(function () {
      // Fullscreen refused (rare, some embedded browsers). The stage still
      // covers the viewport and still hides the cursor, so carry on.
      status.textContent = 'Fullscreen was blocked — running in the tab instead.';
    }).finally(function () {
      sizeCanvas();
      lockPointer(stage);
      running = true;
      pos = { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
      place(pos);
      ctx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
      hop();
    });
  }

  function stop() {
    running = false;
    clearTimeout(timer);
    cancelAnimationFrame(frame);

    if (document.exitPointerLock) {
      try { document.exitPointerLock(); } catch (e) { /* already released */ }
    }
    if (fullscreenElement() && document.exitFullscreen) {
      document.exitFullscreen().catch(function () {});
    }

    stage.hidden = true;
    home.hidden = false;
    label.textContent = 'Move the mouse';
    status.textContent = hops ? 'Stopped after ' + hops + '.' : ' ';
  }

  go.addEventListener('click', start);

  // Esc leaves fullscreen on its own; mirror that back into our state.
  document.addEventListener('fullscreenchange', function () {
    if (running && !fullscreenElement()) stop();
  });

  // Any click or key inside the stage also gets you out.
  stage.addEventListener('click', function () { if (running) stop(); });
  document.addEventListener('keydown', function (e) {
    if (running && (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter')) stop();
  });

  window.addEventListener('resize', function () { if (running) sizeCanvas(); });

  // --- the "real OS cursor" explainer -------------------------------------

  var dlg = document.getElementById('osdlg');
  document.getElementById('real').addEventListener('click', function () {
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  });
})();
