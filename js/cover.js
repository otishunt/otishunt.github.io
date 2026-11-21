(function () {
  var name = document.querySelector('.name');
  var key = document.querySelector('.letter.key');
  var wiz = key.querySelector('.o-wizard');

  // The wizard's drawing spans x -14..16 and y -64..2, feet at (0, 0).
  var VB_X = -14, VB_Y = -64, VB_W = 30;
  // A spot on the robe with at least 3.4 units of solid robe colour all around it.
  var ROBE = { x: -4.4, y: -15, r: 3.4 };
  var ROBE_COLOR = '#4b3fa8';

  // Any letter that isn't the O shows an arrow pointing left (toward the O).
  name.addEventListener('click', function (e) {
    var letter = e.target.closest('.letter');
    if (!letter || letter === key) return;

    var old = letter.querySelector('.hint');
    if (old) old.remove();

    var hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = '←'; // ←
    hint.addEventListener('animationend', function () { hint.remove(); });
    letter.appendChild(hint);
  });

  // Find the O's glyph box (in page coordinates).
  function measureO() {
    var keyRect = key.getBoundingClientRect();
    var style = getComputedStyle(key);

    // A zero-size inline-block sits on the baseline, so its top = baseline.
    var probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;';
    key.appendChild(probe);
    var baseline = probe.getBoundingClientRect().top;
    key.removeChild(probe);

    var ctx = document.createElement('canvas').getContext('2d');
    ctx.font = style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
    var m = ctx.measureText('O');

    var left = keyRect.left - m.actualBoundingBoxLeft;
    var width = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    var top = baseline - m.actualBoundingBoxAscent;
    var height = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;

    return { x: left + width / 2, bottom: top + height, fontSize: parseFloat(style.fontSize) };
  }

  // Stand the wizard on the inside of the O's bottom curve.
  function placeWizard() {
    var o = measureO();
    var keyRect = key.getBoundingClientRect();
    var unit = wiz.getBoundingClientRect().width / VB_W;
    var feetX = o.x;                         // body centred, staff to his right
    var feetY = o.bottom - o.fontSize * 0.03; // just above the O's thin bottom stroke
    wiz.style.left = (feetX - keyRect.left + VB_X * unit) + 'px';
    wiz.style.top = (feetY - keyRect.top + VB_Y * unit) + 'px';
    wiz.classList.add('placed');
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeWizard);
  else placeWizard();
  window.addEventListener('resize', function () {
    if (!zooming) placeWizard();
  });

  // Clicking the O dives into the wizard's robe; home.html then zooms back out of it.
  var zooming = false;
  key.addEventListener('click', function (e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (zooming) return;
    zooming = true;

    var href = key.getAttribute('href');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { window.location.href = href; return; }

    // Tell home.html to start inside the robe, with the wizard back at the start.
    try {
      sessionStorage.setItem('arriveZoom', '1');
      sessionStorage.setItem('mapNode', '0');
    } catch (err) {}

    // Freeze the O where it is (hover lift included) so it doesn't drop mid-zoom.
    key.style.transition = 'none';
    key.style.transform = getComputedStyle(key).transform;
    name.classList.add('zooming'); // also stops the wizard bobbing

    var r = wiz.getBoundingClientRect();
    var unit = r.width / VB_W;
    var ax = r.left + (ROBE.x - VB_X) * unit;
    var ay = r.top + (ROBE.y - VB_Y) * unit;
    var nameRect = name.getBoundingClientRect();
    name.style.transformOrigin = (ax - nameRect.left) + 'px ' + (ay - nameRect.top) + 'px';

    // Zoom until the robe covers the whole screen, drifting the robe to the centre.
    var cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    var halfDiagonal = Math.hypot(cx, cy);
    var logMax = Math.log(halfDiagonal / (ROBE.r * unit) * 1.15);
    var DURATION = 1400;
    var start = null;

    function frame(now) {
      if (start === null) start = now;
      var p = Math.min(1, (now - start) / DURATION);
      var e = p * p; // speed up as we fall in
      name.style.transform = 'translate(' + ((cx - ax) * e) + 'px, ' + ((cy - ay) * e) + 'px) ' +
        'scale(' + Math.exp(logMax * e) + ')';
      if (p < 1) requestAnimationFrame(frame);
      else go();
    }
    requestAnimationFrame(frame);

    var done = false;
    function go() {
      if (done) return;
      done = true;
      document.documentElement.style.background = ROBE_COLOR;
      window.location.href = href;
    }
  });

  // If the user comes back with the browser's Back button, undo the zoom.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    zooming = false;
    name.classList.remove('zooming');
    name.style.transform = '';
    document.documentElement.style.background = '';
    key.style.transition = '';
    key.style.transform = '';
    try { sessionStorage.removeItem('arriveZoom'); } catch (err) {}
    placeWizard();
  });
})();
