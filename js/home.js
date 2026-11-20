(function () {
  // ── Checkpoints, in path order. `section` is the id of the <section> it opens.
  var NODES = [
    { name: 'Start',          section: null },
    { name: 'About',       section: 'about' },
    { name: 'Projects',    section: 'projects' },
    { name: 'Experience',  section: 'experience' },
    { name: 'Contact',     section: 'contact' }
  ];
  var SPEED = 260;        // map units per second
  var STEP_LENGTH = 7;    // how far one leg swing covers

  var world = document.getElementById('world');
  var mapWrap = document.getElementById('mapWrap');
  var walker = document.getElementById('walker');
  var face = walker.querySelector('.walker-face');
  var legL = document.getElementById('legL');
  var legR = document.getElementById('legR');
  var armL = document.getElementById('armL');
  var armR = document.getElementById('armR');
  var statusEl = document.getElementById('status');
  var checkpoints = Array.prototype.slice.call(document.querySelectorAll('.checkpoint'));
  var segments = NODES.slice(1).map(function (_, i) {
    return document.getElementById('seg-' + i);
  });
  var pages = Array.prototype.slice.call(document.querySelectorAll('.page'));

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var current = 0;   // node the walker is at (or last left)
  var target = 0;    // node the walker is heading to
  var moving = false;
  var entering = false;

  // ── Drawing the walker ─────────────────────────────────────────
  function nodePoint(i) {
    var seg = i === 0 ? segments[0] : segments[i - 1];
    return seg.getPointAtLength(i === 0 ? 0 : seg.getTotalLength());
  }

  function place(p) {
    walker.setAttribute('transform', 'translate(' + p.x.toFixed(2) + ' ' + p.y.toFixed(2) + ')');
    follow(p);
  }

  // On narrow screens the map scrolls sideways; keep the walker in view.
  var scroller = document.getElementById('mapScroll');
  var svg = document.getElementById('map');
  function follow(p) {
    if (scroller.scrollWidth <= scroller.clientWidth) return;
    var px = p.x * (svg.clientWidth / 1000);
    scroller.scrollLeft = px - scroller.clientWidth / 2;
  }

  function face_(dir) {
    face.setAttribute('transform', dir < 0 ? 'scale(-1 1)' : '');
  }

  function pose(distance) {
    var s = moving ? Math.sin(distance / STEP_LENGTH) : 0;
    legL.setAttribute('x2', (-4 + 6 * s).toFixed(2));
    legR.setAttribute('x2', (4 - 6 * s).toFixed(2));
    armL.setAttribute('x2', (-6 - 3 * s).toFixed(2));
    armR.setAttribute('x2', (6 + 3 * s).toFixed(2));
  }

  function setIdle(idle) {
    walker.classList.toggle('idle', idle);
  }

  // ── Status line + highlight ───────────────────────────────────
  function updateStatus() {
    checkpoints.forEach(function (cp, i) {
      cp.classList.toggle('here', !moving && i === current);
    });
    if (moving) return;
    if (current === 0) {
      statusEl.textContent = 'Use → to walk to the first checkpoint, or tap one on the map.';
    } else {
      statusEl.textContent = NODES[current].name + ': press Enter (or tap it again) to go inside.';
    }
  }

  // ── Walking ────────────────────────────────────────────────────
  function stepOnce(dir, done) {
    var seg = dir > 0 ? segments[current] : segments[current - 1];
    var len = seg.getTotalLength();
    var next = current + dir;

    if (reduceMotion) {
      current = next;
      place(nodePoint(current));
      done();
      return;
    }

    var start = null;
    var duration = (len / SPEED) * 1000;
    var prevX = null;

    function frame(now) {
      if (start === null) start = now;
      var t = Math.min((now - start) / duration, 1);
      var d = t * len;
      var p = seg.getPointAtLength(dir > 0 ? d : len - d);
      if (prevX !== null && Math.abs(p.x - prevX) > 0.05) face_(p.x > prevX ? 1 : -1);
      prevX = p.x;
      place(p);
      pose(d);
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        current = next;
        done();
      }
    }
    requestAnimationFrame(frame);
  }

  function walk() {
    if (moving) return;
    if (current === target) return;
    moving = true;
    setIdle(false);
    statusEl.textContent = 'Walking…';
    updateStatus();

    (function loop() {
      if (current === target) {
        moving = false;
        pose(0);
        setIdle(true);
        updateStatus();
        saveNode();
        return;
      }
      stepOnce(target > current ? 1 : -1, loop);
    })();
  }

  function walkTo(i) {
    if (entering) return;
    target = Math.max(0, Math.min(NODES.length - 1, i));
    walk();
  }

  function nudge(dir) {
    // Pressing again while walking queues one more checkpoint.
    walkTo((moving ? target : current) + dir);
  }

  // ── Walking into a checkpoint ─────────────────────────────────
  function enter() {
    if (moving || entering) return;
    var node = NODES[current];
    if (!node.section) {
      statusEl.textContent = 'Nothing to go into here. Walk → to the first checkpoint.';
      return;
    }
    entering = true;

    if (reduceMotion) {
      location.hash = node.section;
      return;
    }

    setIdle(false);
    walker.classList.add('entering');
    world.classList.add('leaving');

    setTimeout(function () {
      var door = checkpoints[current].querySelector('.door');
      var doorRect = door.getBoundingClientRect();
      var wrapRect = mapWrap.getBoundingClientRect();
      var cx = doorRect.left + doorRect.width / 2 - wrapRect.left;
      var cy = doorRect.top + doorRect.height * 0.6 - wrapRect.top;
      var diagonal = Math.hypot(window.innerWidth, window.innerHeight);
      var scale = (diagonal / doorRect.width) * 1.4;

      mapWrap.style.transformOrigin = cx + 'px ' + cy + 'px';
      mapWrap.getBoundingClientRect(); // commit origin before animating
      mapWrap.classList.add('zooming');
      mapWrap.style.transform = 'scale(' + scale + ')';

      var finished = false;
      function finish() {
        if (finished) return;
        finished = true;
        location.hash = node.section;
      }
      mapWrap.addEventListener('transitionend', function handler(ev) {
        if (ev.target !== mapWrap || ev.propertyName !== 'transform') return;
        mapWrap.removeEventListener('transitionend', handler);
        finish();
      });
      setTimeout(finish, 1600);
    }, 550);
  }

  function resetMap() {
    entering = false;
    mapWrap.classList.remove('zooming');
    mapWrap.style.transform = '';
    world.classList.remove('leaving');
    walker.classList.remove('entering');
    setIdle(true);
  }

  // ── Pages (driven by the URL hash, so Back works) ─────────────
  function route() {
    var id = location.hash.replace('#', '');
    var idx = NODES.findIndex(function (n) { return n.section && n.section === id; });

    if (idx === -1) {
      pages.forEach(function (p) { p.hidden = true; });
      world.hidden = false;
      resetMap();
      updateStatus();
      return;
    }

    // Arriving straight at a section (link or reload): stand at its checkpoint.
    if (current !== idx && !moving) {
      current = target = idx;
      place(nodePoint(idx));
      saveNode();
    }

    world.hidden = true;
    pages.forEach(function (p) { p.hidden = p.id !== id; });
    window.scrollTo(0, 0);
    var page = document.getElementById(id);
    var heading = page.querySelector('h2');
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }

  // ── Remember where the walker was (per tab, optional) ─────────
  function saveNode() {
    try { sessionStorage.setItem('mapNode', String(current)); } catch (e) {}
  }

  function loadNode() {
    try {
      var n = parseInt(sessionStorage.getItem('mapNode'), 10);
      if (n >= 0 && n < NODES.length) return n;
    } catch (e) {}
    return 0;
  }

  // ── Input ──────────────────────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    if (world.hidden) return;
    var tag = e.target.tagName;
    var onControl = tag === 'BUTTON' || tag === 'A';

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        nudge(1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        nudge(-1);
        break;
      case 'Enter':
      case ' ':
        if (onControl) return; // let the focused button do its own thing
        e.preventDefault();
        enter();
        break;
    }
  });

  checkpoints.forEach(function (cp, i) {
    cp.addEventListener('click', function () {
      if (i === current && !moving) enter();
      else walkTo(i);
    });
  });

  document.getElementById('btnPrev').addEventListener('click', function () { nudge(-1); });
  document.getElementById('btnNext').addEventListener('click', function () { nudge(1); });
  document.getElementById('btnEnter').addEventListener('click', enter);

  window.addEventListener('hashchange', route);

  // Coming back via the browser's Back button from another page.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) route();
  });

  // ── Start ──────────────────────────────────────────────────────
  current = target = loadNode();
  place(nodePoint(current));
  pose(0);
  setIdle(true);
  route();
})();
