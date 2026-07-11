import { useEffect, useMemo, useState } from 'react';
import type { FeastTutorialMode, FeastTutorialStep } from './FeastTutorial';

interface FeastTourOverlayProps {
  steps: readonly FeastTutorialStep[];
  step: number;
  mode: FeastTutorialMode;
  setStep: (step: number) => void;
  setMode: (mode: FeastTutorialMode) => void;
  close: () => void;
}

export function FeastTourOverlay({ steps, step, mode, setStep, setMode, close }: FeastTourOverlayProps) {
  const safeStep = Math.max(0, Math.min(step, steps.length - 1));
  const item = steps[safeStep];
  const [rect, setRect] = useState<DOMRect | null>(null);
  const chapters = useMemo(() => [...new Set(steps.map((entry) => entry.chapter))], [steps]);

  useEffect(() => {
    if (item?.mode && item.mode !== mode) setMode(item.mode);
  }, [item?.mode, mode, setMode]);

  useEffect(() => {
    if (!item) return;
    let frame = 0;
    let settleFrames = 6;
    let observedTarget: Element | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    let scrolledParent: HTMLElement | null = null;
    let originalScrollTop = 0;
    let originalScrollLeft = 0;
    const revealInsideNearestPane = (target: Element) => {
      const initial = target.getBoundingClientRect();
      const alreadyVisible = initial.left >= 0 && initial.top >= 0
        && initial.right <= window.innerWidth && initial.bottom <= window.innerHeight;
      if (alreadyVisible) return;
      let parent = target.parentElement;
      while (parent && parent !== document.body && parent !== document.documentElement) {
        const style = window.getComputedStyle(parent);
        const scrollsY = /(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight;
        const scrollsX = /(auto|scroll)/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth;
        if (scrollsY || scrollsX) {
          const parentRect = parent.getBoundingClientRect();
          scrolledParent = parent;
          originalScrollTop = parent.scrollTop;
          originalScrollLeft = parent.scrollLeft;
          if (scrollsY) parent.scrollTop += initial.top + initial.height / 2 - (parentRect.top + parentRect.height / 2);
          if (scrollsX) parent.scrollLeft += initial.left + initial.width / 2 - (parentRect.left + parentRect.width / 2);
          return;
        }
        parent = parent.parentElement;
      }
    };
    const update = () => {
      const target = item.selector ? document.querySelector(item.selector) : null;
      if (target !== observedTarget) {
        resizeObserver?.disconnect();
        observedTarget = target;
        if (target) revealInsideNearestPane(target);
        if (target && 'ResizeObserver' in window) {
          resizeObserver ??= new ResizeObserver(update);
          resizeObserver.observe(target);
        }
      }
      const next = target?.getBoundingClientRect();
      setRect(next && next.width > 0 && next.height > 0 ? next : null);
    };

    const settle = () => {
      frame = 0;
      update();
      settleFrames--;
      if (settleFrames > 0) frame = window.requestAnimationFrame(settle);
    };
    const schedule = () => {
      settleFrames = Math.max(settleFrames, 2);
      if (!frame) frame = window.requestAnimationFrame(settle);
    };

    schedule();
    if ('MutationObserver' in window) {
      mutationObserver = new MutationObserver(schedule);
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    }
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    document.addEventListener('transitionend', update, true);
    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (scrolledParent) {
        scrolledParent.scrollTop = originalScrollTop;
        scrolledParent.scrollLeft = originalScrollLeft;
      }
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      document.removeEventListener('transitionend', update, true);
    };
  }, [item, mode]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowLeft' && safeStep > 0) setStep(safeStep - 1);
      if (event.key === 'ArrowRight' && safeStep < steps.length - 1) setStep(safeStep + 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [close, safeStep, setStep, steps.length]);

  if (!item) return null;
  const ring = rect ? {
    top: Math.max(6, rect.top - 7),
    left: Math.max(6, rect.left - 7),
    width: Math.max(0, Math.min(rect.width + 14, window.innerWidth - Math.max(6, rect.left - 7) - 6)),
    height: Math.max(0, Math.min(rect.height + 14, window.innerHeight - Math.max(6, rect.top - 7) - 6)),
  } : null;
  const last = safeStep === steps.length - 1;
  const chapterIndex = chapters.indexOf(item.chapter);

  return (
    <div className="ft-tour" role="dialog" aria-modal="true" aria-label="A Feast for Odin live tutorial" data-testid="feast-tutorial">
      {ring && <div className="ft-tour-ring" style={ring} aria-hidden="true" />}
      <section className={`ft-tour-card ig-glass${rect && rect.top < window.innerHeight / 2 ? ' low' : ''}`}>
        <div className="ft-tour-progress" aria-hidden="true"><i style={{ width: `${((safeStep + 1) / steps.length) * 100}%` }} /></div>
        <div className="ft-tour-meta">
          <span>{item.chapter}</span>
          <b>{safeStep + 1} / {steps.length}</b>
        </div>
        <h2>{item.title}</h2>
        <p>{item.body}</p>
        {item.tip && <div className="ft-tour-tip"><span>TABLE NOTE</span>{item.tip}</div>}
        <div className="ft-tour-chapters" aria-label="Tutorial chapters">
          {chapters.map((chapter, index) => {
            const target = steps.findIndex((entry) => entry.chapter === chapter);
            return (
              <button key={chapter} className={index === chapterIndex ? 'on' : ''} onClick={() => setStep(target)} aria-label={`Open ${chapter} chapter`}>
                <span>{index + 1}</span>{chapter}
              </button>
            );
          })}
        </div>
        <footer>
          <button className="ft-button" onClick={() => (safeStep === 0 ? close() : setStep(safeStep - 1))}>{safeStep === 0 ? 'CLOSE' : 'BACK'}</button>
          <button className="ft-button primary" onClick={() => (last ? close() : setStep(safeStep + 1))}>{last ? 'DONE' : 'NEXT'}</button>
          <button className="ft-button quiet" onClick={close}>SKIP TOUR</button>
        </footer>
      </section>
    </div>
  );
}
