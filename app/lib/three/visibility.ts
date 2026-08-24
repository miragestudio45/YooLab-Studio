/**
 * "Is this element worth drawing?"
 *
 * Every WebGL panel on this page pauses its render loop while it is off screen,
 * and every one of them used to answer that question from an IntersectionObserver
 * alone. That turns out to be the single most dangerous dependency in the whole
 * project.
 *
 * The Library mounts its first specimen while the section is thousands of pixels
 * below the fold, so the observer's opening record is "not intersecting". In a
 * real Chrome, scrolling down to that section was then observed *not* to deliver
 * a second record: the stage stayed paused, having ticked 219 animation frames
 * and drawn 2 of them. What the visitor sees is a laid-out, sized, fully loaded
 * panel rendering absolutely nothing — no error, no loading block, no clue. It
 * is the exact failure a screenshot harness exists to catch, and the exact
 * failure a numeric check never would.
 *
 * So the observer becomes a cheap hint and a measured rect becomes the truth.
 * The rect forces a layout, so it is only measured while the observer is saying
 * "no" — precisely when a wrong answer costs the whole panel — and at most five
 * times a second. While the observer says "yes" this is one boolean read.
 */

export type VisibilityGate = {
  /** True when the element is on screen (or within `margin` of it). */
  visible(): boolean;
  dispose(): void;
};

export function createVisibilityGate(element: Element, margin = 160): VisibilityGate {
  let observed = true;
  const observer = new IntersectionObserver(
    ([entry]) => { observed = entry?.isIntersecting ?? true; },
    { rootMargin: `${margin}px 0px` },
  );
  observer.observe(element);

  let lastProbe = -Infinity;
  let probed = true;

  return {
    visible: () => {
      if (observed) return true;
      const now = performance.now();
      if (now - lastProbe < 200) return probed;
      lastProbe = now;
      const rect = element.getBoundingClientRect();
      const viewport = window.innerHeight || document.documentElement.clientHeight;
      probed = rect.width > 0
        && rect.height > 0
        && rect.bottom > -margin
        && rect.top < viewport + margin;
      return probed;
    },
    dispose: () => observer.disconnect(),
  };
}

/**
 * Runs `callback` once, as soon as the element is near the viewport.
 *
 * Same reasoning as above, for the one-shot case: the thumbnail baker is
 * triggered this way, and a record that never arrives leaves a rail of rows
 * stuck on "đang dựng bản xem trước…" forever. Here the poll is a short interval
 * rather than a per-frame probe, because there is no render loop to hang it off.
 */
export function whenOnScreen(element: Element, callback: () => void, margin = 320) {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    observer.disconnect();
    clearInterval(timer);
    callback();
  };

  const observer = new IntersectionObserver(([entry]) => {
    if (entry?.isIntersecting) finish();
  }, { rootMargin: `${margin}px 0px` });
  observer.observe(element);

  const timer = setInterval(() => {
    const rect = element.getBoundingClientRect();
    const viewport = window.innerHeight || document.documentElement.clientHeight;
    if (rect.width > 0 && rect.height > 0 && rect.bottom > -margin && rect.top < viewport + margin) finish();
  }, 400);

  return () => {
    done = true;
    observer.disconnect();
    clearInterval(timer);
  };
}
