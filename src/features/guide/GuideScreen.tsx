import { useState, type ReactNode } from 'react';
import { commands, errorMessage, runErrorMessage } from '../../api/commands';
import { useUiStore } from '../../app/store';
import { GROUP_LABELS, PRESETS } from '../settings/presets';
import { msg, t, tr } from '../../i18n';
import {
  ACCOUNT_STEPS,
  HOSTED,
  LABS,
  LOCAL,
  PICTURES,
  type GuideLink,
  type ServiceGuide,
} from './guide';

const SECTIONS = [
  { id: 'guide-start', title: msg('Play right away') },
  { id: 'guide-choose', title: msg('Choose where replies come from') },
  { id: 'guide-connect', title: msg('Connect a service') },
  { id: 'guide-test', title: msg('Test it and start playing') },
  { id: 'guide-pictures', title: msg('Pictures (optional)') },
  { id: 'guide-costs', title: msg('Keep costs in check') },
  { id: 'guide-keys', title: msg('Your keys stay on this computer') },
  { id: 'guide-problems', title: msg('If something goes wrong') },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const n = SECTIONS.findIndex((s) => s.id === id);
  const s = SECTIONS[n]!;
  return (
    <section className="settings-section guide-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} tabIndex={-1}>
        {n + 1}. {t(s.title)}
      </h2>
      {children}
    </section>
  );
}

const code = (name: string) => <code>{name}</code>;

/**
 * Which model to pick, folded away until someone opens it. Names are the
 * services' own and change often, so the services' lists are a click away.
 */
function ModelPicks({ onError }: { onError: (e: string) => void }) {
  return (
    <details className="guide-models" data-testid="guide-models">
      <summary>{t('Which model should I use?')}</summary>
      <p className="muted small">
        {t(
          'Suggestions, checked in November 2026. Names change often: the service’s model list has the current ones, and any model you like works.',
        )}
      </p>
      <dl className="guide-picks">
        <dt>{t('Stories and pictures with one key')}</dt>
        <dd>
          {tr(
            'OpenAI. {terra} writes clear, natural stories quickly, {sol} is stronger for long, twisting plots, and {astra} is the most capable and costs the most. {pictures} makes portraits and item pictures with the same key.',
            {
              terra: code('gpt-6.1-terra'),
              sol: code('gpt-6.1-sol'),
              astra: code('gpt-6-astra'),
              pictures: code('gpt-image-2.6-flare'),
            },
          )}
        </dd>
        <dt>{t('Long stories that stay consistent')}</dt>
        <dd>
          {tr(
            'Anthropic’s Claude. {opus} keeps characters, threads and tone straight over long stories, and {sonnet} costs less for everyday play. Claude doesn’t make pictures, so add a picture connection too.',
            { opus: code('claude-opus-5-5'), sonnet: code('claude-sonnet-5-5') },
          )}
        </dd>
        <dt>{t('Cheap and quick')}</dt>
        <dd>
          {tr(
            '{luna}, {flash} or {haiku}: a fraction of a cent per reply, good for trying things out and for light stories.',
            {
              luna: code('gpt-6-luna'),
              flash: code('gemini-3.6-flash'),
              haiku: code('claude-haiku-5-5'),
            },
          )}
        </dd>
        <dt>{t('Many models with one key')}</dt>
        <dd>
          {t(
            'OpenRouter offers hundreds of models, including open ones with looser content rules, and its roleplay list shows what other players use most.',
          )}
        </dd>
        <dt>{t('Free and private')}</dt>
        <dd>
          {tr(
            'On this computer with Ollama or LM Studio. {small} runs on almost any computer. Models of 12 to 14B write much better and want about 16 GB of memory; 27 to 32B models need a strong graphics card.',
            { small: code('llama3.2') },
          )}
        </dd>
        <dt>{t('Pictures')}</dt>
        <dd>
          {tr(
            '{flare} is quick for portraits and items, and {sunburst} takes more care over detail. Free on this computer: Stable Diffusion WebUI.',
            { flare: code('gpt-image-2.6-flare'), sunburst: code('gpt-image-2.6-sunburst') },
          )}
        </dd>
      </dl>
      <Links
        links={[
          { id: 'openai-models', label: 'OpenAI' },
          { id: 'anthropic-models', label: 'Anthropic' },
          { id: 'gemini-models', label: 'Gemini' },
          { id: 'openrouter-roleplay', label: 'OpenRouter' },
          { id: 'ollama-models', label: 'Ollama' },
        ]}
        onError={onError}
      />
    </details>
  );
}

/** Buttons that open a service's pages in the browser. */
function Links({ links, onError }: { links: GuideLink[]; onError: (e: string) => void }) {
  return (
    <div className="button-row guide-links">
      {links.map((l) => (
        <button
          key={l.id}
          type="button"
          title={t('Opens in your browser')}
          onClick={() => void commands.openGuideLink(l.id).catch((e) => onError(errorMessage(e)))}
        >
          {t(l.label)} ↗
        </button>
      ))}
    </div>
  );
}

function Service({
  guide,
  onSetUp,
  onError,
}: {
  guide: ServiceGuide;
  onSetUp: (preset: string) => void;
  onError: (e: string) => void;
}) {
  const preset = PRESETS.find((p) => p.id === guide.preset);
  if (!preset) return null;
  const steps = guide.site ? [...ACCOUNT_STEPS.slice(0, 2), ...guide.steps, ACCOUNT_STEPS[2]!] : [];
  return (
    <details className="guide-service" data-testid={`guide-${guide.preset}`}>
      <summary>
        <strong>{t(preset.label)}</strong>
        <span className="muted small">
          {preset.billing === 'local'
            ? t('free, on this computer')
            : preset.group === 'pictures'
              ? t('API key, paid per picture')
              : t('API key, paid per use')}
        </span>
      </summary>
      <ol className="guide-steps">
        {(guide.site ? steps : guide.steps).map((step, i) => (
          <li key={i}>
            {t(step, { site: guide.site ?? '' })}
            {guide.command && step.endsWith(':') && (
              <code className="guide-command">{guide.command}</code>
            )}
          </li>
        ))}
      </ol>
      <div className="button-row">
        <Links links={guide.links} onError={onError} />
        <button type="button" className="primary" onClick={() => onSetUp(guide.preset)}>
          {t('Set it up here')}
        </button>
      </div>
    </details>
  );
}

/**
 * Setup guide: how to play right away, choose and connect an AI service
 * (with each service's own pages one click away), make portraits, keep
 * costs in check and fix the usual problems.
 */
export function GuideScreen() {
  const goBack = useUiStore((s) => s.goBack);
  const navigate = useUiStore((s) => s.navigate);
  const addConnection = useUiStore((s) => s.addConnection);
  const [error, setError] = useState<string | null>(null);

  const setUp = (preset: string) => addConnection(preset);
  const jump = (id: SectionId) => {
    const el = document.getElementById(`${id}-title`);
    el?.scrollIntoView({ block: 'start' });
    el?.focus({ preventScroll: true });
  };
  const services = (list: ServiceGuide[]) =>
    list.map((g) => <Service key={g.preset} guide={g} onSetUp={setUp} onError={setError} />);

  return (
    <section className="screen guide" aria-labelledby="guide-title">
      <div className="screen-header">
        <button type="button" onClick={goBack}>
          {t('Back')}
        </button>
        <h1 id="guide-title">{t('Setup guide')}</h1>
        <span />
      </div>
      <p className="guide-lead">
        {t(
          'You can play right away: the built-in offline storyteller needs nothing. To have an AI model write your stories, connect one of the services below. It takes a few minutes, and you can switch any time.',
        )}
      </p>
      <nav className="guide-toc" aria-label={t('On this page')}>
        <ol>
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <button type="button" className="link-button" onClick={() => jump(s.id)}>
                {i + 1}. {t(s.title)}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <Section id="guide-start">
        <ol className="guide-steps">
          <li>
            {tr('In the library, choose {newStory}, pick a story and choose {start}.', {
              newStory: <strong>{t('New story')}</strong>,
              start: <strong>{t('Start story')}</strong>,
            })}
          </li>
          <li>
            {t(
              'The offline storyteller writes the replies: simple ones, free and without internet. You can switch to an AI model later, even in the middle of a story.',
            )}
          </li>
        </ol>
        <button type="button" onClick={() => navigate({ name: 'quickstart' })}>
          {t('New story')}
        </button>
      </Section>

      <Section id="guide-choose">
        <div className="guide-options">
          <div className="guide-option">
            <h3>{t(GROUP_LABELS.local)}</h3>
            <p>
              {t(
                'Nothing leaves your computer and nothing costs money. Small models run on most recent computers and write simpler stories; bigger ones write better but need a strong graphics card or a lot of memory.',
              )}
            </p>
          </div>
          <div className="guide-option">
            <h3>{t(GROUP_LABELS.labs)}</h3>
            <p>
              {t(
                'The strongest writers. You pay the company for each reply, usually a fraction of a cent to a few cents. Each company has its own rules on what stories it will write.',
              )}
            </p>
          </div>
          <div className="guide-option">
            <h3>{t(GROUP_LABELS.hosted)}</h3>
            <p>
              {t(
                'Open models run for you by a service: often cheaper than the labs, with many models to choose from. Rules on content differ from model to model and service to service.',
              )}
            </p>
          </div>
        </div>
        <ModelPicks onError={setError} />
      </Section>

      <Section id="guide-connect">
        <p className="muted">
          {t(
            'Pick one and open it for its steps. Links open in your browser; Set it up here opens a new connection with the service filled in.',
          )}
        </p>
        <h3>{t(GROUP_LABELS.local)}</h3>
        {services(LOCAL)}
        <h3>{t(GROUP_LABELS.labs)}</h3>
        {services(LABS)}
        <h3>{t(GROUP_LABELS.hosted)}</h3>
        {services(HOSTED)}
        <p className="muted small">
          {t(
            'Something else? Any service or program with an OpenAI-compatible API works: choose Add connection in Settings, then Other, and type its address.',
          )}
        </p>
      </Section>

      <Section id="guide-test">
        <ol className="guide-steps">
          <li>
            {tr(
              'In Settings, under AI connections, {test} checks the address and key for free. {send} asks the model for one short reply.',
              {
                test: <strong>{t('Test connection')}</strong>,
                send: <strong>{t('Send test message')}</strong>,
              },
            )}
          </li>
          <li>
            {t(
              "Your first connection becomes the storyteller for every story. Settings → Storyteller changes it, and a story can have its own: click the storyteller's name above the story.",
            )}
          </li>
          <li>
            {t(
              'Programs on this computer often load a model with a short memory (4096 tokens). If replies forget the start of the story, raise the context size in the program and the context limit of the connection.',
            )}
          </li>
        </ol>
        <button type="button" onClick={() => navigate({ name: 'settings' })}>
          {t('Open Settings')}
        </button>
      </Section>

      <Section id="guide-pictures">
        <p>
          {t(
            'A picture connection draws portraits of characters and pictures of items from their descriptions. Pictures are always asked for as safe for work, and you can use your own pictures instead.',
          )}
        </p>
        {services(PICTURES)}
        <p className="muted small">
          {t(
            'Your first picture connection is put to use; Settings → Pictures chooses another, or none.',
          )}
        </p>
      </Section>

      <Section id="guide-costs">
        <ul className="guide-steps">
          <li>
            {tr(
              '{usage} estimates what each paid connection has cost, and can warn you or pause paid replies at a monthly limit you choose.',
              { usage: <strong>{t('Usage & budget')}</strong> },
            )}
          </li>
          <li>
            {t(
              "Set a spending limit on the service's own site too: the app can't see your balance.",
            )}
          </li>
        </ul>
        <div className="button-row">
          <button type="button" onClick={() => navigate({ name: 'usage' })}>
            {t('Usage & budget')}
          </button>
          <Links
            links={[
              { id: 'openai-limits', label: 'OpenAI' },
              { id: 'anthropic-limits', label: 'Anthropic' },
            ]}
            onError={setError}
          />
        </div>
      </Section>

      <Section id="guide-keys">
        <p>
          {t(
            "API keys are kept in your computer's own password store (Credential Manager on Windows, Keychain on a Mac, the Secret Service on Linux) and are only sent to the service they belong to. They are never put in stories, storypacks, backups, exports or diagnostics reports.",
          )}
        </p>
      </Section>

      <Section id="guide-problems">
        <dl className="guide-problems">
          <dt>{runErrorMessage('AUTH_FAILED')}</dt>
          <dd>{t('The key is wrong or was revoked. Edit the connection and paste a new one.')}</dd>
          <dt>{runErrorMessage('RATE_LIMITED')}</dt>
          <dd>
            {t(
              "Wait a minute and retry, or add credit on the service's site. New accounts often have low limits.",
            )}
          </dd>
          <dt>{runErrorMessage('PROVIDER_UNREACHABLE')}</dt>
          <dd>
            {t(
              'For a program on this computer, check that it is running and its server is on. Otherwise check your internet connection and the address.',
            )}
          </dd>
          <dt>{runErrorMessage('PROVIDER_ERROR')}</dt>
          <dd>
            {t(
              "Often the model name: type it exactly as the service's model list shows it. The message under the reply says more.",
            )}
          </dd>
        </dl>
        <p>
          {tr(
            '{diagnostics} checks the app and your connections, and can make a report to share that leaves out keys and story text.',
            { diagnostics: <strong>{t('Diagnostics')}</strong> },
          )}
        </p>
        <button type="button" onClick={() => navigate({ name: 'diagnostics' })}>
          {t('Diagnostics')}
        </button>
      </Section>
    </section>
  );
}
