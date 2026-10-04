const DURATION_MS = 280;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Scrolls `el` by `delta` px with a short ease-out, returning a cancel
 * function. Driven by requestAnimationFrame rather than `behavior: "smooth"`,
 * with a timer fallback that lands on the final position: macOS withholds
 * animation frames from an unfocused WKWebView, and the target must still be
 * reached when that happens. A long distance first jumps most of the way so
 * the animation only covers the last stretch instead of racing past rows.
 */
export function animateScrollBy(el: HTMLElement, delta: number): () => void {
  const maxTravel = el.clientHeight * 1.5;
  if (Math.abs(delta) > maxTravel) {
    const jump = delta - Math.sign(delta) * maxTravel;
    el.scrollTop += jump;
    delta -= jump;
  }

  const start = el.scrollTop;
  const target = start + delta;
  const t0 = performance.now();
  let raf = 0;
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    clearTimeout(fallback);
    el.scrollTop = target;
  };
  const fallback = window.setTimeout(finish, DURATION_MS + 120);

  const step = (now: number) => {
    if (done) return;
    const t = Math.min(1, (now - t0) / DURATION_MS);
    if (t >= 1) { finish(); return; }
    el.scrollTop = start + delta * easeOutCubic(t);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);

  // Stop fighting the user if they take over mid-glide.
  const cancel = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    clearTimeout(fallback);
  };
  el.addEventListener("wheel", cancel, { once: true, passive: true });
  el.addEventListener("pointerdown", cancel, { once: true });
  return cancel;
}
