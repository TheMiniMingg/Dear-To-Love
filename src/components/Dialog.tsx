import { useEffect, useId, useRef, type ReactNode, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { t } from '../i18n';

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional element id to focus first; defaults to the first focusable element. */
  initialFocusId?: string;
  /** Wider dialog for long read-only content. */
  wide?: boolean;
};

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog: traps Tab focus, closes on Escape (only the top dialog),
 * and restores focus to whatever was focused before it opened.
 */
export function Dialog({ title, onClose, children, initialFocusId, wide = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const first =
      (initialFocusId && root?.querySelector<HTMLElement>(`#${CSS.escape(initialFocusId)}`)) ||
      root?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? root)?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [initialFocusId]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="dialog-backdrop">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={wide ? 'dialog wide' : 'dialog'}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-button" aria-label={t('Close')} onClick={onClose}>
            <X aria-hidden={true} size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  );
}
