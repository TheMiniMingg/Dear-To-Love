// Dice: roll requests from the storyteller, rolls shown in the story, and
// the composer's Roll dice mode.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from '../features/reader/Composer';
import { DiceRulesContext } from '../features/reader/DiceCards';
import {
  isDice,
  lastRollRequest,
  rollFromComposer,
  rollRequestOf,
} from '../features/reader/messages';
import { NarrativeView } from '../features/reader/NarrativeView';
import { RichText } from '../features/reader/RichText';
import type { EventDto } from '../types';

describe('roll tags', () => {
  it('reads what the storyteller asks for', () => {
    expect(rollRequestOf({ for: 'Pass the test', dice: '40-100', target: '60' })).toEqual({
      label: 'Pass the test',
      dice: '40-100',
      target: 60,
      asked: true,
    });
    expect(rollRequestOf({ for: 'x', dice: '1d20', result: '12' })).toBeNull();
    expect(rollRequestOf({ for: 'x' })).toBeNull();
    expect(
      lastRollRequest(
        'Hm. <roll for="A" dice="1d6"/> then <roll for="B" dice="1d20" stat="Smarts"/>',
      ),
    ).toEqual({ label: 'B', dice: '1d20', stat: 'Smarts', asked: true });
    expect(lastRollRequest('No dice here.')).toBeNull();
  });

  it('accepts dice and ranges the app can roll', () => {
    for (const ok of [
      '1d20',
      'd6',
      '2d6+1',
      '1d100 - 5',
      '40-100',
      '40–100',
      '40—100',
      '0 to 100',
      '-5 to 5',
      '20d6',
    ]) {
      expect(isDice(ok), ok).toBe(true);
    }
    // The same limits as the app's core: at most 20 dice, numbers up to a million.
    for (const bad of [
      '',
      'd',
      'two dice',
      '1d20+',
      '7',
      '5to10',
      '30d6',
      '1d20+5000000',
      '9-3',
      '1d1',
    ]) {
      expect(isDice(bad), bad).toBe(false);
    }
  });

  it('turns the composer box into what the roll is for', () => {
    const opts = { dice: ' 1d20 ', stat: 'Smarts', target: '12' };
    expect(rollFromComposer('Climb the wall', opts)).toEqual({
      text: '',
      roll: { label: 'Climb the wall', dice: '1d20', stat: 'Smarts', target: 12 },
    });
    expect(rollFromComposer('', { dice: '2d6', stat: '', target: '' })).toEqual({
      text: '',
      roll: { label: 'A roll', dice: '2d6' },
    });
    const long = rollFromComposer('I jump.\nThen I run as fast as I can.', opts);
    expect(long.roll.label).toBe('I jump.');
    expect(long.text).toBe('I jump.\nThen I run as fast as I can.');
  });
});

describe('dice cards', () => {
  it('offers a Roll button on the last roll asked for', async () => {
    const onRoll = vi.fn();
    render(
      <RichText
        playerName="Sam"
        onRoll={onRoll}
        text={
          'The lock is old. <roll for="Force it" dice="1d6"/>\n\nOr maybe not.\n\n' +
          '<roll for="Pick the lock" dice="1d20" stat="Hands" target="12"/>'
        }
      />,
    );
    const ask = screen.getByRole('group', { name: 'Roll for Pick the lock' });
    expect(ask).toHaveTextContent('1d20 + your Hands · needs 12');
    expect(
      within(screen.getByRole('group', { name: 'Roll for Force it' })).queryByRole('button'),
    ).toBeNull();
    await userEvent.click(within(ask).getByRole('button', { name: 'Roll 1d20' }));
    expect(onRoll).toHaveBeenCalledWith({
      label: 'Pick the lock',
      dice: '1d20',
      stat: 'Hands',
      target: 12,
      asked: true,
    });
  });

  it('shows no button while the reply is still being written', () => {
    render(
      <RichText
        playerName="Sam"
        onRoll={() => undefined}
        streaming
        text={'Here goes. <roll for="Jump" dice="1d20"/>'}
      />,
    );
    expect(screen.getByRole('group', { name: 'Roll for Jump' })).toBeInTheDocument();
    render(<RichText playerName="Sam" text={'<roll for="Jump" dice="1d20"/>'} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the roll stored with an action, and a result written by the storyteller', () => {
    const events: EventDto[] = [
      {
        id: 'e1',
        originRouteId: 'r',
        parentEventId: null,
        generationRunId: null,
        kind: 'player',
        payload: {
          text: '',
          roll: {
            label: 'Pass the exam',
            dice: '40-100',
            target: 60,
            faces: [73],
            total: 73,
            asked: true,
          },
        },
        createdAt: '2026-11-06T22:00:00Z',
      },
    ];
    render(<NarrativeView events={events} playerName="Sam" />);
    const card = screen.getByRole('group', { name: 'Roll for Pass the exam: 73, Success' });
    expect(card).toHaveTextContent('You rolled for');
    expect(card).toHaveTextContent('40-100 · needs 60');

    render(
      <RichText
        playerName="Sam"
        text={
          '<roll for="Sneak" dice="2d6" stat="Stealth" bonus="+1" target="9" result="5" outcome="failure"/>'
        }
      />,
    );
    expect(screen.getByRole('group', { name: 'Roll for Sneak: 5, Failed' })).toHaveTextContent(
      '2d6 + Stealth +1 · needs 9',
    );
  });
});

describe('Roll dice in the composer', () => {
  it('rolls with a stat and a target, only in stories with dice', async () => {
    const onSubmit = vi.fn();
    const props = {
      value: 'Climb the wall',
      onChange: () => undefined,
      onSubmit,
      disabled: false,
      placeholder: 'What do you do?',
      stats: [{ name: 'Fitness', value: 2 }],
    };
    const { rerender } = render(<Composer {...props} />);
    expect(screen.queryByRole('option', { name: 'Roll dice' })).toBeNull();

    rerender(<Composer {...props} dice />);
    await userEvent.click(screen.getByRole('radio', { name: 'Roll dice' }));
    const dice = screen.getByLabelText('Dice');
    expect(dice).toHaveValue('1d20');
    await userEvent.clear(dice);
    await userEvent.type(dice, 'two');
    expect(screen.getByRole('button', { name: 'Roll' })).toBeDisabled();
    await userEvent.clear(dice);
    await userEvent.type(dice, '1d20');
    await userEvent.selectOptions(screen.getByLabelText('With'), 'Fitness (+2)');
    await userEvent.type(screen.getByLabelText('Need'), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Roll' }));
    expect(onSubmit).toHaveBeenCalledWith('', {
      label: 'Climb the wall',
      dice: '1d20',
      stat: 'Fitness',
      target: 12,
    });
  });

  it('follows the story dice settings: own dice, no stats, a secret target, criticals', async () => {
    const onRoll = vi.fn();
    render(
      <DiceRulesContext.Provider value={{ dice: '2d6', noStats: true, hideTarget: true }}>
        <RichText
          playerName="Sam"
          onRoll={onRoll}
          text={
            '<roll for="Old roll" dice="1d20" result="20" critical="success" target="25"/>\n\n' +
            '<roll for="Pick the lock" dice="1d20" stat="Hands" target="12"/>'
          }
        />
      </DiceRulesContext.Provider>,
    );
    const ask = screen.getByRole('group', { name: 'Roll for Pick the lock' });
    expect(ask).toHaveTextContent('2d6');
    expect(ask).not.toHaveTextContent('Hands');
    expect(ask).not.toHaveTextContent('needs 12');
    await userEvent.click(within(ask).getByRole('button', { name: 'Roll 2d6' }));
    expect(onRoll).toHaveBeenCalled();
    expect(
      screen.getByRole('group', { name: 'Roll for Old roll: 20, Critical success' }),
    ).toHaveClass('critical', 'success');
  });

  it('leaves stats out of the composer when the story adds none', async () => {
    render(
      <Composer
        value=""
        onChange={() => undefined}
        onSubmit={() => undefined}
        disabled={false}
        placeholder="What do you do?"
        stats={[{ name: 'Fitness', value: 2 }]}
        dice
        diceRules={{ dice: '3d6', noStats: true }}
      />,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Roll dice' }));
    expect(screen.getByLabelText('Dice')).toHaveValue('3d6');
    expect(screen.queryByLabelText('With')).toBeNull();
  });
});
