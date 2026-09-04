/* Random Mouse Mover
 *
 * The button drives the REAL system cursor. A web page has no API for that, so
 * a one-file agent runs on the user's machine and this page calls it over
 * localhost. If the agent isn't up, the setup steps appear; otherwise they stay
 * out of the way entirely.
 */

(function () {
  'use strict';

  var AGENT = 'http://127.0.0.1:8777';
  var INTERVAL = 1500;   // ms of rest between hops

  var go = document.getElementById('go');
  var label = go.querySelector('.go-label');
  var hint = go.querySelector('.go-hint');
  var status = document.getElementById('status');
  var hopsEl = document.getElementById('hops');
  var setup = document.getElementById('setup');

  var running = false;
  var hops = 0;
  var timer = null;
  var connected = false;

  // --- talking to the agent ----------------------------------------------

  function call(path, timeoutMs) {
    var controller = new AbortController();
    var bail = setTimeout(function () { controller.abort(); }, timeoutMs || 8000);
    return fetch(AGENT + path, { signal: controller.signal, cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('agent returned ' + r.status);
        return r.json();
      })
      .finally(function () { clearTimeout(bail); });
  }

  function setConnected(on, info) {
    connected = on;
    setup.hidden = on;
    if (on) {
      hint.textContent = 'agent ready — ' + info.screen[0] + '×' + info.screen[1];
      go.classList.remove('cold');
    } else {
      hint.textContent = 'agent not running';
      go.classList.add('cold');
    }
  }

  function probe() {
    return call('/ping', 2500).then(
      function (info) { setConnected(true, info); return true; },
      function () { setConnected(false); return false; }
    );
  }

  // --- the loop -----------------------------------------------------------

  function tick() {
    if (!running) return;
    status.textContent = 'Moving…';
    call('/hop').then(function (d) {
      if (!running) return;
      hops++;
      hopsEl.textContent = hops + (hops === 1 ? ' hop' : ' hops');
      status.textContent = 'Hopped ' + d.distance + 'px to ' + d.x + ', ' + d.y + '.';
      timer = setTimeout(tick, INTERVAL);
    }, function () {
      stop('Lost the agent — is it still running?');
      setConnected(false);
    });
  }

  function start() {
    running = true;
    go.classList.add('running');
    label.textContent = 'Stop';
    hint.textContent = 'click to stop';
    tick();
  }

  function stop(message) {
    running = false;
    clearTimeout(timer);
    go.classList.remove('running');
    label.textContent = 'Move my mouse';
    hint.textContent = connected ? 'click to start' : 'agent not running';
    status.textContent = message || (hops ? 'Stopped after ' + hops + '.' : ' ');
  }

  go.addEventListener('click', function () {
    if (running) { stop(); return; }
    if (connected) { start(); return; }

    // Not connected as far as we know — re-check before nagging, since the
    // agent may have been started since the page loaded.
    label.textContent = 'Checking…';
    status.textContent = 'Looking for the agent on ' + AGENT + '…';
    probe().then(function (ok) {
      label.textContent = 'Move my mouse';
      if (ok) {
        status.textContent = ' ';
        start();
      } else {
        status.textContent = 'No agent found. Set it up below, then press again.';
        setup.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  });

  window.addEventListener('beforeunload', function () { running = false; });

  // --- per-OS setup instructions -----------------------------------------

  var TARGETS = {
    windows: {
      file: 'scripts/mouse_mover.ps1',
      save: 'mouse_mover.ps1',
      cmd: 'powershell -ExecutionPolicy Bypass -File mouse_mover.ps1'
    },
    macos: {
      file: 'scripts/mouse_mover.py',
      save: 'mouse_mover.py',
      cmd: 'python3 mouse_mover.py'
    },
    linux: {
      file: 'scripts/mouse_mover.py',
      save: 'mouse_mover.py',
      cmd: 'python3 mouse_mover.py'
    }
  };

  function detectOS() {
    var platform = (navigator.userAgentData && navigator.userAgentData.platform) ||
                   navigator.platform || '';
    var hay = (platform + ' ' + navigator.userAgent).toLowerCase();
    if (hay.indexOf('mac') > -1 || hay.indexOf('iphone') > -1 || hay.indexOf('ipad') > -1) return 'macos';
    if (hay.indexOf('win') > -1) return 'windows';
    if (hay.indexOf('linux') > -1 || hay.indexOf('android') > -1) return 'linux';
    return 'windows';
  }

  var os = detectOS();
  var target = TARGETS[os];
  var dl = document.getElementById('dl');
  var copyBtn = document.getElementById('copy');

  dl.href = target.file;
  dl.setAttribute('download', target.save);
  document.getElementById('dl-name').textContent = target.save;
  document.getElementById('cmd').textContent = target.cmd;
  if (os === 'macos') document.getElementById('mac-note').hidden = false;

  copyBtn.addEventListener('click', function () {
    var done = function () {
      copyBtn.textContent = 'Copied';
      setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1500);
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

  // Re-probe when the tab regains focus, so starting the agent in another
  // window makes the setup steps disappear without a reload.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !running && !connected) probe();
  });

  probe();
})();
