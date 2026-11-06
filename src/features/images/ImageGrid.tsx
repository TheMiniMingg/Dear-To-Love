import { useState } from 'react';
import { imageUrl } from '../../api/images';
import type { AssetDto } from '../../types';

/** A library thumbnail that says so when its file is missing. */
export function Thumb({
  assetId,
  alt,
  size = 'thumb',
  className,
}: {
  assetId: string;
  alt: string;
  size?: 'thumb' | 'full';
  className?: string;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  if (broken === assetId) {
    return (
      <span className={`thumb-missing ${className ?? ''}`} role="img" aria-label={alt}>
        Picture missing
      </span>
    );
  }
  return (
    <img
      className={className}
      src={imageUrl(assetId, size)}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(assetId)}
    />
  );
}

/** Library images as a grid of toggle buttons. */
export function ImageGrid({
  images,
  selectedId,
  onSelect,
  label,
}: {
  images: AssetDto[];
  selectedId: string | null;
  onSelect: (a: AssetDto) => void;
  label: string;
}) {
  return (
    <ul className="image-grid" aria-label={label}>
      {images.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            className="image-tile"
            aria-pressed={selectedId === a.id}
            onClick={() => onSelect(a)}
          >
            <Thumb assetId={a.id} alt="" />
            <span className="image-name">{a.label || 'Untitled'}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
