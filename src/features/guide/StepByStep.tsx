import type { ReactNode } from 'react';
import { commands, errorMessage } from '../../api/commands';
import { PRESETS } from '../settings/presets';
import { t, tr } from '../../i18n';
import {
  DETAIL_NOTE,
  HOSTED,
  LABS,
  LOCAL,
  PICTURES,
  detailSteps,
  type GuideLink,
  type ServiceGuide,
} from './guide';

export const code = (name: string) => <code>{name}</code>;

/** The guide for a connection preset, if it has one. */
export function guideFor(preset: string | undefined): ServiceGuide | undefined {
  return [...LOCAL, ...LABS, ...HOSTED, ...PICTURES].find((g) => g.preset === preset);
}

/** Buttons that open a service's pages in the browser. */
export function Links({ links, onError }: { links: GuideLink[]; onError: (e: string) => void }) {
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

/** The names of buttons and fields a step mentions, in bold as on screen. */
function stepVars(guide: ServiceGuide): Record<string, ReactNode> {
  const preset = PRESETS.find((p) => p.id === guide.preset);
  const b = (label: string) => <strong>{t(label)}</strong>;
  const keyLink = guide.links.find((l) => l.id.endsWith('-keys'));
  const download = guide.links.find((l) => l.id.endsWith('-download'));
  return {
    site: guide.site ?? '',
    getKey: b(keyLink?.label ?? 'Get a key'),
    download: b(download?.label ?? 'Download'),
    setUp: b('Set it up here'),
    apiKey: b('API key'),
    model: b('Model'),
    context: b('Context limit (tokens)'),
    save: b('Save connection'),
    test: b('Test connection'),
    send: b('Send test message'),
    example: code(preset?.model ?? ''),
    small: code('gemma4:e2b'),
    large: code('qwen3.8:27b'),
  };
}

/**
 * Every click, for people who want each step spelled out. Folded away
 * until opened; `where` says whether the connection form is already open.
 */
export function StepByStep({
  guide,
  where,
  onError,
  open,
}: {
  guide: ServiceGuide;
  where: 'guide' | 'form';
  onError: (e: string) => void;
  open?: boolean;
}) {
  const preset = PRESETS.find((p) => p.id === guide.preset);
  const vars = stepVars(guide);
  return (
    <details className="step-by-step" data-testid={`steps-${guide.preset}`} open={open}>
      <summary>
        {t('Step by step, every click: {service}', { service: t(preset?.label ?? '') })}
      </summary>
      <ol className="guide-steps">
        {detailSteps(guide, where).map((s, i) => (
          <li key={i}>
            {tr(s.text, vars)}
            {s.command && <code className="guide-command">{s.command}</code>}
          </li>
        ))}
      </ol>
      <p className="muted small">{t(DETAIL_NOTE)}</p>
      {where === 'form' && <Links links={guide.links} onError={onError} />}
    </details>
  );
}
