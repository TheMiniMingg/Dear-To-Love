import { msg } from '../../i18n';
import links from './links.json';

/** A page the guide can open in the browser (its name in links.json). */
export type LinkId = keyof typeof links;

export type GuideLink = { id: LinkId; label: string };

/** How to get one service working, step by step. */
export type ServiceGuide = {
  /** The connection preset it sets up (settings/presets.ts). */
  preset: string;
  /** For services with an account: the site where keys are made. */
  site?: string;
  /** Steps of its own; services with an account get the account steps too. */
  steps: string[];
  links: GuideLink[];
  /** Typed in a terminal; shown as code. */
  command?: string;
};

const KEY = msg('Get a key');
const MODELS = msg('Model list');
const DOWNLOAD = msg('Download');
const DOCS = msg('Instructions');

/** The steps every service with an account and an API key shares. */
export const ACCOUNT_STEPS = [
  msg('Make an account at {site} and set up billing (credit you buy ahead, or a card).'),
  msg('Make an API key and copy it. Most sites show a key only once, so keep this page open.'),
  msg('Choose Set it up here, paste the key, and type a model name from the service’s model list.'),
];

export const LABS: ServiceGuide[] = [
  {
    preset: 'openai',
    site: 'platform.openai.com',
    steps: [],
    links: [
      { id: 'openai-keys', label: KEY },
      { id: 'openai-models', label: MODELS },
    ],
  },
  {
    preset: 'anthropic',
    site: 'platform.claude.com',
    steps: [msg('The model field suggests a Claude model; you can type another.')],
    links: [
      { id: 'anthropic-keys', label: KEY },
      { id: 'anthropic-models', label: MODELS },
    ],
  },
  {
    preset: 'gemini',
    site: 'aistudio.google.com',
    steps: [msg('Sign in with a Google account, then choose Get API key in Google AI Studio.')],
    links: [
      { id: 'gemini-keys', label: KEY },
      { id: 'gemini-models', label: MODELS },
    ],
  },
  {
    preset: 'xai',
    site: 'console.x.ai',
    steps: [],
    links: [
      { id: 'xai-keys', label: KEY },
      { id: 'xai-models', label: MODELS },
    ],
  },
  {
    preset: 'mistral',
    site: 'console.mistral.ai',
    steps: [],
    links: [
      { id: 'mistral-keys', label: KEY },
      { id: 'mistral-models', label: MODELS },
    ],
  },
  {
    preset: 'deepseek',
    site: 'platform.deepseek.com',
    steps: [],
    links: [
      { id: 'deepseek-keys', label: KEY },
      { id: 'deepseek-models', label: MODELS },
    ],
  },
];

export const HOSTED: ServiceGuide[] = [
  {
    preset: 'openrouter',
    site: 'openrouter.ai',
    steps: [
      msg(
        'One key reaches hundreds of models from many companies. Each model page shows its price and the name to type.',
      ),
    ],
    links: [
      { id: 'openrouter-keys', label: KEY },
      { id: 'openrouter-models', label: MODELS },
    ],
  },
  {
    preset: 'groq',
    site: 'console.groq.com',
    steps: [],
    links: [
      { id: 'groq-keys', label: KEY },
      { id: 'groq-models', label: MODELS },
    ],
  },
  {
    preset: 'together',
    site: 'api.together.ai',
    steps: [],
    links: [
      { id: 'together-keys', label: KEY },
      { id: 'together-models', label: MODELS },
    ],
  },
  {
    preset: 'fireworks',
    site: 'fireworks.ai',
    steps: [],
    links: [
      { id: 'fireworks-keys', label: KEY },
      { id: 'fireworks-models', label: MODELS },
    ],
  },
  {
    preset: 'deepinfra',
    site: 'deepinfra.com',
    steps: [],
    links: [
      { id: 'deepinfra-keys', label: KEY },
      { id: 'deepinfra-models', label: MODELS },
    ],
  },
  {
    preset: 'huggingface',
    site: 'huggingface.co',
    steps: [
      msg(
        'The key is an access token: make a fine-grained one that may make calls to Inference Providers.',
      ),
    ],
    links: [
      { id: 'huggingface-keys', label: KEY },
      { id: 'huggingface-models', label: MODELS },
    ],
  },
];

const LOCAL_LAST = msg(
  'Choose Set it up here. The address is filled in; type the model’s name as the program shows it.',
);
const ANY_NAME = msg('Choose Set it up here. The address is filled in, and any model name works.');

export const LOCAL: ServiceGuide[] = [
  {
    preset: 'ollama',
    steps: [
      msg('Download and install Ollama. It runs in the background.'),
      msg('Open a terminal and download a model with this command (or pick one from its list):'),
      LOCAL_LAST,
    ],
    command: 'ollama pull llama3.2',
    links: [
      { id: 'ollama-download', label: DOWNLOAD },
      { id: 'ollama-models', label: MODELS },
    ],
  },
  {
    preset: 'lmstudio',
    steps: [
      msg('Install LM Studio and download a model in it.'),
      msg('In the Developer tab, load the model and switch on the server.'),
      LOCAL_LAST,
    ],
    links: [
      { id: 'lmstudio-download', label: DOWNLOAD },
      { id: 'lmstudio-docs', label: DOCS },
    ],
  },
  {
    preset: 'jan',
    steps: [
      msg('Install Jan and download a model in it.'),
      msg(
        'In Jan’s Settings, open Local API Server, choose the model and start the server. If you give it an API key, paste the same key here.',
      ),
      LOCAL_LAST,
    ],
    links: [
      { id: 'jan-download', label: DOWNLOAD },
      { id: 'jan-docs', label: DOCS },
    ],
  },
  {
    preset: 'koboldcpp',
    steps: [
      msg('Download KoboldCpp and a model file (GGUF), and start it with the model.'),
      ANY_NAME,
    ],
    links: [{ id: 'koboldcpp-download', label: DOWNLOAD }],
  },
  {
    preset: 'llamacpp',
    steps: [msg('Get llama.cpp and a model file (GGUF), and start its server:'), ANY_NAME],
    command: 'llama-server -m your-model.gguf',
    links: [{ id: 'llamacpp-download', label: DOWNLOAD }],
  },
  {
    preset: 'textgen',
    steps: [msg('Install text-generation-webui, start it with --api and load a model.'), ANY_NAME],
    links: [{ id: 'textgen-download', label: DOWNLOAD }],
  },
  {
    preset: 'vllm',
    steps: [
      msg('vLLM needs a strong graphics card. Start it with the model you want:'),
      msg('Choose Set it up here and type the same model name.'),
    ],
    command: 'vllm serve <model>',
    links: [{ id: 'vllm-docs', label: DOCS }],
  },
];

export const PICTURES: ServiceGuide[] = [
  {
    preset: 'openai-images',
    site: 'platform.openai.com',
    steps: [
      msg(
        'Uses an OpenAI key (the same one works). OpenAI charges for each picture, and may ask you to verify your organization before its newest picture models work.',
      ),
    ],
    links: [
      { id: 'openai-keys', label: KEY },
      { id: 'openai-images', label: DOCS },
    ],
  },
  {
    preset: 'sd-webui',
    steps: [
      msg('Install Stable Diffusion WebUI (or its Forge version) and a model for it.'),
      msg(
        'Start it with --api: add it to COMMANDLINE_ARGS in webui-user.bat (Windows) or webui-user.sh (Mac and Linux).',
      ),
      msg('Choose Set it up here. The model “default” uses whichever one the WebUI has loaded.'),
    ],
    links: [
      { id: 'sd-webui-download', label: DOWNLOAD },
      { id: 'sd-forge-download', label: msg('Forge version') },
    ],
  },
];
