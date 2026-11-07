import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

export type MenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
};

/**
 * A button that opens a short menu of actions. Arrow keys move through it,
 * Escape or a click elsewhere closes it, and focus returns to the button.
 */
/** The part of the window the menu can show in: inside the nearest scrolling box. */
function room(el: HTMLElement): { top: number; bottom: number } {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === 'auto' || o === 'scroll' || o === 'hidden') {
      const r = p.getBoundingClientRect();
      return { top: Math.max(0, r.top), bottom: Math.min(window.innerHeight, r.bottom) };
    }
  }
  return { top: 0, bottom: window.innerHeight };
}

export function MenuButton({
  label,
  items,
  children,
  className = 'icon-button',
}: {
  /** What the button is called (it usually shows only an icon). */
  label: string;
  items: MenuItem[];
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  /** Which item gets focus when the menu opens: the first or the last. */
  const start = useRef<'first' | 'last'>('first');

  const entries = () =>
    Array.from(
      menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );

  // Before it shows: open upward if it would run past the bottom.
  useLayoutEffect(() => {
    if (!open || !button.current || !menu.current) return setUp(false);
    const b = button.current.getBoundingClientRect();
    const h = menu.current.offsetHeight + 6;
    const { top, bottom } = room(button.current);
    setUp(b.bottom + h > bottom && b.top - h >= top);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const list = entries();
    (start.current === 'last' ? list[list.length - 1] : list[0])?.focus();
    const away = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = entries();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const move = (i: number) => {
      e.preventDefault();
      list[(i + list.length) % list.length]?.focus();
    };
    switch (e.key) {
      case 'ArrowDown':
        return move(at + 1);
      case 'ArrowUp':
        return move(at - 1);
      case 'Home':
        return move(0);
      case 'End':
        return move(list.length - 1);
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        return close();
      case 'Tab':
        return close(false);
    }
  };

  return (
    <span className="menu-anchor">
      <button
        ref={button}
        type="button"
        className={className}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          start.current = 'first';
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            start.current = e.key === 'ArrowUp' ? 'last' : 'first';
            setOpen(true);
          }
        }}
      >
        {children}
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={label}
          className={up ? 'menu-popup up' : 'menu-popup'}
          onKeyDown={onMenuKey}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={item.danger ? 'menu-item danger-item' : 'menu-item'}
              disabled={item.disabled}
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
