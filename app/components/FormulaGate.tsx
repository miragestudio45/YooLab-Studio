'use client';

import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Single owner of the Formula overlay.
 *
 * The workshop is referenced from three places now — the library card, the
 * hands-on STEM section and the sample-lesson proof layer — and all three must
 * open the *same* overlay. Mounting one instance here keeps a single WebGL
 * context, a single body-scroll lock and a single focus trap no matter which
 * entry point the visitor uses.
 */

/**
 * Split, because this gate wraps the entire page.
 *
 * `FormulaExperience` pulls `three` and the whole car runtime, and the gate is
 * the outermost client component on `/` — so importing it statically put the
 * workshop's bundle in the first request wave of a page where the overlay is
 * shut and nothing has been clicked. It was the clearest case of the measured
 * problem that every one of the route's chunks arrived before 1.5 s.
 *
 * Conditional *rendering* was never the issue: `{open && …}` already kept the
 * overlay unmounted. Only the import had to move.
 */
const FormulaExperience = lazy(() =>
  import('./FormulaExperience').then((module) => ({ default: module.FormulaExperience })));

/**
 * The overlay's own loading state, reused as the Suspense fallback.
 *
 * `FormulaExperience` shows exactly this markup while its GLBs decode, so a
 * visitor who clicks before the chunk lands sees the workshop opening rather
 * than a blank frame followed by a different loader.
 */
function FormulaFallback() {
  return (
    <div className="formula-overlay" role="dialog" aria-modal="true" aria-label="Trải nghiệm xe Formula">
      <div className="formula-loader"><i />Đang mở xưởng mô hình…</div>
    </div>
  );
}

type FormulaGateApi = { openFormula: () => void; isOpen: boolean };

const FormulaContext = createContext<FormulaGateApi | null>(null);

export function useFormulaGate(): FormulaGateApi {
  const context = useContext(FormulaContext);
  // A section rendered outside the gate should degrade to an inert button
  // rather than crash the page.
  return context ?? { openFormula: () => {}, isOpen: false };
}

export function FormulaGate({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openFormula = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ openFormula, isOpen: open }), [openFormula, open]);

  /*
   * Warmed on idle, the same bargain `ExploreCanvas` strikes with the ocean.
   *
   * Taking the workshop out of the first wave is the point; making the click
   * wait for a network round-trip is not. `requestIdleCallback` fetches the
   * chunk once the page has settled, so the overlay is normally already parsed
   * by the time anyone reaches the three buttons that open it — and on a slow
   * connection the idle callback simply never gets a quiet moment, which is the
   * correct outcome rather than a missed one.
   */
  useEffect(() => {
    if (open) return;
    const warm = () => { void import('./FormulaExperience'); };
    if (!('requestIdleCallback' in window)) {
      const timer = setTimeout(warm, 2000);
      return () => clearTimeout(timer);
    }
    const handle = window.requestIdleCallback(warm, { timeout: 4000 });
    return () => window.cancelIdleCallback(handle);
  }, [open]);

  return (
    <FormulaContext.Provider value={value}>
      {children}
      {open && (
        <Suspense fallback={<FormulaFallback />}>
          <FormulaExperience onClose={close} />
        </Suspense>
      )}
    </FormulaContext.Provider>
  );
}
