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
    var heading = page.querySelector('h2');
    heading.setAttribute('tabindex', '-1');
    openShop(page);
  }


  // ── Inside the shops: a shopkeeper sells you each scroll ───────
  // Every <div class="scroll"> in a shop's <section> is one scroll for sale.
  // You start with exactly enough gold to buy every scroll on the site.
  var SCROLL_PRICE = 5;
  var SHOPS = {
    about: {
      keeper: 'archivist', name: 'Mistress Quill, Archivist',
      pitch: 'Ah, a visitor! I keep the chronicle of Otis Hunt himself. One scroll, ' + SCROLL_PRICE + ' gold.'
    },
    projects: {
      keeper: 'tinker', name: 'Bram the Tinker',
      pitch: 'Gears, gadgets and grand designs! Each of Otis\'s projects has its own scroll. ' + SCROLL_PRICE + ' gold apiece.'
    },
    experience: {
      keeper: 'guildmaster', name: 'Guildmaster Rowan',
      pitch: 'Every quest Otis has taken on, recorded for the guild. ' + SCROLL_PRICE + ' gold, traveller.'
    },
    contact: {
      keeper: 'postmaster', name: 'Postmaster Pell',
      pitch: 'Want to send word to Otis? His addresses are sealed in this scroll. ' + SCROLL_PRICE + ' gold.'
    }
  };
  var THANKS = 'Pleasure doing business! Mind the ink, it is still wet.';
  var THANKS_MORE = 'Pleasure doing business! Fancy another? The rest are still on the shelf.';
  var WELCOME_BACK = 'Back again? Your scroll is right where you left it.';
  var WELCOME_BACK_MORE = 'Back for more? The rest are still on the shelf, ' + SCROLL_PRICE + ' gold apiece.';

  // Purchases are not remembered: every visit starts with full gold and sealed scrolls.
  var gold = 0;
  var owned = {};           // "page-id:index" -> true

  function keeperArt(kind) {
    var skin = { archivist: '#f1cfae', tinker: '#c99a72', guildmaster: '#8d5b3a', postmaster: '#e8b98f' }[kind];
    var body = { archivist: '#6f8f6a', tinker: '#d9a35b', guildmaster: '#8f2a1c', postmaster: '#3f5c8a' }[kind];
    var a = '';
    // torso and head
    a += '<path class="k-body" style="fill:' + body + '" d="M138 206 L150 152 Q180 138 210 152 L222 206 Z" />';
    if (kind === 'tinker') a += '<path class="k-apron" d="M160 160 H200 V206 H160 Z" />';
    if (kind === 'guildmaster') a += '<circle class="k-gold" cx="180" cy="172" r="7" /><path d="M176 158 L180 165 L184 158" class="k-line" />';
    if (kind === 'postmaster') a += '<path class="k-line" d="M180 150 V206 M172 165 h0 M172 180 h0 M188 165 h0 M188 180 h0" /><circle class="k-gold" cx="172" cy="168" r="2" /><circle class="k-gold" cx="172" cy="184" r="2" />';
    a += '<circle class="k-skin" style="fill:' + skin + '" cx="180" cy="120" r="22" />';
    // faces
    a += '<circle class="k-eye" cx="172" cy="118" r="2" /><circle class="k-eye" cx="188" cy="118" r="2" />';
    a += '<path class="k-line" d="M172 130 Q180 136 188 130" />';
    if (kind === 'archivist') {
      a += '<path class="k-hair" d="M158 116 Q158 94 180 96 Q202 94 202 116 Q196 104 180 104 Q164 104 158 116 Z" />';
      a += '<circle class="k-hair" cx="180" cy="90" r="9" />';
      a += '<circle class="k-glass" cx="172" cy="118" r="6" /><circle class="k-glass" cx="188" cy="118" r="6" /><path class="k-line" d="M178 118 h4" />';
    }
    if (kind === 'tinker') {
      a += '<path class="k-line" d="M158 106 H202" />';
      a += '<circle class="k-goggle" cx="171" cy="104" r="6" /><circle class="k-goggle" cx="189" cy="104" r="6" />';
      a += '<path class="k-beard" d="M164 128 Q180 150 196 128 Q188 136 180 136 Q172 136 164 128 Z" />';
    }
    if (kind === 'guildmaster') {
      a += '<path class="k-cap" d="M156 106 Q160 86 182 88 Q204 88 206 104 Z" />';
      a += '<path class="k-feather" d="M198 98 Q206 70 232 56 Q230 78 206 102 Z" /><path class="k-line" d="M202 100 Q214 78 230 60" />';
    }
    if (kind === 'postmaster') {
      a += '<path class="k-post" d="M158 104 Q160 88 180 88 Q200 88 202 104 Z" /><path class="k-line" d="M154 104 H208" />';
      a += '<path class="k-beard" d="M170 127 Q180 122 190 127 Q180 131 170 127 Z" />';
    }
    return a;
  }

  // Hands resting on top of the counter (drawn after it, so they show).
  function keeperHands(kind) {
    var skin = { archivist: '#f1cfae', tinker: '#c99a72', guildmaster: '#8d5b3a', postmaster: '#e8b98f' }[kind];
    return '<ellipse class="k-skin" style="fill:' + skin + '" cx="150" cy="195" rx="9" ry="5.5" />' +
           '<ellipse class="k-skin" style="fill:' + skin + '" cx="210" cy="195" rx="9" ry="5.5" />';
  }

  function propArt(kind) {
    if (kind === 'archivist') return '<rect class="k-book1" x="40" y="182" width="44" height="10" /><rect class="k-book2" x="44" y="172" width="38" height="10" /><rect class="k-book3" x="38" y="162" width="42" height="10" />';
    if (kind === 'tinker') return '<circle class="k-gear" cx="62" cy="182" r="11" /><circle class="k-shelf" cx="62" cy="182" r="4" /><path class="k-metal" d="M80 196 L104 172 M100 168 l8 8 l-4 4 l-8 -8 Z" />';
    if (kind === 'guildmaster') return '<path class="k-shield" d="M46 162 H80 V180 Q80 194 63 200 Q46 194 46 180 Z" /><path class="k-line" d="M63 166 V194 M50 178 H76" />';
    return '<rect class="k-letter" x="40" y="184" width="34" height="12" /><rect class="k-letter" x="44" y="176" width="34" height="12" /><path class="k-line" d="M44 176 l17 7 l17 -7" /><path class="k-quill" d="M92 196 Q100 170 118 156 Q108 176 96 196 Z" />';
  }

  function shopScene(kind) {
    var a = '<svg class="shop-art" viewBox="0 0 360 260" aria-hidden="true">';
    a += '<rect class="k-wall" x="0" y="0" width="360" height="260" />';
    // shelves with scrolls, jars and a candle
    a += '<path class="k-shelf" d="M14 70 H346 V76 H14 Z M14 132 H346 V138 H14 Z" />';
    // rolled scrolls lying on the shelves, some stacked two high: [x, shelf y, stack height]
    [[30, 70, 2], [66, 70, 1], [262, 70, 1], [296, 70, 2], [36, 132, 1], [286, 132, 2]].forEach(function (p) {
      for (var k = 0; k < p[2]; k++) {
        a += '<rect class="k-roll" x="' + (p[0] + k * 3) + '" y="' + (p[1] - 11 - k * 11) + '" width="30" height="11" rx="5.5" />';
      }
    });
    a += '<rect class="k-jar1" x="112" y="46" width="16" height="24" rx="3" /><rect class="k-jar2" x="232" y="50" width="14" height="20" rx="3" />';
    a += '<rect class="k-jar3" x="80" y="108" width="18" height="24" rx="3" /><rect class="k-jar1" x="258" y="112" width="14" height="20" rx="3" />';
    a += '<rect class="k-candle" x="318" y="112" width="6" height="20" /><path class="k-flame" d="M321 112 q-4 -6 0 -12 q4 6 0 12 Z" />';
    a += keeperArt(kind);
    // counter
    a += '<rect class="k-counter" x="8" y="200" width="344" height="60" />';
    a += '<rect class="k-countertop" x="4" y="196" width="352" height="10" />';
    a += '<path class="k-line" d="M90 206 V260 M180 206 V260 M270 206 V260" />';
    a += keeperHands(kind);
    a += propArt(kind);
    // the scroll for sale, tied with a red ribbon
    a += '<g class="for-sale"><rect class="k-roll" x="238" y="180" width="64" height="16" rx="8" />';
    a += '<rect class="k-ribbon" x="266" y="179" width="8" height="18" /></g>';
    return a + '</svg>';
  }

  function scrollsOf(page) {
    return Array.prototype.slice.call(page.querySelectorAll('.scroll'));
  }

  function scrollKey(page, i) {
    return page.id + ':' + i;
  }

  function scrollTitle(scroll) {
    var h = scroll.querySelector('h2');
    return h ? h.textContent.trim() : 'Scroll';
  }

  function buildShops() {
    var total = 0;
    pages.forEach(function (page) {
      var info = SHOPS[page.id];
      if (!info) return;
      var scrolls = scrollsOf(page);
      total += scrolls.length;

      var purse = document.createElement('p');
      purse.className = 'purse';
      purse.innerHTML = '<span class="coin" aria-hidden="true"></span> <span class="gold-count"></span> gold';
      page.insertBefore(purse, page.querySelector('.back').nextSibling);

      var many = scrolls.length > 1;
      var shop = document.createElement('div');
      shop.className = 'shop-ui';
      shop.innerHTML =
        '<div class="shop-scene">' + shopScene(info.keeper) +
        '<div class="speech"><p class="speaker">' + info.name + '</p>' +
        '<p class="line" aria-hidden="true"></p><p class="sr-only" aria-live="polite"></p></div></div>' +
        '<div class="shop-actions"><div class="buy-list"></div>' +
        '<span class="hint">' + (many ? 'Tab to choose · ' : '') + 'Space to buy · Esc to leave</span></div>';
      page.insertBefore(shop, scrolls[0]);

      var list = shop.querySelector('.buy-list');
      scrolls.forEach(function (scroll, i) {
        var h = scroll.querySelector('h2');
        if (h) h.setAttribute('tabindex', '-1');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'buy';
        btn.textContent = (many ? scrollTitle(scroll) : 'Buy the scroll') + ' \u00B7 ' + SCROLL_PRICE + ' gold';
        btn.addEventListener('click', function () { buy(page, i); });
        list.appendChild(btn);
      });
    });
    gold = total * SCROLL_PRICE;
    updatePurse();
  }

  // Shopkeepers talk: their line types out quickly, letter by letter.
  var TYPE_MS = 16;        // per character
  var typing = null;
  function say(page, text) {
    var line = page.querySelector('.speech .line');
    page.querySelector('.speech .sr-only').textContent = text; // screen readers get the whole line
    if (typing) clearTimeout(typing);
    typing = null;
    if (reduceMotion) { line.textContent = text; return; }
    var i = 0;
    line.textContent = '';
    (function next() {
      i += 1;
      line.textContent = text.slice(0, i);
      // pause a little longer after punctuation, like someone speaking
      var ch = text.charAt(i - 1);
      if (i < text.length) typing = setTimeout(next, /[.!?,]/.test(ch) ? TYPE_MS * 8 : TYPE_MS);
      else typing = null;
    })();
  }

  function updatePurse() {
    Array.prototype.forEach.call(document.querySelectorAll('.gold-count'), function (el) {
      el.textContent = gold;
    });
  }

  function remaining(page) {
    return scrollsOf(page).filter(function (_, i) { return !owned[scrollKey(page, i)]; }).length;
  }

  // Show what's bought, hide what isn't, and keep the buy buttons in step.
  function refreshShop(page) {
    var buttons = page.querySelectorAll('.buy');
    scrollsOf(page).forEach(function (scroll, i) {
      var have = !!owned[scrollKey(page, i)];
      scroll.classList.toggle('sealed', !have);
      buttons[i].hidden = have;
    });
    var left = remaining(page);
    page.querySelector('.shop-actions').hidden = left === 0;
    page.querySelector('.for-sale').style.display = left === 0 ? 'none' : '';
  }

  function openShop(page) {
    var info = SHOPS[page.id];
    if (!info) return;
    var total = scrollsOf(page).length;
    var left = remaining(page);
    say(page, left === total ? info.pitch : left > 0 ? WELCOME_BACK_MORE : WELCOME_BACK);
    scrollsOf(page).forEach(function (scroll) {
      scroll.classList.remove('unrolling', 'inking');
    });
    refreshShop(page);
    var firstBuy = page.querySelector('.buy:not([hidden])');
    (firstBuy || page.querySelector('.scroll h2')).focus({ preventScroll: true });
  }

  function buy(page, i) {
    var key = scrollKey(page, i);
    if (!SHOPS[page.id] || owned[key]) return;
    owned[key] = true;
    gold = Math.max(0, gold - SCROLL_PRICE);
    updatePurse();
    refreshShop(page);
    say(page, remaining(page) > 0 ? THANKS_MORE : THANKS);

    var scroll = scrollsOf(page)[i];
    if (!reduceMotion) {
      scroll.classList.remove('unrolling');
      void scroll.offsetWidth;
      scroll.classList.add('unrolling');
    }
    inkIn(scroll, 0.7);
    var next = page.querySelector('.buy:not([hidden])');
    (next || scroll.querySelector('h2')).focus({ preventScroll: true });
    scroll.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  // Space or Enter with nothing focused buys the next scroll on the shelf.
  function buyNext(page) {
    var buttons = page.querySelectorAll('.buy');
    for (var i = 0; i < buttons.length; i++) {
      if (!buttons[i].hidden) { buy(page, i); return true; }
    }
    return false;
  }

  function leaveShop() {
    location.hash = '';
  }

  // Write a scroll's text in, one piece after another, like fresh ink.
  function inkIn(scroll, startDelay) {
    startDelay = startDelay || 0.25;
    if (reduceMotion) return;
    var pieces = scroll.querySelectorAll('h2, h3, p, li, .portrait');
    scroll.classList.remove('inking');
    void scroll.offsetWidth; // restart the animation each time
    Array.prototype.forEach.call(pieces, function (el, i) {
      el.classList.add('ink');
      el.style.animationDelay = (startDelay + i * 0.4) + 's';
    });
    scroll.classList.add('inking');
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
    var tag = e.target.tagName;
    var onControl = tag === 'BUTTON' || tag === 'A';

    // Inside a shop: Esc leaves, Space or Enter buys the scroll.
    if (world.hidden) {
      if (e.key === 'Escape') {
        e.preventDefault();
        leaveShop();
      } else if ((e.key === ' ' || e.key === 'Enter') && !onControl) {
        var open = pages.filter(function (p) { return !p.hidden; })[0];
        if (open && SHOPS[open.id] && buyNext(open)) e.preventDefault();
      }
      return;
    }

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
  // Clear purchases saved by older versions of the site.
  try { sessionStorage.removeItem('shopGold'); sessionStorage.removeItem('shopScrolls'); } catch (e) {}
  buildShops();
  // Pets aren't remembered: every visit starts with them back in their shop windows.
  try { sessionStorage.removeItem('mapPets'); } catch (e) {}
  place(nodePoint(current));
  pose(0);
  setIdle(true);
  route();
})();
