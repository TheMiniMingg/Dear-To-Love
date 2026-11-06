import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import { useUiStore } from '../../app/store';
import { Dialog } from '../../components/Dialog';
import type {
  CreateStoryDraft,
  DraftProblem,
  DraftStep,
  TemplateCatalog,
  WizardDraft,
  WizardMode,
} from '../../types';
import {
  blankDraft,
  CharacterStep,
  fittingScenarios,
  NarrationStep,
  ReviewStep,
  STEP_NAMES,
  StoryStep,
  WorldStep,
} from './WizardSteps';

const STEPS: DraftStep[] = ['world', 'character', 'story', 'narration', 'review'];
const SAVE_DELAY_MS = 400;

const STEP_TITLES: Record<DraftStep, string> = {
  world: 'Where does it take place?',
  character: 'Who do you play?',
  story: 'How does it begin?',
  narration: 'How is it told?',
  review: 'Ready to begin?',
};

function savedLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

async function freshDraft(catalog: TemplateCatalog): Promise<CreateStoryDraft> {
  const worldId = catalog.worlds[0]?.id ?? '';
  return commands.composeStoryDraft({
    worldId,
    scenarioId: fittingScenarios(catalog, worldId)[0]?.id ?? '',
    characterId: catalog.characters[0]?.id ?? '',
  });
}

/**
 * Create a story step by step. Guided mode needs no typing (arrows,
 * menus and checkboxes) and starts from presets; Custom mode has no
 * presets and lets you type every field. Both edit the same draft, which
 * is saved as you go and restored on reopen. Switching to Custom before
 * changing anything empties the fields; anything picked in Guided first
 * carries over.
 */
export function CreateWizardScreen() {
  const navigate = useUiStore((s) => s.navigate);
  const id = useId();
  const [catalog, setCatalog] = useState<TemplateCatalog | null>(null);
  const [draft, setDraft] = useState<CreateStoryDraft | null>(null);
  const [mode, setMode] = useState<WizardMode>('guided');
  const [step, setStep] = useState<DraftStep>('world');
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [problems, setProblems] = useState<DraftProblem[] | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // The preset-filled draft a fresh wizard starts from, while nothing in
  // it has been changed yet. Switching modes then swaps between it and an
  // empty draft instead of carrying presets into Custom.
  const [untouched, setUntouched] = useState<CreateStoryDraft | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [dirty, setDirty] = useState(false);
  const pending = useRef<WizardDraft | null>(null);
  const focusHeading = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([commands.getTemplateCatalog(), commands.getWizardDraft()])
      .then(async ([cat, saved]) => {
        if (cancelled) return;
        setCatalog(cat);
        if (saved) {
          setDraft(saved.draft);
          setMode(saved.mode);
          setStep(saved.step);
          setRestoredAt(saved.savedAt);
        } else {
          const d = await freshDraft(cat);
          if (cancelled) return;
          setUntouched(d);
          setDraft(d);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const w = pending.current;
    pending.current = null;
    if (!w) return;
    commands
      .saveWizardDraft(w)
      .then(() => {
        if (!pending.current) setSaveState('saved');
      })
      .catch(() => setSaveState('failed'));
  }, []);

  // Save shortly after each change; leaving the screen saves at once.
  useEffect(() => {
    if (!draft || !dirty) return;
    pending.current = { mode, step, draft, savedAt: '' };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [draft, mode, step, dirty, flush]);
  useEffect(() => flush, [flush]);

  // Moving between steps puts focus on the new step's heading.
  useEffect(() => {
    if (!focusHeading.current) return;
    focusHeading.current = false;
    heading.current?.focus();
  }, [step]);

  // Review lists what still needs fixing, checked by the same rules as create.
  useEffect(() => {
    if (!draft || step !== 'review') return;
    let cancelled = false;
    commands
      .checkStoryDraft(draft)
      .then((p) => {
        if (!cancelled) setProblems(p);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [draft, step]);

  const touch = () => {
    setDirty(true);
    setSaveState('saving');
  };

  const update = (patch: Partial<CreateStoryDraft>) => {
    touch();
    setUntouched(null);
    setDraft((d) => (d ? { ...d, ...patch } : d));
  };

  const goTo = (s: DraftStep) => {
    touch();
    focusHeading.current = true;
    setStep(s);
    setError(null);
  };

  const changeMode = (m: WizardMode) => {
    touch();
    setMode(m);
    if (untouched) setDraft(m === 'custom' ? blankDraft(untouched) : untouched);
  };

  const clearAll = () => {
    setConfirmClear(false);
    touch();
    setUntouched(null);
    setDraft((d) => (d ? blankDraft(d) : d));
    setProblems(null);
  };

  const startOver = async () => {
    if (!catalog) return;
    setConfirmReset(false);
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    setDirty(false);
    try {
      await commands.clearWizardDraft();
      const d = await freshDraft(catalog);
      setUntouched(d);
      setDraft(mode === 'custom' ? blankDraft(d) : d);
      setStep('world');
      setRestoredAt(null);
      setSaveState('idle');
      setProblems(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const create = async () => {
    if (!draft) return;
    setBusy(true);
    setError(null);
    // A save landing after create would bring the finished draft back.
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    try {
      const created = await commands.createStory(draft);
      setDirty(false);
      navigate({ name: 'reader', routeId: created.mainRouteId });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
      pending.current = { mode, step, draft, savedAt: '' };
      flush();
    }
  };

  const index = STEPS.indexOf(step);
  const guided = mode === 'guided';
  const props = draft && catalog ? { draft, update, catalog, guided } : null;

  return (
    <section className="screen wizard" aria-labelledby={`${id}-title`}>
      <div className="screen-header">
        <button type="button" onClick={() => navigate({ name: 'library' })}>
          Back
        </button>
        <h1 id={`${id}-title`}>Create a story</h1>
        <div role="radiogroup" aria-label="How to fill it in" className="segmented">
          {(['guided', 'custom'] as WizardMode[]).map((m) => (
            <label key={m}>
              <input
                type="radio"
                name={`${id}-mode`}
                checked={mode === m}
                onChange={() => changeMode(m)}
              />
              <span>{m === 'guided' ? 'Guided' : 'Custom'}</span>
            </label>
          ))}
        </div>
      </div>
      <p className="muted small">
        {guided
          ? 'Choose everything with arrows, menus and checkboxes. Nothing to type.'
          : 'Write everything yourself; no presets needed. To build on a preset instead, pick it in Guided first and it carries over.'}{' '}
        {!guided && draft && (
          <button type="button" className="link-button" onClick={() => setConfirmClear(true)}>
            Clear all fields
          </button>
        )}{' '}
        <span role="status">
          {saveState === 'saving' && 'Saving draft…'}
          {saveState === 'saved' && 'Draft saved.'}
          {saveState === 'failed' && "Couldn't save the draft."}
        </span>
      </p>

      {restoredAt !== null && (
        <div className="notice" role="note">
          Picked up your unfinished story
          {savedLabel(restoredAt) ? ` from ${savedLabel(restoredAt)}` : ''}.{' '}
          <button type="button" className="link-button" onClick={() => setConfirmReset(true)}>
            Start over
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      {props && (
        <>
          <nav aria-label="Steps">
            <ol className="wizard-steps">
              {STEPS.map((s, i) => (
                <li key={s}>
                  <button
                    type="button"
                    aria-current={s === step ? 'step' : undefined}
                    onClick={() => goTo(s)}
                  >
                    {i + 1}. {STEP_NAMES[s]}
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <div className="wizard-body">
            <h2 ref={heading} tabIndex={-1}>
              {STEP_TITLES[step]}
            </h2>
            {step === 'world' && <WorldStep {...props} />}
            {step === 'character' && <CharacterStep {...props} />}
            {step === 'story' && <StoryStep {...props} />}
            {step === 'narration' && <NarrationStep {...props} />}
            {step === 'review' && (
              <ReviewStep draft={props.draft} problems={problems} onGoTo={goTo} />
            )}
          </div>

          <div className="button-row wizard-nav">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => goTo(STEPS[index - 1] ?? 'world')}
            >
              Previous
            </button>
            {step !== 'review' ? (
              <button
                type="button"
                className="primary"
                onClick={() => goTo(STEPS[index + 1] ?? 'review')}
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                className="primary"
                disabled={busy || problems === null || problems.length > 0}
                onClick={() => void create()}
              >
                {busy ? 'Creating…' : 'Create story'}
              </button>
            )}
          </div>
        </>
      )}
      {!props && !error && <p className="muted">Loading…</p>}

      {confirmClear && (
        <Dialog title="Clear all fields?" onClose={() => setConfirmClear(false)}>
          <p>
            Every field in this story is emptied, and narration goes back to the defaults, so you
            can write it all yourself.
          </p>
          <div className="button-row">
            <button type="button" onClick={() => setConfirmClear(false)}>
              Keep them
            </button>
            <button type="button" className="danger" onClick={clearAll}>
              Clear all fields
            </button>
          </div>
        </Dialog>
      )}
      {confirmReset && (
        <Dialog title="Start over?" onClose={() => setConfirmReset(false)}>
          <p>Your unfinished story will be discarded.</p>
          <div className="button-row">
            <button type="button" onClick={() => setConfirmReset(false)}>
              Keep it
            </button>
            <button type="button" className="danger" onClick={() => void startOver()}>
              Discard and start over
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
