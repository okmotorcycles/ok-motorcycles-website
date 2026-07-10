// Scroll parallax for the home-page motorcycle wallpaper.
// The wallpaper (.roadway::before) scrolls 1:1 with the content; here we nudge
// it back down by a fraction of the scroll so it lags behind => parallax depth.
// Because the tile repeats every TILE px, we wrap the offset to one tile: the
// transform value stays < TILE (no exposed edge) while the motion reads as a
// continuous half-speed drift. The CSS keyframe drift is independent of this.
(function () {
  if (!document.body.classList.contains('is-home')) return;
  var road = document.querySelector('.roadway');
  if (!road) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var TILE = 70;      // must match background-size / keyframe distance in garden.scss
  var FACTOR = 0.5;   // background travels at (1 - FACTOR) of scroll speed
  var ticking = false;

  function update() {
    ticking = false;
    var y = (window.scrollY * FACTOR) % TILE;   // wrapped: seamless, no edge reveal
    road.style.setProperty('--moto-parallax', y.toFixed(2) + 'px');
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();
