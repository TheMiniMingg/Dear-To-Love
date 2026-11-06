import { useId, useState } from 'react';
import {
  TEXT_FORMATS,
  describeExport,
  describeText,
  pickStorypackTarget,
  pickTextTarget,
} from '../../api/archive';
import { commands, errorMessage } from '../../api/commands';
import type { RouteView, TextFormat } from '../../types';

/**
 * Reader -> Export: this route as readable text, or the whole story as a
 * storypack another copy of the app can import.
 */
export function ExportPanel({ view }: { view: RouteView }) {
  const id = useId();
  const [format, setFormat] = useState<TextFormat>('markdown');
  const [timestamps, setTimestamps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    pick: () => Promise<string | null>,
    write: (path: string) => Promise<string>,
  ) => {
    setError(null);
    setStatus(null);
    try {
      const path = await pick();
      if (!path) return;
      setBusy(true);
      setStatus(await write(path));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const saveText = () =>
    run(
      () => pickTextTarget(view.story.title, view.route.label, format),
      async (path) =>
        describeText(await commands.exportRouteText(view.route.id, path, format, timestamps)),
    );

  const savePack = () =>
    run(
      () => pickStorypackTarget(view.story.title),
      async (path) => describeExport(await commands.exportStorypack(view.story.id, path)),
    );

  return (
    <div className="panel export-panel">
      <section aria-labelledby={`${id}-text`}>
        <h3 id={`${id}-text`}>Readable text</h3>
        <p className="muted small">
          The route <strong>{view.route.label}</strong> as you read it: chapter headings, then each
          turn with who said it.
        </p>
        <div className="inline-choices" role="radiogroup" aria-labelledby={`${id}-format`}>
          <span id={`${id}-format`} className="choices-label">
            Format
          </span>
          {TEXT_FORMATS.map((f) => (
            <label key={f.format} className="check">
              <input
                type="radio"
                name={`${id}-format`}
                checked={format === f.format}
                onChange={() => setFormat(f.format)}
              />
              {f.label}
            </label>
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={timestamps}
            onChange={(e) => setTimestamps(e.target.checked)}
          />
          Include the time of each turn
        </label>
        <div className="button-row">
          <button type="button" disabled={busy} onClick={() => void saveText()}>
            Save as text…
          </button>
        </div>
      </section>
      <section aria-labelledby={`${id}-pack`}>
        <h3 id={`${id}-pack`}>Storypack</h3>
        <p className="muted small">
          The whole story in one file: every route, saves, story summaries and the pictures it
          shows. Import it on another computer or keep it as a copy. It never includes API keys,
          connections, usage records or your settings.
        </p>
        <div className="button-row">
          <button type="button" disabled={busy} onClick={() => void savePack()}>
            Save storypack…
          </button>
        </div>
      </section>
      <div aria-live="polite">
        {busy && <p className="muted">Saving…</p>}
        {status && <p role="status">{status}</p>}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
