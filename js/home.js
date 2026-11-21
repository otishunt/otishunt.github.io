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
    var s = moving || entering ? Math.sin(distance / STEP_LENGTH) : 0;
    legL.setAttribute('x2', (-4 + 6 * s).toFixed(2));
    legR.setAttribute('x2', (4 - 6 * s).toFixed(2));
    armL.setAttribute('x2', (-9 - 3 * s).toFixed(2)); // the other hand holds the staff
  }

  // ── The conga line ─────────────────────────────────────────────
  // The wizard's recent path, so each pet can stand where the wizard was a few steps ago.
  var trail = [];        // [{x, y, d}] with d = distance walked so far
  var walked = 0;
  var pets = [];         // in the order they joined

  // A point `d` along the whole street (all segments end to end). Before the start it carries
  // on in a straight line, off the bottom of the map where the street comes in.
  function routePoint(d) {
    if (d < 0) {
      var a = segments[0].getPointAtLength(0), b = segments[0].getPointAtLength(2);
      var len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: a.x + (a.x - b.x) / len * -d, y: a.y + (a.y - b.y) / len * -d };
    }
    for (var i = 0; i < segments.length; i++) {
      var l = segments[i].getTotalLength();
      if (d <= l || i === segments.length - 1) return segments[i].getPointAtLength(Math.min(d, l));
      d -= l;
    }
  }

  function resetTrail(p) {
    // Line the pets up behind the wizard along the street he came up.
    var at = 0;
    for (var i = 0; i < current; i++) at += segments[i].getTotalLength();
    var back = PET_SPACING * 5;
    trail = [];
    for (var d = 0; d <= back; d += 4) {
      var q = routePoint(at - back + d);
      trail.push({ x: q.x, y: q.y, d: d });
    }
    trail.push({ x: p.x, y: p.y, d: back + 0.01 });
    walked = back + 0.01;
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
      win.parentNode.insertBefore(wrap, win.nextSibling); // inside the (scaled) shop drawing
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
    world.classList.add('leaving');

    // Walk up to the shop's doorway (the shop group is placed with its door at its origin)...
    var from = nodePoint(current);
    var m = checkpoints[current].transform.baseVal.consolidate().matrix;
    var to = { x: m.e, y: m.f - 3 };
    var len = Math.hypot(to.x - from.x, to.y - from.y);
    var duration = Math.max(160, (len / SPEED) * 1000);
    var start = null;
    function step(now) {
      if (start === null) start = now;
      var t = Math.min((now - start) / duration, 1);
      place({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
      pose(t * len * 2.5);
      if (t < 1) { requestAnimationFrame(step); return; }
      pose(0);
      // ...vanish into it, then fade the screen to white and open the shop.
      walker.classList.add('entering');
      setTimeout(function () {
        veil.classList.add('on');
        setTimeout(function () { location.hash = node.section; }, VEIL_MS);
      }, 160);
    }
    requestAnimationFrame(step);
  }

  // A full-screen white veil for going in and out of shops.
  var VEIL_MS = 180;
  var veil = document.createElement('div');
  veil.className = 'veil';
  veil.setAttribute('aria-hidden', 'true');
  document.body.appendChild(veil);

  function liftVeil() {
    if (!veil.classList.contains('on')) return;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { veil.classList.remove('on'); });
    });
  }

  function resetMap() {
    entering = false;
    world.classList.remove('leaving');
    walker.classList.remove('entering');
    place(nodePoint(current)); // back out on the street, in front of the door
    pose(0);
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
    liftVeil(); // fade up from white into the shop
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
      pitch: 'Every quest Otis has taken on, recorded for the guild, one scroll per quest. ' + SCROLL_PRICE + ' gold apiece, traveller.',
      // Recruiters can get Otis's contact scroll right here, without walking to the post office.
      recruit: 'contact',
      recruitLine: 'Hiring, are we? Here are Otis\'s addresses, fresh from the post office. Send word anytime.'
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

  // ── The shop interior: a full-width room behind the counter ──
  // Drawn on a 1200×400 canvas that fills the screen width (cropping the sides on phones, never the
  // shopkeeper). The shopkeeper art above was drawn for a 360×260 scene; it's scaled into place here.
  var INK = '#3b2c22';
  var ROOMS = {
    archivist:   { wall: '#efe2c6', accent: '#8f2a1c' },
    tinker:      { wall: '#e6dccb', accent: '#4f6fa3' },
    guildmaster: { wall: '#eadbb4', accent: '#4c8a5e' },
    postmaster:  { wall: '#efe6d6', accent: '#7d4f6a' }
  };

  function spin(cx, cy, seconds, reverse) {
    if (reduceMotion) return '';
    return '<animateTransform attributeName="transform" type="rotate" from="0 ' + cx + ' ' + cy + '" to="' +
      (reverse ? -360 : 360) + ' ' + cx + ' ' + cy + '" dur="' + seconds + 's" repeatCount="indefinite" />';
  }

  function gear(cx, cy, r, teeth, seconds, reverse) {
    var d = '', step = Math.PI * 2 / teeth;
    for (var i = 0; i < teeth; i++) {
      var a = i * step;
      [[a - step * 0.28, r * 0.8], [a - step * 0.16, r], [a + step * 0.16, r], [a + step * 0.28, r * 0.8]].forEach(function (p, k) {
        d += (i === 0 && k === 0 ? 'M' : 'L') + (cx + Math.cos(p[0]) * p[1]).toFixed(1) + ' ' + (cy + Math.sin(p[0]) * p[1]).toFixed(1) + ' ';
      });
    }
    return '<g>' + spin(cx, cy, seconds, reverse) +
      '<path d="' + d + 'Z" fill="#b9bec7" stroke="' + INK + '" stroke-width="1.5" />' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.55) + '" fill="#9aa0aa" stroke="' + INK + '" stroke-width="1.2" />' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.16) + '" fill="#5b3a26" /></g>';
  }

  // Deterministic "random" so every visit draws the same books.
  function wobble(i, salt) {
    var x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function roomProps(kind, id) {
    var a = '';
    if (kind === 'archivist') {
      // a tapestry map behind the archivist
      a += '<path d="M520 34 H680 V172 H520 Z" fill="#f3e2bd" stroke="' + INK + '" stroke-width="2" />';
      a += '<path d="M514 34 H686" stroke="#5b3a26" stroke-width="6" stroke-linecap="round" />';
      a += '<path d="M540 70 q20 -14 36 4 t40 -2 q16 10 34 -6 M548 120 q24 10 44 -8 t48 6 M560 150 q20 -6 40 4" fill="none" stroke="#8a6a3a" stroke-width="1.6" />';
      a += '<path d="M612 96 l5 10 l-10 0 Z M596 108 l4 8 l-8 0 Z" fill="#6f8f6a" /><path d="M640 136 l-8 8 M632 136 l8 8" stroke="#8f2a1c" stroke-width="2" />';
      // a portrait in a gilt frame
      a += '<rect x="732" y="74" width="100" height="92" fill="#c9a24a" stroke="' + INK + '" stroke-width="2" />';
      a += '<rect x="742" y="84" width="80" height="72" fill="url(#' + id + 'sky)" /><path d="M742 140 q20 -24 40 -6 q20 -18 40 0 V156 H742 Z" fill="#87b066" />';
      // a tall bookcase
      a += '<path d="M880 34 H1130 V300 H880 Z" fill="#6b4424" stroke="' + INK + '" stroke-width="2" />';
      var colors = ['#8f2a1c', '#3f5c8a', '#6f8f6a', '#c9a24a', '#7d4f6a', '#a8743d', '#2f466c'];
      [96, 160, 224, 292].forEach(function (shelfY, row) {
        a += '<path d="M886 ' + shelfY + ' H1124 V' + (shelfY + 6) + ' H886 Z" fill="#8a5a33" />';
        var x = 892;
        for (var i = 0; x < 1110; i++) {
          var w = 10 + Math.floor(wobble(i, row) * 8);
          var h = 36 + Math.floor(wobble(i, row + 9) * 18);
          if (wobble(i, row + 3) < 0.08) { x += 14; continue; }
          a += '<rect x="' + x + '" y="' + (shelfY - h) + '" width="' + w + '" height="' + h + '" fill="' + colors[(i + row * 3) % colors.length] +
               '" stroke="' + INK + '" stroke-width="1.2" /><path d="M' + (x + 2) + ' ' + (shelfY - h + 8) + ' h' + (w - 4) + '" stroke="#f3e2bd" stroke-width="1.5" />';
          x += w + 1;
        }
      });
      a += '<path d="M1060 34 v-8" stroke="' + INK + '" stroke-width="1" />';
    }
    if (kind === 'tinker') {
      a += gear(588, 92, 52, 12, 18, false) + gear(664, 54, 30, 8, 10.4, true) + gear(520, 150, 24, 8, 8, true);
      // blueprint pinned to the wall
      a += '<path d="M722 70 L852 64 L856 170 L726 176 Z" fill="#3f6fa3" stroke="' + INK + '" stroke-width="2" />';
      a += '<path d="M740 150 L800 92 L840 130 M760 90 h40 v30 h-40 Z M746 160 h60" fill="none" stroke="#dbe8f6" stroke-width="1.6" />';
      a += '<circle cx="728" cy="74" r="4" fill="#c0504a" /><circle cx="850" cy="68" r="4" fill="#c0504a" />';
      // pegboard with tools
      a += '<path d="M880 44 H1130 V286 H880 Z" fill="#c9a37a" stroke="' + INK + '" stroke-width="2" />';
      for (var py = 58; py < 280; py += 18) for (var px = 894; px < 1124; px += 18) a += '<circle cx="' + px + '" cy="' + py + '" r="2" fill="#9c7a52" />';
      a += '<g fill="#9aa0aa" stroke="' + INK + '" stroke-width="1.5" stroke-linejoin="round">' +
           '<path d="M916 70 h10 v110 h-10 Z" fill="#a8743d" /><path d="M904 64 h34 v18 h-34 Z" />' +                       // hammer
           '<path d="M966 70 a14 14 0 1 1 0 26 v86 h-10 v-86 a14 14 0 1 1 0 -26 v12 h10 Z" />' +                         // wrench
           '<path d="M1010 74 h70 l-8 50 h-62 Z" fill="#cfd4dc" /><path d="M1080 74 h20 v24 h-20 Z" fill="#a8743d" />' +    // saw
           '<path d="M1020 160 l24 90 h-10 l-22 -84 Z M1060 160 l-24 90 h10 l22 -84 Z" fill="#c0504a" />' +                // pliers
           '<path d="M1100 150 h10 v60 h-10 Z" fill="#c9a24a" /><path d="M1103 210 h4 v50 h-4 Z" /></g>';                 // screwdriver
    }
    if (kind === 'guildmaster') {
      // the guild banner
      a += '<path d="M540 26 H660 V176 L600 150 L540 176 Z" fill="#4c8a5e" stroke="' + INK + '" stroke-width="2" />';
      a += '<path d="M550 36 H650 V164 L600 142 L550 164 Z" fill="none" stroke="#ffc21a" stroke-width="2" />';
      a += '<path d="M578 66 H622 V96 Q622 116 600 124 Q578 116 578 96 Z" fill="#8f2a1c" stroke="#ffc21a" stroke-width="2" />';
      a += '<path d="M600 74 l4 9 l9 1 l-7 6 l2 9 l-8 -5 l-8 5 l2 -9 l-7 -6 l9 -1 Z" fill="#ffc21a" />';
      // crossed swords over a shield
      a += '<path d="M730 70 L836 190 M836 70 L730 190" stroke="#cfd4dc" stroke-width="7" stroke-linecap="round" />';
      a += '<path d="M730 70 L836 190 M836 70 L730 190" stroke="' + INK + '" stroke-width="1.2" stroke-linecap="round" fill="none" />';
      a += '<path d="M744 176 l-12 12 M822 176 l12 12" stroke="#a8743d" stroke-width="6" stroke-linecap="round" />';
      a += '<path d="M756 96 H810 V132 Q810 160 783 170 Q756 160 756 132 Z" fill="#3f5c8a" stroke="' + INK + '" stroke-width="2" />';
      a += '<path d="M783 104 V162 M760 130 H806" stroke="#ffc21a" stroke-width="3" />';
      // the quest board, papers pinned all over it
      a += '<path d="M880 56 H1124 V270 H880 Z" fill="#b98a56" stroke="#5b3a26" stroke-width="8" />';
      [[900, 72, -4], [968, 80, 3], [1040, 70, -2], [906, 160, 2], [980, 170, -5], [1050, 158, 4]].forEach(function (q, i) {
        a += '<g transform="rotate(' + q[2] + ' ' + (q[0] + 28) + ' ' + (q[1] + 36) + ')"><path d="M' + q[0] + ' ' + q[1] + ' h56 v74 h-56 Z" fill="#f6efe2" stroke="' + INK + '" stroke-width="1.2" />' +
             '<path d="M' + (q[0] + 8) + ' ' + (q[1] + 16) + ' h40 M' + (q[0] + 8) + ' ' + (q[1] + 28) + ' h34 M' + (q[0] + 8) + ' ' + (q[1] + 40) + ' h38 M' + (q[0] + 8) + ' ' + (q[1] + 52) + ' h26" stroke="#8a7a62" stroke-width="2" />' +
             '<circle cx="' + (q[0] + 28) + '" cy="' + (q[1] + 6) + '" r="3.5" fill="' + (i % 2 ? '#c0504a' : '#4f6fa3') + '" /></g>';
      });
    }
    if (kind === 'postmaster') {
      // wall clock, its minute hand going round
      a += '<circle cx="600" cy="80" r="42" fill="#5b3a26" stroke="' + INK + '" stroke-width="2" /><circle cx="600" cy="80" r="34" fill="#f6efe2" />';
      for (var h = 0; h < 12; h++) {
        var ang = h * Math.PI / 6;
        a += '<path d="M' + (600 + Math.cos(ang) * 27).toFixed(1) + ' ' + (80 + Math.sin(ang) * 27).toFixed(1) + ' L' + (600 + Math.cos(ang) * 31).toFixed(1) + ' ' + (80 + Math.sin(ang) * 31).toFixed(1) + '" stroke="' + INK + '" stroke-width="2" />';
      }
      a += '<path d="M600 80 L616 89" stroke="' + INK + '" stroke-width="3.5" stroke-linecap="round" />';
      a += '<g>' + spin(600, 80, 30, false) + '<path d="M600 80 V52" stroke="' + INK + '" stroke-width="2.2" stroke-linecap="round" /></g>';
      a += '<circle cx="600" cy="80" r="3" fill="' + INK + '" />';
      // a mail bag on a hook
      a += '<path d="M780 60 v14" stroke="#3b3530" stroke-width="3" /><path d="M752 84 Q780 70 808 84 L816 170 Q780 184 744 170 Z" fill="#a8743d" stroke="' + INK + '" stroke-width="2" />';
      a += '<path d="M756 104 Q780 112 804 104" fill="none" stroke="' + INK + '" stroke-width="1.5" /><path d="M766 128 h28 v18 h-28 Z M766 128 l14 9 l14 -9" fill="#f6efe2" stroke="' + INK + '" stroke-width="1.3" />';
      // pigeonholes full of letters
      a += '<path d="M876 50 H1132 V290 H876 Z" fill="#6b4424" stroke="' + INK + '" stroke-width="2" />';
      for (var r = 0; r < 4; r++) for (var c = 0; c < 5; c++) {
        var x0 = 884 + c * 49.6, y0 = 58 + r * 58;
        a += '<path d="M' + x0.toFixed(1) + ' ' + y0 + ' h42 v50 h-42 Z" fill="#3e2716" />';
        var n = Math.floor(wobble(c, r) * 4);
        for (var k = 0; k < n; k++) {
          a += '<path d="M' + (x0 + 4 + k * 3).toFixed(1) + ' ' + (y0 + 50 - 22 - k * 5) + ' h32 v20 h-32 Z" fill="' + (k % 2 ? '#f6efe2' : '#efe0c4') + '" stroke="' + INK + '" stroke-width="1" />';
        }
        if (wobble(r, c) > 0.75) a += '<path d="M' + (x0 + 6).toFixed(1) + ' ' + (y0 + 20) + ' h30 v30 h-30 Z" fill="#c9a37a" stroke="' + INK + '" stroke-width="1.2" /><path d="M' + (x0 + 21).toFixed(1) + ' ' + (y0 + 20) + ' v30 M' + (x0 + 6).toFixed(1) + ' ' + (y0 + 35) + ' h30" stroke="#8f2a1c" stroke-width="1.5" />';
      }
      // a pigeon perched on top, bobbing
      a += '<g>' + (reduceMotion ? '' : '<animateTransform attributeName="transform" type="translate" values="0 0; 0 -3; 0 0" dur="1.4s" repeatCount="indefinite" />') +
           '<ellipse cx="1004" cy="38" rx="16" ry="11" fill="#9aa3b5" stroke="' + INK + '" stroke-width="1.5" />' +
           '<circle cx="1018" cy="26" r="7" fill="#9aa3b5" stroke="' + INK + '" stroke-width="1.5" /><path d="M1024 26 l6 2 l-6 2 Z" fill="#ff8c1a" />' +
           '<circle cx="1020" cy="24" r="1.3" fill="' + INK + '" /><path d="M990 34 q10 6 20 2" fill="none" stroke="#6f7890" stroke-width="2" />' +
           '<path d="M1000 49 v4 M1008 49 v4" stroke="#ff8c1a" stroke-width="2" /></g>';
    }
    return a;
  }

  function shopScene(kind) {
    var room = ROOMS[kind], id = 'room-' + kind + '-';
    var a = '<svg class="shop-art" viewBox="0 0 1200 400" preserveAspectRatio="xMidYMax slice" aria-hidden="true">';
    a += '<defs>' +
      '<linearGradient id="' + id + 'sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fb8de" /><stop offset="1" stop-color="#f7e1c4" /></linearGradient>' +
      '<linearGradient id="' + id + 'shaft" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6d8" stop-opacity=".55" /><stop offset="1" stop-color="#fff6d8" stop-opacity="0" /></linearGradient>' +
      '<radialGradient id="' + id + 'glow"><stop offset="0" stop-color="#ffe9a0" stop-opacity=".8" /><stop offset="1" stop-color="#ffe9a0" stop-opacity="0" /></radialGradient>' +
      '<radialGradient id="' + id + 'dim" cx=".5" cy=".55" r=".75"><stop offset=".55" stop-color="#2a1a0e" stop-opacity="0" /><stop offset="1" stop-color="#2a1a0e" stop-opacity=".38" /></radialGradient>' +
      '</defs>';
    // walls, wainscot, ceiling beam and posts
    a += '<rect width="1200" height="400" fill="' + room.wall + '" />';
    a += '<ellipse cx="300" cy="60" rx="140" ry="40" fill="#fff" opacity=".22" /><ellipse cx="980" cy="210" rx="160" ry="50" fill="#5b3a26" opacity=".05" />';
    a += '<rect y="236" width="1200" height="64" fill="#8a5a33" /><path d="' +
      [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return 'M' + (i * 150 + 12) + ' 246 h126 v44 h-126 Z'; }).join(' ') +
      '" fill="#9a6a3f" stroke="#5b3a26" stroke-width="1.5" />';
    a += '<rect width="1200" height="26" fill="#5b3a26" /><path d="' +
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function (i) { return 'M' + (i * 104 + 30) + ' 26 h22 v8 h-22 Z'; }).join(' ') + '" fill="#4a2e18" />';
    [40, 340, 860, 1150].forEach(function (x) {
      a += '<path d="M' + x + ' 26 h20 V300 h-20 Z" fill="#5b3a26" />';
      a += '<path d="M' + (x + 20) + ' 70 L' + (x + 60) + ' 26 M' + x + ' 70 L' + (x - 40) + ' 26" stroke="#5b3a26" stroke-width="10" />';
    });
    // an arched window onto the town, with daylight falling in
    a += '<path d="M120 236 V140 A80 80 0 0 1 280 140 V236 Z" fill="url(#' + id + 'sky)" />';
    a += '<path d="M120 236 V196 l20 -14 l18 10 v-22 l22 -16 l22 16 v18 l18 -12 l22 14 l20 -10 l18 12 V236 Z" fill="#b89f92" opacity=".8" />';
    a += '<path d="M120 236 V140 A80 80 0 0 1 280 140 V236 Z M200 60 V236 M120 160 H280" fill="none" stroke="#5b3a26" stroke-width="8" />';
    a += '<path d="M108 236 h184 v10 h-184 Z" fill="#9c8f80" stroke="' + INK + '" stroke-width="1.2" />';
    a += '<path d="M128 70 L286 120 L560 300 L300 300 Z" fill="url(#' + id + 'shaft)" />';
    // shelves between the window and the counter
    a += '<g stroke="' + INK + '" stroke-width="1.3">' +
      '<path d="M380 120 H500 V126 H380 Z M380 196 H500 V202 H380 Z" fill="#a8743d" />' +
      '<rect x="390" y="96" width="16" height="24" rx="3" fill="#d6eaf8" /><rect x="414" y="102" width="14" height="18" rx="3" fill="#f0cdbd" />' +
      '<rect x="440" y="109" width="30" height="11" rx="5.5" fill="#f3e2bd" /><rect x="444" y="98" width="30" height="11" rx="5.5" fill="#f3e2bd" />' +
      '<rect x="392" y="185" width="30" height="11" rx="5.5" fill="#f3e2bd" /><rect x="432" y="172" width="18" height="24" rx="3" fill="#d9efcf" />' +
      '<rect x="476" y="176" width="6" height="20" fill="#fff" /><path d="M479 176 q-4 -6 0 -12 q4 6 0 12 Z" fill="#ffc21a" /></g>';
    a += '<circle cx="479" cy="166" r="16" fill="url(#' + id + 'glow)" />';
    a += roomProps(kind, id);
    // hanging lanterns
    [440, 780].forEach(function (x) {
      a += '<circle cx="' + x + '" cy="80" r="34" fill="url(#' + id + 'glow)" />';
      a += '<path d="M' + x + ' 26 V62" stroke="#3b3530" stroke-width="2" /><path d="M' + (x - 9) + ' 62 h18 l-3 26 h-12 Z" fill="#ffe08a" stroke="#3b3530" stroke-width="2" />' +
           '<path d="M' + (x - 11) + ' 62 h22 l-11 -8 Z M' + (x - 8) + ' 88 h16 v4 h-16 Z" fill="#3b3530" />';
    });
    // the shopkeeper, then the counter, then hands and wares on top of it
    var place = '<g class="ink" transform="translate(330 6) scale(1.5)">';
    a += place + keeperArt(kind) + '</g>';
    a += '<rect y="300" width="1200" height="100" fill="#9a6a3f" />';
    a += '<path d="' + [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return 'M' + (i * 150 + 14) + ' 318 h122 v70 h-122 Z'; }).join(' ') +
      '" fill="#a8743d" stroke="#6b4424" stroke-width="2" />';
    a += '<rect y="290" width="1200" height="16" fill="#6b4424" /><path d="M0 292 H1200" stroke="#a8743d" stroke-width="2" />';
    a += '<rect y="306" width="1200" height="6" fill="#2a1a0e" opacity=".25" />';
    a += place + keeperHands(kind) + propArt(kind) +
      '<g class="for-sale"><rect class="k-roll" x="238" y="180" width="64" height="16" rx="8" />' +
      '<rect class="k-ribbon" x="266" y="179" width="8" height="18" /></g></g>';
    // a little brass bell on the counter
    a += '<path d="M818 290 a12 12 0 0 1 24 0 Z" fill="#c9a24a" stroke="' + INK + '" stroke-width="1.5" /><path d="M812 290 h36" stroke="' + INK + '" stroke-width="2.5" /><circle cx="830" cy="276" r="2.5" fill="' + INK + '" />';
    a += '<rect width="1200" height="400" fill="url(#' + id + 'dim)" />';
    return a + '</svg>';
  }

  // A shop's own scrolls (not copies of another shop's scroll, like the recruiter's contact scroll).
  function scrollsOf(page) {
    return Array.prototype.slice.call(page.querySelectorAll('.scroll:not(.courier)'));
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
        '<div class="shop-band">' + shopScene(info.keeper) +
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

      if (info.recruit) {
        var row = document.createElement('p');
        row.className = 'recruit-row';
        row.innerHTML = '<button type="button" class="recruit"></button>';
        shop.appendChild(row);
        row.querySelector('button').addEventListener('click', function () { recruit(page); });
      }
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

    var info = SHOPS[page.id];
    var row = page.querySelector('.recruit-row');
    if (info && info.recruit && row) {
      var other = document.getElementById(info.recruit);
      var have = scrollsOf(other).every(function (_, i) { return owned[scrollKey(other, i)]; });
      row.hidden = !!page.querySelector('.scroll.courier');
      row.querySelector('button').textContent = have
        ? 'Hiring? Read Otis\'s Contact scroll here'
        : 'Hiring? Get Otis\'s Contact scroll here \u00B7 ' + SCROLL_PRICE + ' gold';
    }
  }

  // Buy (if needed) another shop's scrolls and unroll copies of them here.
  function recruit(page) {
    var info = SHOPS[page.id];
    var other = document.getElementById(info.recruit);
    scrollsOf(other).forEach(function (scroll, i) {
      var key = scrollKey(other, i);
      if (!owned[key]) {
        owned[key] = true;
        gold = Math.max(0, gold - SCROLL_PRICE);
      }
      var copy = scroll.cloneNode(true);
      copy.classList.remove('sealed', 'unrolling', 'inking');
      copy.classList.add('courier');
      var h = copy.querySelector('h2');
      if (h) h.setAttribute('tabindex', '-1');
      page.appendChild(copy);
      if (!reduceMotion) copy.classList.add('unrolling');
      inkIn(copy, 0.7);
      if (i === 0) {
        (h || copy).focus({ preventScroll: true });
        copy.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      }
    });
    updatePurse();
    refreshShop(other);
    refreshShop(page);
    say(page, info.recruitLine);
  }

  function openShop(page) {
    var info = SHOPS[page.id];
    if (!info) return;
    var total = scrollsOf(page).length;
    var left = remaining(page);
    say(page, left === total ? info.pitch : left > 0 ? WELCOME_BACK_MORE : WELCOME_BACK);
    Array.prototype.forEach.call(page.querySelectorAll('.scroll'), function (scroll) {
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

  // For visitors who'd rather not play: every scroll in every shop, all at once.
  var magickBtn = document.getElementById('btnMagick');
  function magickAll() {
    pages.forEach(function (page) {
      if (!SHOPS[page.id]) return;
      scrollsOf(page).forEach(function (_, i) { owned[scrollKey(page, i)] = true; });
      refreshShop(page);
    });
    gold = 0;
    updatePurse();
    magickBtn.disabled = true;
    magickBtn.textContent = '✦ Every scroll is yours ✦';
    magickBtn.classList.add('cast');
    statusEl.textContent = 'Poof! Every scroll is yours. Step into any shop to read them.';
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
    if (arriving) return; // still zooming out of the robe
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
      // The street climbs from bottom-left to top-right: Right/Up go forward, Left/Down go back.
      case 'ArrowRight':
      case 'ArrowUp':
        e.preventDefault();
        nudge(1);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
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
  magickBtn.addEventListener('click', magickAll);

  window.addEventListener('hashchange', route);

  // Coming back via the browser's Back button from another page.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) route();
  });

  // ── Arriving from the cover: zoom out of the wizard's robe ─────
  // The cover dives into the robe until it fills the screen; we start there and pull back.
  var ROBE = { x: -4.4, y: -15, r: 3.4 }; // a spot with solid robe colour all around (same as cover.js)
  var ROBE_RGB = [75, 63, 168];
  var root = document.documentElement;
  var arriving = root.classList.contains('arriving');

  function arrive() {
    try { sessionStorage.removeItem('arriveZoom'); } catch (e) {}
    setIdle(false); // hold still so the robe stays put under the camera

    var ctm = face.getScreenCTM();
    var pt = svg.createSVGPoint();
    pt.x = ROBE.x;
    pt.y = ROBE.y;
    var a = pt.matrixTransform(ctm);
    var unit = Math.hypot(ctm.a, ctm.b);
    var w = world.getBoundingClientRect();
    world.style.transformOrigin = (a.x - w.left) + 'px ' + (a.y - w.top) + 'px';

    var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    var logMax = Math.log(Math.hypot(cx, cy) / (ROBE.r * unit) * 1.15);
    var LOG_FADE_HI = Math.log(6), LOG_FADE_LO = Math.log(1.5);

    function show(z) { // z: 1 = deep in the robe, 0 = the street at normal size
      var logS = logMax * z;
      world.style.transform = 'translate(' + ((cx - a.x) * z) + 'px, ' + ((cy - a.y) * z) + 'px) ' +
        'scale(' + Math.exp(logS) + ')';
      // Whatever peeks out around the map fades from robe colour to the page's white.
      var k = Math.max(0, Math.min(1, (logS - LOG_FADE_LO) / (LOG_FADE_HI - LOG_FADE_LO)));
      root.style.background = 'rgb(' + ROBE_RGB.map(function (c) {
        return Math.round(255 + (c - 255) * k);
      }).join(',') + ')';
    }

    show(1);
    root.classList.add('zoom-set');

    var DURATION = 1900;
    var start = null;
    function frame(now) {
      if (start === null) start = now;
      var p = Math.min(1, (now - start) / DURATION);
      show((1 - p) * (1 - p)); // ease out: fast at first, settling onto the street
      if (p < 1) { requestAnimationFrame(frame); return; }
      world.style.transform = '';
      world.style.transformOrigin = '';
      root.style.background = '';
      root.classList.remove('arriving', 'zoom-set'); // title, key and controls fade in
      arriving = false;
      setIdle(true);
    }
    requestAnimationFrame(frame);
  }

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
  if (arriving) {
    // Wait for fonts so the layout (and the wizard's spot on screen) won't shift mid-zoom.
    var started = false;
    var begin = function () { if (!started) { started = true; arrive(); } };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(begin);
    setTimeout(begin, 600);
  }
})();
