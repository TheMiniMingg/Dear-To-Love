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
  /** One sentence on getting started with this service. */
  note?: string;
};

export const GROUP_LABELS: Record<PresetGroup, string> = {
  local: 'On this computer (free and private)',
  labs: 'AI labs (API key, paid per use)',
  hosted: 'Open models, hosted (API key)',
  pictures: 'Pictures (for character portraits)',
  other: 'Anything else',
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
    note: "Load a model and start the server in LM Studio's Developer tab.",
  },
  {
    ...LOCAL,
    id: 'llamacpp',
    label: 'llama.cpp server',
    adapter: COMPATIBLE,
    baseUrl: 'http://localhost:8080/v1',
    contextTokens: 4096,
    note: 'Start it with llama-server -m your-model.gguf. Any model name works.',
  },
  {
    ...LOCAL,
    id: 'koboldcpp',
    label: 'KoboldCpp',
    adapter: COMPATIBLE,
    baseUrl: 'http://localhost:5001/v1',
    contextTokens: 4096,
    note: 'Start KoboldCpp with a model loaded. Any model name works.',
  },
  {
    ...LOCAL,
    id: 'jan',
    label: 'Jan',
    adapter: COMPATIBLE,
    baseUrl: 'http://localhost:1337/v1',
    contextTokens: 4096,
    note: "Turn on Jan's Local API Server first.",
  },
  {
    ...LOCAL,
    id: 'textgen',
    label: 'text-generation-webui',
    adapter: COMPATIBLE,
    baseUrl: 'http://localhost:5000/v1',
    contextTokens: 4096,
    note: 'Start it with the --api flag and load a model.',
  },
  {
    ...LOCAL,
    id: 'vllm',
    label: 'vLLM',
    adapter: COMPATIBLE,
    baseUrl: 'http://localhost:8000/v1',
    contextTokens: 8192,
    note: 'Use the model name you served, as vllm serve was given it.',
  },
  {
    ...LAB,
    id: 'openai',
    label: 'OpenAI',
    adapter: COMPATIBLE,
    baseUrl: 'https://api.openai.com/v1',
    contextTokens: 128_000,
    note: 'Create a key at platform.openai.com.',
  },
  {
    ...LAB,
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    adapter: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    contextTokens: 128_000,
    model: 'claude-opus-5-5',
    note: 'Create a key at platform.claude.com. Uses Anthropic’s own API.',
  },
  {
    ...LAB,
    id: 'gemini',
    label: 'Google Gemini',
    adapter: COMPATIBLE,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    contextTokens: 128_000,
    note: 'Create a key in Google AI Studio (aistudio.google.com).',
  },
  {
    ...LAB,
    id: 'xai',
    label: 'xAI (Grok)',
    adapter: COMPATIBLE,
    baseUrl: 'https://api.x.ai/v1',
    contextTokens: 128_000,
    note: 'Create a key at console.x.ai.',
  },
  {
    ...LAB,
    id: 'mistral',
    label: 'Mistral AI',
    adapter: COMPATIBLE,
    baseUrl: 'https://api.mistral.ai/v1',
    contextTokens: 32_000,
    note: 'Create a key at console.mistral.ai.',
  },
  {
    ...LAB,
    id: 'deepseek',
    label: 'DeepSeek',
    adapter: COMPATIBLE,
    baseUrl: 'https://api.deepseek.com/v1',
    contextTokens: 64_000,
    note: 'Create a key at platform.deepseek.com.',
  },
  {
    ...HOSTED,
    id: 'openrouter',
    label: 'OpenRouter',
    adapter: COMPATIBLE,
    baseUrl: 'https://openrouter.ai/api/v1',
    note: 'One key reaches hundreds of models, open and closed, with different content rules.',
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
    note: 'Use a Hugging Face access token as the key.',
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
    model: 'gpt-image-1',
    note: "Makes character portraits. OpenAI charges for each picture; the app records every request but can't price pictures.",
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
    note: 'Makes portraits on this computer, for free. Start the WebUI with --api. The model "default" uses whichever one it has loaded.',
  },
  {
    id: 'custom',
    label: 'Other (enter the address)',
    group: 'other',
    adapter: COMPATIBLE,
    baseUrl: '',
    billing: 'paid',
    needsKey: true,
    contextTokens: 16_000,
    note: 'Any service or server with an OpenAI-compatible chat completions API works.',
  },
];
