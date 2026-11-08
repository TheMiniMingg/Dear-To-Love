import { useState, type ReactNode } from 'react';
import { runErrorMessage } from '../../api/commands';
import { useUiStore } from '../../app/store';
import { GROUP_LABELS, PRESETS, type PresetGroup } from '../settings/presets';
import { CHECKED, formatHundred, formatReplyCost, knownModel, replyCost } from '../settings/models';
import { msg, t, tr } from '../../i18n';
import {
  ACCOUNT_STEPS,
  HOSTED,
  LABS,
  LOCAL,
  PICKS,
  PICTURES,
  VOICES,
  PRICED,
  type ModelPick,
  type ServiceGuide,
} from './guide';
import { Links, StepByStep, code } from './StepByStep';

const SECTIONS = [
  { id: 'guide-start', title: msg('The short version') },
  { id: 'guide-picks', title: msg('Recommended models') },
  { id: 'guide-costs', title: msg('Costs and your budget') },
  { id: 'guide-connect', title: msg('Connect a service') },
  { id: 'guide-test', title: msg('Test it and start playing') },
  { id: 'guide-pictures', title: msg('Pictures (optional)') },
  { id: 'guide-voices', title: msg('Voices (optional)') },
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

/** What one reply costs with a model, or that it is free. */
function costOf(preset: string, model: string): string {
  if (PRESETS.find((p) => p.id === preset)?.billing === 'local') return t('free');
  const known = knownModel(model);
  return known?.price
    ? t('about {cost} a reply', { cost: formatReplyCost(replyCost(known.price, known.thinks)) })
    : t('price on its model page');
}

function Pick({ pick, onSetUp }: { pick: ModelPick; onSetUp: (p: ModelPick) => void }) {
  const preset = PRESETS.find((p) => p.id === pick.preset);
  return (
    <div className="guide-pick" data-testid={`pick-${pick.preset}`}>
      <h3>{t(pick.title)}</h3>
      <p className="guide-pick-model">
        <span className="muted">{t(preset?.label ?? '')}</span>
        {code(pick.model)}
      </p>
      <p>{t(pick.why)}</p>
      <p className="guide-pick-cost">{costOf(pick.preset, pick.model)}</p>
      <button
        type="button"
        aria-label={t('Set up {model}', { model: pick.model })}
        onClick={() => onSetUp(pick)}
      >
        {t('Set up')}
      </button>
    </div>
  );
}

/** What a reply costs with each listed model, well into a story. */
function PriceTable() {
  return (
    <div className="table-scroll">
      <table className="guide-prices">
        <thead>
          <tr>
            <th scope="col">{t('Model')}</th>
            <th scope="col">{t('One reply')}</th>
            <th scope="col">{t('100 replies')}</th>
          </tr>
        </thead>
        <tbody>
          {PRICED.map((id) => {
            const m = knownModel(id);
            if (!m?.price) return null;
            const cost = replyCost(m.price, m.thinks);
            return (
              <tr key={id}>
                <th scope="row">
                  {code(id)} <span className="muted small">{t(m.note)}</span>
                </th>
                <td>{formatReplyCost(cost)}</td>
                <td>{formatHundred(cost)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
  const recommended = PICKS.some((p) => p.preset === guide.preset);
  return (
    <details className="guide-service" data-testid={`guide-${guide.preset}`}>
      <summary>
        <strong>{t(preset.label)}</strong>
        <span className="muted small">
          {preset.billing === 'local'
            ? t('free, on this computer')
            : preset.group === 'pictures'
              ? t('API key, paid per picture')
              : preset.group === 'voices'
                ? t('API key, paid by the character read')
                : t('API key, paid per use')}
        </span>
        {recommended && <span className="badge">{t('Recommended')}</span>}
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
      <StepByStep guide={guide} where="guide" onError={onError} />
      <div className="button-row">
        <Links links={guide.links} onError={onError} />
        <button type="button" className="primary" onClick={() => onSetUp(guide.preset)}>
          {t('Set it up here')}
        </button>
      </div>
    </details>
  );
}

const GROUP_INTRO: Record<Exclude<PresetGroup, 'pictures' | 'voices' | 'other'>, string> = {
  local: msg(
    'Nothing leaves your computer and nothing costs money. Small models run on most recent computers and write simpler stories; bigger ones write better but need a strong graphics card or a lot of memory.',
  ),
  labs: msg(
    'The strongest writers. You pay the company for each reply, usually a fraction of a cent to a few cents. Each company has its own rules on what stories it will write.',
  ),
  hosted: msg(
    'Open models run for you by a service: often cheaper than the labs, with many models to choose from. Rules on content differ from model to model and service to service.',
  ),
};

/**
 * Setup guide: the essentials first (play now, what to pick, what it
 * costs), then each service step by step, with an every-click version
 * folded inside, and the usual problems at the end.
 */
export function GuideScreen() {
  const goBack = useUiStore((s) => s.goBack);
  const navigate = useUiStore((s) => s.navigate);
  const addConnection = useUiStore((s) => s.addConnection);
  const [error, setError] = useState<string | null>(null);

  const setUp = (preset: string, model?: string) => addConnection(preset, model);
  const jump = (id: SectionId) => {
    const el = document.getElementById(`${id}-title`);
    // Land just below the contents bar, however many rows it wraps to.
    const bar = document.querySelector<HTMLElement>('.guide-toc');
    if (el) el.style.scrollMarginTop = `${(bar?.offsetHeight ?? 0) + 12}px`;
    el?.scrollIntoView?.({ block: 'start' });
    el?.focus({ preventScroll: true });
  };
  const services = (list: ServiceGuide[]) =>
    list.map((g) => (
      <Service key={g.preset} guide={g} onSetUp={(p) => setUp(p)} onError={setError} />
    ));

  return (
    <section className="screen guide" aria-labelledby="guide-title">
      <div className="screen-header">
        <button type="button" onClick={goBack}>
          {t('Back')}
        </button>
        <h1 id="guide-title">{t('Setup guide')}</h1>
        <span />
      </div>
      <nav className="guide-toc" aria-label={t('On this page')}>
        <ol>
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <button type="button" className="chip chip-button" onClick={() => jump(s.id)}>
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
        <div className="guide-options guide-essentials">
          <div className="guide-option">
            <h3>{t('Play free, right now')}</h3>
            <p>
              {tr(
                'The built-in offline storyteller needs nothing: no account, no internet. In the library, choose {newStory}, pick a story and choose {start}.',
                {
                  newStory: <strong>{t('Preset Story')}</strong>,
                  start: <strong>{t('Start story')}</strong>,
                },
              )}
            </p>
            <button type="button" onClick={() => navigate({ name: 'quickstart' })}>
              {t('Preset Story')}
            </button>
          </div>
          <div className="guide-option">
            <h3>{t('Better stories: connect an AI')}</h3>
            <p>
              {t(
                'Takes about five minutes. Most services cost 1 to 3 cents a reply in a long story; models on your own computer are free. You can switch any time, even mid-story.',
              )}
            </p>
            <button type="button" onClick={() => jump('guide-picks')}>
              {t('See recommended models')}
            </button>
          </div>
          <div className="guide-option">
            <h3>{t('Stay within budget')}</h3>
            <p>
              {tr(
                '{usage} estimates what each reply cost and can pause paid replies at a monthly limit you choose. Set a limit on the service’s own site too.',
                { usage: <strong>{t('Usage & budget')}</strong> },
              )}
            </p>
            <button type="button" onClick={() => navigate({ name: 'usage' })}>
              {t('Usage & budget')}
            </button>
          </div>
          <div className="guide-option">
            <h3>{t('Your keys stay here')}</h3>
            <p>
              {t(
                "API keys are kept in your computer's own password store and sent only to the service they belong to. Never in stories, exports or reports.",
              )}
            </p>
          </div>
        </div>
      </Section>

      <Section id="guide-picks">
        <p className="muted">
          {t(
            'Good places to start, checked {checked}. Set up opens a new connection with the service and model filled in; you paste the key.',
            { checked: t(CHECKED) },
          )}
        </p>
        <div className="guide-picks">
          {PICKS.map((p) => (
            <Pick key={p.preset} pick={p} onSetUp={(x) => setUp(x.preset, x.model)} />
          ))}
        </div>
        <p className="muted small">
          {t(
            'Names change often: each service’s model list has the current ones, and any model you like works. The connection form suggests a few more for each service.',
          )}
        </p>
        <div className="guide-section-links" data-testid="guide-picks-links">
          <Links
            links={[
              { id: 'openai-models', label: 'OpenAI' },
              { id: 'anthropic-models', label: 'Anthropic' },
              { id: 'gemini-models', label: 'Gemini' },
              { id: 'openrouter-roleplay', label: msg('OpenRouter roleplay list') },
              { id: 'ollama-models', label: 'Ollama' },
            ]}
            onError={setError}
          />
        </div>
      </Section>

      <Section id="guide-costs">
        <p>
          {t(
            'Paid services charge for the words they read and write. Each reply sends the story so far, up to the connection’s context limit, so replies cost a little more as a story grows.',
          )}
        </p>
        <PriceTable />
        <p className="muted small">
          {t(
            'For a reply well into a story: about 12,000 tokens read and 600 written, plus a little thinking for models that think first. Early replies cost much less. List prices checked {checked}; the services’ pricing pages have the current ones.',
            { checked: t(CHECKED) },
          )}
        </p>
        <ul className="guide-steps">
          <li>
            {tr(
              '{usage} shows what each connection has cost, warns you near a monthly limit you choose, and can pause paid replies when it is reached.',
              { usage: <strong>{t('Usage & budget')}</strong> },
            )}
          </li>
          <li>
            {tr(
              'It needs each model’s prices. Under Prices there, {listed} fills them in for the models this guide lists; for others, copy them from the service’s pricing page.',
              { listed: <strong>{t('Use the listed prices')}</strong> },
            )}
          </li>
          <li>
            {t(
              "Set a spending limit on the service's own site too: the app can't see your balance, and that limit is the one that really stops charges.",
            )}
          </li>
          <li>
            {t(
              'A lower context limit (the connection’s Advanced settings) keeps long stories cheaper; older parts of the story are summarized to fit.',
            )}
          </li>
        </ul>
        <div className="button-row">
          <button type="button" onClick={() => navigate({ name: 'usage' })}>
            {t('Usage & budget')}
          </button>
          <Links
            links={[
              { id: 'openai-limits', label: msg('OpenAI limits') },
              { id: 'anthropic-limits', label: msg('Anthropic limits') },
              { id: 'openrouter-keys', label: msg('OpenRouter key limits') },
            ]}
            onError={setError}
          />
        </div>
      </Section>

      <Section id="guide-connect">
        <p className="muted">
          {t(
            'Pick one and open it for its steps; open Step by step inside for every click. Links open in your browser; Set it up here opens a new connection with the service filled in.',
          )}
        </p>
        {(['local', 'labs', 'hosted'] as const).map((g) => (
          <div key={g} className="guide-group">
            <h3>{t(GROUP_LABELS[g])}</h3>
            <p className="muted small">{t(GROUP_INTRO[g])}</p>
            {services(g === 'local' ? LOCAL : g === 'labs' ? LABS : HOSTED)}
          </div>
        ))}
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

      <Section id="guide-voices">
        <p>
          {t(
            'Replies can be read aloud with the computer’s own voices, for free. For AI voices (a narrator and a voice for each character, including voices you clone), connect a voice service and make a voice pack in Settings → Sound. Sound can be turned off there too.',
          )}
        </p>
        {services(VOICES)}
        <p className="muted small">
          {t(
            'Only the text being read is sent to the voice service. A voice pack can be saved to a file and shared; it names the voices only, never your key.',
          )}
        </p>
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
          <dt>{runErrorMessage('CONTENT_FILTERED')}</dt>
          <dd>
            {t(
              'The service’s rules stopped this reply. Try another reply, change the action, or use a model with looser rules, such as one on OpenRouter or your own computer.',
            )}
          </dd>
          <dt>{t('A reply stops halfway or comes back empty')}</dt>
          <dd>
            {t(
              'Raise Longest reply in the connection’s Advanced settings. Models that think first use part of it for their thinking.',
            )}
          </dd>
        </dl>
        <p>
          {tr(
            '{diagnostics} checks the app and your connections, and can make a report to share that leaves out keys and story text. {report} in the footer puts that report with your own words, ready to copy or save.',
            {
              diagnostics: <strong>{t('Diagnostics')}</strong>,
              report: <strong>{t('Report a problem')}</strong>,
            },
          )}
        </p>
        <button type="button" onClick={() => navigate({ name: 'diagnostics' })}>
          {t('Diagnostics')}
        </button>
      </Section>
    </section>
  );
}
