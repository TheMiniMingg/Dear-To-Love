import { BookOpenText, X } from 'lucide-react';
import { useReplyNotices, useReplyWatch } from '../app/replyWatch';
import { useUiStore } from '../app/store';
import { t } from '../i18n';

/**
 * "A reply is ready in …": shown when a story you left while it was
 * writing has finished, with a way to go there.
 */
export function ReplyToast() {
  useReplyNotices();
  const ready = useReplyWatch((s) => s.ready);
  const dismiss = useReplyWatch((s) => s.dismiss);
  const navigate = useUiStore((s) => s.navigate);
  return (
    <div className="toast-host" aria-live="polite">
      {ready && (
        <div className="toast" role="status">
          <BookOpenText className="toast-icon" aria-hidden={true} size={20} />
          <span>{t('A reply is ready in {title}.', { title: ready.title })}</span>
          <button
            type="button"
            className="primary"
            onClick={() => {
              dismiss();
              navigate({ name: 'reader', routeId: ready.routeId });
            }}
          >
            {t('Read it')}
          </button>
          <button type="button" className="icon-button" aria-label={t('Dismiss')} onClick={dismiss}>
            <X aria-hidden={true} size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
