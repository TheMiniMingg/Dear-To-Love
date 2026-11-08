import { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { create } from 'zustand';
import { shortcutKeys } from '../../app/shortcuts';
import { msg, t } from '../../i18n';

const DONE_KEY = 'dtl.tourDone';

/** The four first-time tips, each pointing at a part of the reader. */
const STEPS: { target: string; text: string }[] = [
  {
    target: '#composer-input',
    text: msg(
      'Write what you do or say here and press Enter. The storyteller plays everyone else and never decides for you.',
    ),
  },
  {
    target: '.mode-pills',
    text: msg(
      'Pick the kind of action: do, say, send a text, call someone, think to yourself, or roll the dice.',
    ),
  },
  {
    target: '.tool-bar',
    text: msg(
      'Quick save, Save / Load, End chapter, Routes and Search are here. Point at a reply for more: another reply, a branch, a bookmark or reading it aloud.',
    ),
  },
  {
    target: '.reader-rail',
    text: msg(
      'Go back to your stories, change the look or see every key here. Menu (Esc) has Story memory and Story details, and {keys} finds anything.',
    ),
  },
];

function seen(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return true;
  }
}

/** Whether the first-time tips show, and which one. */
export const useTour = create<{
  step: number | null;
  start: () => void;
  next: () => void;
  /** The player sent an action: the first tip (how to write one) is done. */
  acted: () => void;
  finish: () => void;
}>((set, get) => ({
  step: seen() ? null : 0,
  start: () => set({ step: 0 }),
  next: () => {
    const step = get().step;
    if (step === null) return;
    if (step + 1 >= STEPS.length) get().finish();
    else set({ step: step + 1 });
  },
  acted: () => {
    if (get().step === 0) get().next();
  },
  finish: () => {
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {
      // Shown again next time; nothing else depends on it.
    }
    set({ step: null });
  },
}));

/**
 * Four short tips the first time a story opens, one at a time above the
 * action box, each lighting up the part it is about. Skip ends them for
 * good; the command palette can show them again.
 */
export function Tour({ hidden }: { hidden: boolean }) {
  const step = useTour((s) => s.step);
  const { next, finish } = useTour.getState();
  const [, redraw] = useState(0);
  const tip = step === null ? null : STEPS[step];

  // Light up the part of the reader the tip is about.
  useEffect(() => {
    if (!tip || hidden) return;
    const el = document.querySelector<HTMLElement>(tip.target);
    if (!el) {
      // Not drawn yet (the first paint of the story): look again soon.
      const later = setTimeout(() => redraw((n) => n + 1), 200);
      return () => clearTimeout(later);
    }
    el.classList.add('tour-target');
    return () => el.classList.remove('tour-target');
  });

  if (!tip || hidden || step === null) return null;
  const last = step + 1 >= STEPS.length;
  return (
    <section className="tour" aria-label={t('Tips for your first story')} aria-live="polite">
      <Lightbulb className="tour-icon" aria-hidden={true} size={18} />
      <p className="tour-text">
        <span className="tour-count">
          {t('Tip {n} of {total}', { n: step + 1, total: STEPS.length })}
        </span>{' '}
        {t(tip.text, { keys: shortcutKeys('palette') })}
      </p>
      <div className="tour-buttons">
        {!last && (
          <button type="button" className="link-button" onClick={finish}>
            {t('Skip tips')}
          </button>
        )}
        <button type="button" className="primary" onClick={last ? finish : next}>
          {last ? t('Got it') : t('Next tip')}
        </button>
      </div>
    </section>
  );
}
