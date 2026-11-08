import { useEffect, useId, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { commands, errorMessage } from '../../api/commands';
import { pickVoicePackFile, pickVoicePackTarget } from '../../api/voices';
import { READING_SPEEDS, canReadAloud, useReadAloud, useVoices } from '../../app/readAloud';
import { useLibraryPrefs } from '../../app/library';
import { playChime } from '../../app/replyWatch';
import { useSound } from '../../app/sound';
import {
  copyPack,
  fromFile,
  toFile,
  useVoicePacks,
  usesAiVoices,
  type VoicePack,
} from '../../app/voicePacks';
import { Dialog } from '../../components/Dialog';
import type { ProviderProfile } from '../../types';
import { t, tn } from '../../i18n';
import { voiceConnections } from './kinds';
import { VoicePackEditor } from './VoicePackEditor';

/** A line with someone speaking, to hear a voice pack's voices together. */
export function packSample(pack: VoicePack): string {
  const someone = pack.characters.find((c) => c.voice)?.name;
  return someone
    ? t('The bell over the door rings. "You came back," {name} says.', { name: someone })
    : t('The bell over the door rings, and for a moment the whole café goes quiet.');
}

/**
 * Settings: one switch for all sound, the chime when a reply is ready in a
 * story you left, and reading replies aloud (with voice packs).
 */
export function SoundSection() {
  const id = useId();
  const on = useSound((s) => s.on);
  const setOn = useSound((s) => s.setOn);
  const chime = useLibraryPrefs((s) => s.chime);
  const setChime = useLibraryPrefs((s) => s.setChime);
  return (
    <section
      id="settings-sound"
      className="settings-section"
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
    >
      <h2 id={`${id}-title`} className="section-title">
        <Volume2 className="section-icon" aria-hidden={true} />
        {t('Sound')}
      </h2>
      <p className="muted">{t('What the app plays on this computer.')}</p>
      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            role="switch"
            checked={on}
            aria-describedby={`${id}-on-hint`}
            onChange={(e) => setOn(e.target.checked)}
          />
          <strong>{t('Sound on')}</strong>
        </label>
        <p id={`${id}-on-hint`} className="muted small check-hint">
          {on
            ? t('Turn it off for a silent app: no chime, and nothing is read aloud.')
            : t('Sound is off. Nothing plays and no voice is asked for until you turn it on.')}
        </p>
      </div>
      <fieldset className="sound-options" disabled={!on}>
        <legend className="visually-hidden">{t('Sound')}</legend>
        <div className="field">
          <label className="check">
            <input
              type="checkbox"
              checked={chime}
              aria-describedby={`${id}-hint`}
              onChange={(e) => {
                setChime(e.target.checked);
                if (e.target.checked) playChime();
              }}
            />
            {t('Chime when a reply is ready in another story')}
          </label>
          <p id={`${id}-hint`} className="muted small check-hint">
            {t(
              'A reply keeps writing while you read another story or look at your library. A notice says when it is ready either way.',
            )}
          </p>
        </div>
        <ReadAloudSettings />
      </fieldset>
    </section>
  );
}

/** This computer's connections, loaded when the section opens and on `reload`. */
function useConnectionList(reload: number): ProviderProfile[] {
  const [list, setList] = useState<ProviderProfile[]>([]);
  useEffect(() => {
    let live = true;
    commands
      .listConnections()
      .then((l) => live && setList(l))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [reload]);
  return list;
}

/** Which voices read replies aloud: the computer's one voice, or a voice pack. */
function ReadAloudSettings() {
  const id = useId();
  const packs = useVoicePacks((s) => s.packs);
  const activeId = useVoicePacks((s) => s.active);
  const { setActive, savePack, deletePack } = useVoicePacks.getState();
  const [editing, setEditing] = useState<VoicePack | 'new' | null>(null);
  const [deleting, setDeleting] = useState<VoicePack | null>(null);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null);
  const [reload, setReload] = useState(0);
  const connections = useConnectionList(reload);
  const active = packs.find((p) => p.id === activeId) ?? null;
  const computer = canReadAloud();

  const importPack = async () => {
    setNote(null);
    try {
      const path = await pickVoicePackFile();
      if (!path) return;
      const file = await commands.importVoicePack(path);
      const pack = fromFile(file, voiceConnections(connections));
      savePack(pack);
      setActive(pack.id);
      setNote({
        error: false,
        text:
          usesAiVoices(pack) && !pack.connectionId
            ? t(
                'Imported {name}. Its voices are AI voices: edit it and choose your voice connection.',
                { name: pack.name },
              )
            : t('Imported {name}, and replies are read with it now.', { name: pack.name }),
      });
    } catch (e) {
      setNote({ error: true, text: errorMessage(e) });
    }
  };

  const exportPack = async (pack: VoicePack) => {
    setNote(null);
    try {
      const path = await pickVoicePackTarget(pack.name);
      if (!path) return;
      await commands.exportVoicePack(path, toFile(pack));
      setNote({
        error: false,
        text: t('Saved {name}. The file names the voices only: no keys and no connections.', {
          name: pack.name,
        }),
      });
    } catch (e) {
      setNote({ error: true, text: errorMessage(e) });
    }
  };

  return (
    <div className="field read-aloud-settings" aria-labelledby={`${id}-title`} role="group">
      <h3 id={`${id}-title`}>{t('Read aloud')}</h3>
      <p className="muted small">
        {t(
          'The speaker under a reply reads it aloud. A voice pack gives the narrator and each character a voice of their own, from this computer or from an AI voice service such as ElevenLabs, with your own or cloned voices.',
        )}
      </p>
      <label htmlFor={`${id}-pack`}>{t('Voices')}</label>
      <select
        id={`${id}-pack`}
        value={activeId ?? ''}
        onChange={(e) => setActive(e.target.value || null)}
      >
        <option value="">{t('One computer voice for everything')}</option>
        {packs.map((p) => (
          <option key={p.id} value={p.id}>
            {t('Voice pack: {name}', { name: p.name })}
          </option>
        ))}
      </select>
      {active ? (
        <PackSummary pack={active} connections={connections} />
      ) : computer ? (
        <ComputerVoice />
      ) : (
        <p className="muted small">
          {t(
            'This computer has no voices the app can use. A voice pack with AI voices can still read replies aloud.',
          )}
        </p>
      )}
      <div className="button-row">
        <button type="button" onClick={() => setEditing('new')}>
          {t('New voice pack')}
        </button>
        <button type="button" onClick={() => void importPack()}>
          {t('Import voice pack…')}
        </button>
        {active && (
          <>
            <button type="button" onClick={() => setEditing(active)}>
              {t('Edit')}
            </button>
            <button
              type="button"
              onClick={() => {
                const copy = copyPack(active, t('{name} (copy)', { name: active.name }));
                savePack(copy);
                setActive(copy.id);
              }}
            >
              {t('Duplicate')}
            </button>
            <button type="button" onClick={() => void exportPack(active)}>
              {t('Save to a file…')}
            </button>
            <button
              type="button"
              className="danger-link"
              aria-label={t('Delete {title}', { title: active.name })}
              onClick={() => setDeleting(active)}
            >
              {t('Delete')}
            </button>
          </>
        )}
      </div>
      {note && (
        <p role="status" className={note.error ? 'error small' : 'small note-ok'}>
          {note.text}
        </p>
      )}
      {editing && (
        <Dialog
          title={editing === 'new' ? t('New voice pack') : t('Edit {name}', { name: editing.name })}
          wide
          onClose={() => setEditing(null)}
        >
          <VoicePackEditor
            existing={editing === 'new' ? null : editing}
            connections={connections}
            onCancel={() => setEditing(null)}
            onSaved={(pack) => {
              savePack(pack);
              setActive(pack.id);
              setEditing(null);
              setReload((n) => n + 1);
            }}
          />
        </Dialog>
      )}
      {deleting && (
        <Dialog title={t('Delete voice pack?')} onClose={() => setDeleting(null)}>
          <p>
            {t(
              '{name} is removed from this computer. Replies are read with one computer voice again. A file you saved it to is kept.',
              { name: deleting.name },
            )}
          </p>
          <div className="button-row">
            <button type="button" onClick={() => setDeleting(null)}>
              {t('Keep it')}
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                deletePack(deleting.id);
                setDeleting(null);
              }}
            >
              {t('Delete')}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** What the chosen voice pack does, with a sample to hear. */
function PackSummary({ pack, connections }: { pack: VoicePack; connections: ProviderProfile[] }) {
  const trying = useReadAloud((s) => s.reading === 'settings-sample');
  const problem = useReadAloud((s) => (s.problem?.id === 'settings-sample' ? s.problem : null));
  const { read, stop, readAnyway } = useReadAloud.getState();
  const voiced = pack.characters.filter((c) => c.voice).length;
  const connection = connections.find((c) => c.id === pack.connectionId);
  const narrator = pack.narrator.label || pack.narrator.voice;
  return (
    <>
      <p className="small">
        {[
          narrator ? t('Narrator: {voice}.', { voice: narrator }) : t('Narrator: the usual voice.'),
          tn(
            voiced,
            '{n} character has a voice of their own.',
            '{n} characters have voices of their own.',
          ),
          usesAiVoices(pack)
            ? connection
              ? t('AI voices from {name}; each reading is recorded in Usage.', {
                  name: connection.label,
                })
              : t('Choose a voice connection for it: Edit.')
            : t('The computer’s own voices: free and offline.'),
        ].join(' ')}
      </p>
      <div className="button-row">
        <button
          type="button"
          aria-pressed={trying}
          onClick={() =>
            trying ? stop() : read('settings-sample', packSample(pack), undefined, { pack })
          }
        >
          {trying ? t('Stop') : t('Try it')}
        </button>
      </div>
      {problem && (
        <div role="alert">
          <p className="error small">{problem.text}</p>
          {problem.override && (
            <button type="button" onClick={readAnyway}>
              {t('Read aloud anyway')}
            </button>
          )}
        </div>
      )}
    </>
  );
}

/** The one computer voice and speed replies are read in, with a sample to try. */
function ComputerVoice() {
  const id = useId();
  const voices = useVoices();
  const voice = useReadAloud((s) => s.voice);
  const speed = useReadAloud((s) => s.speed);
  const trying = useReadAloud((s) => s.reading === 'settings-sample');
  const { setVoice, setSpeed, read, stop } = useReadAloud.getState();
  return (
    <>
      <p className="muted small">
        {t('The computer’s own voices read replies aloud, so it works offline and costs nothing.')}
      </p>
      <label htmlFor={`${id}-voice`}>{t('Voice')}</label>
      <select
        id={`${id}-voice`}
        value={voice ?? ''}
        onChange={(e) => setVoice(e.target.value || null)}
      >
        <option value="">{t('The computer’s usual voice')}</option>
        {voices.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>
            {v.lang ? `${v.name} (${v.lang})` : v.name}
          </option>
        ))}
      </select>
      <div className="inline-choices" role="radiogroup" aria-labelledby={`${id}-speed`}>
        <span id={`${id}-speed`} className="choices-label">
          {t('Speed')}
        </span>
        {READING_SPEEDS.map((s) => (
          <label key={s.id} className="check">
            <input
              type="radio"
              name={`${id}-speed`}
              checked={speed === s.id}
              onChange={() => setSpeed(s.id)}
            />
            {t(s.label)}
          </label>
        ))}
      </div>
      <div className="button-row">
        <button
          type="button"
          aria-pressed={trying}
          onClick={() =>
            trying
              ? stop()
              : read(
                  'settings-sample',
                  t('The bell over the door rings, and for a moment the whole café goes quiet.'),
                  undefined,
                  { pack: null },
                )
          }
        >
          {trying ? t('Stop') : t('Try it')}
        </button>
      </div>
    </>
  );
}
