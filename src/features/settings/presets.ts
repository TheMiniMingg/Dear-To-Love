import { msg } from '../../i18n';
import type { AdapterKind, Billing } from '../../types';

export type PresetGroup = 'local' | 'labs' | 'hosted' | 'pictures' | 'other';

export type Preset = {
  id: string;
  label: string;
  group: PresetGroup;
  adapter: AdapterKind;
  baseUrl: string;
  billing: Billing;
  needsKey: boolean;
  /** Prompt plus reply, in tokens. Local servers often load models with 4096. */
  contextTokens: number;
  /** Longest reply. Reasoning models think inside this, so they get more room. */
  replyTokens?: number;
  /** An example model name, shown in the empty Model field. */
  model?: string;
  /**
   * Current model names offered in the Model field's list (checked
   * November 2026). Any other name can still be typed.
   */
  suggestions?: string[];
  /** One sentence on getting started with this service. */
  note?: string;
};

export const GROUP_LABELS: Record<PresetGroup, string> = {
  local: msg('On this computer (free and private)'),
  labs: msg('AI labs (API key, paid per use)'),
  hosted: msg('Open models, hosted (API key)'),
  pictures: msg('Pictures (portraits and items)'),
  other: msg('Anything else'),
};

const LOCAL = { group: 'local', billing: 'local', needsKey: false } as const;
const LAB = { group: 'labs', billing: 'paid', needsKey: true, replyTokens: 4000 } as const;
const HOSTED = { group: 'hosted', billing: 'paid', needsKey: true, contextTokens: 32_000 } as const;
const COMPATIBLE = 'openai_compatible' as const;

// Addresses only; nothing is contacted until the user tests or plays.
export const PRESETS: Preset[] = [
  {
    ...LOCAL,
    id: 'ollama',
    label: 'Ollama',
    adapter: 'ollama',
    baseUrl: 'http://localhost:11434',
    contextTokens: 8192,
    model: 'llama3.2',
  },
  {
    ...LOCAL,
    id: 'lmstudio',
    label: 'LM Studio',
    adapter: COMPATIBLE,
    baseUrl: 'http://localhost:1234/v1',
    contextTokens: 4096,
    note: msg("Load a model and start the server in LM Studio's Developer tab."),
  },
  {
    ...LOCAL,
    id: 'llamacpp',
    label: 'llama.cpp server',
    adapter: COMPATIBLE,
    baseUrl: 'http://localhost:8080/v1',
    contextTokens: 4096,
    note: msg('Start it with llama-server -m your-model.gguf. Any model name works.'),
  },
  {
    ...LOCAL,
    id: 'koboldcpp',
    label: 'KoboldCpp',
    adapter: COMPATIBLE,
    baseUrl: 'http://localhost:5001/v1',
    contextTokens: 4096,
    note: msg('Start KoboldCpp with a model loaded. Any model name works.'),
  },
  {
    ...LOCAL,
    id: 'jan',
    label: 'Jan',
    adapter: COMPATIBLE,
    baseUrl: 'http://localhost:1337/v1',
    contextTokens: 4096,
    note: msg("Turn on Jan's Local API Server first."),
  },
  {
    ...LOCAL,
    id: 'textgen',
    label: 'text-generation-webui',
    adapter: COMPATIBLE,
    baseUrl: 'http://localhost:5000/v1',
    contextTokens: 4096,
    note: msg('Start it with the --api flag and load a model.'),
  },
  {
    ...LOCAL,
    id: 'vllm',
    label: 'vLLM',
    adapter: COMPATIBLE,
    baseUrl: 'http://localhost:8000/v1',
    contextTokens: 8192,
    note: msg('Use the model name you served, as vllm serve was given it.'),
  },
  {
    ...LAB,
    id: 'openai',
    label: 'OpenAI',
    adapter: COMPATIBLE,
    baseUrl: 'https://api.openai.com/v1',
    contextTokens: 128_000,
    model: 'gpt-6.1-terra',
    suggestions: ['gpt-6.1-terra', 'gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna'],
    note: msg('Create a key at platform.openai.com.'),
  },
  {
    ...LAB,
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    adapter: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    contextTokens: 128_000,
    model: 'claude-opus-5-5',
    suggestions: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
    note: msg('Create a key at platform.claude.com. Uses Anthropic’s own API.'),
  },
  {
    ...LAB,
    id: 'gemini',
    label: 'Google Gemini',
    adapter: COMPATIBLE,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    contextTokens: 128_000,
    model: 'gemini-3.6-flash',
    suggestions: ['gemini-3.6-flash', 'gemini-3.5-flash-lite'],
    note: msg('Create a key in Google AI Studio (aistudio.google.com).'),
  },
  {
    ...LAB,
    id: 'xai',
    label: 'xAI (Grok)',
    adapter: COMPATIBLE,
    baseUrl: 'https://api.x.ai/v1',
    contextTokens: 128_000,
    note: msg('Create a key at console.x.ai.'),
  },
  {
    ...LAB,
    id: 'mistral',
    label: 'Mistral AI',
    adapter: COMPATIBLE,
    baseUrl: 'https://api.mistral.ai/v1',
    contextTokens: 32_000,
    note: msg('Create a key at console.mistral.ai.'),
  },
  {
    ...LAB,
    id: 'deepseek',
    label: 'DeepSeek',
    adapter: COMPATIBLE,
    baseUrl: 'https://api.deepseek.com/v1',
    contextTokens: 64_000,
    note: msg('Create a key at platform.deepseek.com.'),
  },
  {
    ...HOSTED,
    id: 'openrouter',
    label: 'OpenRouter',
    adapter: COMPATIBLE,
    baseUrl: 'https://openrouter.ai/api/v1',
    note: msg('One key reaches hundreds of models, open and closed, with different content rules.'),
  },
  {
    ...HOSTED,
    id: 'groq',
    label: 'Groq',
    adapter: COMPATIBLE,
    baseUrl: 'https://api.groq.com/openai/v1',
  },
  {
    ...HOSTED,
    id: 'together',
    label: 'Together AI',
    adapter: COMPATIBLE,
    baseUrl: 'https://api.together.xyz/v1',
  },
  {
    ...HOSTED,
    id: 'fireworks',
    label: 'Fireworks AI',
    adapter: COMPATIBLE,
    baseUrl: 'https://api.fireworks.ai/inference/v1',
  },
  {
    ...HOSTED,
    id: 'deepinfra',
    label: 'DeepInfra',
    adapter: COMPATIBLE,
    baseUrl: 'https://api.deepinfra.com/v1/openai',
  },
  {
    ...HOSTED,
    id: 'huggingface',
    label: 'Hugging Face',
    adapter: COMPATIBLE,
    baseUrl: 'https://router.huggingface.co/v1',
    note: msg('Use a Hugging Face access token as the key.'),
  },
  {
    id: 'openai-images',
    label: 'OpenAI images',
    group: 'pictures',
    adapter: 'openai_images',
    baseUrl: 'https://api.openai.com/v1',
    billing: 'paid',
    needsKey: true,
    contextTokens: 16_000,
    // gpt-image-1 was retired on 23 October 2026.
    model: 'gpt-image-2.6-flare',
    suggestions: ['gpt-image-2.6-flare', 'gpt-image-2.6-sunburst', 'gpt-image-2.5-flare'],
    note: msg(
      "Makes portraits and item pictures. OpenAI charges for each picture; the app records every request but can't price pictures.",
    ),
  },
  {
    id: 'sd-webui',
    label: 'Stable Diffusion WebUI',
    group: 'pictures',
    adapter: 'stable_diffusion',
    baseUrl: 'http://127.0.0.1:7860',
    billing: 'local',
    needsKey: false,
    contextTokens: 16_000,
    model: 'default',
    note: msg(
      'Makes portraits on this computer, for free. Start the WebUI with --api. The model "default" uses whichever one it has loaded.',
    ),
  },
  {
    id: 'custom',
    label: msg('Other (enter the address)'),
    group: 'other',
    adapter: COMPATIBLE,
    baseUrl: '',
    billing: 'paid',
    needsKey: true,
    contextTokens: 16_000,
    note: msg('Any service or server with an OpenAI-compatible chat completions API works.'),
  },
];

/** OpenAI picture models that no longer answer (retired in 2026). */
export function retiredPictureModel(model: string): boolean {
  return /^(gpt-image-1(-\d{4}-\d{2}-\d{2})?|dall-e-[23])$/i.test(model.trim());
}
