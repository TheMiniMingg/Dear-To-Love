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
  /**
   * The every-click version, for people who want each step spelled out.
   * Services with an account build it from the shared account steps, with
   * these in place of the shared credit and key steps where they differ.
   */
  detail?: string[];
  credit?: string;
  key?: string;
  /** One more thing worth knowing, after the steps. */
  tip?: string;
};

/** One line of the every-click instructions. */
export type DetailStep = { text: string; command?: string };

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

/** The every-click steps for a service with an account, up to the key. */
const ACCOUNT_DETAIL = {
  open: msg('Choose {getKey} below. It opens {site} in your browser.'),
  signIn: msg('Sign in, or make an account with your email or a Google account.'),
  credit: msg(
    'Add some credit: find Billing on the site and add a card, or buy credit ahead. US$5 lasts a few hundred replies on most recommended models.',
  ),
  key: msg(
    'Make a new key. The button says something like Create key or Create new secret key. Name it Dear to Love so you know later what it is for.',
  ),
  copy: msg(
    'Copy the key right away: most sites show it only once. Keep it private, like a password.',
  ),
};

/** In the guide only: from the instructions to the form. */
export const OPEN_FORM = msg(
  'Back in Dear to Love, choose {setUp} below. It opens the form with the service and address filled in.',
);

/** The steps in the connection form, the same for every service. */
const FORM_DETAIL = {
  paste: msg('Paste the key into {apiKey}.'),
  model: msg(
    'Pick a model under {model}, for example {example}. Any name from the service’s model list works.',
  ),
  localModel: msg('Type the model’s name under {model} as the program shows it. No key is needed.'),
  save: msg(
    'Choose {save}, then {test} beside the new connection. It checks the address, the key and the model, for free.',
  ),
  play: msg(
    'Start a story. Your first connection writes the replies; {send} shows one short sample first, for a fraction of a cent.',
  ),
};

/** Where a step mentions it, a site's or program's button names may differ a little. */
export const DETAIL_NOTE = msg(
  'Sites and programs rename their buttons now and then. If one is called something else, look for the closest match.',
);

/**
 * The every-click instructions for a service: in the guide they lead to
 * Set it up here; in the connection form, the form is already open.
 */
export function detailSteps(guide: ServiceGuide, where: 'guide' | 'form'): DetailStep[] {
  const out: DetailStep[] = [];
  const add = (text: string, command?: string) => out.push(command ? { text, command } : { text });
  const toForm = () => {
    if (where === 'guide') add(OPEN_FORM);
  };
  if (guide.site) {
    add(ACCOUNT_DETAIL.open);
    add(ACCOUNT_DETAIL.signIn);
    add(guide.credit ?? ACCOUNT_DETAIL.credit);
    add(guide.key ?? ACCOUNT_DETAIL.key);
    add(ACCOUNT_DETAIL.copy);
    toForm();
    add(FORM_DETAIL.paste);
    add(FORM_DETAIL.model);
    add(FORM_DETAIL.save);
    if (guide.preset !== 'openai-images') add(FORM_DETAIL.play);
  } else {
    for (const step of guide.detail ?? guide.steps.slice(0, -1)) {
      add(step, step.endsWith(':') ? guide.command : undefined);
    }
    toForm();
    if (guide.preset !== 'sd-webui') add(FORM_DETAIL.localModel);
    add(FORM_DETAIL.save);
    if (guide.preset !== 'sd-webui') add(FORM_DETAIL.play);
  }
  if (guide.tip) add(guide.tip);
  return out;
}

export const LABS: ServiceGuide[] = [
  {
    preset: 'openai',
    site: 'platform.openai.com',
    steps: [],
    tip: msg(
      'If OpenAI answers that your organization must be verified, verify it in OpenAI’s settings (Organization, then General) and try again a few minutes later.',
    ),
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
    credit: msg(
      'Google AI Studio has a free tier with low daily limits, so you can try it before paying. Google may use what you send on the free tier to improve its products; set up billing in AI Studio to lift the limits.',
    ),
    key: msg('Choose Get API key, then Create API key. Name it Dear to Love.'),
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
    credit: msg(
      'Buy a few dollars of credit on the Credits page. A few models are free, with low limits.',
    ),
    key: msg(
      'Open Keys and choose Create Key. You can give the key its own spending limit there, which is a good idea.',
    ),
    tip: msg(
      'Each model’s page on OpenRouter shows its price, its content rules and the exact name to type.',
    ),
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
    key: msg(
      'Open Access Tokens and create a new fine-grained token that may make calls to Inference Providers. Name it Dear to Love.',
    ),
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
    detail: [
      msg(
        'Choose {download} below and install Ollama. Open it once; after that it runs quietly in the background.',
      ),
      msg(
        'Open a terminal. On Windows, press Start, type Terminal and press Enter. On a Mac, press Cmd+Space, type Terminal and press Enter.',
      ),
      msg('Type this and press Enter. The model is several GB, so it takes a few minutes:'),
      msg(
        'Not much memory? {small} runs on computers with 8 GB. With a graphics card that has 24 GB, {large} writes much better.',
      ),
    ],
    command: 'ollama pull gemma4:12b',
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
    detail: [
      msg('Choose {download} below, install LM Studio and open it.'),
      msg(
        'Find a model in its Discover tab (the magnifying glass), such as Gemma 4 12B, and download it.',
      ),
      msg(
        'In the Developer tab, load the model with a context length of 8192 or more, then switch the server on.',
      ),
    ],
    tip: msg(
      'Set {context} under Advanced to the context length the model was loaded with, so long stories fit.',
    ),
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
    credit: msg('Already have an OpenAI key for stories? The same key works: skip to pasting it.'),
    tip: msg('Settings → Pictures chooses which connection makes pictures, or none.'),
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

/** A model the guide recommends, with a button that sets it up. */
export type ModelPick = { title: string; preset: string; model: string; why: string };

/** A few good places to start (checked November 2026; prices in models.ts). */
export const PICKS: ModelPick[] = [
  {
    title: msg('Best place to start'),
    preset: 'openai',
    model: 'gpt-6.1-terra',
    why: msg(
      'Clear, natural stories, written quickly. The same key makes portraits and item pictures.',
    ),
  },
  {
    title: msg('Long stories that stay consistent'),
    preset: 'anthropic',
    model: 'claude-sonnet-5-5',
    why: msg(
      'Keeps characters, threads and tone straight over long stories. Claude Opus 5.5 is stronger still, at about twice the price.',
    ),
  },
  {
    title: msg('Cheap and good'),
    preset: 'gemini',
    model: 'gemini-3.8-flash',
    why: msg('Quick and capable, and Google has a free tier to try it first.'),
  },
  {
    title: msg('Many models, looser rules'),
    preset: 'openrouter',
    model: 'deepseek/deepseek-v4.1-flash',
    why: msg(
      'One key for hundreds of models, including open ones with looser content rules. A favourite for roleplay.',
    ),
  },
  {
    title: msg('Free and private'),
    preset: 'ollama',
    model: 'gemma4:12b',
    why: msg('Runs on your own computer with about 16 GB of memory. Nothing leaves it.'),
  },
];

/** The models in the guide's price table, cheapest first. */
export const PRICED = [
  'gpt-6-luna',
  'claude-haiku-5-5',
  'mistral-large-latest',
  'gemini-3.8-flash',
  'gpt-6.1-terra',
  'grok-4.7',
  'claude-sonnet-5-5',
  'gpt-6.1-sol',
  'claude-opus-5-5',
  'gpt-6-astra',
];
