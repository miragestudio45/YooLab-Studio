'use client';

import { useEffect } from 'react';

/**
 * Scroll-triggered kinetic typography for the page's display headings.
 *
 * Each `[data-kinetic]` heading is split into lines, each line is masked, and on
 * arrival the lines rise out of their masks with a short blur-to-clear and a
 * per-line stagger. Scrolling back up plays it backwards.
 *
 * ## Why this is additive rather than a replacement
 *
 * DESIGN.md §8 states the page's motion doctrine — one reveal, 520 ms, and the
 * product half stays calm — and `ScrollReveal` implements it in CSS for every
 * `[data-reveal]` block. That system stays exactly as it is. Two animation
 * systems fighting over the same property on the same node is how a page gets
 * muddy, so the division is by *element*: the CSS reveal owns the block (kicker,
 * heading and lede rise and fade together, once, and never reverse), and this
 * owns the **lines inside the heading only**.
 *
 * They are in phase on purpose — same trigger point, same direction — so the
 * compound reads as one gesture: the block arrives, and the words assemble as it
 * lands. What it must not become is two fades at different speeds, which is why
 * the line opacity here resolves in the first third of the line's own tween and
 * the motion is carried by `y` and `blur` after that.
 *
 * ## Why it does not fight the snap
 *
 * `lib/story/snap.ts` is documented as the only thing on the page that writes
 * scroll position, and that is still true. ScrollTrigger only *reads* scroll
 * unless it is given `scrub` with its own `snap`, or `normalizeScroll`, or a
 * `scrollerProxy` — none of which is used here. Every trigger below is a plain
 * `toggleActions` play/reverse, so the magnetic settle and this layer never both
 * try to own the same frame.
 *
 * ## Where it deliberately does nothing
 *
 * - **`prefers-reduced-motion`.** No split, no trigger, no import. The heading
 *   is ordinary text and the CSS reveal is off too.
 * - **`data-gpu="lean"`.** The pre-paint bootstrap in `layout.tsx` stamps this
 *   on a handheld or a four-core machine, and it is the flag the stylesheet
 *   already uses to drop the backdrop blurs. An animated `filter: blur()` on
 *   text is the same class of cost as those and worse — it forces a fresh
 *   rasterisation of the layer every frame — so a machine that cannot afford a
 *   blurred header does not get blurred type either.
 * - **Below 720 px.** A phone heading is two or three lines at 31 px; the
 *   stagger has nothing to stagger and the split costs DOM for no effect.
 *
 * In all three cases the page is not left broken or hidden: nothing here sets an
 * initial hidden state in CSS. The armed state is written by `onSplit`, from
 * JavaScript, after the split has succeeded — so a failure to load GSAP leaves
 * every heading visible rather than invisible, which is the same rule
 * `reveal-ready` follows.
 *
 * ## Lines, not words
 *
 * The brief asked for a stagger by line *or* word. It is lines, and that is a
 * budget decision rather than a preference: `mask` wraps every split unit in its
 * own `overflow: hidden` element, and blurring each one promotes it to its own
 * raster layer. A four-line heading is four layers; the same heading by words is
 * twenty-six. This page runs a full-viewport WebGL hero, an editor canvas and a
 * Library stage, and the one thing the motion budget cannot absorb is thirty
 * blurred text layers compositing over a canvas that is already the frame's
 * critical path.
 */

/**
 * The headings that get it, in document order.
 *
 * Deliberately a list and not "every `h2`". The effect is worth having on the
 * display headings that introduce a chapter, and it is noise on a dialog title,
 * a card title or the eleven `h3`s inside the Library's knowledge panel. Review
 * asked for it explicitly and also asked not to overuse it; a selector list is
 * where that restraint is enforceable.
 */
const TARGETS = '[data-kinetic]';

export function KineticType() {
  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (root.getAttribute('data-gpu') === 'lean') return;
    if (window.innerWidth < 720) return;
    if (!document.querySelector(TARGETS)) return;

    let disposed = false;
    /* Everything this effect creates, collected so the cleanup has one list to
       walk. ScrollTrigger instances outlive their tweens and SplitText holds the
       DOM it created, so both have to be reverted by hand. */
    const teardown: Array<() => void> = [];

    void (async () => {
      /*
       * Imported here, not at module scope.
       *
       * gsap + ScrollTrigger + SplitText is about 70 kB gzipped, and none of it
       * is needed by a visitor on a phone, a visitor who asked for less motion,
       * or the first paint of anybody else. An `await import` inside the effect
       * puts all three in a chunk that is fetched after hydration, so the
       * heading is readable before the library that animates it exists.
       */
      const [{ gsap }, { ScrollTrigger }, { SplitText }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
        import('gsap/SplitText'),
      ]);
      if (disposed) return;
      gsap.registerPlugin(ScrollTrigger, SplitText);

      /*
       * Split after the fonts are in.
       *
       * `SplitText` measures where the lines actually break, so splitting while
       * the fallback face is still on screen records the fallback's line breaks
       * and then holds them — the display face loads, the text reflows, and the
       * masks are in the wrong places with a word hanging outside one. This is
       * the single most common way this effect ships broken.
       */
      if (document.fonts?.status !== 'loaded') {
        await document.fonts?.ready.catch(() => {});
        if (disposed) return;
      }

      for (const element of document.querySelectorAll<HTMLElement>(TARGETS)) {
        /*
         * Work out the accessible name here, and re-stamp it after every split.
         *
         * `SplitText` runs its own `aria: 'auto'` pass: it marks every line and
         * mask it creates `aria-hidden` — which is right, a screen reader must
         * not read a heading one clipped fragment at a time — and then writes an
         * `aria-label` on the heading itself so the name survives. Five of these
         * eight headings are the target of an `aria-labelledby` on their own
         * `<section>`, so without that the page would lose five landmark names.
         *
         * The problem is *which* name GSAP writes: it reads `textContent`, and
         * every heading here sets its own line break. `textContent` concatenates
         * straight across a break, so GSAP's pass shipped "Những bài họcbạn có
         * thể mở ngay", "Một nền tảng,ba vai trò" and "…một bài học YooLab.Và
         * chính bạn…". Measuring this cost two wrong diagnoses in a row: setting
         * the label *before* `new SplitText()` looks like it works and is then
         * silently overwritten, so the walk below has to be re-applied from
         * inside `onSplit` — which is also what makes it survive an `autoSplit`
         * re-split, since GSAP redoes its aria pass each time.
         *
         * Two kinds of break have to become a space and neither is `textContent`
         * material. Four headings use `<br />`; the bridge heading uses a
         * `<span>` and an `<em>` that the stylesheet makes blocks. So: replace
         * the breaks with spaces, join the top-level children with one more, and
         * collapse. `innerText` would give the same answer through layout, but
         * it falls back to `textContent` whenever the element is not being
         * rendered — and these eight are spread down a very long page, mostly
         * off screen when this runs, so a layout-derived name would be right on
         * some loads and wrong on others.
         *
         * The join is safe for this set because every child boundary here is
         * also a word boundary. A heading that wrapped a suffix — `<em>x</em>s`
         * — would gain a space it should not have; the fix then is an authored
         * `aria-label`, which the check below leaves alone.
         */
        const authored = element.getAttribute('aria-label');
        const copy = element.cloneNode(true) as HTMLElement;
        for (const br of copy.querySelectorAll('br')) br.replaceWith(' ');
        const name =
          authored ??
          Array.from(copy.childNodes)
            .map((node) => node.textContent ?? '')
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

        /*
         * `autoSplit` re-splits on a resize that changes the line breaks and
         * calls `onSplit` again, which is why the timeline is *built inside*
         * `onSplit` and returned from it: returning an animation hands GSAP
         * ownership, so the old one is reverted rather than left running against
         * DOM that no longer exists. Building the timeline outside and reusing
         * it is the other common way this effect ships broken — the tween keeps
         * animating the previous split's orphaned line divs.
         *
         * `mask: 'lines'` is what makes the slide read as a Canva-style wipe
         * rather than as text moving: each line gets an `overflow: hidden`
         * parent of its own exact height, so the glyphs are clipped by their own
         * line box on the way up instead of sliding over the line above.
         */
        const split = new SplitText(element, {
          type: 'lines',
          mask: 'lines',
          linesClass: 'kinetic-line',
          autoSplit: true,
          /* The display faces here carry descenders and diacritics — Vietnamese
             stacks a tone mark over a circumflex — and a mask cut to the line
             box alone clips them. `SplitText` reads this as extra room on the
             mask, not as leading, so it costs nothing in layout. */
          reduceWhiteSpace: false,
          onSplit(self: { lines: Element[] }) {
            /* After GSAP's aria pass, every time it runs. See above. */
            if (name) element.setAttribute('aria-label', name);
            return gsap.fromTo(
              self.lines,
              {
                /*
                 * 104, not 118. The mask is now a quarter of an em taller than
                 * the line box (see `.kinetic-line-mask`), so 118% overshot into
                 * territory the mask no longer hides *and* gave the line further
                 * to travel than the wipe needs. Just past 100 is the whole
                 * distance: the line starts exactly below its own clip edge.
                 */
                yPercent: 104,
                opacity: 0,
                /*
                 * 5 px, not 9. Nine on a 49 px display face is a smear rather
                 * than a focus pull — which is most of what review meant by
                 * "chưa đẹp" once the clipping was accounted for — and blur is
                 * the one property here that costs a fresh rasterisation of the
                 * layer on every frame it changes.
                 */
                filter: 'blur(5px)',
              },
              {
                yPercent: 0,
                opacity: 1,
                filter: 'blur(0px)',
                duration: 0.8,
                /*
                 * Ease-out, per the craft floor: it moves on the first frame and
                 * spends its budget decelerating, which is what makes a slide
                 * read as arriving rather than as travelling.
                 *
                 * `power3`, not the `power4` this shipped with. On a travel this
                 * short the steeper curve puts almost the whole distance in the
                 * first sixth, so the line is effectively already there before
                 * the eye registers it moving — the motion reads as a pop.
                 * `power3` keeps the ease-out character with enough of the
                 * distance spread across the middle to be seen.
                 */
                ease: 'power3.out',
                /* Just under a tenth of a second. At 0.075 a three-line heading
                   resolved within 0.15 s of itself, which is not a stagger
                   anybody perceives; at 0.09 the lines read as following one
                   another. */
                stagger: 0.09,
                scrollTrigger: {
                  trigger: element,
                  /*
                   * 84%, not 'top bottom'. The heading should be animating while
                   * it is comfortably inside the viewport, not the instant its
                   * first pixel crosses the fold — and it must be *finished*
                   * before the chapter snap settles the section, which lands in
                   * 300-620 ms (DESIGN.md §8). Triggering a 0.92 s tween at the
                   * fold would have it still running after the page had stopped.
                   */
                  start: 'top 84%',
                  /*
                   * The four actions are [onEnter, onLeave, onEnterBack,
                   * onLeaveBack]:
                   *
                   *   enter from above  → play     the arrival
                   *   leave downwards   → nothing  a heading read stays read
                   *   re-enter from below → play   see below
                   *   leave upwards     → reverse  the gesture the brief asked for
                   *
                   * The third is `play` rather than the `none` that the usual
                   * `play none none reverse` puts there, and it is a guard rather
                   * than an observed fix. With `none` in that slot, any scroll
                   * that lands the viewport *inside* the trigger's range while
                   * the timeline happens to be at zero leaves a heading that is
                   * on screen and invisible. On this page the chapter snap can
                   * produce exactly that: it writes scroll positions of its own
                   * after the visitor has stopped, and a settle that arrives from
                   * below is not a gesture this trigger saw. `play` there costs
                   * nothing when the timeline is already complete and makes the
                   * on-screen-and-hidden state unreachable.
                   *
                   * Worth recording what this is *not*, because it cost a
                   * measurement: driving the cycle in a real browser showed
                   * opacity 0 after scrolling up to this section from the
                   * footer, which looked exactly like that bug. It was not — the
                   * snap had settled to the previous section's anchor and the
                   * heading was 122% down the viewport, off screen, where zero is
                   * the correct state. Reading opacity without reading position
                   * is how a scroll-triggered animation gets "fixed" in the wrong
                   * place.
                   *
                   * `play` rather than `restart` throughout: `restart` jumps to
                   * zero before running and is what makes a scroll-triggered
                   * page feel twitchy on a trackpad.
                   */
                  toggleActions: 'play none play reverse',
                },
              },
            );
          },
        } as never) as { revert: () => void };

        teardown.push(() => split.revert());
      }

      /*
       * One refresh, after the reveal system has had a frame.
       *
       * `ScrollReveal` translates blocks by 20 px as they arrive, and
       * ScrollTrigger caches every trigger's document position when it is
       * created. Created mid-reveal, a trigger's start is 20 px off — enough to
       * make the last heading on a short page never fire. Refreshing once the
       * transforms have settled recomputes them all against the resting layout.
       */
      const settle = window.setTimeout(() => ScrollTrigger.refresh(), 600);
      teardown.push(() => window.clearTimeout(settle));
      teardown.push(() => {
        for (const trigger of ScrollTrigger.getAll()) trigger.kill();
      });
    })();

    return () => {
      disposed = true;
      /* Reverse order: the triggers are killed before the splits they point at
         are reverted, so nothing is animating DOM that has just been unwrapped. */
      for (const undo of teardown.reverse()) undo();
    };
  }, []);

  return null;
}
