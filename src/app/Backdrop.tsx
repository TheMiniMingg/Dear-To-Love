import { imageUrl } from '../api/images';
import { useBackdrop } from './backdropStore';

/**
 * The background picture behind every screen, under a veil in the page's own
 * colour so text stays readable. A picture that no longer loads (it was
 * deleted from the library) is forgotten.
 */
export function Backdrop() {
  const assetId = useBackdrop((s) => s.assetId);
  const veil = useBackdrop((s) => s.veil);
  const update = useBackdrop((s) => s.update);
  if (!assetId) return null;
  return (
    <div className={`app-backdrop veil-${veil}`} aria-hidden="true" data-testid="app-backdrop">
      <img src={imageUrl(assetId, 'full')} alt="" onError={() => update({ assetId: null })} />
    </div>
  );
}
