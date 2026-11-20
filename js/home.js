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

  // ── Pets: one waits in each shop and joins the line when you come back out.
  var PET_SPACING = 26;   // gap between creatures in the conga line
  var PETS = {
    1: { name: 'cat', art:
      '<path class="nofill" d="M-9 -8 Q-16 -10 -14 -20" />' +
      '<path class="nofill" d="M-6 -3 v3 M4 -3 v3" />' +
      '<ellipse class="cat" cx="-1" cy="-7" rx="9" ry="5.5" />' +
      '<path class="cat" d="M4.5 -16 l1 -5 l3 3.5 Z M8.5 -17.5 l3 -4 l1 5 Z" />' +
      '<circle class="cat" cx="8" cy="-13" r="5" />' +
      '<circle class="eyeY" cx="10" cy="-13.5" r="1.3" />' },
    2: { name: 'frog', art:
      '<path class="nofill" d="M-9 0 q2 -5 5 -4 M9 0 q-2 -5 -5 -4" />' +
      '<ellipse class="frog" cx="0" cy="-6" rx="9" ry="6" />' +
      '<circle class="frog" cx="-3" cy="-12" r="3" /><circle class="frog" cx="4" cy="-12" r="3" />' +
      '<circle class="dot" cx="-2.4" cy="-12.4" r="1.1" /><circle class="dot" cx="4.6" cy="-12.4" r="1.1" />' +
      '<path class="nofill" d="M1 -6 q3 2 6 -0.5" />' },
    3: { name: 'owl', art:
      '<path class="nofill" d="M-3 0 v-2 M3 0 v-2" />' +
      '<path class="owl" d="M-6 -15 l-1.5 -6 l4.5 3 Z M6 -15 l1.5 -6 l-4.5 3 Z" />' +
      '<ellipse class="owl" cx="0" cy="-10" rx="7.5" ry="9" />' +
      '<ellipse class="owl2" cx="0" cy="-5.5" rx="4.5" ry="4" />' +
      '<circle class="white" cx="-2.8" cy="-13" r="2.6" /><circle class="white" cx="2.8" cy="-13" r="2.6" />' +
      '<circle class="dot" cx="-2.4" cy="-13" r="1.1" /><circle class="dot" cx="3.2" cy="-13" r="1.1" />' +
      '<path class="beak" d="M-1.2 -10.5 h2.4 l-1.2 2.6 Z" />' },
    4: { name: 'dragon', art:
      '<path class="dragon" d="M-7 -6 Q-14 -6 -17 -12 Q-12 -8.5 -7 -9.5 Z" />' +
      '<path class="nofill" d="M-5 -2 v2 M3 -2 v2" />' +
      '<ellipse class="dragon" cx="-1" cy="-7" rx="8" ry="5.5" />' +
      '<path class="wing" d="M-4 -11 L-2 -22 L5 -12 Z" />' +
      '<path class="nofill" d="M6.5 -16.5 l-1.5 -4 M9.5 -17 l1 -4" />' +
      '<circle class="dragon" cx="8" cy="-13" r="4.5" />' +
      '<circle class="dot" cx="9.6" cy="-13.6" r="1" />' }
  };

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

  var petsLayer = document.getElementById('pets');
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var current = 0;   // node the walker is at (or last left)
  var target = 0;    // node the walker is heading to
  var moving = false;
  var entering = false;
  var lastShop = null; // the shop we were last inside, so its pet can join on the way out

  // ── Drawing the walker ─────────────────────────────────────────
  function nodePoint(i) {
    var seg = i === 0 ? segments[0] : segments[i - 1];
    return seg.getPointAtLength(i === 0 ? 0 : seg.getTotalLength());
  }

  function place(p) {
    walker.setAttribute('transform', 'translate(' + p.x.toFixed(2) + ' ' + p.y.toFixed(2) + ')');
    record(p);
    renderPets();
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
    armL.setAttribute('x2', (-9 - 3 * s).toFixed(2)); // the other hand holds the staff
  }

  // ── The conga line ─────────────────────────────────────────────
  // The wizard's recent path, so each pet can stand where the wizard was a few steps ago.
  var trail = [];        // [{x, y, d}] with d = distance walked so far
  var walked = 0;
  var pets = [];         // in the order they joined

  function resetTrail(p) {
    // Pretend the wizard just walked in from the side with more room, so pets line up behind.
    var dir = p.x > 300 ? -1 : 1;
    var back = PET_SPACING * 5;
    trail = [{ x: p.x + dir * back, y: p.y, d: 0 }, { x: p.x, y: p.y, d: back }];
    walked = back;
  }

  function record(p) {
    var last = trail[trail.length - 1];
    if (!last) { resetTrail(p); return; }
    var step = Math.hypot(p.x - last.x, p.y - last.y);
    if (step < 0.3) return;
    walked += step;
    trail.push({ x: p.x, y: p.y, d: walked });
    // Keep only as much as the line needs.
    var keep = PET_SPACING * (Object.keys(PETS).length + 2);
    while (trail.length > 2 && trail[1].d < walked - keep) trail.shift();
  }

  function pointBehind(lag) {
    var want = walked - lag;
    if (want <= trail[0].d) return { x: trail[0].x, y: trail[0].y };
    for (var i = trail.length - 1; i > 0; i--) {
      var a = trail[i - 1], b = trail[i];
      if (a.d <= want) {
        var t = (want - a.d) / ((b.d - a.d) || 1);
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
    }
    return { x: trail[0].x, y: trail[0].y };
  }

  function makePet(node) {
    var g = document.createElementNS(SVG_NS, 'g');
    var flip = document.createElementNS(SVG_NS, 'g');
    var hop = document.createElementNS(SVG_NS, 'g');
    var art = document.createElementNS(SVG_NS, 'g');
    art.setAttribute('class', 'pet-art');
    art.innerHTML = PETS[node].art;
    hop.appendChild(art);
    flip.appendChild(hop);
    g.appendChild(flip);
    g.setAttribute('class', 'pet pet-' + PETS[node].name);
    petsLayer.appendChild(g);
    return { node: node, el: g, flip: flip, hop: hop, art: art, lastX: null, dir: 1, join: null };
  }

  function renderPets(now) {
    now = now || performance.now();
    var joining = false;
    pets.forEach(function (pet, i) {
      var lag = PET_SPACING * (i + 1);
      var p = pointBehind(lag);
      var lift = moving ? Math.abs(Math.sin((walked - lag) / 5)) * 3 : 0;

      if (pet.join) {
        var t = reduceMotion ? 1 : Math.min((now - pet.join.start) / 650, 1);
        var e = 1 - Math.pow(1 - t, 3);
        p = { x: pet.join.from.x + (p.x - pet.join.from.x) * e, y: pet.join.from.y + (p.y - pet.join.from.y) * e };
        lift = Math.sin(Math.PI * t) * 16;
        if (t >= 1) pet.join = null; else joining = true;
      }

      if (pet.lastX !== null && Math.abs(p.x - pet.lastX) > 0.05) pet.dir = p.x > pet.lastX ? 1 : -1;
      pet.lastX = p.x;
      pet.el.setAttribute('transform', 'translate(' + p.x.toFixed(2) + ' ' + p.y.toFixed(2) + ')');
      pet.flip.setAttribute('transform', pet.dir < 0 ? 'scale(-1 1)' : '');
      pet.hop.setAttribute('transform', 'translate(0 ' + (-lift).toFixed(2) + ')');
    });
    if (joining) requestAnimationFrame(renderPets);
  }

  // Before it joins, each pet sits in its shop's front window.
  var residents = {};
  function makeResidents() {
    var defs = document.createElementNS(SVG_NS, 'defs');
    svg.insertBefore(defs, svg.firstChild);
    Object.keys(PETS).forEach(function (node) {
      var cp = checkpoints[node];
      var win = cp && cp.querySelector('.shop rect.window');
      if (!win) return;
      var x = +win.getAttribute('x'), y = +win.getAttribute('y');
      var w = +win.getAttribute('width'), h = +win.getAttribute('height');

      var clip = document.createElementNS(SVG_NS, 'clipPath');
      clip.setAttribute('id', 'shop-window-' + node);
      clip.innerHTML = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" />';
      defs.appendChild(clip);

      var wrap = document.createElementNS(SVG_NS, 'g');
      wrap.setAttribute('class', 'resident-wrap');
      wrap.setAttribute('clip-path', 'url(#shop-window-' + node + ')');
      var place = document.createElementNS(SVG_NS, 'g');
      place.setAttribute('transform', 'translate(' + (x + w / 2) + ' ' + (y + h - 1) + ') scale(0.72)');
      var art = document.createElementNS(SVG_NS, 'g');
      art.setAttribute('class', 'pet-art resident');
      art.style.animationDelay = (-0.4 * node) + 's';
      art.innerHTML = PETS[node].art;
      place.appendChild(art);
      wrap.appendChild(place);
      cp.insertBefore(wrap, cp.querySelector('.label'));
      residents[node] = wrap;
    });
  }

  function addPet(node, animate) {
    if (!PETS[node]) return false;
    if (pets.some(function (p) { return p.node === node; })) return false;
    if (residents[node]) residents[node].classList.add('gone');
    var pet = makePet(node);
    pets.push(pet);
    if (animate) {
      pet.join = { start: performance.now(), from: nodePoint(node) };
      pet.art.classList.add('pet-pop');
      setTimeout(function () { pet.art.classList.remove('pet-pop'); }, 600);
    }
    savePets();
    renderPets();
    return true;
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
      statusEl.textContent = NODES[current].name + ': press Space (or tap it again) to go inside.';
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
    statusEl.textContent = 'Walking...';
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
      if (lastShop !== null) {
        var shop = lastShop;
        lastShop = null;
        // Wait a beat so the map is visible before the pet hops out.
        setTimeout(function () {
          if (addPet(shop, true)) {
            var petName = PETS[shop].name;
            statusEl.textContent = (/^[aeiou]/.test(petName) ? 'An ' : 'A ') + petName +
              ' followed you out of ' + NODES[shop].name + '!';
          }
        }, 250);
      }
      return;
    }

    lastShop = idx;

    // Arriving straight at a section (link or reload): stand at its checkpoint.
    if (current !== idx && !moving) {
      current = target = idx;
      resetTrail(nodePoint(idx));
      place(nodePoint(idx));
      saveNode();
    }

    world.hidden = true;
    pages.forEach(function (p) { p.hidden = p.id !== id; });
    window.scrollTo(0, 0);
    var page = document.getElementById(id);
    inkIn(page);
    var heading = page.querySelector('h2');
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }

  // Write the scroll's text in, one piece after another, like fresh ink.
  function inkIn(page) {
    if (reduceMotion) return;
    var pieces = page.querySelectorAll('.scroll h2, .scroll h3, .scroll p, .scroll li, .scroll .portrait');
    page.classList.remove('inking');
    void page.offsetWidth; // restart the animation each time the scroll opens
    Array.prototype.forEach.call(pieces, function (el, i) {
      el.classList.add('ink');
      el.style.animationDelay = (0.25 + i * 0.4) + 's';
    });
    page.classList.add('inking');
  }

  // ── Remember where the walker was (per tab, optional) ─────────
  function saveNode() {
    try { sessionStorage.setItem('mapNode', String(current)); } catch (e) {}
  }

  function savePets() {
    try {
      sessionStorage.setItem('mapPets', JSON.stringify(pets.map(function (p) { return p.node; })));
    } catch (e) {}
  }

  function loadPets() {
    try {
      var list = JSON.parse(sessionStorage.getItem('mapPets') || '[]');
      if (Array.isArray(list)) return list;
    } catch (e) {}
    return [];
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
  resetTrail(nodePoint(current));
  makeResidents();
  loadPets().forEach(function (n) { addPet(n, false); });
  place(nodePoint(current));
  pose(0);
  setIdle(true);
  route();
})();
