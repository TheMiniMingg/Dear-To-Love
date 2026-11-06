// Texts, calls, thoughts and letters in the story, and the composer modes.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { parseBlocks, samePerson, wrapAction } from '../features/reader/messages';
import { RichText } from '../features/reader/RichText';
import { Composer } from '../features/reader/Composer';

describe('message tags', () => {
  it('splits prose from texts, calls, thoughts, letters and posts', () => {
    const blocks = parseBlocks(
      'Your phone vibrates.\n<text from="Erika K." time="7:11 PM">Z...?\nIs that really you?</text>\n' +
        '<call with="Erika K." status="ringing"/>Ring.<thought who="Mara">Careful.</thought>' +
        '<letter from="A friend">Dear keeper</letter><post from="Kit">Sunset!</post>a < b <i>x</i>',
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      'prose',
      'text',
      'prose',
      'call',
      'prose',
      'thought',
      'letter',
      'post',
      'prose',
    ]);
    expect(blocks[1]).toEqual({
      kind: 'text',
      attrs: { from: 'Erika K.', time: '7:11 PM' },
      body: 'Z...?\nIs that really you?',
      open: false,
    });
    expect(blocks[3]).toMatchObject({ kind: 'call', attrs: { status: 'ringing' }, body: '' });
    expect(blocks[8]).toEqual({ kind: 'prose', text: 'a < b <i>x</i>' });
  });

  it('hides a tag that is still streaming in and shows an open card', () => {
    expect(parseBlocks('Your phone buzzes. <te', true)).toEqual([
      { kind: 'prose', text: 'Your phone buzzes. ' },
    ]);
    expect(parseBlocks('Buzz. <text from="Eri', true)).toEqual([{ kind: 'prose', text: 'Buzz. ' }]);
    expect(parseBlocks('<text from="Erika">Are you th</te', true)).toEqual([
      { kind: 'text', attrs: { from: 'Erika' }, body: 'Are you th', open: true },
    ]);
    expect(parseBlocks('a < b', true)).toEqual([{ kind: 'prose', text: 'a < b' }]);
  });

  it('wraps composer modes as tags and matches first names', () => {
    const who = { to: 'Erika "E" K.', player: 'Sam' };
    expect(wrapAction('act', ' Wave ', who)).toBe(' Wave ');
    expect(wrapAction('text', ' hey ', who)).toBe(`<text to="Erika 'E' K.">hey</text>`);
    expect(wrapAction('call', '', who)).toBe(`<call with="Erika 'E' K." status="ringing"/>`);
    expect(wrapAction('call', 'Hi!', who)).toBe(
      `<call with="Erika 'E' K." status="ringing"/>\n\nHi!`,
    );
    expect(wrapAction('think', 'Hm.', who)).toBe('<thought who="Sam">Hm.</thought>');
    expect(samePerson('Erika K.', 'erika')).toBe(true);
    expect(samePerson('Erika', 'Mara')).toBe(false);
  });
});

describe('RichText', () => {
  it('shows texts as a phone card, sent ones on the right', () => {
    render(
      <RichText
        playerName="Sam Ashby"
        text={
          '<text from="Erika K." time="7:11 PM">Is that really you?</text>\n' +
          '<text from="Erika K." time="7:12 PM">Where have you been?</text>\n\n' +
          '<text to="Erika K.">I am back.</text>\n\nYou put the phone down.'
        }
      />,
    );
    const phone = screen.getByRole('group', { name: 'Text messages with Erika K.' });
    expect(within(phone).getAllByText(/Is that really you\?|Where have you been\?/)).toHaveLength(
      2,
    );
    expect(within(phone).getByText('7:12 PM')).toBeInTheDocument();
    const sent = within(phone).getByText('I am back.').closest('.msg-bubble-row');
    expect(sent).toHaveClass('sent');
    expect(screen.getByText('You put the phone down.')).toBeInTheDocument();
  });

  it('shows calls, thoughts, letters, speakers and emphasis', () => {
    render(
      <RichText
        playerName="Sam"
        text={
          '<call with="Erika K." status="ringing"/>\n\n*Ring...*\n\nErika: "H-Hello?! Z?!"\n\n' +
          '<thought who="Mara">I **missed** this.</thought>\n<thought who="Sam">Breathe.</thought>' +
          '<letter from="A friend">Meet me at the pier.</letter>'
        }
      />,
    );
    const call = screen.getByRole('group', { name: 'Call with Erika K.' });
    expect(call).toHaveTextContent('Ringing…');
    expect(screen.getByText('Ring...').tagName).toBe('EM');
    expect(screen.getByText('Erika:').tagName).toBe('STRONG');
    const thought = screen.getByRole('complementary', { name: "Mara's thoughts" });
    expect(within(thought).getByText('missed').tagName).toBe('STRONG');
    expect(screen.getByRole('complementary', { name: 'Your thoughts' })).toHaveTextContent(
      'You thinkBreathe.',
    );
    expect(screen.getByRole('figure', { name: 'Letter from A friend' })).toHaveTextContent(
      'Meet me at the pier.',
    );
  });

  it('does not take ordinary sentences with a colon for a speaker', () => {
    render(<RichText playerName="Sam" text={'You decide: "Look around."'} />);
    expect(screen.queryByText('You decide:')).toBeNull();
  });
});

describe('Composer modes', () => {
  it('sends a text to a contact and a call without words', async () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <Composer
        value="Are you awake?"
        onChange={() => undefined}
        onSubmit={onSubmit}
        disabled={false}
        placeholder="What do you do?"
        contacts={['Mara Quill']}
        playerName="Sam"
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText('Kind of action'), 'Send a text');
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('To'), 'Mara Quill');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledWith('<text to="Mara Quill">Are you awake?</text>');

    rerender(
      <Composer
        value=""
        onChange={() => undefined}
        onSubmit={onSubmit}
        disabled={false}
        placeholder="What do you do?"
        contacts={['Mara Quill']}
        playerName="Sam"
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText('Kind of action'), 'Call');
    await userEvent.click(screen.getByRole('button', { name: 'Call' }));
    expect(onSubmit).toHaveBeenLastCalledWith('<call with="Mara Quill" status="ringing"/>');
  });
});
