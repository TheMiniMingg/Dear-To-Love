import { useEffect, useId, useRef, useState } from 'react';
import { create } from 'zustand';
import { commands, errorMessage } from '../../api/commands';
import { Dialog } from '../../components/Dialog';
import { t } from '../../i18n';
import { copyText, pickReportTarget } from './ReportDialog';

type Note = { tone: 'ok' | 'error'; text: string };

/** Whether Report a problem is open (from the footer or the palette). */
export const useProblemReport = create<{ open: boolean; setOpen: (open: boolean) => void }>(
  (set) => ({ open: false, setOpen: (open) => set({ open }) }),
);

/** The report, then the player's own words under it. */
export function problemText(report: string, words: string): string {
  const said = words.trim();
  return said ? `${report.trimEnd()}\n\nWhat happened\n-------------\n${said}\n` : report;
}

/**
 * Report a problem: the player says what happened, and the app adds the
 * sanitized diagnostics report. Nothing is sent from here; the player
 * copies or saves it, and can open a new issue on GitHub to paste it in.
 */
export function ProblemDialog({ onClose }: { onClose: () => void }) {
  const id = useId();
  const [report, setReport] = useState<string | null>(null);
  const [words, setWords] = useState('');
  const [note, setNote] = useState<Note | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    commands
      .diagnosticsReport(false)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setNote({ tone: 'error', text: errorMessage(e) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const text = report === null ? null : problemText(report, words);

  const copy = async (thenOpen: boolean) => {
    if (text === null) return;
    const ok = await copyText(text, area.current);
    if (!ok) {
      setNote({
        tone: 'error',
        text: t('Copying did not work here. Save it as a file and attach that instead.'),
      });
      return;
    }
    if (thenOpen) {
      try {
        await commands.openIssuePage();
        setNote({
          tone: 'ok',
          text: t('Copied. Paste it into the issue that opened in your browser.'),
        });
      } catch (e) {
        setNote({ tone: 'error', text: errorMessage(e) });
      }
    } else {
      setNote({ tone: 'ok', text: t('Copied. Paste it into an email or a message.') });
    }
  };

  const saveFile = async () => {
    if (text === null) return;
    try {
      const path = await pickReportTarget();
      if (!path) return;
      const name = await commands.saveDiagnosticsReport(path, text);
      setNote({ tone: 'ok', text: t('Saved {file}.', { file: name }) });
    } catch (e) {
      setNote({ tone: 'error', text: errorMessage(e) });
    }
  };

  return (
    <Dialog title={t('Report a problem')} onClose={onClose} wide>
      <p className="muted small">
        {t(
          'Say what happened, and the app adds a short report: versions and check results, with no story text, titles, API keys or file paths. Nothing is sent from here. Copy it into an email or a message to whoever gave you the app, or into a new issue on GitHub.',
        )}
      </p>
      <div className="field">
        <label htmlFor={`${id}-words`}>{t('What happened?')}</label>
        <textarea
          id={`${id}-words`}
          rows={5}
          maxLength={4000}
          value={words}
          placeholder={t('What you did, what you expected, and what happened instead.')}
          onChange={(e) => {
            setWords(e.target.value);
            setNote(null);
          }}
        />
      </div>
      <details className="problem-report">
        <summary>{t('The report it adds')}</summary>
        {report === null && !note && <p role="status">{t('Running the checks…')}</p>}
        {text !== null && (
          <textarea
            ref={area}
            className="report-text"
            aria-label={t('Report text')}
            readOnly
            rows={10}
            value={text}
          />
        )}
      </details>
      <div className="button-row">
        <button type="button" onClick={onClose}>
          {t('Close')}
        </button>
        <button type="button" disabled={text === null} onClick={() => void saveFile()}>
          {t('Save as file…')}
        </button>
        <button type="button" disabled={text === null} onClick={() => void copy(true)}>
          {t('Copy and open GitHub')}
        </button>
        <button
          type="button"
          className="primary"
          disabled={text === null}
          onClick={() => void copy(false)}
        >
          {t('Copy')}
        </button>
      </div>
      {note && (
        <p
          role={note.tone === 'error' ? 'alert' : 'status'}
          className={note.tone === 'error' ? 'error small' : 'small note-ok'}
        >
          {note.text}
        </p>
      )}
    </Dialog>
  );
}
