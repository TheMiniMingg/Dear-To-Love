import { msg } from '../../i18n';
import type { AdapterKind, ProviderProfile } from '../../types';

/** Short names for each kind of connection. */
export const ADAPTER_LABELS: Record<AdapterKind, string> = {
  openai_compatible: msg('OpenAI-compatible'),
  anthropic: 'Anthropic',
  ollama: 'Ollama',
  openai_images: msg('Images API'),
  stable_diffusion: 'Stable Diffusion WebUI',
};

/** Connections that make pictures (portraits) instead of writing replies. */
export const makesPictures = (c: { adapter: AdapterKind }): boolean =>
  c.adapter === 'openai_images' || c.adapter === 'stable_diffusion';

/** Connections that can write a story's replies. */
export const storyConnections = (list: ProviderProfile[]): ProviderProfile[] =>
  list.filter((c) => !makesPictures(c));

/** Connections that can make portraits. */
export const pictureConnections = (list: ProviderProfile[]): ProviderProfile[] =>
  list.filter(makesPictures);
