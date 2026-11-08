// More presets: races and roles, and the compact multi-choice picker used
// for rules and personality.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { MultiPicker } from '../features/create/fields';
import { ruleCategory } from '../features/create/ruleCategories';
import { RulesField } from '../features/create/RulesField';
import { PERSONALITIES, RACES, ROLES, RULES } from '../features/create/presets';

function Harness({ initial }: { initial: string[] }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <MultiPicker
        label="Rules the storyteller follows"
        presets={RULES}
        value={value}
        onChange={setValue}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

describe('presets', () => {
  it('offer peoples beyond humans, and many roles and traits', () => {
    for (const race of ['Orc', 'Goblin', 'Lizardfolk', 'Kobold', 'Catfolk', 'Android']) {
      expect(RACES).toContain(race);
    }
    expect(ROLES.length).toBeGreaterThan(50);
    expect(PERSONALITIES.length).toBeGreaterThan(40);
    const lower = [...RACES, ...ROLES].map((r) => r.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });
});

describe('MultiPicker', () => {
  it('adds from the list, adds your own, and removes, without listing every rule', async () => {
    render(<Harness initial={['Monsters exist']} />);
    const group = screen.getByRole('group', { name: 'Rules the storyteller follows' });
    expect(within(group).queryAllByRole('checkbox')).toHaveLength(0);
    const menu = within(group).getByRole('combobox', {
      name: 'Add to rules the storyteller follows from the list',
    });
    expect(within(menu).queryByRole('option', { name: 'Monsters exist' })).toBeNull();
    await userEvent.selectOptions(menu, 'Everyone has a secret');
    await userEvent.type(
      within(group).getByRole('textbox', { name: /Add your own/ }),
      'Dragons are extinct{Enter}',
    );
    expect(screen.getByTestId('value')).toHaveTextContent(
      '["Monsters exist","Everyone has a secret","Dragons are extinct"]',
    );
    await userEvent.click(within(group).getByRole('button', { name: 'Remove Monsters exist' }));
    expect(screen.getByTestId('value')).toHaveTextContent(
      '["Everyone has a secret","Dragons are extinct"]',
    );
    // The same rule twice is ignored.
    await userEvent.type(
      within(group).getByRole('textbox', { name: /Add your own/ }),
      'dragons are extinct',
    );
    await userEvent.click(within(group).getByRole('button', { name: 'Add' }));
    expect(screen.getByTestId('value')).toHaveTextContent(
      '["Everyone has a secret","Dragons are extinct"]',
    );
  });
});

function RulesHarness({ initial }: { initial: string[] }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <RulesField
        label="Rules the storyteller follows"
        presets={RULES}
        value={value}
        onChange={setValue}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

describe('the storyteller’s rules', () => {
  it('sorts rules into kinds by their words', () => {
    expect(ruleCategory('Magic is real but rare and costly')).toBe('magic');
    expect(ruleCategory('Romance develops slowly and only with mutual interest')).toBe('romance');
    expect(ruleCategory('Guns are deadly, and gunfights are rare')).toBe('danger');
    expect(ruleCategory('Space is cold; air and fuel are counted')).toBe('tech');
    expect(ruleCategory('Every character is an adult')).toBe('content');
    expect(ruleCategory('Rumors are often wrong')).toBe('society');
    expect(ruleCategory('Money and supplies are scarce')).toBe('life');
    expect(ruleCategory('Humor is welcome, even in dark moments')).toBe('tone');
    // A word inside another word doesn't count: "air" is not "AI", "warden" is not "war".
    expect(ruleCategory('Rain fills the air')).toBe('life');
    expect(ruleCategory('Aim well at the warden')).toBe('other');
    expect(ruleCategory('魔法は存在しない')).toBe('magic');
  });

  it('finds a rule in a long list by words, kind and order, and edits it in place', async () => {
    render(
      <RulesHarness
        initial={[
          'Monsters exist',
          'No character dies',
          'Rumors are often wrong',
          'Money and supplies are scarce',
          'Dragons hoard books, not gold',
          'Romance can move fast',
        ]}
      />,
    );
    const group = screen.getByRole('group', { name: 'Rules the storyteller follows' });
    const list = within(group).getByRole('list', { name: /Chosen rules/ });
    await userEvent.type(
      within(group).getByRole('searchbox', { name: 'Search your rules' }),
      'hoard',
    );
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(group).getByText('1 of 6')).toBeInTheDocument();
    await userEvent.clear(within(group).getByRole('searchbox', { name: 'Search your rules' }));

    await userEvent.selectOptions(
      within(group).getByRole('combobox', { name: 'Category of your rules' }),
      'magic',
    );
    expect(
      within(list)
        .getAllByRole('textbox')
        .map((i) => (i as HTMLInputElement).value),
    ).toEqual(['Monsters exist', 'Dragons hoard books, not gold']);
    // Show all puts back the whole list: no words, any kind.
    await userEvent.click(within(group).getByRole('button', { name: 'Show all' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(6);
    expect(
      (
        within(group).getByRole('combobox', {
          name: 'Category of your rules',
        }) as HTMLSelectElement
      ).value,
    ).toBe('');
    expect(within(group).queryByRole('button', { name: 'Show all' })).toBeNull();
    await userEvent.selectOptions(
      within(group).getByRole('combobox', { name: 'Order of your rules' }),
      'az',
    );
    expect((within(list).getAllByRole('textbox')[0] as HTMLInputElement).value).toBe(
      'Dragons hoard books, not gold',
    );
    // Sorting only changes what is shown.
    expect(screen.getByTestId('value')).toHaveTextContent('["Monsters exist","No character dies"');

    const rule = within(list).getByRole('textbox', { name: 'Rule 3' });
    await userEvent.clear(rule);
    await userEvent.type(rule, 'Rumors are always true');
    expect(screen.getByTestId('value')).toHaveTextContent('"Rumors are always true"');
    // A rule wraps to show all of it, but stays one line.
    await userEvent.type(rule, '{Enter}, mostly');
    expect((rule as HTMLTextAreaElement).value).toBe('Rumors are always true, mostly');

    // Suggestions are browsed the same way, and added with one click.
    await userEvent.click(within(group).getByText(/Browse suggested rules/));
    await userEvent.type(
      within(group).getByRole('searchbox', { name: 'Search suggested rules' }),
      'clues',
    );
    await userEvent.click(
      within(group).getByRole('button', { name: 'Add the rule Mysteries have fair clues' }),
    );
    expect(screen.getByTestId('value')).toHaveTextContent('"Mysteries have fair clues"]');
  });
});

describe('MultiPicker in a long list', () => {
  it('narrows the list as you type', async () => {
    render(<Harness initial={[]} />);
    const group = screen.getByRole('group', { name: 'Rules the storyteller follows' });
    await userEvent.type(
      within(group).getByRole('searchbox', { name: 'Find in rules the storyteller follows' }),
      'romance',
    );
    const menu = within(group).getByRole('combobox', {
      name: 'Add to rules the storyteller follows from the list',
    });
    expect(
      within(menu)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Add from 2 matches…',
      'Romance develops slowly and only with mutual interest',
      'Romance can move fast',
    ]);
  });
});
