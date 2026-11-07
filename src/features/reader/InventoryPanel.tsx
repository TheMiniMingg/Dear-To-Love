import { useEffect, useId, useState } from 'react';
import { CommandError, commands, errorMessage, sentence } from '../../api/commands';
import { Thumb } from '../images/ImageGrid';
import { PICTURE_STYLES } from '../images/MakePortrait';
import type {
  AssetDto,
  Item,
  ItemPictureInput,
  Meter,
  PortraitStyle,
  Prompt,
  ProviderProfile,
  RouteView,
  Tracking,
  World,
} from '../../types';
import { joinSentences, t } from '../../i18n';
import { picture, itemSlot, slotName } from './pictures';

/** How full a bar is, 0 to 100. */
const fullness = (m: Meter) =>
  m.max ? Math.round((Math.min(Math.max(m.value, 0), m.max) / m.max) * 100) : 0;

/** "Health ▰▰▰▱ 80/100" or "Gold 35"; the words carry it, the bar is a picture of them. */
export function MeterView({ meter: m }: { meter: Meter }) {
  const bar = m.max !== undefined;
  const pct = fullness(m);
  return (
    <span className={`hud-meter ${bar ? 'bar' : 'counter'}${bar && pct <= 25 ? ' low' : ''}`}>
      <span className="hud-name">{m.name}</span>
      {bar && (
        <span className="hud-track" aria-hidden="true">
          <span className="hud-fill" style={{ width: `${pct}%` }} />
        </span>
      )}
      <span className="hud-value">{bar ? `${m.value}/${m.max}` : m.value}</span>
    </span>
  );
}

/**
 * Above the action box when a story keeps track: the player's own bars and
 * counters, and a button to the full status and inventory.
 */
export function TrackerHud({ tracking, onOpen }: { tracking: Tracking; onOpen: () => void }) {
  const mine = tracking.meters.filter((m) => !m.who && m.name.trim());
  const n = (tracking.items ?? []).length;
  return (
    <div className="tracker-hud" role="group" aria-label={t('Your status')}>
      {mine.length > 0 && (
        <ul className="hud-meters">
          {mine.map((m, i) => (
            <li key={`${m.name}-${i}`}>
              <MeterView meter={m} />
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="hud-open" onClick={onOpen}>
        {tracking.inventory ? t('Inventory ({n})', { n }) : t('Status')}
      </button>
    </div>
  );
}

type Props = {
  view: RouteView;
  /** The details can't change while an action waits for its reply. */
  detailsDisabled: boolean;
  onOpenDetails: () => void;
  onChanged: (view: RouteView, status: string) => void;
};

/**
 * Reader -> Status and inventory: every tracked bar and counter, by whose
 * they are, and the items the player carries, each with its description
 * and a picture if one was made. The storyteller keeps them; changing them
 * by hand is in Story details.
 */
export function InventoryPanel({ view, detailsDisabled, onOpenDetails, onChanged }: Props) {
  const tracking = view.state.state.tracking;
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!tracking) {
    return (
      <div className="panel">
        <p>
          {t(
            "This story doesn't keep track of health or items. You can turn it on in Story details.",
          )}
        </p>
        <div className="button-row">
          <button type="button" disabled={detailsDisabled} onClick={onOpenDetails}>
            {t('Story details')}
          </button>
        </div>
      </div>
    );
  }

  const groups = new Map<string, Meter[]>();
  for (const m of tracking.meters) {
    if (!m.name.trim()) continue;
    const who = m.who ?? '';
    groups.set(who, [...(groups.get(who) ?? []), m]);
  }
  const whose = [...groups.keys()].sort((a, b) =>
    a === '' ? -1 : b === '' ? 1 : a.localeCompare(b),
  );
  const items = tracking.items ?? [];

  const setPicture = async (item: Item, assetId: string | null) => {
    const slot = itemSlot(item.name);
    const name = slotName(view, slot);
    setBusy(true);
    setError(null);
    try {
      const visuals = await commands.setStoryPicture(view.story.id, slot, assetId);
      onChanged(
        { ...view, visuals },
        assetId
          ? t('{name} set for the story', { name })
          : t('{name} cleared for the story', { name }),
      );
      setOpen(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel inventory-panel">
      {whose.length > 0 && (
        <section className="tracker-section" aria-label={t('Bars and counters')}>
          <h3 className="small-heading">{t('Bars and counters')}</h3>
          {whose.map((who) => (
            <div key={who} className="meter-group">
              <h4 className="meter-owner">{who || t('Yours')}</h4>
              <ul className="meter-list">
                {(groups.get(who) ?? []).map((m, i) => (
                  <li key={`${m.name}-${i}`}>
                    <MeterView meter={m} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {tracking.inventory && (
        <section className="tracker-section" aria-label={t('Inventory')}>
          <h3 className="small-heading">{t('Inventory')}</h3>
          {items.length === 0 ? (
            <p className="muted">
              {t('Nothing yet. What you find, buy or are given shows up here.')}
            </p>
          ) : (
            <ul className="inventory-list">
              {items.map((item) => {
                const slot = itemSlot(item.name);
                const p = picture(view, slot);
                const opened = open === slot;
                return (
                  <li key={slot} className="inventory-item">
                    <div className="inventory-thumb">
                      {p.assetId ? (
                        <Thumb assetId={p.assetId} alt={slotName(view, slot)} />
                      ) : (
                        <span className="thumb-empty" aria-hidden="true">
                          {t('No picture')}
                        </span>
                      )}
                    </div>
                    <div className="inventory-text">
                      <strong>
                        {item.name}
                        {item.qty > 1 && <span className="inventory-qty"> × {item.qty}</span>}
                      </strong>
                      {item.description && <p className="small">{item.description}</p>}
                      <div className="button-row">
                        <button
                          type="button"
                          aria-expanded={opened}
                          aria-label={
                            p.assetId
                              ? t('New picture of {name}', { name: item.name })
                              : t('Make a picture of {name}', { name: item.name })
                          }
                          onClick={() => setOpen(opened ? null : slot)}
                        >
                          {p.assetId ? t('New picture') : t('Make a picture')}
                        </button>
                        {p.assetId && (
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={t('Remove {name}', { name: slotName(view, slot) })}
                            onClick={() => void setPicture(item, null)}
                          >
                            {t('Remove picture')}
                          </button>
                        )}
                      </div>
                      {opened && (
                        <MakeItemPicture
                          item={item}
                          world={view.state.state.world}
                          storyId={view.story.id}
                          onMade={(a) => void setPicture(item, a.id)}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="muted small">
        {t(
          'The storyteller changes these as things happen. To change them yourself, use Story details.',
        )}
      </p>
      <div className="button-row">
        <button type="button" disabled={detailsDisabled} onClick={onOpenDetails}>
          {t('Story details')}
        </button>
      </div>
    </div>
  );
}

function itemInput(
  item: Item,
  world: World,
  style: PortraitStyle,
  storyId: string,
  budgetOverride = false,
): ItemPictureInput {
  return {
    name: item.name,
    description: item.description ?? '',
    world,
    style,
    storyId,
    ...(budgetOverride ? { budgetOverride: true } : {}),
  };
}

/**
 * Asks the picture connection (Settings -> Pictures) for a picture of an
 * item: the object alone, safe for work. Shows exactly what is sent.
 */
function MakeItemPicture({
  item,
  world,
  storyId,
  onMade,
}: {
  item: Item;
  world: World;
  storyId: string;
  onMade: (asset: AssetDto) => void;
}) {
  const id = useId();
  /** `undefined` while loading; `null` when no picture connection is chosen. */
  const [maker, setMaker] = useState<ProviderProfile | null | undefined>(undefined);
  const [style, setStyle] = useState<PortraitStyle>('painted');
  const [showPrompt, setShowPrompt] = useState(false);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsOverride, setNeedsOverride] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([commands.getPictureMaker(), commands.listConnections()])
      .then(([pid, list]) => {
        if (live) setMaker(list.find((c) => c.id === pid) ?? null);
      })
      .catch(() => {
        if (live) setMaker(null);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!showPrompt) return;
    let live = true;
    commands
      .previewItemPicture(itemInput(item, world, style, storyId))
      .then((p) => {
        if (live) setPrompt(p);
      })
      .catch((e: unknown) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [showPrompt, item, world, style, storyId]);

  const make = async (budgetOverride = false) => {
    setBusy(true);
    setError(null);
    setNeedsOverride(false);
    try {
      onMade(
        await commands.makeItemPicture(itemInput(item, world, style, storyId, budgetOverride)),
      );
    } catch (e) {
      if (e instanceof CommandError && e.code === 'BUDGET_OVERRIDE_REQUIRED') {
        setNeedsOverride(true);
        setError(
          t(
            "Your budget pauses paid requests, and the app can't price pictures, so it can't tell whether this one fits.",
          ),
        );
      } else if (e instanceof CommandError && e.code === 'NO_PROVIDER') {
        setError(sentence(e.message));
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  };

  if (maker === undefined) return null;
  if (maker === null) {
    return (
      <p className="muted small make-portrait">
        {t(
          'To make a picture of it, add a picture connection in Settings and choose it under Pictures.',
        )}
      </p>
    );
  }
  return (
    <section className="make-portrait" aria-labelledby={`${id}-title`}>
      <h4 id={`${id}-title`} className="small-heading">
        {t('Picture of {name}', { name: item.name })}
      </h4>
      <p className="muted small">
        {joinSentences([
          t('Uses {name} ({model}).', { name: maker.label, model: maker.modelId }),
          maker.billing === 'local'
            ? t('It runs on your computer, with no charges.')
            : t('One request; the service charges for each picture.'),
          t('The picture is kept for this story only, and shows the object alone, safe for work.'),
        ])}
      </p>
      <div className="field">
        <label htmlFor={`${id}-style`}>{t('Style')}</label>
        <select
          id={`${id}-style`}
          value={style}
          onChange={(e) => setStyle(e.target.value as PortraitStyle)}
        >
          {PICTURE_STYLES.map((s) => (
            <option key={s.value} value={s.value}>
              {t(s.label)}
            </option>
          ))}
        </select>
      </div>
      <div className="button-row">
        <button type="button" className="primary" disabled={busy} onClick={() => void make()}>
          {busy ? t('Making the picture…') : t('Make picture')}
        </button>
        <button type="button" aria-expanded={showPrompt} onClick={() => setShowPrompt((v) => !v)}>
          {showPrompt ? t('Hide what is sent') : t('Show what is sent')}
        </button>
      </div>
      {busy && (
        <p role="status" className="muted small">
          {t('This can take a minute.')}
        </p>
      )}
      {showPrompt && prompt && (
        <div className="portrait-prompt small" aria-label={t('What is sent')}>
          <p>{prompt.text}</p>
          <p className="muted">Avoid: {prompt.avoid}</p>
        </div>
      )}
      {error && (
        <div role="alert" className="error">
          <p>{error}</p>
          {needsOverride && (
            <button type="button" disabled={busy} onClick={() => void make(true)}>
              {t('Make it anyway')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
