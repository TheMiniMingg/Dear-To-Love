import { useEffect, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import { useUiStore } from '../../app/store';
import { Dialog } from '../../components/Dialog';
import type { ProviderProfile, StorytellerInfo } from '../../types';
import { ConnectionForm } from './ConnectionForm';

type Note = { tone: 'ok' | 'warn' | 'error'; text: string };

export function SettingsScreen() {
  const goBack = useUiStore((s) => s.goBack);
  const [connections, setConnections] = useState<ProviderProfile[] | null>(null);
  const [storyteller, setStoryteller] = useState<StorytellerInfo | null>(null);
  const [editing, setEditing] = useState<ProviderProfile | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ProviderProfile | null>(null);
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([commands.listConnections(), commands.getStoryteller()])
      .then(([c, s]) => {
        if (cancelled) return;
        setConnections(c);
        setStoryteller(s);
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

  const note = (id: string, n: Note) => setNotes((all) => ({ ...all, [id]: n }));

  const test = async (p: ProviderProfile) => {
    setBusyId(p.id);
    note(p.id, { tone: 'ok', text: 'Checking…' });
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
    note(p.id, { tone: 'ok', text: 'Sending a one-line test message…' });
    try {
      const reply = await commands.sendTestMessage(p.id);
      note(p.id, { tone: 'ok', text: `The model replied: “${reply.trim()}”` });
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

  return (
    <section className="screen" aria-labelledby="settings-title">
      <div className="screen-header">
        <button type="button" onClick={goBack}>
          Back
        </button>
        <h1 id="settings-title">Settings</h1>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <section className="settings-section" aria-labelledby="storyteller-title">
        <h2 id="storyteller-title">Storyteller</h2>
        <p className="muted">
          Who writes the replies in your stories. Changing it only affects new replies; what is
          already written stays as it is.
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
              <strong>Offline storyteller</strong>
              <span className="muted small">
                Built in. Simple replies, works without internet, never costs anything.
              </span>
            </span>
          </label>
          {connections?.map((c) => (
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
                  {c.modelId} · {c.billing === 'local' ? 'local, no API charges' : 'paid API'}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="settings-section" aria-labelledby="connections-title">
        <div className="screen-header">
          <h2 id="connections-title">AI connections</h2>
          <button type="button" className="primary" onClick={() => setEditing('new')}>
            Add connection
          </button>
        </div>
        {connections && connections.length === 0 && (
          <p className="muted">
            No connections yet. Add one to play with an AI model from a cloud service or one running
            on this computer.
          </p>
        )}
        <ul className="connection-list">
          {connections?.map((c) => {
            const n = notes[c.id];
            return (
              <li key={c.id} className="connection-card">
                <div>
                  <strong>{c.label}</strong>
                  <div className="muted small">
                    {c.modelId} · {c.adapter === 'ollama' ? 'Ollama' : 'OpenAI-compatible'} ·{' '}
                    {c.baseUrl} ·{' '}
                    {c.hasKey ? 'key saved' : c.billing === 'local' ? 'no key needed' : 'no key'}
                  </div>
                </div>
                <div className="button-row">
                  <button
                    type="button"
                    onClick={() => void test(c)}
                    disabled={busyId === c.id}
                    title="Checks the address and key by listing models. Free, sends no story text."
                  >
                    Test connection
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendTest(c)}
                    disabled={busyId === c.id}
                    title="Sends one short message to the model. Paid services may charge a tiny amount."
                  >
                    Send test message
                  </button>
                  <button type="button" onClick={() => setEditing(c)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="danger-link"
                    aria-label={`Delete ${c.label}`}
                    onClick={() => setDeleting(c)}
                  >
                    Delete
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
          Usage and cost estimates are recorded for every request to a paid service. Set a spending
          limit in your provider&apos;s own dashboard too; this app cannot see your balance.
        </p>
      </section>

      {editing && (
        <Dialog
          title={editing === 'new' ? 'Add AI connection' : `Edit ${editing.label}`}
          onClose={() => setEditing(null)}
        >
          <ConnectionForm
            existing={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={(p) => {
              setEditing(null);
              setReload((n) => n + 1);
              if (editing === 'new' && active === null) void choose(p.id);
            }}
          />
        </Dialog>
      )}
      {deleting && (
        <Dialog title="Delete connection?" onClose={() => setDeleting(null)}>
          <p>
            <strong>{deleting.label}</strong> and its saved key will be removed. Stories and their
            replies are not affected, and past usage records are kept.
          </p>
          <div className="button-row">
            <button type="button" onClick={() => setDeleting(null)}>
              Keep it
            </button>
            <button type="button" className="danger" onClick={() => void doDelete(deleting)}>
              Delete connection
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
