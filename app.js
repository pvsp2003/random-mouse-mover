/* Random Mouse Mover
 *
 * The button drives a pointer around this page in random hops of up to half a
 * viewport. Browsers deliberately give no API for moving the OS cursor, so the
 * real thing lives in scripts/ and is handed out by the panel below.
 */

(function () {
  'use strict';

  var JUMP = 0.5;          // max hop, as a fraction of the viewport
  var INTERVAL = 1400;     // ms of rest between hops
  var TRAVEL = 900;        // ms a hop takes

  var go = document.getElementById('go');
  var label = go.querySelector('.go-label');
  var hint = go.querySelector('.go-hint');
  var status = document.getElementById('status');
  var hopsEl = document.getElementById('hops');
  var ghost = document.getElementById('ghost');
  var canvas = document.getElementById('trail');
  var ctx = canvas.getContext('2d');

  var running = false;
  var hops = 0;
  var timer = null;
  var frame = null;
  var pos = { x: 0, y: 0 };
  var dpr = 1;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- canvas ------------------------------------------------------------

  function sizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function fadeTrail() {
    // Paint a translucent wash instead of clearing, so the path lingers.
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.035)';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.restore();
  }

  function drawSegment(from, to) {
    ctx.strokeStyle = 'rgba(110, 168, 254, 0.5)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  function drawLanding(p) {
    ctx.fillStyle = 'rgba(183, 140, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- movement ----------------------------------------------------------

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function pickTarget() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    var pad = 24;
    return {
      x: clamp(pos.x + (Math.random() * 2 - 1) * w * JUMP, pad, w - pad),
      y: clamp(pos.y + (Math.random() * 2 - 1) * h * JUMP, pad, h - pad)
    };
  }

  function place(p) {
    ghost.style.transform = 'translate(' + (p.x - 4) + 'px,' + (p.y - 2) + 'px)';
  }

  function hop() {
    if (!running) return;

    var from = { x: pos.x, y: pos.y };
    var to = pickTarget();
    var dist = Math.round(Math.hypot(to.x - from.x, to.y - from.y));
    var start = performance.now();
    var duration = reduceMotion ? 1 : TRAVEL;

    function step(now) {
      if (!running) return;
      var t = Math.min(1, (now - start) / duration);
      var e = easeInOut(t);
      var next = {
        x: from.x + (to.x - from.x) * e,
        y: from.y + (to.y - from.y) * e
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
        status.textContent =
          'Hopped ' + dist + 'px to ' + Math.round(pos.x) + ', ' + Math.round(pos.y) + '.';
        timer = setTimeout(hop, INTERVAL);
      }
    }

    status.textContent = 'Moving…';
    frame = requestAnimationFrame(step);
  }

  function start() {
    running = true;
    sizeCanvas();
    pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    place(pos);
    ghost.classList.add('on');
    go.classList.add('running');
    label.textContent = 'Stop';
    hint.textContent = 'click to stop';
    hop();
  }

  function stop() {
    running = false;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    ghost.classList.remove('on');
    go.classList.remove('running');
    label.textContent = 'Move the mouse';
    hint.textContent = 'click to start';
    status.textContent = hops ? 'Stopped after ' + hops + '.' : 'Idle.';
  }

  go.addEventListener('click', function () {
    if (running) stop(); else start();
  });

  window.addEventListener('resize', function () {
    if (!running) return;
    var snapshot = canvas.toDataURL();
    sizeCanvas();
    var img = new Image();
    img.onload = function () { ctx.drawImage(img, 0, 0, window.innerWidth, window.innerHeight); };
    img.src = snapshot;
  });

  // --- the real deal: hand out the right script for this OS ---------------

  var TARGETS = {
    windows: {
      name: 'Windows',
      file: 'scripts/mouse_mover.ps1',
      save: 'mouse_mover.ps1',
      cmd: 'powershell -ExecutionPolicy Bypass -File mouse_mover.ps1'
    },
    macos: {
      name: 'macOS',
      file: 'scripts/mouse_mover.py',
      save: 'mouse_mover.py',
      cmd: 'python3 mouse_mover.py'
    },
    linux: {
      name: 'Linux',
      file: 'scripts/mouse_mover.py',
      save: 'mouse_mover.py',
      cmd: 'python3 mouse_mover.py'
    }
  };

  function detectOS() {
    var ua = navigator.userAgent;
    var platform = (navigator.userAgentData && navigator.userAgentData.platform) ||
                   navigator.platform || '';
    var hay = (platform + ' ' + ua).toLowerCase();
    if (hay.indexOf('mac') > -1 || hay.indexOf('iphone') > -1 || hay.indexOf('ipad') > -1) return 'macos';
    if (hay.indexOf('win') > -1) return 'windows';
    if (hay.indexOf('linux') > -1 || hay.indexOf('android') > -1) return 'linux';
    return 'windows';
  }

  var target = TARGETS[detectOS()];
  var dlBtn = document.getElementById('download');
  var copyBtn = document.getElementById('copy');
  var cmdEl = document.querySelector('#cmd code');

  document.getElementById('os-badge').textContent = target.name;
  dlBtn.textContent = 'Download for ' + target.name;
  cmdEl.textContent = target.cmd;

  dlBtn.addEventListener('click', function () {
    // fetch + Blob so the browser saves rather than renders the plain-text file
    fetch(target.file)
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      })
      .then(function (text) {
        var url = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
        var a = document.createElement('a');
        a.href = url;
        a.download = target.save;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      })
      .catch(function () {
        // file:// or an offline page - just open it and let the user save
        window.open(target.file, '_blank');
      });
  });

  copyBtn.addEventListener('click', function () {
    var done = function () {
      copyBtn.textContent = 'Copied';
      setTimeout(function () { copyBtn.textContent = 'Copy run command'; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(target.cmd).then(done, done);
    } else {
      var ta = document.createElement('textarea');
      ta.value = target.cmd;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (e) { /* nothing else to try */ }
      ta.remove();
      done();
    }
  });

  // Point "source" at the repo this page is served from.
  var host = location.hostname.split('.')[0];
  var repo = location.pathname.split('/').filter(Boolean)[0];
  if (location.hostname.endsWith('github.io') && host) {
    document.getElementById('repo-link').href =
      'https://github.com/' + host + '/' + (repo || host + '.github.io');
  }

  sizeCanvas();
})();
