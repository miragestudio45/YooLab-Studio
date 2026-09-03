'use client';

import { useEffect } from 'react';
import * as THREE from 'three';
import { managedContextReport } from '../lib/three/contextRegistry';

/*
 * Keep fetched asset bytes in memory for the page's lifetime.
 *
 * Now that a stage can be released and re-acquired, its model is fetched again
 * on the way back — and three's `FileLoader` cache is off by default, so every
 * remount was a fresh request even though the bytes had not changed. Enabling
 * it once, at module scope, means a re-acquire pays only for the DRACO decode
 * and the shader compile.
 *
 * Set here rather than in each loader because it is one global switch and this
 * module is the page's existing run-once client bootstrap.
 */
THREE.Cache.enabled = true;

/**
 * The page-wide reveal.
 *
 * One observer for every `[data-reveal]` element on the page, mounted once.
 * Four details matter and none of them are cosmetic:
 *
 *   - the hidden state is armed by `html.reveal-ready`, which the bootstrap
 *     script in the layout head sets before the first paint. Without that class
 *     the CSS keeps everything visible, so a page that never reaches this
 *     component is a page with no animation — never a blank one.
 *   - the revealed flag is the `data-revealed` attribute, not a class. React
 *     owns `className` on these elements and rewrites it whenever the prop
 *     changes; a class added from outside React can be wiped by a re-render,
 *     which would fade a section back out for no reason the visitor can see.
 *   - new nodes are picked up by a MutationObserver. The library grid replaces
 *     its cards whenever a filter or the search changes, and those cards are
 *     fresh elements the IntersectionObserver has never been told about. Without
 *     this they would sit at `opacity: 0` permanently — an empty grid.
 *   - elements are unobserved the moment they reveal, so sections do not
 *     re-fade on the way back up.
 */
export function ScrollReveal() {
  useEffect(() => {
    const root = document.documentElement;
    // `reveal-ready` is added by the bootstrap script in the layout head, before
    // the first paint. If it is not there, the reveal is deliberately off
    // (reduced motion, or the safety timeout fired) and this component does
    // nothing at all.
    if (!root.classList.contains('reveal-ready')) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.revealed = '';
          observer.unobserve(entry.target);
        }
      },
      // Fires a little before the element reaches the fold, so the move has
      // finished by the time it is properly in view.
      { rootMargin: '0px 0px -12% 0px', threshold: 0.04 },
    );

    // Typed as the two concrete hosts rather than `ParentNode`: the Workers
    // type package in this project widens `ParentNode.append`, and an HTMLElement
    // no longer satisfies it.
    const observeAll = (scope: Document | HTMLElement) => {
      for (const target of scope.querySelectorAll<HTMLElement>('[data-reveal]:not([data-revealed])')) {
        observer.observe(target);
      }
    };
    observeAll(document);

    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches('[data-reveal]:not([data-revealed])')) observer.observe(node);
          observeAll(node);
        }
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
      root.classList.remove('reveal-ready');
    };
  }, []);

  /*
   * Dev-only census hook.
   *
   * Hung off this component because it is the page's existing run-once client
   * bootstrap, and because the question "how many GPU contexts is this page
   * holding right now, and which ones" has no other answer available from
   * outside: `document.querySelectorAll('canvas')` counts elements, and a
   * released surface has no element to count.
   */
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const target = window as unknown as { __contexts?: unknown };
    target.__contexts = managedContextReport;
    return () => { delete target.__contexts; };
  }, []);

  return null;
}
