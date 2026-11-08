import { useEffect, useId, useMemo, useState } from 'react';
import { commands, errorMessage } from '../../api/commands';
import { READING_SPEEDS, useReadAloud, useVoices } from '../../app/readAloud';
import { newPack, usesAiVoices, type VoicePack } from '../../app/voicePacks';
import type {
  ProviderProfile,
  StoryCharacter,
  VoiceChoice,
  VoiceInfo,
  VoiceSource,
} from '../../types';
import { t } from '../../i18n';
import { voiceConnections } from './kinds';

const MAX_CHARACTERS = 300;

/** Each connection's voices, asked for once while the app is open. */
const voiceLists = new Map<string, Promise<VoiceInfo[]>>();

function useConnectionVoices(connectionId: string | null): {
  voices: VoiceInfo[] | null;
  error: string | null;
} {
  const [got, setGot] = useState<{ id: string; voices: VoiceInfo[] | null; error: string | null }>({
    id: '',
    voices: null,
    error: null,
  });
  useEffect(() => {
    if (!connectionId) return;
    let live = true;
    let list = voiceLists.get(connectionId);
    if (!list) {
      list = commands.listVoices(connectionId);
      voiceLists.set(connectionId, list);
      // A failed list is asked for again next time.
      list.catch(() => voiceLists.delete(connectionId));
    }
    list.then(
      (voices) => live && setGot({ id: connectionId, voices, error: null }),
      (e: unknown) => live && setGot({ id: connectionId, voices: null, error: errorMessage(e) }),
    );
    return () => {
      live = false;
    };
  }, [connectionId]);
  return got.id === connectionId ? got : { voices: null, error: null };
}

type PickerProps = {
  id: string;
  label: string;
  source: VoiceSource;
  connectionId: string | null;
  value: VoiceChoice;
  onChange: (v: VoiceChoice) => void;
  /** For a character: the empty choice is "the narrator's voice". */
  character?: boolean;
};

/** A voice from the computer or from the pack's voice connection. */
function VoicePicker({ id, label, source, connectionId, value, onChange, character }: PickerProps) {
  const computer = useVoices();
  const ai = useConnectionVoices(usesAiVoices({ source }) ? connectionId : null);
  const empty = character
    ? t('The narrator’s voice')
    : source === 'computer'
      ? t('The computer’s usual voice')
      : t('Choose a voice');
  if (source !== 'computer' && ai.error) {
    // No list: the voice id can still be typed in.
    return (
      <input
        id={id}
        aria-label={label}
        value={value.voice}
        placeholder={character ? t('Voice id, or empty for the narrator’s') : t('Voice id')}
        spellCheck={false}
        onChange={(e) => onChange({ voice: e.target.value, label: e.target.value })}
      />
    );
  }
  const options: { id: string; name: string }[] =
    source === 'computer'
      ? computer.map((v) => ({ id: v.voiceURI, name: v.lang ? `${v.name} (${v.lang})` : v.name }))
      : (ai.voices ?? []).map((v) => ({
          id: v.id,
          name: v.note ? `${v.name} (${v.note})` : v.name,
        }));
  const listed = !value.voice || options.some((o) => o.id === value.voice);
  return (
    <select
      id={id}
      aria-label={label}
      value={value.voice}
      onChange={(e) => {
        const voice = e.target.value;
        const name =
          source === 'computer'
            ? (computer.find((v) => v.voiceURI === voice)?.name ?? '')
            : (ai.voices?.find((v) => v.id === voice)?.name ?? voice);
        onChange({ voice, label: voice ? name : '' });
      }}
    >
      <option value="">{empty}</option>
      {!listed && (
        <option value={value.voice}>
          {t('{voice} (not on this computer)', { voice: value.label || value.voice })}
        </option>
      )}
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}

type Props = {
  existing: VoicePack | null;
  connections: ProviderProfile[];
  onSaved: (pack: VoicePack) => void;
  onCancel: () => void;
};

/** Make or change a voice pack: where its voices come from, and who reads what. */
export function VoicePackEditor({ existing, connections, onSaved, onCancel }: Props) {
  const id = useId();
  const voiceConns = voiceConnections(connections);
  const [draft, setDraft] = useState<VoicePack>(
    () =>
      existing ?? {
        ...newPack(t('My voices'), 'computer', null),
      },
  );
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<StoryCharacter[] | null>(null);
  const trying = useReadAloud((s) => s.reading?.startsWith('pack-try-') ?? false);
  const tryProblem = useReadAloud((s) =>
    s.problem?.id.startsWith('pack-try-') ? s.problem : null,
  );
  const ai = usesAiVoices(draft);
  const connection = voiceConns.find((c) => c.id === draft.connectionId) ?? null;

  // A sample still playing stops when the editor closes.
  useEffect(
    () => () => {
      if (useReadAloud.getState().reading?.startsWith('pack-try-')) useReadAloud.getState().stop();
    },
    [],
  );

  useEffect(() => {
    let live = true;
    commands
      .listStoryCharacters()
      .then((list) => live && setPeople(list))
      .catch(() => live && setPeople([]));
    return () => {
      live = false;
    };
  }, []);

  /** Stories with people in them, by title, for "Add the people from…". */
  const stories = useMemo(() => {
    const by = new Map<string, { title: string; names: string[] }>();
    for (const p of people ?? []) {
      if (p.wasPlayer) continue;
      const s = by.get(p.storyId) ?? { title: p.storyTitle || t('Untitled story'), names: [] };
      s.names.push(p.character.name);
      by.set(p.storyId, s);
    }
    return [...by.entries()].sort((a, b) => a[1].title.localeCompare(b[1].title));
  }, [people]);

  const update = (next: Partial<VoicePack>) => setDraft((d) => ({ ...d, ...next }));

  const chooseSource = (value: string) => {
    // "computer", or a voice connection's id.
    if (value === 'computer') {
      update({ source: 'computer', connectionId: null, narrator: { voice: '', label: '' } });
      return;
    }
    const c = voiceConns.find((x) => x.id === value);
    if (!c) return;
    const source: VoiceSource = c.adapter === 'elevenlabs' ? 'elevenlabs' : 'openai_speech';
    // Voices of another kind of source don't carry over.
    setDraft((d) =>
      d.source === source
        ? { ...d, connectionId: c.id }
        : {
            ...d,
            source,
            connectionId: c.id,
            narrator: { voice: '', label: '' },
            characters: d.characters.map((ch) => ({ ...ch, voice: '', label: '' })),
          },
    );
  };

  const addNames = (names: string[]) => {
    setDraft((d) => {
      const have = new Set(d.characters.map((c) => c.name.trim().toLowerCase()));
      const added = names
        .map((n) => n.trim())
        .filter((n) => n && !have.has(n.toLowerCase()) && (have.add(n.toLowerCase()), true))
        .map((name) => ({ name, voice: '', label: '' }));
      return { ...d, characters: [...d.characters, ...added].slice(0, MAX_CHARACTERS) };
    });
  };

  const tryVoice = (key: string, choice: VoiceChoice) => {
    const state = useReadAloud.getState();
    if (trying) return state.stop();
    const sample = t('The bell over the door rings, and for a moment the whole café goes quiet.');
    state.read(`pack-try-${key}`, sample, undefined, {
      pack: { ...draft, narrator: choice.voice ? choice : draft.narrator, characters: [] },
    });
  };

  const submit = () => {
    const name = draft.name.trim();
    if (!name) return setError(t('Give the voice pack a name.'));
    if (ai && !draft.connectionId) return setError(t('Choose the voice connection to use.'));
    if (ai && !draft.narrator.voice) return setError(t('Choose the narrator’s voice.'));
    const seen = new Set<string>();
    const characters = draft.characters
      .map((c) => ({ ...c, name: c.name.trim() }))
      .filter(
        (c) => c.name && !seen.has(c.name.toLowerCase()) && (seen.add(c.name.toLowerCase()), true),
      );
    onSaved({ ...draft, name, characters });
  };

  const tryLabel = ai
    ? t('Reads one line with this voice. The voice service may charge a little.')
    : t('Reads one line with this voice.');

  return (
    <form
      className="form voice-pack-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="field">
        <label htmlFor={`${id}-name`}>{t('Name')}</label>
        <input
          id={`${id}-name`}
          value={draft.name}
          maxLength={80}
          required
          onChange={(e) => update({ name: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-source`}>{t('Voices from')}</label>
        <select
          id={`${id}-source`}
          value={ai ? (draft.connectionId ?? '') : 'computer'}
          onChange={(e) => chooseSource(e.target.value)}
        >
          <option value="computer">{t('This computer (free, offline)')}</option>
          {ai && !connection && <option value="">{t('Choose a voice connection')}</option>}
          {voiceConns.map((c) => (
            <option key={c.id} value={c.id}>
              {t('AI voices: {name}', { name: c.label })}
            </option>
          ))}
        </select>
        <p className="muted small">
          {ai
            ? t(
                'The text being read is sent to this voice service, a paragraph or a line at a time. Each reading is recorded in Usage; ElevenLabs charges by the character, and a voice server on your own computer is free.',
              )
            : voiceConns.length === 0
              ? t(
                  'For AI voices (your own, cloned or from a voice library), add a voice connection under AI connections: choose ElevenLabs, or a voice server on your computer such as Kokoro.',
                )
              : t('The computer’s voices cost nothing and never leave this computer.')}
        </p>
      </div>
      <div className="field">
        <label htmlFor={`${id}-narrator`}>{t('Narrator')}</label>
        <div className="voice-row">
          <VoicePicker
            id={`${id}-narrator`}
            label={t('Narrator')}
            source={draft.source}
            connectionId={draft.connectionId}
            value={draft.narrator}
            onChange={(narrator) => update({ narrator })}
          />
          <button
            type="button"
            title={tryLabel}
            aria-pressed={trying}
            onClick={() => tryVoice('narrator', draft.narrator)}
          >
            {trying ? t('Stop') : t('Try it')}
          </button>
        </div>
      </div>
      <div className="inline-choices" role="radiogroup" aria-labelledby={`${id}-speed`}>
        <span id={`${id}-speed`} className="choices-label">
          {t('Speed')}
        </span>
        {READING_SPEEDS.map((s) => (
          <label key={s.id} className="check">
            <input
              type="radio"
              name={`${id}-speed`}
              checked={draft.speed === s.id}
              onChange={() => update({ speed: s.id })}
            />
            {t(s.label)}
          </label>
        ))}
      </div>
      <fieldset className="field voice-cast">
        <legend>{t('Characters')}</legend>
        <p className="muted small">
          {t(
            'Lines a character speaks (in quotes next to their name, or after "Name:") are read in their voice. Everyone else, and the narration, is read by the narrator.',
          )}
        </p>
        {draft.characters.length > 0 && (
          <ul className="voice-cast-list">
            {draft.characters.map((c, i) => (
              <li key={i} className="voice-row">
                <input
                  aria-label={t('Character {n} name', { n: String(i + 1) })}
                  value={c.name}
                  maxLength={80}
                  placeholder={t('Name, as the story spells it')}
                  onChange={(e) =>
                    update({
                      characters: draft.characters.map((x, j) =>
                        j === i ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
                <VoicePicker
                  id={`${id}-c${i}`}
                  label={t('Voice for {name}', { name: c.name || t('this character') })}
                  source={draft.source}
                  connectionId={draft.connectionId}
                  value={c}
                  character
                  onChange={(v) =>
                    update({
                      characters: draft.characters.map((x, j) => (j === i ? { ...x, ...v } : x)),
                    })
                  }
                />
                <button
                  type="button"
                  title={tryLabel}
                  disabled={!c.voice}
                  onClick={() => tryVoice(`c${i}`, c)}
                >
                  {t('Try it')}
                </button>
                <button
                  type="button"
                  className="danger-link"
                  aria-label={t('Remove {name}', { name: c.name || t('this character') })}
                  onClick={() => update({ characters: draft.characters.filter((_, j) => j !== i) })}
                >
                  {t('Remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="button-row">
          <button
            type="button"
            disabled={draft.characters.length >= MAX_CHARACTERS}
            onClick={() =>
              update({ characters: [...draft.characters, { name: '', voice: '', label: '' }] })
            }
          >
            {t('Add a character')}
          </button>
          {stories.length > 0 && (
            <select
              aria-label={t('Add the people from a story')}
              value=""
              onChange={(e) => {
                const s = stories.find(([sid]) => sid === e.target.value);
                if (s) addNames(s[1].names);
              }}
            >
              <option value="">{t('Add the people from a story…')}</option>
              {stories.map(([sid, s]) => (
                <option key={sid} value={sid}>
                  {t('{title} ({count})', { title: s.title, count: String(s.names.length) })}
                </option>
              ))}
            </select>
          )}
        </div>
      </fieldset>
      {tryProblem && (
        <div role="alert">
          <p className="error small">{tryProblem.text}</p>
          {tryProblem.override && (
            <button type="button" onClick={() => useReadAloud.getState().readAnyway()}>
              {t('Read aloud anyway')}
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="button-row">
        <button type="button" onClick={onCancel}>
          {t('Cancel')}
        </button>
        <button type="submit" className="primary">
          {existing ? t('Save changes') : t('Save voice pack')}
        </button>
      </div>
    </form>
  );
}
