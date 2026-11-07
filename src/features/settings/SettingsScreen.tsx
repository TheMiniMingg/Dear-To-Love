import { useEffect, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import { useUiStore } from '../../app/store';
import { Dialog } from '../../components/Dialog';
import type { ProviderProfile, StorytellerInfo } from '../../types';
import { AboutSection, UpdatesSection } from '../updates/UpdatesSection';
import { ConnectionForm } from './ConnectionForm';
import { BackdropSection } from './BackdropSection';
import { LanguageSection } from './LanguageSection';
import { LookSection } from './LookSection';
import { SoundSection } from './SoundSection';
import { ADAPTER_LABELS, makesPictures, pictureConnections, storyConnections } from './kinds';
import { retiredPictureModel } from './presets';
import { msg, t, tr } from '../../i18n';

type Note = { tone: 'ok' | 'warn' | 'error'; text: string };

/** Settings' sections in page order, for the jump links at the top. */
const SECTIONS: [id: string, label: string][] = [
  ['settings-language', msg('Language')],
  ['settings-look', msg('Look')],
  ['settings-sound', msg('Sound')],
  ['settings-backdrop', msg('Background')],
  ['settings-storyteller', msg('Storyteller')],
  ['settings-pictures', msg('Pictures')],
  ['settings-connections', msg('AI connections')],
  ['settings-updates', msg('Updates')],
  ['settings-about', msg('About')],
];

/** Settings' sections, for the command palette. */
export const SETTINGS_SECTIONS: readonly [id: string, label: string][] = SECTIONS;

/** Scrolls a section of Settings into view and puts the focus on it. */
function showSection(id: string): boolean {
  const el = document.getElementById(id);
  if (!el) return false;
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView?.({ block: 'start', behavior: still ? 'auto' : 'smooth' });
  el.focus({ preventScroll: true });
  return true;
}

/** Opens Settings (if it isn't open) at one of its sections. */
export function goToSettingsSection(id: string) {
  const ui = useUiStore.getState();
  if (ui.screen.name !== 'settings') ui.navigate({ name: 'settings' });
  // Sections that wait for the connections to load appear a moment later.
  let frames = 0;
  const tryShow = () => {
    if (!showSection(id) && ++frames < 90) requestAnimationFrame(tryShow);
  };
  requestAnimationFrame(tryShow);
}

/** A row of links to each section of the long Settings page; it stays at the top. */
function SettingsJump() {
  const go = (id: string) => void showSection(id);
  return (
    <nav className="settings-jump" aria-label={t('Settings sections')}>
      {SECTIONS.map(([id, label]) => (
        <button key={id} type="button" className="jump-link" onClick={() => go(id)}>
          {t(label)}
        </button>
      ))}
    </nav>
  );
}

export function SettingsScreen() {
  const goBack = useUiStore((s) => s.goBack);
  const navigate = useUiStore((s) => s.navigate);
  // The setup guide's Set it up here opens a new connection for that service.
  const newConnection = useUiStore((s) => s.newConnection);
  const clearNewConnection = useUiStore((s) => s.clearNewConnection);
  const [connections, setConnections] = useState<ProviderProfile[] | null>(null);
  const [storyteller, setStoryteller] = useState<StorytellerInfo | null>(null);
  const [pictureMaker, setPictureMaker] = useState<string | null>(null);
  const [editing, setEditingState] = useState<ProviderProfile | 'new' | null>(() =>
    useUiStore.getState().newConnection ? 'new' : null,
  );
  const setEditing = (e: ProviderProfile | 'new' | null) => {
    if (e === null) clearNewConnection();
    setEditingState(e);
  };
  const [deleting, setDeleting] = useState<ProviderProfile | null>(null);
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([commands.listConnections(), commands.getStoryteller(), commands.getPictureMaker()])
      .then(([c, s, p]) => {
        if (cancelled) return;
        setConnections(c);
        setStoryteller(s);
        setPictureMaker(p);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const choose = async (profileId: string | null) => {
    setError(null);
    try {
      setStoryteller(await commands.setStoryteller(profileId));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const choosePictures = async (profileId: string | null) => {
    setError(null);
    try {
      setPictureMaker(await commands.setPictureMaker(profileId));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const note = (id: string, n: Note) => setNotes((all) => ({ ...all, [id]: n }));

  const test = async (p: ProviderProfile) => {
    setBusyId(p.id);
    note(p.id, { tone: 'ok', text: t('Checking…') });
    try {
      const r = await commands.testConnection(p.id);
      note(p.id, {
        tone: r.ok ? (r.modelListed === false ? 'warn' : 'ok') : 'error',
        text: r.message,
      });
    } catch (e) {
      note(p.id, { tone: 'error', text: errorMessage(e) });
    } finally {
      setBusyId(null);
    }
  };

  const sendTest = async (p: ProviderProfile) => {
    setBusyId(p.id);
    note(p.id, { tone: 'ok', text: t('Sending a one-line test message…') });
    try {
      const reply = await commands.sendTestMessage(p.id);
      note(p.id, { tone: 'ok', text: t('The model replied: “{reply}”', { reply: reply.trim() }) });
    } catch (e) {
      note(p.id, { tone: 'error', text: errorMessage(e) });
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async (p: ProviderProfile) => {
    try {
      await commands.deleteConnection(p.id);
      setDeleting(null);
      setReload((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const active = storyteller?.profileId ?? null;
  const writers = connections ? storyConnections(connections) : null;
  const painters = connections ? pictureConnections(connections) : null;

  return (
    <section className="screen" aria-labelledby="settings-title">
      <div className="screen-header">
        <button type="button" onClick={goBack}>
          {t('Back')}
        </button>
        <h1 id="settings-title">{t('Settings')}</h1>
        <div className="button-row">
          <button type="button" onClick={() => navigate({ name: 'guide' })}>
            {t('Setup guide')}
          </button>
          <button type="button" onClick={() => navigate({ name: 'usage' })}>
            {t('Usage & budget')}
          </button>
          <button type="button" onClick={() => navigate({ name: 'backups' })}>
            {t('Backups')}
          </button>
        </div>
      </div>
      <SettingsJump />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <LanguageSection />
      <LookSection />
      <SoundSection />
      <BackdropSection />

      <section
        id="settings-storyteller"
        className="settings-section"
        tabIndex={-1}
        aria-labelledby="storyteller-title"
      >
        <h2 id="storyteller-title">{t('Storyteller')}</h2>
        <p className="muted">
          {t(
            "Who writes the replies in your stories. A story can pick its own storyteller instead (click the storyteller's name above the story). Changing it only affects new replies; what is already written stays as it is.",
          )}
        </p>
        <div role="radiogroup" aria-labelledby="storyteller-title" className="choice-list">
          <label className="choice">
            <input
              type="radio"
              name="storyteller"
              checked={active === null}
              onChange={() => void choose(null)}
            />
            <span>
              <strong>{t('Offline storyteller')}</strong>
              <span className="muted small">
                {t(
                  'Built in. Simple replies in English, works without internet, never costs anything.',
                )}
              </span>
            </span>
          </label>
          {writers?.map((c) => (
            <label key={c.id} className="choice">
              <input
                type="radio"
                name="storyteller"
                checked={active === c.id}
                onChange={() => void choose(c.id)}
              />
              <span>
                <strong>{c.label}</strong>
                <span className="muted small">
                  {c.modelId} · {c.billing === 'local' ? t('local, no API charges') : t('paid API')}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section
        id="settings-pictures"
        className="settings-section"
        tabIndex={-1}
        aria-labelledby="pictures-title"
      >
        <h2 id="pictures-title">{t('Pictures')}</h2>
        <p className="muted">
          {t(
            "Makes a character's portrait from their description, when you choose a portrait while creating or reading a story. Portraits are always asked for as safe-for-work pictures.",
          )}
        </p>
        <div role="radiogroup" aria-labelledby="pictures-title" className="choice-list">
          <label className="choice">
            <input
              type="radio"
              name="picture-maker"
              checked={pictureMaker === null}
              onChange={() => void choosePictures(null)}
            />
            <span>
              <strong>{t("Don't make pictures")}</strong>
              <span className="muted small">{t('Use only pictures you add yourself.')}</span>
            </span>
          </label>
          {painters?.map((c) => (
            <label key={c.id} className="choice">
              <input
                type="radio"
                name="picture-maker"
                checked={pictureMaker === c.id}
                onChange={() => void choosePictures(c.id)}
              />
              <span>
                <strong>{c.label}</strong>
                <span className="muted small">
                  {c.modelId} ·{' '}
                  {c.billing === 'local' ? t('local, no API charges') : t('paid per picture')}
                </span>
              </span>
            </label>
          ))}
        </div>
        {painters && painters.length === 0 && (
          <p className="muted small">
            {t(
              'To make portraits, add a picture connection (OpenAI images, or Stable Diffusion WebUI on this computer) under AI connections.',
            )}
          </p>
        )}
      </section>

      <section
        id="settings-connections"
        className="settings-section"
        tabIndex={-1}
        aria-labelledby="connections-title"
      >
        <div className="screen-header">
          <h2 id="connections-title">{t('AI connections')}</h2>
          <button type="button" className="primary" onClick={() => setEditing('new')}>
            {t('Add connection')}
          </button>
        </div>
        {connections && connections.length === 0 && (
          <p className="muted">
            {t(
              'No connections yet. Add one to play with an AI model from a cloud service or one running on this computer.',
            )}
          </p>
        )}
        <p className="muted small">
          {tr('Not sure which to choose, or where to get a key? {guide} walks you through it.', {
            guide: (
              <button
                type="button"
                className="link-button"
                onClick={() => navigate({ name: 'guide' })}
              >
                {t('The setup guide')}
              </button>
            ),
          })}
        </p>
        <ul className="connection-list">
          {connections?.map((c) => {
            const n = notes[c.id];
            return (
              <li key={c.id} className="connection-card">
                <div>
                  <strong>{c.label}</strong>
                  <div className="muted small">
                    {c.modelId} · {t(ADAPTER_LABELS[c.adapter])} · {c.baseUrl} ·{' '}
                    {c.hasKey
                      ? t('key saved')
                      : c.billing === 'local'
                        ? t('no key needed')
                        : t('no key')}
                  </div>
                  {makesPictures(c) && retiredPictureModel(c.modelId) && (
                    <p className="small note-warn">
                      {t(
                        'OpenAI retired this picture model. Edit the connection and choose {model}.',
                        { model: 'gpt-image-2.6-flare' },
                      )}
                    </p>
                  )}
                </div>
                <div className="button-row">
                  <button
                    type="button"
                    onClick={() => void test(c)}
                    disabled={busyId === c.id}
                    title={t(
                      'Checks the address and key by listing models. Free, sends no story text.',
                    )}
                  >
                    {t('Test connection')}
                  </button>
                  {!makesPictures(c) && (
                    <button
                      type="button"
                      onClick={() => void sendTest(c)}
                      disabled={busyId === c.id}
                      title={t(
                        'Sends one short message to the model. Paid services may charge a tiny amount.',
                      )}
                    >
                      {t('Send test message')}
                    </button>
                  )}
                  <button type="button" onClick={() => setEditing(c)}>
                    {t('Edit')}
                  </button>
                  <button
                    type="button"
                    className="danger-link"
                    aria-label={t('Delete {title}', { title: c.label })}
                    onClick={() => setDeleting(c)}
                  >
                    {t('Delete')}
                  </button>
                </div>
                {n && (
                  <p
                    role="status"
                    className={n.tone === 'error' ? 'error small' : `small note-${n.tone}`}
                  >
                    {n.text}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <p className="muted small">
          {t(
            "Usage and cost estimates are recorded for every request to a paid service. Set a spending limit in your provider's own dashboard too; this app cannot see your balance.",
          )}
        </p>
      </section>

      <UpdatesSection />
      <AboutSection />

      {editing && (
        <Dialog
          title={
            editing === 'new' ? t('Add AI connection') : t('Edit {name}', { name: editing.label })
          }
          onClose={() => setEditing(null)}
        >
          <ConnectionForm
            existing={editing === 'new' ? null : editing}
            preset={editing === 'new' ? (newConnection ?? undefined) : undefined}
            onCancel={() => setEditing(null)}
            onSaved={(p) => {
              setEditing(null);
              // The first connection of each kind is put to use (only once the
              // current choices are known), and the lists reload after that, so
              // a reload that started first can't bring back the old choice.
              const first =
                editing === 'new' && connections
                  ? makesPictures(p)
                    ? pictureMaker === null && (() => choosePictures(p.id))
                    : active === null && (() => choose(p.id))
                  : false;
              void (first ? first() : Promise.resolve()).then(() => setReload((n) => n + 1));
            }}
          />
        </Dialog>
      )}
      {deleting && (
        <Dialog title={t('Delete connection?')} onClose={() => setDeleting(null)}>
          <p>
            {tr(
              '{name} and its saved key will be removed. Stories and their replies are not affected, and past usage records are kept.',
              { name: <strong>{deleting.label}</strong> },
            )}
          </p>
          <div className="button-row">
            <button type="button" onClick={() => setDeleting(null)}>
              {t('Keep it')}
            </button>
            <button type="button" className="danger" onClick={() => void doDelete(deleting)}>
              {t('Delete connection')}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
