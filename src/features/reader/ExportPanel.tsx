import { useId, useState } from 'react';
import {
  TEXT_FORMATS,
  describeBook,
  describeExport,
  describeText,
  pickBookTarget,
  pickStorypackTarget,
  pickTextTarget,
} from '../../api/archive';
import { speechLang } from '../../app/readAloud';
import { commands, errorMessage } from '../../api/commands';
import type { RouteView, TextFormat } from '../../types';
import { intlLocale, t, tr } from '../../i18n';
import { routeName } from '../../i18n/names';

/**
 * Reader -> Export: this route as readable text or as a book, or the whole
 * story as a storypack another copy of the app can import.
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

  const saveBook = () =>
    run(
      () => pickBookTarget(view.story.title, view.route.label),
      async (path) => {
        const s = view.state.state;
        const player = s.characters[s.playerCharacterId]?.name.trim() || t('you');
        return describeBook(
          await commands.exportRouteBook(view.route.id, path, {
            language: speechLang(s.narration?.language),
            subtitle: view.route.isMain
              ? undefined
              : t('Route: {name}', { name: routeName(view.route.label) }),
            byline: t('Played as {name}', { name: player }),
            colophon: t('Made with Dear to Love on {date}', {
              date: new Date().toLocaleDateString(intlLocale(), { dateStyle: 'long' }),
            }),
            contents: t('Contents'),
          }),
        );
      },
    );

  const savePack = () =>
    run(
      () => pickStorypackTarget(view.story.title),
      async (path) => describeExport(await commands.exportStorypack(view.story.id, path)),
    );

  return (
    <div className="panel export-panel">
      <section aria-labelledby={`${id}-text`}>
        <h3 id={`${id}-text`}>{t('Readable text')}</h3>
        <p className="muted small">
          {tr(
            'The route {route} as you read it: chapter headings, then each turn with who said it.',
            { route: <strong>{routeName(view.route.label)}</strong> },
          )}
        </p>
        <div className="inline-choices" role="radiogroup" aria-labelledby={`${id}-format`}>
          <span id={`${id}-format`} className="choices-label">
            {t('Format')}
          </span>
          {TEXT_FORMATS.map((f) => (
            <label key={f.format} className="check">
              <input
                type="radio"
                name={`${id}-format`}
                checked={format === f.format}
                onChange={() => setFormat(f.format)}
              />
              {t(f.label)}
            </label>
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={timestamps}
            onChange={(e) => setTimestamps(e.target.checked)}
          />
          {t('Include the time of each turn')}
        </label>
        <div className="button-row">
          <button type="button" disabled={busy} onClick={() => void saveText()}>
            {t('Save as text…')}
          </button>
        </div>
      </section>
      <section aria-labelledby={`${id}-book`}>
        <h3 id={`${id}-book`}>{t('Book')}</h3>
        <p className="muted small">
          {tr(
            'The route {route} as an e-book for any e-reader or book app: the cover, a title page, a page for each chapter and the reading font. Only the story goes in, never notes or settings.',
            { route: <strong>{routeName(view.route.label)}</strong> },
          )}
        </p>
        <div className="button-row">
          <button type="button" disabled={busy} onClick={() => void saveBook()}>
            {t('Save as a book…')}
          </button>
        </div>
      </section>
      <section aria-labelledby={`${id}-pack`}>
        <h3 id={`${id}-pack`}>{t('Storypack')}</h3>
        <p className="muted small">
          {t(
            'The whole story in one file: every route, saves, story summaries and the pictures it shows. Import it on another computer or keep it as a copy. It never includes API keys, connections, usage records or your settings.',
          )}
        </p>
        <div className="button-row">
          <button type="button" disabled={busy} onClick={() => void savePack()}>
            {t('Save storypack…')}
          </button>
        </div>
      </section>
      <div aria-live="polite">
        {busy && <p className="muted">{t('Saving…')}</p>}
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
