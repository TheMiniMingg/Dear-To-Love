// Usage & budget: totals never price unknown calls, prices and the budget
// save through the backend, and the reader shows the monthly warning and
// the one-time override for an unpriced model.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ApiRequestRow,
  BudgetPolicy,
  BudgetStatus,
  EventDto,
  RateCardView,
  RunDto,
  UsageSummary,
  UsageTotals,
} from '../types';
import { fakeRouteView } from './fakeBackend';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  Channel: class {
    onmessage: (m: unknown) => void = () => undefined;
  },
}));

import { UsageScreen } from '../features/usage/UsageScreen';
import { ReaderScreen } from '../features/reader/ReaderScreen';
import { useUiStore } from '../app/store';

const totals = (t: Partial<UsageTotals> = {}): UsageTotals => ({
  requestCount: 0,
  inputTokens: null,
  cachedInputTokens: null,
  outputTokens: null,
  estimatedCostMicroUsd: 0,
  unknownCostRequestCount: 0,
  inFlightRequestCount: 0,
  localModelRequestCount: 0,
  approximateCostRequestCount: 0,
  ...t,
});

const summary: UsageSummary = {
  scope: 'session',
  providerProfileId: null,
  since: null,
  totals: totals({
    requestCount: 3,
    inputTokens: 2000,
    cachedInputTokens: 0,
    outputTokens: 300,
    estimatedCostMicroUsd: 2300,
    unknownCostRequestCount: 1,
    localModelRequestCount: 1,
  }),
  byModel: [
    {
      providerLabel: 'Cloud',
      modelId: 'big',
      billing: 'paid',
      totals: totals({ requestCount: 2, estimatedCostMicroUsd: 2300, unknownCostRequestCount: 1 }),
    },
  ],
};

const row = (r: Partial<ApiRequestRow>): ApiRequestRow => ({
  id: 'r1',
  startedAt: '2026-11-06T09:00:00.000Z',
  providerLabel: 'Cloud',
  modelId: 'big',
  billing: 'paid',
  purpose: 'story_reply',
  status: 'completed',
  usageSource: 'provider',
  inputTokens: 1000,
  cachedInputTokens: 0,
  outputTokens: 150,
  costMicroUsd: 2300,
  errorCode: null,
  costApproximate: false,
  ...r,
});

const rates: RateCardView[] = [
  {
    providerProfileId: 'p1',
    providerLabel: 'Cloud',
    modelId: 'big',
    billing: 'paid',
    card: null,
  },
  {
    providerProfileId: 'p2',
    providerLabel: 'Home',
    modelId: 'llama',
    billing: 'local',
    card: null,
  },
];

const disabled: BudgetPolicy = {
  enabled: false,
  currency: 'USD',
  monthlyLimitUsd: null,
  warningThresholdPercent: 80,
  mode: 'warn',
};

const status = (p: BudgetPolicy, s: Partial<BudgetStatus> = {}): BudgetStatus => ({
  policy: p,
  month: '2026-11',
  limitMicroUsd: p.monthlyLimitUsd ? Math.round(Number(p.monthlyLimitUsd) * 1e6) : null,
  spentMicroUsd: 2300,
  reservedMicroUsd: 0,
  unknownCostRequests: 0,
  percent: null,
  level: 'none',
  dismissed: false,
  paused: false,
  ...s,
});

describe('Usage & budget screen', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      switch (cmd) {
        case 'list_connections':
          return [];
        case 'get_usage_summary':
          return summary;
        case 'list_api_requests':
          return [
            row({}),
            row({ id: 'r2', status: 'failed', usageSource: 'unknown', costMicroUsd: null }),
            row({ id: 'r3', billing: 'local', modelId: 'llama', costMicroUsd: 0 }),
          ];
        case 'list_rates':
          return rates;
        case 'set_rates':
          return [
            {
              ...rates[0],
              card: {
                id: 'c1',
                providerProfileId: 'p1',
                modelId: 'big',
                inputUsdPerMillion: args.inputUsdPerMillion,
                outputUsdPerMillion: args.outputUsdPerMillion,
                cachedInputUsdPerMillion: args.cachedInputUsdPerMillion,
                effectiveAt: '2026-11-06T09:00:00.000Z',
              },
            },
            rates[1],
          ];
        case 'get_budget_status':
          return status(disabled);
        case 'set_budget_policy': {
          const p = args.policy as BudgetPolicy;
          if (p.enabled && !p.monthlyLimitUsd) throw { code: 'INVALID_INPUT', message: 'x' };
          return status(p, { percent: 0 });
        }
        default:
          throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
      }
    });
  });

  it('shows totals and never prices an unknown call as $0', async () => {
    render(<UsageScreen />);
    const totalsList = await screen.findByLabelText('Totals');
    expect(within(totalsList).getByText('$0.0023')).toBeInTheDocument();
    expect(within(totalsList).getByText(/1 call with unknown cost/)).toBeInTheDocument();
    expect(within(totalsList).getByText(/1 to local models/)).toBeInTheDocument();

    const recent = screen.getByRole('table', { name: 'Recent requests' });
    const cells = within(recent).getAllByRole('row');
    expect(cells).toHaveLength(4);
    // Cost and token source are both unknown for the failed call.
    expect(within(cells[2]!).getAllByText('Unknown')).toHaveLength(2);
    expect(within(cells[3]!).getByText('$0 (local)')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'This month (UTC)' }));
    expect(invoke).toHaveBeenCalledWith('get_usage_summary', {
      scope: 'month_utc',
      profileId: null,
    });
  });

  it('saves prices for a paid connection; local ones need none', async () => {
    render(<UsageScreen />);
    expect(await screen.findByText(/Local model: \$0 API charge/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add prices' }));
    const form = screen.getByRole('form', { name: 'Prices for Cloud · big' });
    await userEvent.type(within(form).getByLabelText('Input, USD per 1M tokens'), '0.15');
    await userEvent.type(within(form).getByLabelText('Output, USD per 1M tokens'), '0.6');
    await userEvent.click(within(form).getByRole('button', { name: 'Save prices' }));
    expect(invoke).toHaveBeenCalledWith('set_rates', {
      profileId: 'p1',
      inputUsdPerMillion: '0.15',
      outputUsdPerMillion: '0.6',
      cachedInputUsdPerMillion: null,
    });
    expect(await screen.findByText(/\$0\.15 in · \$0\.6 out/)).toBeInTheDocument();
  });

  it('turns on a budget that pauses paid replies', async () => {
    render(<UsageScreen />);
    const form = await screen.findByRole('form', { name: 'Budget settings' });
    const limit = within(form).getByLabelText('Monthly budget (USD)');
    expect(limit).toBeDisabled();
    await userEvent.click(within(form).getByLabelText('Use a monthly budget'));
    await userEvent.type(limit, '5');
    await userEvent.click(within(form).getByRole('radio', { name: /Pause new paid replies/ }));
    await userEvent.click(within(form).getByRole('button', { name: 'Save budget' }));
    expect(invoke).toHaveBeenCalledWith('set_budget_policy', {
      policy: { ...disabled, enabled: true, monthlyLimitUsd: '5', mode: 'pause_new_requests' },
    });
    expect(await within(form).findByRole('status')).toHaveTextContent('Saved');
    const month = screen.getByLabelText('This month');
    expect(within(month).getByText('$0.0023')).toBeInTheDocument();
    expect(within(month).getByText(/of \$5\.0000/)).toBeInTheDocument();
  });
});

describe('Budget in the reader', () => {
  const action: EventDto = {
    id: 'ev-2',
    originRouteId: 'route-1',
    parentEventId: 'ev-1',
    generationRunId: null,
    createdAt: '2026-11-06T00:00:01Z',
    kind: 'player',
    payload: { text: 'Open the door' },
  };
  const failedRun: RunDto = {
    id: 'run-1',
    routeId: 'route-1',
    inputEventId: 'ev-2',
    providerProfileId: 'p1',
    status: 'failed',
    errorCode: 'BUDGET_OVERRIDE_REQUIRED',
    createdAt: '2026-11-06T00:00:01Z',
    finishedAt: '2026-11-06T00:00:01Z',
  };
  const warnPolicy: BudgetPolicy = { ...disabled, enabled: true, monthlyLimitUsd: '5' };

  beforeEach(() => {
    invoke.mockReset();
    useUiStore.setState({ drafts: {}, screen: { name: 'library' }, history: [] });
  });

  it('shows the warning once and hides it after dismissal', async () => {
    let dismissed = false;
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_route_view') return fakeRouteView();
      if (cmd === 'get_budget_status')
        return status(warnPolicy, {
          spentMicroUsd: 4_100_000,
          percent: 82,
          level: 'warning',
          dismissed,
        });
      if (cmd === 'dismiss_budget_warning') {
        dismissed = true;
        return status(warnPolicy, { percent: 82, level: 'warning', dismissed });
      }
      throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
    });
    render(<ReaderScreen routeId="route-1" />);
    const banner = await screen.findByRole('region', { name: 'Monthly budget' });
    expect(banner).toHaveTextContent("You've used 82% of your monthly budget");
    expect(banner).toHaveTextContent('$4.1000 of $5.0000');
    await userEvent.click(within(banner).getByRole('button', { name: 'Dismiss for this month' }));
    expect(screen.queryByRole('region', { name: 'Monthly budget' })).toBeNull();
    expect(invoke).toHaveBeenCalledWith('dismiss_budget_warning', undefined);
  });

  it('offers to send one unpriced reply when the budget pauses', async () => {
    invoke.mockImplementation(async (cmd: string, args: Record<string, unknown>) => {
      if (cmd === 'get_route_view') {
        const v = fakeRouteView([action]);
        v.awaitingReply = { inputEventId: 'ev-2', activeRun: null, lastRun: failedRun };
        return v;
      }
      if (cmd === 'get_budget_status') return status({ ...warnPolicy, mode: 'pause_new_requests' });
      if (cmd === 'retry_reply') {
        return { runId: 'run-2', view: fakeRouteView([action]) };
      }
      if (cmd === 'generate_reply') {
        expect(args.budgetOverride).toBe(true);
        return fakeRouteView([action]);
      }
      throw { code: 'NOT_FOUND', message: `unknown ${cmd}` };
    });
    render(<ReaderScreen routeId="route-1" />);
    const bar = await screen.findByRole('region', { name: 'Reply needed' });
    expect(bar).toHaveTextContent(/this model has no prices/);
    await userEvent.click(within(bar).getByRole('button', { name: 'Usage & budget' }));
    expect(useUiStore.getState().screen).toEqual({ name: 'usage' });
    await userEvent.click(within(bar).getByRole('button', { name: 'Send once without a price' }));
    expect(invoke).toHaveBeenCalledWith(
      'generate_reply',
      expect.objectContaining({ runId: 'run-2', budgetOverride: true }),
    );
  });

  it('Back walks the screen history', () => {
    const { navigate, goBack } = useUiStore.getState();
    useUiStore.setState({ screen: { name: 'reader', routeId: 'route-1' }, history: [] });
    navigate({ name: 'settings' });
    navigate({ name: 'usage' });
    goBack();
    expect(useUiStore.getState().screen).toEqual({ name: 'settings' });
    goBack();
    expect(useUiStore.getState().screen).toEqual({ name: 'reader', routeId: 'route-1' });
    goBack();
    expect(useUiStore.getState().screen).toEqual({ name: 'library' });
  });
});
