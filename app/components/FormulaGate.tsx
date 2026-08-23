'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { FormulaExperience } from './FormulaExperience';

/**
 * Single owner of the Formula overlay.
 *
 * The workshop is referenced from three places now — the library card, the
 * hands-on STEM section and the sample-lesson proof layer — and all three must
 * open the *same* overlay. Mounting one instance here keeps a single WebGL
 * context, a single body-scroll lock and a single focus trap no matter which
 * entry point the visitor uses.
 */

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

  return (
    <FormulaContext.Provider value={value}>
      {children}
      {open && <FormulaExperience onClose={close} />}
    </FormulaContext.Provider>
  );
}
