import { useEffect, useId, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import { describeImports, formatBytes, pickImageFiles } from '../../api/images';
import { useUiStore } from '../../app/store';
import { Dialog } from '../../components/Dialog';
import type { AssetDto, AssetUsage, ImageImport, ImageScope, StorySummary } from '../../types';
import { ImageGrid, Thumb } from './ImageGrid';
import { joinList, msg, t } from '../../i18n';
import { pictureName } from '../../i18n/names';

/** Kinds offered as tags. Other tags an image already has are kept. */
export const IMAGE_KINDS = [
  msg('Portrait'),
  msg('Background'),
  msg('Cover'),
  msg('Expression'),
  msg('Outfit'),
] as const;

const FORMAT: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
};

/**
 * Adds images through the file picker and reports what happened. `add`
 * takes who may use them (all stories when left out).
 */
export function useAddImages(onAdded: (added: AssetDto[], results: ImageImport[]) => void) {
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<{ text: string; problems: string[] } | null>(null);
  const add = async (scope?: ImageScope) => {
    setAdding(true);
    try {
      const paths = await pickImageFiles();
      if (!paths.length) return;
      const results = await commands.importImages(paths, scope);
      setResult(describeImports(results));
      onAdded(
        results.flatMap((r) => (r.asset ? [r.asset] : [])),
        results,
      );
    } catch (e) {
      setResult({ text: errorMessage(e), problems: [] });
    } finally {
      setAdding(false);
    }
  };
  return { add, adding, result };
}

export function ImportResult({ result }: { result: { text: string; problems: string[] } | null }) {
  if (!result) return null;
  return (
    <div role="status" className="import-result">
      <p>{result.text}</p>
      {result.problems.length > 0 && (
        <ul className="problems">
          {result.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

type Group = { key: string; title: string; hint?: string; images: AssetDto[] };

function quoteList(titles: string[]): string {
  const q = titles.map((x) => t('“{title}”', { title: x }));
  if (q.length <= 1) return q.join('');
  if (q.length <= 3) {
    return t('{list} and {last}', { list: joinList(q.slice(0, -1)), last: q[q.length - 1]! });
  }
  return t('{list} and {n} more', { list: joinList(q.slice(0, 2)), n: q.length - 2 });
}

/** Who may use an image, in words. */
export function scopeText(a: AssetDto): string {
  if (a.shared) return t('All stories');
  if (!a.stories.length) return t('Not in any story');
  return t('Only {stories}', { stories: quoteList(a.stories.map((s) => s.title)) });
}

/**
 * Where an image is used, from the app's core ("Portrait of Mara (story
 * default)", "Background on route Late night"), in the chosen language.
 */
export function placeText(place: string): string {
  const what = (w: string) =>
    w === 'Cover' || w === 'Background' || w === 'A picture'
      ? t(w)
      : w.startsWith('Portrait of ')
        ? t('Portrait of {name}', { name: w.slice('Portrait of '.length) })
        : w;
  let m = /^(.*) \(story default\)$/.exec(place);
  if (m) return t('{what} (story default)', { what: what(m[1]!) });
  m = /^(.*) \(story start\)$/.exec(place);
  if (m) return t('{what} (story start)', { what: what(m[1]!) });
  m = /^(Cover|Background|A picture|Portrait of .*?) on route (.*)$/.exec(place);
  if (m) return t('{what} on route {route}', { what: what(m[1]!), route: m[2]! });
  return what(place);
}

/** Shared images first, then each story's own, then images in no story. */
export function groupImages(images: AssetDto[]): Group[] {
  const shared = images.filter((a) => a.shared);
  const own = new Map<string, Group>();
  const none: AssetDto[] = [];
  for (const a of images) {
    if (a.shared) continue;
    if (!a.stories.length) {
      none.push(a);
      continue;
    }
    const key = a.stories.map((s) => s.id).join('|');
    const g = own.get(key) ?? {
      key,
      title: t('Only in {stories}', { stories: quoteList(a.stories.map((s) => s.title)) }),
      images: [],
    };
    g.images.push(a);
    own.set(key, g);
  }
  const groups: Group[] = [];
  if (shared.length) groups.push({ key: 'shared', title: t('For all stories'), images: shared });
  groups.push(...[...own.values()].sort((a, b) => a.title.localeCompare(b.title)));
  if (none.length)
    groups.push({
      key: 'none',
      title: t('Not in any story'),
      hint: t(
        'From deleted stories, or added for a story that was never created. Share them or delete them.',
      ),
      images: none,
    });
  return groups;
}

/** Library -> Images: every picture on this computer, reusable in any story. */
export function ImagesScreen() {
  const goBack = useUiStore((s) => s.goBack);
  const [images, setImages] = useState<AssetDto[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [stories, setStories] = useState<StorySummary[]>([]);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    // The story list only feeds "Keep for one story"; images show without it.
    Promise.all([commands.listImages(), commands.listStories().catch(() => [])])
      .then(([list, all]) => {
        if (live) {
          setImages(list);
          setStories(all);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [reload]);
  const load = () => setReload((n) => n + 1);

  const { add, adding, result } = useAddImages((added) => {
    load();
    if (added[0]) setSelectedId(added[0].id);
  });

  const selected = images?.find((i) => i.id === selectedId) ?? null;

  return (
    <section className="screen images-screen" aria-labelledby="images-title">
      <div className="screen-header">
        <button type="button" onClick={goBack}>
          {t('Back')}
        </button>
        <h1 id="images-title">{t('Images')}</h1>
        <div className="button-row">
          <button type="button" className="primary" disabled={adding} onClick={() => void add()}>
            {adding ? t('Adding…') : t('Add images')}
          </button>
        </div>
      </div>
      <p className="muted">
        {t(
          "PNG, JPEG or WebP, up to 20 MB each. Images stay on this computer. Pictures added here can be used in any story; pictures added from a story's Pictures (or while creating a story) stay in that story unless you share them. Adding the same picture twice keeps one copy.",
        )}
      </p>
      <ImportResult result={result} />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {images && images.length === 0 && (
        <div className="empty-state">
          <p>{t('No images yet.')}</p>
          <p className="muted">
            Use <strong>{t('Add images')}</strong> to bring in pictures for covers, scene
            backgrounds and character portraits.
          </p>
        </div>
      )}
      {images && images.length > 0 && (
        <div className="images-layout">
          <div className="image-groups">
            {groupImages(images).map((g) => (
              <section key={g.key} className="image-group" aria-label={g.title}>
                <h2 className="small-heading">{g.title}</h2>
                {g.hint && <p className="muted small">{g.hint}</p>}
                <ImageGrid
                  images={g.images}
                  selectedId={selectedId}
                  onSelect={(a) => setSelectedId(a.id)}
                  label={g.title}
                />
              </section>
            ))}
          </div>
          {selected ? (
            <ImageDetails
              key={selected.id}
              image={selected}
              stories={stories}
              onSaved={(a) => setImages((list) => list?.map((x) => (x.id === a.id ? a : x)) ?? [])}
              onDeleted={() => {
                setSelectedId(null);
                load();
              }}
            />
          ) : (
            <p className="muted image-details">{t('Choose an image to see where it is used.')}</p>
          )}
        </div>
      )}
    </section>
  );
}

function ImageDetails({
  image,
  stories,
  onSaved,
  onDeleted,
}: {
  image: AssetDto;
  stories: StorySummary[];
  onSaved: (a: AssetDto) => void;
  onDeleted: () => void;
}) {
  const id = useId();
  // A portrait the app named is shown, and saved, in the chosen language.
  const shownLabel = pictureName(image.label);
  const [label, setLabel] = useState(shownLabel);
  const [tags, setTags] = useState<string[]>(image.tags);
  const [usages, setUsages] = useState<AssetUsage[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    let live = true;
    commands
      .imageUsages(image.id)
      .then((u) => {
        if (live) setUsages(u);
      })
      .catch((e: unknown) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [image.id]);

  const dirty = label !== shownLabel || tags.join('\n') !== image.tags.join('\n');
  const toggle = (kind: string) =>
    setTags((t) => (t.includes(kind) ? t.filter((x) => x !== kind) : [...t, kind]));

  const save = async () => {
    try {
      onSaved(await commands.updateImage(image.id, label, tags));
      setStatus(t('Saved.'));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const remove = async () => {
    try {
      await commands.deleteImage(image.id);
      setConfirm(false);
      onDeleted();
    } catch (e) {
      setConfirm(false);
      setError(errorMessage(e));
    }
  };

  const [onlyStory, setOnlyStory] = useState('');
  const setScope = async (storyId: string | null) => {
    try {
      const a = await commands.setImageScope(image.id, storyId);
      onSaved(a);
      setStatus(
        a.shared
          ? t('Shared with all stories.')
          : t('Kept for {stories} only.', {
              stories: quoteList(a.stories.map((st) => st.title)),
            }),
      );
      setError(null);
      setOnlyStory('');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const inHistory = usages?.some((u) => u.inHistory) ?? false;
  const name = shownLabel || t('Untitled');

  return (
    <div className="image-details" aria-label={t('Image: {name}', { name })} role="region">
      <Thumb assetId={image.id} size="full" alt={name} className="image-preview" />
      <p className="muted small">
        {image.width} × {image.height} · {formatBytes(image.byteSize)} ·{' '}
        {FORMAT[image.mime] ?? image.mime}
      </p>
      <form
        className="image-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="field">
          <label htmlFor={`${id}-name`}>{t('Name')}</label>
          <input
            id={`${id}-name`}
            value={label}
            maxLength={100}
            onChange={(e) => {
              setLabel(e.target.value);
              setStatus(null);
            }}
          />
        </div>
        <fieldset>
          <legend>{t('Kind')}</legend>
          <div className="toggle-list">
            {IMAGE_KINDS.map((k) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={tags.includes(k)}
                  onChange={() => {
                    toggle(k);
                    setStatus(null);
                  }}
                />{' '}
                {t(k)}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="button-row">
          <button type="submit" disabled={!dirty}>
            {t('Save details')}
          </button>
          {status && (
            <span role="status" className="muted small">
              {status}
            </span>
          )}
        </div>
      </form>

      <h2 className="small-heading">{t('Available to')}</h2>
      <p className="small" data-testid="image-scope">
        {scopeText(image)}
      </p>
      {image.shared ? (
        stories.length > 0 && (
          <div className="button-row">
            <label htmlFor={`${id}-only`} className="small">
              {t('Keep for one story only')}
            </label>
            <select
              id={`${id}-only`}
              value={onlyStory}
              onChange={(e) => setOnlyStory(e.target.value)}
            >
              <option value="">{t('Choose a story…')}</option>
              {stories.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.title}
                </option>
              ))}
            </select>
            <button type="button" disabled={!onlyStory} onClick={() => void setScope(onlyStory)}>
              {t('Keep for that story')}
            </button>
          </div>
        )
      ) : (
        <div className="button-row">
          <button type="button" onClick={() => void setScope(null)}>
            {t('Share with all stories')}
          </button>
        </div>
      )}
      {image.shared && usages && new Set(usages.map((u) => u.storyId)).size > 0 && (
        <p className="muted small">{t('Stories that already show it keep it.')}</p>
      )}

      <h2 className="small-heading">{t('Used in')}</h2>
      {usages === null && !error && <p className="muted small">{t('Checking…')}</p>}
      {usages?.length === 0 && <p className="muted small">{t('Not used in any story.')}</p>}
      {usages && usages.length > 0 && (
        <ul className="usage-list" aria-label={t('Used in')}>
          {usages.map((u) => (
            <li key={`${u.storyId}:${u.place}`}>
              <strong>{u.storyTitle}</strong>: {placeText(u.place)}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {usages && usages.length > 0 ? (
        <p className="muted small" id={`${id}-delete-hint`}>
          {inHistory
            ? t(
                'Earlier turns keep the pictures they showed, so this image stays while those stories exist.',
              )
            : t('To delete this image, remove it from the stories above first.')}
        </p>
      ) : null}
      <div className="button-row">
        <button
          type="button"
          className="danger-link"
          disabled={usages === null || usages.length > 0}
          aria-describedby={usages && usages.length > 0 ? `${id}-delete-hint` : undefined}
          onClick={() => setConfirm(true)}
        >
          {t('Delete image')}
        </button>
      </div>
      {confirm && (
        <Dialog title={t('Delete image?')} onClose={() => setConfirm(false)}>
          <p>
            <strong>{name}</strong> will be removed from this computer. No story uses it.
          </p>
          <div className="button-row">
            <button type="button" onClick={() => setConfirm(false)}>
              {t('Keep image')}
            </button>
            <button type="button" className="danger" onClick={() => void remove()}>
              {t('Delete image')}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
