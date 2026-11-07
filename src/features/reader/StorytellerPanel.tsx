import { useEffect, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import type { ProviderProfile, StorytellerInfo } from '../../types';
import { StorytellerPicker } from '../settings/StorytellerPicker';

/**
 * Reader -> Storyteller: who writes this story's new replies. Earlier
 * replies stay as they were written.
 */
export function StorytellerPanel({
  storyId,
  current,
  onChanged,
  onOpenSettings,
}: {
  storyId: string;
  current: StorytellerInfo;
  onChanged: (info: StorytellerInfo) => void;
  onOpenSettings: () => void;
}) {
  const [connections, setConnections] = useState<ProviderProfile[] | null>(null);
  const [app, setApp] = useState<StorytellerInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([commands.listConnections(), commands.getStoryteller()])
      .then(([c, a]) => {
        if (!live) return;
        setConnections(c);
        setApp(a);
      })
      .catch((e: unknown) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="panel storyteller-panel">
      <p className="muted">
        Only this story changes, and only new replies: what is already written stays as it is.
        Everything the story remembers (summaries, recaps and facts) carries over to the new
        storyteller.
      </p>
      {connections && app ? (
        <StorytellerPicker
          legend="Who writes this story's replies"
          value={current.storyChoice ?? null}
          connections={connections}
          appLabel={app.label}
          disabled={busy}
          onChange={(choice) => {
            setBusy(true);
            setError(null);
            commands
              .setStoryStoryteller(storyId, choice)
              .then(onChanged)
              .catch((e: unknown) => setError(errorMessage(e)))
              .finally(() => setBusy(false));
          }}
        />
      ) : (
        !error && <p className="muted small">Loading…</p>
      )}
      <p className="muted small" role="status" aria-live="polite">
        Now: <strong>{current.label}</strong>
        {current.modelId ? ` (${current.modelId})` : ''}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="button" onClick={onOpenSettings}>
          Add or change connections in Settings
        </button>
      </div>
    </div>
  );
}
