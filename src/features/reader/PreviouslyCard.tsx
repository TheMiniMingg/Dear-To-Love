import { useEffect, useState } from 'react';
import { BookOpen, Brain } from 'lucide-react';
import { commands } from '../../api/commands';
import { Dialog } from '../../components/Dialog';
import type { RouteView, StoryMemory } from '../../types';
import { plainText } from './messages';
import { t } from '../../i18n';

const PREF_KEY = 'dtl.previously';
/** A story reopened sooner than this is one the player just left. */
export const AWAY_MS = 20 * 60 * 1000;
/** Longest excerpt shown for the summary or the last reply. */
const MAX_EXCERPT = 600;

/** Whether the card is shown at all; a choice kept on this computer. */
export function previouslyEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setPreviouslyEnabled(on: boolean) {
  try {
    if (on) localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, 'off');
  } catch {
    // A preference only.
  }
}

const seenKey = (routeId: string) => `${PREF_KEY}.${routeId}`;

/** Once the card is closed, the route is not greeted again until the app restarts. */
function seenThisSession(routeId: string): boolean {
  try {
    return sessionStorage.getItem(seenKey(routeId)) === '1';
  } catch {
    return false;
  }
}

function markSeen(routeId: string) {
  try {
    sessionStorage.setItem(seenKey(routeId), '1');
  } catch {
    // Then the card may show once more; harmless.
  }
}

/**
 * Whether to greet the player with where they left off: a story with some
 * play behind it, last touched a while ago, with no reply on the way.
 */
export function shouldShowPreviously(view: RouteView, now = Date.now()): boolean {
  if (!previouslyEnabled() || seenThisSession(view.route.id)) return false;
  if (view.awaitingReply) return false;
  const replies = view.history.filter((e) => e.kind === 'assistant');
  if (replies.length < 2) return false;
  const last = view.history[view.history.length - 1];
  const at = last ? Date.parse(last.createdAt) : NaN;
  return Number.isFinite(at) && now - at >= AWAY_MS;
}

/** The first `max` characters, cut at a sentence or word, with an ellipsis. */
export function excerpt(text: string, max = MAX_EXCERPT): string {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  const at = stop > max * 0.6 ? stop + 1 : cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max;
  return `${clean.slice(0, at).trimEnd()}…`;
}

/**
 * Previously…: the card shown when a story is reopened after a while. The
 * story so far (the summary, or the newest chapter recap), the last reply,
 * where the story is and the open threads, with one button back into it.
 */
export function PreviouslyCard({
  view,
  onClose,
  onOpenMemory,
}: {
  view: RouteView;
  onClose: () => void;
  onOpenMemory: () => void;
}) {
  const [memory, setMemory] = useState<StoryMemory | null>(null);
  const [keep, setKeep] = useState(true);
  useEffect(() => {
    let live = true;
    commands
      .getStoryMemory(view.route.id)
      .then((m) => live && setMemory(m))
      .catch(() => live && setMemory(null));
    return () => {
      live = false;
    };
  }, [view.route.id]);
  const s = view.state.state;
  const chapter = view.chapters[view.chapters.length - 1];
  const lastReply = [...view.history].reverse().find((e) => e.kind === 'assistant');
  const recap = memory?.recaps[memory.recaps.length - 1];
  const soFar = memory?.summary?.text ?? recap?.text ?? null;
  const threads = s.openThreads.slice(0, 4);
  const close = () => {
    markSeen(view.route.id);
    setPreviouslyEnabled(keep);
    onClose();
  };
  const where = [s.scene.location.trim(), s.scene.time?.trim()].filter(Boolean).join(' · ');
  return (
    <Dialog
      title={t('Previously in {title}', { title: view.story.title })}
      onClose={close}
      initialFocusId="previously-continue"
    >
      <div className="previously" data-testid="previously">
        <p className="muted small previously-where">
          {chapter &&
            (chapter.title
              ? t('Chapter {n}: {title}', { n: chapter.ordinal, title: chapter.title })
              : t('Chapter {n}', { n: chapter.ordinal }))}
          {chapter && where && <span aria-hidden="true"> · </span>}
          {where}
        </p>
        {soFar && (
          <section aria-labelledby="previously-sofar">
            <h3 id="previously-sofar" className="small-heading">
              {memory?.summary ? t('The story so far') : t('Last chapter')}
            </h3>
            <p>{excerpt(soFar)}</p>
          </section>
        )}
        {lastReply && (
          <section aria-labelledby="previously-last">
            <h3 id="previously-last" className="small-heading">
              {t('Where you left off')}
            </h3>
            <p className="previously-reply">{excerpt(plainText(lastReply.payload.text))}</p>
          </section>
        )}
        {threads.length > 0 && (
          <section aria-labelledby="previously-threads">
            <h3 id="previously-threads" className="small-heading">
              {t('Open threads')}
            </h3>
            <ul className="previously-threads">
              {threads.map((th) => (
                <li key={th}>{th}</li>
              ))}
            </ul>
          </section>
        )}
        <label className="check small">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          {t('Show this when I come back to a story')}
        </label>
        <div className="button-row dialog-actions">
          <button
            type="button"
            onClick={() => {
              close();
              onOpenMemory();
            }}
          >
            <Brain className="btn-icon" aria-hidden={true} />
            {t('Story memory')}
          </button>
          <button id="previously-continue" type="button" className="primary" onClick={close}>
            <BookOpen className="btn-icon" aria-hidden={true} />
            {t('Keep reading')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
