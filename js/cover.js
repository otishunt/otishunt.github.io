(function () {
  var name = document.querySelector('.name');
  var key = document.querySelector('.letter.key');

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

  // Find the centre of the O's hole (in page coordinates) and its glyph width.
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

    return { x: left + width / 2, y: top + height / 2, width: width };
  }

  // The O zooms in slowly (flying through its hole), then goes to the home page.
  var zooming = false;
  key.addEventListener('click', function (e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (zooming) return;
    zooming = true;

    var href = key.getAttribute('href');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { window.location.href = href; return; }

    // Freeze the O where it is (hover lift included) so it doesn't drop mid-zoom.
    key.style.transition = 'none';
    key.style.transform = getComputedStyle(key).transform;

    var o = measureO();
    var nameRect = name.getBoundingClientRect();

    // Scale until the hole (about half the O's width) is wider than the screen diagonal.
    var diagonal = Math.hypot(window.innerWidth, window.innerHeight);
    var scale = (diagonal / (o.width * 0.5)) * 1.3;

    name.style.transformOrigin =
      (o.x - nameRect.left) + 'px ' + (o.y - nameRect.top) + 'px';
    name.getBoundingClientRect(); // apply the origin before the transition starts
    name.classList.add('zooming');
    name.style.transform = 'scale(' + scale + ')';

    var done = false;
    function go() {
      if (done) return;
      done = true;
      window.location.href = href;
    }
    // Ignore transitions from the letters themselves (e.g. the hover lift ending).
    name.addEventListener('transitionend', function (ev) {
      if (ev.target === name && ev.propertyName === 'transform') go();
    });
    setTimeout(go, 2400); // fallback if transitionend doesn't fire
  });

  // If the user comes back with the browser's Back button, undo the zoom.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    zooming = false;
    name.classList.remove('zooming');
    name.style.transform = '';
    key.style.transition = '';
    key.style.transform = '';
  });
})();
