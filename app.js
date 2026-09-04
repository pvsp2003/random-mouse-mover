/* Random Mouse Mover
 *
 * Two modes, picked automatically:
 *
 *   REAL  - the agent is installed and running, so the button moves your actual
 *           OS cursor via GET http://127.0.0.1:8777/hop
 *   DEMO  - no agent, so the page goes fullscreen, hides the real cursor and
 *           flies a drawn pointer instead
 *
 * A page cannot reach the OS pointer on its own - no browser exposes that - so
 * REAL mode needs the one-time install. DEMO mode needs nothing.
 */

(function () {
  'use strict';

  var AGENT = 'http://127.0.0.1:8777';
  var JUMP = 0.5;      // max hop, as a fraction of the screen
  var REST = 1200;     // ms between hops
  var TRAVEL = 950;    // ms a drawn hop takes

  var home = document.getElementById('home');
  var go = document.getElementById('go');
  var label = go.querySelector('.go-label');
  var hint = go.querySelector('.go-hint');
  var status = document.getElementById('status');
  var hopsEl = document.getElementById('hops');
  var mode = document.getElementById('mode');
  var setup = document.getElementById('setup');
  var stage = document.getElementById('stage');
  var canvas = document.getElementById('trail');
  var ptr = document.getElementById('ptr');
  var ctx = canvas.getContext('2d');

  var real = false;    // is the agent reachable?
  var running = false;
  var hops = 0;
  var timer = null;
  var frame = null;
  var pos = { x: 0, y: 0 };

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- agent --------------------------------------------------------------

  function call(path, ms) {
    var c = new AbortController();
    var bail = setTimeout(function () { c.abort(); }, ms || 20000);
    return fetch(AGENT + path, { signal: c.signal, cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('agent ' + r.status);
        return r.json();
      })
      .finally(function () { clearTimeout(bail); });
  }

  function setMode(isReal, info) {
    real = isReal;
    if (isReal) {
      mode.textContent = 'real cursor · ' + info.screen[0] + '×' + info.screen[1];
      mode.className = 'mode on';
      label.textContent = 'Move my mouse';
      hint.textContent = 'moves your actual cursor';
      setup.hidden = true;
    } else {
      mode.textContent = 'demo mode';
      mode.className = 'mode';
      label.textContent = 'Move the mouse';
      hint.textContent = 'fullscreen · Esc to exit';
      setup.hidden = false;
    }
  }

  function probe() {
    return call('/ping', 2500).then(
      function (info) { setMode(true, info); return true; },
      function () { setMode(false); return false; }
    );
  }

  // --- REAL mode ----------------------------------------------------------

  function realTick() {
    if (!running) return;
    call('/hop').then(function (d) {
      if (!running) return;
      hops++;
      hopsEl.textContent = hops + (hops === 1 ? ' hop' : ' hops');
      status.textContent = 'Moved ' + d.distance + 'px to ' + d.x + ', ' + d.y + '.';
      timer = setTimeout(realTick, REST);
    }, function () {
      stopReal('Lost the agent.');
      probe();
    });
  }

  function startReal() {
    running = true;
    go.classList.add('running');
    label.textContent = 'Stop';
    status.textContent = 'Moving your cursor…';
    realTick();
  }

  function stopReal(message) {
    running = false;
    clearTimeout(timer);
    go.classList.remove('running');
    label.textContent = 'Move my mouse';
    status.textContent = message || (hops ? 'Stopped after ' + hops + '.' : ' ');
  }

  // --- DEMO mode: fullscreen, hide the cursor, fly a drawn one -------------

  function sizeCanvas() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(stage.clientWidth * dpr);
    canvas.height = Math.floor(stage.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function place(p) {
    // the pointer tip sits at roughly (7, 4) inside the 36px box
    ptr.style.transform = 'translate(' + (p.x - 7) + 'px,' + (p.y - 4) + 'px)';
  }

  function demoHop() {
    if (!running) return;

    var w = stage.clientWidth;
    var h = stage.clientHeight;
    var from = { x: pos.x, y: pos.y };
    var to = {
      x: clamp(pos.x + (Math.random() * 2 - 1) * w * JUMP, 10, w - 10),
      y: clamp(pos.y + (Math.random() * 2 - 1) * h * JUMP, 10, h - 10)
    };
    var dist = Math.round(Math.hypot(to.x - from.x, to.y - from.y));
    var t0 = performance.now();
    var duration = reduceMotion ? 1 : TRAVEL;

    function step(now) {
      if (!running) return;
      var t = Math.min(1, (now - t0) / duration);
      var e = easeInOut(t);
      var next = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };

      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.04)';
      ctx.fillRect(0, 0, stage.clientWidth, stage.clientHeight);
      ctx.restore();

      ctx.strokeStyle = 'rgba(110,168,254,0.45)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();

      pos = next;
      place(pos);

      if (t < 1) {
        frame = requestAnimationFrame(step);
      } else {
        ctx.fillStyle = 'rgba(183,140,255,0.8)';
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
        ctx.fill();
        hops++;
        hopsEl.textContent = hops + (hops === 1 ? ' hop' : ' hops');
        status.textContent = 'Last hop: ' + dist + 'px.';
        timer = setTimeout(demoHop, REST - 200);
      }
    }

    frame = requestAnimationFrame(step);
  }

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function startDemo() {
    stage.hidden = false;
    home.hidden = true;

    var fs = stage.requestFullscreen || stage.webkitRequestFullscreen;
    var attempt = fs
      ? Promise.resolve(fs.call(stage)).catch(function () {
          status.textContent = 'Fullscreen was blocked — running in the tab.';
        })
      : Promise.resolve();

    attempt.finally(function () {
      sizeCanvas();
      // Pointer Lock pins the real cursor too; `cursor: none` already hides it,
      // so a refusal here costs nothing.
      try {
        var r = stage.requestPointerLock && stage.requestPointerLock();
        if (r && r.catch) r.catch(function () {});
      } catch (e) { /* CSS handles it */ }

      running = true;
      pos = { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
      ctx.clearRect(0, 0, stage.clientWidth, stage.clientHeight);
      place(pos);
      demoHop();
    });
  }

  function stopDemo() {
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
    status.textContent = hops ? 'Stopped after ' + hops + '.' : ' ';
  }

  // --- one button ---------------------------------------------------------

  go.addEventListener('click', function () {
    if (running) { if (real) stopReal(); else stopDemo(); return; }

    if (real) { startReal(); return; }

    // Re-check first: the agent may have been installed since page load.
    status.textContent = 'Checking for the agent…';
    probe().then(function (ok) {
      status.textContent = ' ';
      if (ok) startReal(); else startDemo();
    });
  });

  document.addEventListener('fullscreenchange', function () {
    if (running && !real && !fullscreenElement()) stopDemo();
  });
  stage.addEventListener('click', function () { if (running && !real) stopDemo(); });
  document.addEventListener('keydown', function (e) {
    if (running && !real && (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter')) stopDemo();
  });
  window.addEventListener('resize', function () { if (running && !real) sizeCanvas(); });

  // --- setup card ---------------------------------------------------------

  function detectOS() {
    var platform = (navigator.userAgentData && navigator.userAgentData.platform) ||
                   navigator.platform || '';
    var hay = (platform + ' ' + navigator.userAgent).toLowerCase();
    if (hay.indexOf('mac') > -1 || hay.indexOf('iphone') > -1 || hay.indexOf('ipad') > -1) return 'macos';
    if (hay.indexOf('win') > -1) return 'windows';
    return 'linux';
  }

  var os = detectOS();
  document.body.setAttribute('data-os', os);

  // Re-probe on focus so installing in another window flips the page to REAL
  // mode without a reload.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !running) probe();
  });
  window.addEventListener('focus', function () { if (!running) probe(); });

  var macCopy = document.getElementById('maccopy');
  if (macCopy) {
    macCopy.addEventListener('click', function () {
      var text = document.getElementById('maccmd').textContent;
      var done = function () {
        macCopy.textContent = 'Copied';
        setTimeout(function () { macCopy.textContent = 'Copy'; }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
      } else {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* nothing else to try */ }
        ta.remove();
        done();
      }
    });
  }

  probe();
})();
