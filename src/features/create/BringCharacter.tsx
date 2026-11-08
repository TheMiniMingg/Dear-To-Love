// Bring someone into a new story: a character from another of your stories,
// or a character card file (.png or .json) from a character-chat app.
import { useId, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { FileUp, Users } from 'lucide-react';
import { CommandError, commands, errorMessage } from '../../api/commands';
import type { Character, StoryCharacter } from '../../types';
import { msg, t } from '../../i18n';

/** What was brought in; the caller gives the character their place. */
export type Brought = {
  character: Character;
  /** From a card: the situation it sets up, and its first message. */
  scenario?: string;
  greeting?: string;
  /** The card's own picture, added for this story, as their portrait. */
  portrait?: { assetId: string; storyOnly: boolean };
};

/** Which story fields the caller filled from a card (only empty ones are). */
export type FilledFromCard = { about: boolean; opening: boolean };

const CARD_PROBLEMS: Record<string, string> = {
  'this file is not a character card': msg(
    'This file is not a character card. Choose a card saved as .png or .json.',
  ),
  'the character card has no name': msg('The character card has no name.'),
  "this character reads as under 18, so it can't be used": msg(
    'This character reads as under 18, so they can’t be brought into a story.',
  ),
};

function cardProblem(e: unknown): string {
  const known = e instanceof CommandError ? CARD_PROBLEMS[e.message] : undefined;
  return known ? t(known) : errorMessage(e);
}

/** The fields to copy: everything but who they are in the old story. */
export function personFields(c: Character): Omit<Character, 'id' | 'control'> {
  const rest: Partial<Character> = { ...c };
  delete rest.id;
  delete rest.control;
  return rest as Omit<Character, 'id' | 'control'>;
}

export function BringCharacter({
  forYou,
  playerName,
  onBring,
}: {
  /** Bringing the player's own character (instead of someone else). */
  forYou: boolean;
  /** Stands in for a card's {{user}}. */
  playerName: string;
  onBring: (b: Brought) => FilledFromCard | void;
}) {
  const [people, setPeople] = useState<StoryCharacter[] | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();

  const showList = () => {
    setNote(null);
    setError(null);
    setListOpen((o) => !o);
    if (people === null) {
      commands
        .listStoryCharacters()
        .then(setPeople)
        .catch((e: unknown) => {
          setPeople([]);
          setError(errorMessage(e));
        });
    }
  };

  const pick = (p: StoryCharacter) => {
    onBring({ character: p.character });
    setListOpen(false);
    setQuery('');
    setNote(
      t('{name} from “{story}” is in this story now. Change anything below.', {
        name: p.character.name,
        story: p.storyTitle,
      }),
    );
  };

  const fromCard = async () => {
    setNote(null);
    setError(null);
    setListOpen(false);
    const path = await open({
      title: t('Choose a character card'),
      multiple: false,
      directory: false,
      filters: [{ name: t('Character cards (PNG, JSON)'), extensions: ['png', 'json'] }],
    });
    if (!path || Array.isArray(path)) return;
    setBusy(true);
    try {
      const card = await commands.readCharacterCard(path, playerName.trim() || null);
      let portrait: Brought['portrait'];
      if (card.hasPicture) {
        // The picture is the card itself; a picture that can't be added
        // leaves them without a portrait, nothing more.
        const [added] = await commands.importImages([path], { newStory: true }).catch(() => []);
        if (added?.asset) portrait = { assetId: added.asset.id, storyOnly: !added.asset.shared };
      }
      const filled = onBring({
        character: card.character,
        scenario: card.scenario,
        greeting: card.greeting,
        portrait,
      });
      const parts = [t('{name} is in this story now.', { name: card.character.name })];
      if (portrait) parts.push(t('The card’s picture is their portrait.'));
      if (filled?.about) parts.push(t('Its scenario is in “What the story is about”.'));
      if (filled?.opening) parts.push(t('Its first message is the opening scene.'));
      parts.push(t('Change anything below.'));
      setNote(parts.join(' '));
    } catch (e) {
      setError(cardProblem(e));
    } finally {
      setBusy(false);
    }
  };

  const q = query.trim().toLowerCase();
  const shown = (people ?? []).filter(
    (p) =>
      !q ||
      p.character.name.toLowerCase().includes(q) ||
      p.storyTitle.toLowerCase().includes(q) ||
      (p.character.role ?? '').toLowerCase().includes(q),
  );

  return (
    <div className="bring-character">
      <div className="bring-buttons">
        <span className="muted small">
          {forYou
            ? t('Play as someone you already made:')
            : t('Bring in someone you already made:')}
        </span>
        <button
          type="button"
          className="chip chip-button"
          aria-expanded={listOpen}
          aria-controls={listOpen ? listId : undefined}
          onClick={showList}
        >
          <Users aria-hidden={true} size={15} /> {t('From your stories')}
        </button>
        <button
          type="button"
          className="chip chip-button"
          disabled={busy}
          title={t('A character card (.png or .json) from a character-chat app')}
          onClick={() => void fromCard()}
        >
          <FileUp aria-hidden={true} size={15} /> {t('From a character card')}
        </button>
      </div>
      {listOpen && (
        <div className="bring-list" id={listId}>
          {people === null ? (
            <p className="muted small">{t('Loading…')}</p>
          ) : people.length === 0 ? (
            <p className="muted small">
              {t('Nobody yet: the people in your stories show here once you have played one.')}
            </p>
          ) : (
            <>
              {people.length > 6 && (
                <input
                  type="search"
                  className="bring-search"
                  aria-label={t('Find a character')}
                  placeholder={t('Find by name, role or story')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              )}
              <ul aria-label={t('Characters in your stories')}>
                {shown.map((p) => (
                  <li key={`${p.storyId}:${p.character.id}`}>
                    <button type="button" onClick={() => pick(p)}>
                      <strong>{p.character.name}</strong>
                      <span className="muted small">
                        {[p.character.species, p.character.role].filter(Boolean).join(' ')}
                        {(p.character.species || p.character.role) && ' · '}
                        {p.wasPlayer
                          ? t('you, in “{story}”', { story: p.storyTitle })
                          : t('in “{story}”', { story: p.storyTitle })}
                      </span>
                    </button>
                  </li>
                ))}
                {shown.length === 0 && (
                  <li className="muted small">{t('No one matches “{query}”.', { query })}</li>
                )}
              </ul>
            </>
          )}
        </div>
      )}
      {note && (
        <p className="muted small bring-note" role="status">
          {note}
        </p>
      )}
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
