import { useEffect, useRef, useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { commands, errorMessage } from '../../api/commands';
import { Dialog } from '../../components/Dialog';
import { t } from '../../i18n';

type Note = { tone: 'ok' | 'error'; text: string };

/** Where to save the report. `null` when the dialog is closed. */
export async function pickReportTarget(today = new Date()): Promise<string | null> {
  const day = today.toISOString().slice(0, 10);
  return save({
    title: t('Save diagnostics report'),
    defaultPath: `Dear to Love diagnostics ${day}.txt`,
    filters: [{ name: t('Text file'), extensions: ['txt'] }],
  });
}

/** Clipboard API first; the older selection copy where the webview refuses it. */
export async function copyText(text: string, area: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!area) return false;
    area.focus();
    area.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}

/**
 * The support report: versions, counts and check results only. The user
 * reads it before copying or saving it; nothing is sent anywhere.
 */
export function ReportDialog({ deep, onClose }: { deep: boolean; onClose: () => void }) {
  const [report, setReport] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    commands
      .diagnosticsReport(deep)
      .then((r) => {
        if (!cancelled) setReport(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setNote({ tone: 'error', text: errorMessage(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [deep]);

  const copy = async () => {
    if (report === null) return;
    const ok = await copyText(report, area.current);
    setNote(
      ok
        ? { tone: 'ok', text: t('Copied. Paste it into your message or issue.') }
        : {
            tone: 'error',
            text: t(
              'Copying did not work here. Select the text and copy it, or save it as a file.',
            ),
          },
    );
  };

  const saveFile = async () => {
    if (report === null) return;
    try {
      const path = await pickReportTarget();
      if (!path) return;
      const name = await commands.saveDiagnosticsReport(path, report);
      setNote({ tone: 'ok', text: t('Saved {file}.', { file: name }) });
    } catch (e) {
      setNote({ tone: 'error', text: errorMessage(e) });
    }
  };

  return (
    <Dialog title={t('Diagnostics report')} onClose={onClose} wide>
      <p className="muted small">
        {t(
          'For a support request or a bug report. It lists versions, counts and check results. It has no story text, titles, API keys or file paths, and nothing is sent until you paste or attach it yourself.',
        )}
      </p>
      {report === null && !note && <p role="status">{t('Running the checks…')}</p>}
      {report !== null && (
        <textarea
          ref={area}
          className="report-text"
          aria-label={t('Report text')}
          readOnly
          rows={14}
          value={report}
        />
      )}
      <div className="button-row">
        <button type="button" onClick={onClose}>
          {t('Close')}
        </button>
        <button type="button" disabled={report === null} onClick={() => void saveFile()}>
          {t('Save as file…')}
        </button>
        <button
          type="button"
          className="primary"
          disabled={report === null}
          onClick={() => void copy()}
        >
          {t('Copy report')}
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
