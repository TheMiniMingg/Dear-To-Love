import { msg } from '../../i18n';

/** When the names and prices below were last checked against each service. */
export const CHECKED = msg('November 2026');

/**
 * A model the app knows by name: what it is good for in a story, and its
 * list price in US dollars per million tokens. Prices change; the app only
 * offers them as a starting point, and the player saves them.
 */
export type KnownModel = {
  id: string;
  /** The connection preset it is reached through (presets.ts). */
  preset: string;
  /** A few words on what it is good for, shown beside the name. */
  note: string;
  /** List prices, when the service publishes them for this name. */
  price?: Price;
  /** Thinks before it writes: the reply costs a little more. */
  thinks?: boolean;
};

export type Price = { input: number; output: number; cached?: number };

const ALL_ROUND = msg('all-round, quick');
const STRONGER = msg('stronger plots');
const BEST = msg('the most capable, costs the most');
const CHEAPEST = msg('cheapest');
const CHEAP_GOOD = msg('cheap and good');
const LONG = msg('long stories that stay consistent');

export const KNOWN_MODELS: KnownModel[] = [
  {
    id: 'gpt-6.1-terra',
    preset: 'openai',
    note: ALL_ROUND,
    price: { input: 1, output: 5 },
    thinks: true,
  },
  {
    id: 'gpt-6.1-sol',
    preset: 'openai',
    note: STRONGER,
    price: { input: 2, output: 10 },
    thinks: true,
  },
  {
    id: 'gpt-6-astra',
    preset: 'openai',
    note: BEST,
    price: { input: 10, output: 50 },
    thinks: true,
  },
  {
    id: 'gpt-6-luna',
    preset: 'openai',
    note: CHEAPEST,
    price: { input: 0.1, output: 0.5 },
    thinks: true,
  },
  {
    id: 'claude-sonnet-5-5',
    preset: 'anthropic',
    note: LONG,
    price: { input: 2, output: 10, cached: 0.2 },
    thinks: true,
  },
  {
    id: 'claude-opus-5-5',
    preset: 'anthropic',
    note: msg('the best at long, careful stories'),
    price: { input: 4, output: 20, cached: 0.2 },
    thinks: true,
  },
  {
    id: 'claude-haiku-5-5',
    preset: 'anthropic',
    note: CHEAPEST,
    price: { input: 0.1, output: 0.5 },
    thinks: true,
  },
  {
    id: 'claude-fable-5-1',
    preset: 'anthropic',
    note: BEST,
    price: { input: 10, output: 50, cached: 0.25 },
    thinks: true,
  },
  // The 3.8 Flash launch price runs to 31 December 2026, then doubles.
  {
    id: 'gemini-3.8-flash',
    preset: 'gemini',
    note: CHEAP_GOOD,
    price: { input: 0.75, output: 3.75 },
    thinks: true,
  },
  { id: 'gemini-3.6-flash', preset: 'gemini', note: msg('the previous Flash'), thinks: true },
  { id: 'gemini-3.5-flash-lite', preset: 'gemini', note: CHEAPEST, thinks: true },
  {
    id: 'gemini-4-argon',
    preset: 'gemini',
    note: msg('the strongest Gemini; paid accounts only'),
    price: { input: 2, output: 10 },
    thinks: true,
  },
  { id: 'grok-4.7', preset: 'xai', note: ALL_ROUND, price: { input: 2, output: 6 }, thinks: true },
  { id: 'deepseek-flash', preset: 'deepseek', note: CHEAP_GOOD },
  { id: 'deepseek-v4-pro', preset: 'deepseek', note: STRONGER, thinks: true },
  {
    id: 'deepseek/deepseek-v4.1-flash',
    preset: 'openrouter',
    note: msg('popular for roleplay, cheap'),
  },
  { id: 'z-ai/glm-5.3-flash', preset: 'openrouter', note: CHEAP_GOOD },
  { id: 'moonshotai/kimi-k3.1-pro', preset: 'openrouter', note: STRONGER },
  { id: 'minimax/minimax-m3.1-flash', preset: 'openrouter', note: CHEAP_GOOD },
  { id: 'openai/gpt-6.1-sol', preset: 'openrouter', note: STRONGER, thinks: true },
  { id: 'anthropic/claude-opus-5.5', preset: 'openrouter', note: LONG, thinks: true },
  { id: 'gemma4:12b', preset: 'ollama', note: msg('good stories; about 10 GB of memory') },
  { id: 'gemma4:e2b', preset: 'ollama', note: msg('for computers with 8 GB') },
  { id: 'llama3.2', preset: 'ollama', note: msg('runs almost anywhere; simple stories') },
  { id: 'qwen3.8:27b', preset: 'ollama', note: msg('much better; a graphics card with 24 GB') },
  { id: 'dolphin3', preset: 'ollama', note: msg('fewer refusals for dark fiction') },
  {
    id: 'mistral-large-latest',
    preset: 'mistral',
    note: CHEAP_GOOD,
    price: { input: 0.5, output: 2 },
  },
  {
    id: 'mistral-medium-latest',
    preset: 'mistral',
    note: STRONGER,
    price: { input: 2, output: 8 },
  },
  {
    id: 'mistral-small-latest',
    preset: 'mistral',
    note: CHEAPEST,
    price: { input: 0.15, output: 0.6 },
  },
];

/** The listed price for a model name, if the app knows it. */
export function knownModel(id: string): KnownModel | undefined {
  const name = id.trim().toLowerCase();
  return KNOWN_MODELS.find((m) => m.id === name);
}

/**
 * What one reply costs in a long story: the story so far goes in (about
 * 12,000 tokens once a story is well under way) and about 600 tokens
 * (some 450 words) come out, plus a little thinking for models that think
 * first.
 * Early in a story a reply costs much less.
 */
export const LONG_STORY_INPUT = 12_000;
export const REPLY_OUTPUT = 600;
export const THINKING_OUTPUT = 300;

export function replyCost(price: Price, thinks = false): number {
  const out = REPLY_OUTPUT + (thinks ? THINKING_OUTPUT : 0);
  return (LONG_STORY_INPUT * price.input + out * price.output) / 1_000_000;
}

/** "0.2¢", "2¢" or "17¢" for one reply. */
export function formatReplyCost(usd: number): string {
  const cents = usd * 100;
  if (cents < 1) return `${Math.max(0.1, Math.round(cents * 10) / 10)}¢`;
  return `${Math.round(cents)}¢`;
}

/** "$1.65" for a hundred replies. */
export function formatHundred(usd: number): string {
  const v = usd * 100;
  return `$${v < 10 ? v.toFixed(2) : v.toFixed(0)}`;
}
