import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, GripHorizontal, GripVertical } from 'lucide-react';
import type { EventDto, RouteView } from '../../types';
import { BOX_RANGE, STAGE_MIN, useScreenLayout, type StageSizes } from '../../app/screenLayout';
import { ScenePictures } from './ScenePictures';
import { sceneBackground } from './pictures';
import { stageCast, usePictureView } from './stage';
import { t } from '../../i18n';

/** Arrow keys move the handle this far (pixels, or percent for the text box). */
const KEY_STEP = { px: 24, pct: 4 };

/**
 * The scene picture and the story, laid out the way the player chose in
 * Look: the picture above the story, beside it, or behind a text box. A
 * handle between them resizes the picture; dragging it nearly shut hides the
 * pictures for text only, and a small tab brings them back. Only how the
 * screen looks changes, never the story.
 */
export function StageArea({
  view,
  events,
  draft,
  viewing,
  children,
}: {
  view: RouteView;
  events: EventDto[];
  draft?: string | null;
  /** Reading an old save: no pictures, just the story. */
  viewing: boolean;
  children: ReactNode;
}) {
  const place = useScreenLayout((s) => s.picture);
  const sizes = useScreenLayout((s) => s.sizes);
  const shown = usePictureView((s) => s.shown);
  const setShown = usePictureView((s) => s.setShown);
  const hasPictures = !!sceneBackground(view).assetId || stageCast(view).length > 0;
  const style: Record<string, string> = {};
  if (sizes.top) style['--stage-h'] = `${sizes.top}px`;
  if (sizes.side) style['--stage-w'] = `${sizes.side}px`;
  style['--box-h'] = `${sizes.box ?? BOX_RANGE.standard}%`;
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      ref={ref}
      className={`stage-area${dragging ? ' dragging' : ''}`}
      data-picture={place}
      data-top-sized={sizes.top ? '' : undefined}
      data-side-sized={sizes.side ? '' : undefined}
      style={style as CSSProperties}
    >
      {!viewing && <ScenePictures view={view} events={events} draft={draft} />}
      {!viewing && shown && hasPictures && <StageHandle area={ref} onDragging={setDragging} />}
      {children}
      {!viewing && !shown && hasPictures && (
        <button
          type="button"
          className="stage-tab"
          onClick={() => setShown(true)}
          title={t('The pictures are hidden for more room to read. Click to show them again.')}
        >
          <ChevronDown aria-hidden={true} className="stage-tab-icon" />
          {t('Show pictures')}
        </button>
      )}
    </div>
  );
}

/** The bar between the picture and the story, dragged to resize the picture. */
function StageHandle({
  area,
  onDragging,
}: {
  area: React.RefObject<HTMLDivElement | null>;
  onDragging: (on: boolean) => void;
}) {
  const place = useScreenLayout((s) => s.picture);
  const sizes = useScreenLayout((s) => s.sizes);
  const setSize = useScreenLayout((s) => s.setSize);
  const setShown = usePictureView((s) => s.setShown);
  const drag = useRef<{ x: number; y: number; start: number; before: StageSizes } | null>(null);
  const [now, setNow] = useState<number | null>(null);

  // What the size is now: the one set, or what the stylesheet made of the default.
  const measure = (): number => {
    const box = area.current;
    if (!box) return 0;
    if (place === 'behind') return sizes.box ?? BOX_RANGE.standard;
    const set = sizes[place];
    if (set) return set;
    const stage = box.querySelector<HTMLElement>(
      place === 'side' ? '.scene-pictures' : '.scene-pictures.stage',
    );
    const r = stage?.getBoundingClientRect();
    const got = Math.round(place === 'side' ? (r?.width ?? 0) : (r?.height ?? 0));
    // Nothing laid out (yet): start from a usual size, never from shut.
    return got || (place === 'side' ? 320 : 240);
  };

  // Keep a size within what fits the reader.
  const clamp = (v: number): number => {
    const r = area.current?.getBoundingClientRect();
    if (place === 'behind') return Math.min(96, Math.max(BOX_RANGE.min, v));
    if (place === 'side') return Math.min((r?.width || 1200) * 0.6, Math.max(48, v));
    return Math.min((r?.height || 800) * 0.75, Math.max(32, v));
  };

  // Too small a picture (or too tall a text box) hides the pictures.
  const closes = (v: number): boolean =>
    place === 'behind'
      ? v > BOX_RANGE.max
      : v < (place === 'side' ? STAGE_MIN.side : STAGE_MIN.top);

  const key = place === 'behind' ? 'box' : place;
  const apply = (v: number, keep: boolean) => setSize({ [key]: Math.round(v) }, keep);

  const finish = (v: number, before: StageSizes) => {
    if (closes(v)) {
      // Back to the size it had, so showing the pictures again looks as before.
      setSize({ [key]: before[key] }, true);
      setShown(false);
    } else {
      apply(v, true);
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: measure(), before: sizes };
    onDragging(true);
  };
  const next = (e: React.PointerEvent): number => {
    const d = drag.current!;
    if (place === 'side') return clamp(d.start + (e.clientX - d.x));
    if (place === 'top') return clamp(d.start + (e.clientY - d.y));
    // The text box grows as the handle on its top edge goes up.
    const h = area.current?.getBoundingClientRect().height || 1;
    return clamp(d.start - ((e.clientY - d.y) / h) * 100);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const v = next(e);
    setNow(v);
    apply(v, false);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const v = next(e);
    const before = drag.current.before;
    drag.current = null;
    setNow(null);
    onDragging(false);
    finish(v, before);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const grow: Record<string, number> =
      place === 'side'
        ? { ArrowRight: 1, ArrowLeft: -1 }
        : place === 'top'
          ? { ArrowDown: 1, ArrowUp: -1 }
          : { ArrowUp: 1, ArrowDown: -1 };
    const dir = grow[e.key];
    if (dir) {
      e.preventDefault();
      const step = place === 'behind' ? KEY_STEP.pct : KEY_STEP.px;
      finish(clamp(measure() + dir * step), sizes);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSize({ [key]: null }, true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setShown(false);
    }
  };

  const vertical = place === 'side';
  const Grip = vertical ? GripVertical : GripHorizontal;
  const value = now ?? (place === 'behind' ? (sizes.box ?? BOX_RANGE.standard) : sizes[key]);
  return (
    <div
      className={`stage-handle${now !== null && closes(now) ? ' closing' : ''}`}
      role="separator"
      tabIndex={0}
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={place === 'behind' ? t('Text box size') : t('Picture size')}
      aria-valuenow={value ? Math.round(value) : undefined}
      title={
        place === 'behind'
          ? t(
              'Drag to make the text box taller or shorter. Drag it to the top to hide the pictures. Double-click for the usual size.',
            )
          : t(
              'Drag to make the picture bigger or smaller. Drag it closed to hide the pictures. Double-click for the usual size.',
            )
      }
      data-testid="stage-handle"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => setSize({ [key]: null }, true)}
      onKeyDown={onKeyDown}
    >
      <span className="stage-grip">
        <Grip aria-hidden={true} />
      </span>
    </div>
  );
}
