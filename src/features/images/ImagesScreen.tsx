import { useEffect, useId, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import { describeImports, formatBytes, pickImageFiles } from '../../api/images';
import { useUiStore } from '../../app/store';
import { Dialog } from '../../components/Dialog';
import type { AssetDto, AssetUsage } from '../../types';
import { ImageGrid, Thumb } from './ImageGrid';

/** Kinds offered as tags. Other tags an image already has are kept. */
export const IMAGE_KINDS = ['Portrait', 'Background', 'Cover', 'Expression', 'Outfit'] as const;

const FORMAT: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
};

/** Adds images through the file picker and reports what happened. */
export function useAddImages(onAdded: (added: AssetDto[]) => void) {
  const [adding, setAdding] = useState(false);
  const [result, setResult] = useState<{ text: string; problems: string[] } | null>(null);
  const add = async () => {
    setAdding(true);
    try {
      const paths = await pickImageFiles();
      if (!paths.length) return;
      const results = await commands.importImages(paths);
      setResult(describeImports(results));
      onAdded(results.flatMap((r) => (r.asset ? [r.asset] : [])));
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

/** Library -> Images: every picture on this computer, reusable in any story. */
export function ImagesScreen() {
  const goBack = useUiStore((s) => s.goBack);
  const [images, setImages] = useState<AssetDto[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    commands
      .listImages()
      .then((list) => {
        if (live) {
          setImages(list);
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
          Back
        </button>
        <h1 id="images-title">Images</h1>
        <div className="button-row">
          <button type="button" className="primary" disabled={adding} onClick={() => void add()}>
            {adding ? 'Adding…' : 'Add images'}
          </button>
        </div>
      </div>
      <p className="muted">
        PNG, JPEG or WebP, up to 20 MB each. Images stay on this computer and can be used as covers,
        backgrounds and portraits in any story. Adding the same picture twice keeps one copy.
      </p>
      <ImportResult result={result} />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {images && images.length === 0 && (
        <div className="empty-state">
          <p>No images yet.</p>
          <p className="muted">
            Use <strong>Add images</strong> to bring in pictures for covers, scene backgrounds and
            character portraits.
          </p>
        </div>
      )}
      {images && images.length > 0 && (
        <div className="images-layout">
          <ImageGrid
            images={images}
            selectedId={selectedId}
            onSelect={(a) => setSelectedId(a.id)}
            label="Your images"
          />
          {selected ? (
            <ImageDetails
              key={selected.id}
              image={selected}
              onSaved={(a) => setImages((list) => list?.map((x) => (x.id === a.id ? a : x)) ?? [])}
              onDeleted={() => {
                setSelectedId(null);
                load();
              }}
            />
          ) : (
            <p className="muted image-details">Choose an image to see where it is used.</p>
          )}
        </div>
      )}
    </section>
  );
}

function ImageDetails({
  image,
  onSaved,
  onDeleted,
}: {
  image: AssetDto;
  onSaved: (a: AssetDto) => void;
  onDeleted: () => void;
}) {
  const id = useId();
  const [label, setLabel] = useState(image.label);
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

  const dirty = label !== image.label || tags.join('\n') !== image.tags.join('\n');
  const toggle = (kind: string) =>
    setTags((t) => (t.includes(kind) ? t.filter((x) => x !== kind) : [...t, kind]));

  const save = async () => {
    try {
      onSaved(await commands.updateImage(image.id, label, tags));
      setStatus('Saved.');
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

  const inHistory = usages?.some((u) => u.inHistory) ?? false;
  const name = image.label || 'Untitled';

  return (
    <div className="image-details" aria-label={`Image: ${name}`} role="region">
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
          <label htmlFor={`${id}-name`}>Name</label>
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
          <legend>Kind</legend>
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
                {k}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="button-row">
          <button type="submit" disabled={!dirty}>
            Save details
          </button>
          {status && (
            <span role="status" className="muted small">
              {status}
            </span>
          )}
        </div>
      </form>

      <h2 className="small-heading">Used in</h2>
      {usages === null && !error && <p className="muted small">Checking…</p>}
      {usages?.length === 0 && <p className="muted small">Not used in any story.</p>}
      {usages && usages.length > 0 && (
        <ul className="usage-list" aria-label="Used in">
          {usages.map((u) => (
            <li key={`${u.storyId}:${u.place}`}>
              <strong>{u.storyTitle}</strong>: {u.place}
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
            ? 'Earlier turns keep the pictures they showed, so this image stays while those stories exist.'
            : 'To delete this image, remove it from the stories above first.'}
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
          Delete image
        </button>
      </div>
      {confirm && (
        <Dialog title="Delete image?" onClose={() => setConfirm(false)}>
          <p>
            <strong>{name}</strong> will be removed from this computer. No story uses it.
          </p>
          <div className="button-row">
            <button type="button" onClick={() => setConfirm(false)}>
              Keep image
            </button>
            <button type="button" className="danger" onClick={() => void remove()}>
              Delete image
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
