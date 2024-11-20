import React, { CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import * as Tone from 'tone'; // Audio we are using
import useTownController from '../../../hooks/useTownController'; // for Socket
import { setGlobalPianoVolume } from '../TownMap';
import VolumeControl from './VolumeControl'; // Volume Slider
import YoutubeSearchAndPlay from './YoutubeSearchAndPlay'; //youtube search

interface PianoProps {
  onClose: () => void;
}

interface ExtendedCSSProperties extends CSSProperties {
  [key: string]: string | number | CSSProperties | undefined;
}

// Used for math in CSS
const NUM_WHITE_KEYS = 21;
const BLACK_KEYS_WIDTH = 3.4;

// CSS styles for the piano overlay and keys
const styles: { [key: string]: ExtendedCSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  container: {
    backgroundColor: '#4a2511',
    borderRadius: '8px',
    padding: '24px',
    width: '1400px',
    maxWidth: '90%',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: {
    color: 'white',
    fontSize: '24px',
    fontWeight: 'bold',
  },
  closeButton: {
    color: 'white',
    padding: '1px 1px',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    border: 'none',
  },
  instructions: {
    color: 'white',
    textAlign: 'center',
    marginBottom: '20px',
  },
  pianoContainer: {
    position: 'relative',
    height: '300px',
    backgroundColor: '#111827',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  whiteKeysContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
  },
  whiteKey: {
    flex: 1,
    backgroundColor: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: '0 0 4px 4px',
    cursor: 'pointer',
    position: 'relative',
  },
  whiteKeyActive: {
    backgroundColor: '#93c5fd',
  },
  blackKeysContainer: {
    position: 'absolute',
    top: 0,
    left: `${100 / NUM_WHITE_KEYS - BLACK_KEYS_WIDTH / 2}%`,
    right: `-${100 / NUM_WHITE_KEYS - BLACK_KEYS_WIDTH / 2}%`,
    height: '65%',
  },
  blackKey: {
    position: 'absolute',
    width: `${BLACK_KEYS_WIDTH}%`,
    height: '100%',
    backgroundColor: 'black',
    borderRadius: '0 0 4px 4px',
    cursor: 'pointer',
  },
  blackKeyActive: {
    backgroundColor: '#1e40af',
  },
  keyLabel: {
    position: 'absolute',
    bottom: '8px',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#4b5563',
    fontSize: '14px',
  },
  blackKeyLabel: {
    color: 'white',
  },
};

const noteMap: { [key: string]: string } = {
  'Q': 'C3',
  '2': 'C#3',
  'W': 'D3',
  '3': 'D#3',
  'E': 'E3',
  'R': 'F3',
  '5': 'F#3',
  'T': 'G3',
  '6': 'G#3',
  'Y': 'A3',
  '7': 'A#3',
  'U': 'B3',

  'I': 'C4',
  '9': 'C#4',
  'O': 'D4',
  '0': 'D#4',
  'P': 'E4',
  '[': 'F4',
  'A': 'F#4',
  'Z': 'G4',
  'S': 'G#4',
  'X': 'A4',
  'D': 'A#4',
  'C': 'B4',

  'V': 'C5',
  'G': 'C#5',
  'B': 'D5',
  'H': 'D#5',
  'N': 'E5',
  'M': 'F5',
  'K': 'F#5',
  ',': 'G5',
  'L': 'G#5',
  '.': 'A5',
  ';': 'A#5',
  '/': 'B5',
};

export default function KeyboardOverlay({ onClose }: PianoProps) {
  const [piano, setPiano] = useState<Tone.Sampler | null>(null);
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const townController = useTownController();

  const whiteKeys = useMemo(
    () => [
      'Q',
      'W',
      'E',
      'R',
      'T',
      'Y',
      'U',
      'I',
      'O',
      'P',
      '[',
      'Z',
      'X',
      'C',
      'V',
      'B',
      'N',
      'M',
      ',',
      '.',
      '/',
    ],
    [],
  );
  const blackKeys = useMemo(
    () => [
      { key: '2', position: `${0 * (100 / NUM_WHITE_KEYS)}%` },
      { key: '3', position: `${1 * (100 / NUM_WHITE_KEYS)}%` },
      { key: '5', position: `${3 * (100 / NUM_WHITE_KEYS)}%` },
      { key: '6', position: `${4 * (100 / NUM_WHITE_KEYS)}%` },
      { key: '7', position: `${5 * (100 / NUM_WHITE_KEYS)}%` },
      { key: '9', position: `${7 * (100 / NUM_WHITE_KEYS)}%` },
      { key: '0', position: `${8 * (100 / NUM_WHITE_KEYS)}%` },
      { key: 'A', position: `${10 * (100 / NUM_WHITE_KEYS)}%` },
      { key: 'S', position: `${11 * (100 / NUM_WHITE_KEYS)}%` },
      { key: 'D', position: `${12 * (100 / NUM_WHITE_KEYS)}%` },
      { key: 'G', position: `${14 * (100 / NUM_WHITE_KEYS)}%` },
      { key: 'H', position: `${15 * (100 / NUM_WHITE_KEYS)}%` },
      { key: 'K', position: `${17 * (100 / NUM_WHITE_KEYS)}%` },
      { key: 'L', position: `${18 * (100 / NUM_WHITE_KEYS)}%` },
      { key: ';', position: `${19 * (100 / NUM_WHITE_KEYS)}%` },
    ],
    [],
  );

  // Load the piano sampler for playing
  useEffect(() => {
    const newPiano = new Tone.Sampler({
      urls: {
        'D#3': 'Ds3.mp3',
        'F#3': 'Fs3.mp3',
        'A3': 'A3.mp3',
        'C4': 'C4.mp3',
        'D#4': 'Ds4.mp3',
        'F#4': 'Fs4.mp3',
        'A4': 'A4.mp3',
        'C5': 'C5.mp3',
        'D#5': 'Ds5.mp3',
        'F#5': 'Fs5.mp3',
        'A5': 'A5.mp3',
      },
      baseUrl: 'https://tonejs.github.io/audio/salamander/',
      onload: () => {
        console.log('Piano loaded!');
      },
      release: 1,
    }).toDestination();

    setPiano(newPiano);

    return () => {
      newPiano.dispose();
    };
  }, []);

  const handleVolumeChange = (newVolume: number) => {
    if (piano) {
      piano.volume.value = Tone.gainToDb(newVolume);
      setGlobalPianoVolume(newVolume);
    }
  };

  // Remove the global receiver piano from here since it's now in TownMap
  const playNote = useCallback(
    async (key: string) => {
      setActiveKeys(prev => new Set(prev).add(key));
      if (noteMap[key] && piano) {
        try {
          await Tone.start();
          piano.triggerAttack(noteMap[key]);
          townController.socket.emit('playNote', {
            note: noteMap[key],
            playerId: townController.ourPlayer.id,
          });
        } catch (error) {
          console.error('Error playing note:', error);
        }
      }
    },
    [piano, townController],
  );

  const stopNote = useCallback(
    (key: string) => {
      if (piano) {
        const duration = Tone.now() + 0.01;
        piano.triggerRelease(noteMap[key], duration);
        townController.socket.emit('stopNote', {
          note: noteMap[key],
          playerId: townController.ourPlayer.id,
        });
      }
      setActiveKeys(prev => {
        const newKeys = new Set(prev);
        newKeys.delete(key);
        return newKeys;
      });
    },
    [piano, townController],
  );

  const handleKeyDown = useCallback(
    async (event: KeyboardEvent) => {
      if (isSearching) return; // Ignore keyboard events while searching
      
      if (event.key === 'Escape' || event.key === ' ') {
        onClose();
        return;
      }
      const key = event.key.toUpperCase();
      if (!activeKeys.has(key) && [...whiteKeys, ...blackKeys.map(k => k.key)].includes(key)) {
        event.preventDefault(); // Prevent default only for valid piano keys
        await playNote(key);
      }
    },
    [activeKeys, blackKeys, whiteKeys, onClose, playNote, isSearching],
  );

  const handleKeyUp = useCallback(
    (event: KeyboardEvent) => {
      const key = event.key.toUpperCase();
      stopNote(key);
    },
    [stopNote],
  );

  // Handle keyboard events
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  return (
    <div style={styles.overlay}>
      <div style={styles.container}>
        <div style={styles.header}>
          <h2 style={styles.title}>Piano</h2>
          {/* style for volume */}
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <VolumeControl onVolumeChange={handleVolumeChange} defaultVolume={100} />
            <button style={styles.closeButton} onClick={onClose}>
              &times;
            </button>
          </div>
        </div>
        <div style={styles.instructions}>Search for a song and play along with your piano!</div>

        {/* Song Search and Playback Component */}
        <YoutubeSearchAndPlay onSearchFocus={setIsSearching}/>

        <div style={styles.instructions}>Press Space, ESC or &times; to close</div>
        <div style={styles.pianoContainer}>
          {/* White Keys */}
          <div style={styles.whiteKeysContainer}>
            {whiteKeys.map(key => (
              <div
                key={key}
                style={{
                  ...styles.whiteKey,
                  ...(activeKeys.has(key) ? styles.whiteKeyActive : {}),
                }}
                onMouseDown={() => playNote(key)}
                onMouseUp={() => stopNote(key)}
                onMouseLeave={() => stopNote(key)}>
                <div style={styles.keyLabel}>({key})</div>
              </div>
            ))}
          </div>
          {/* Black Keys */}
          <div style={styles.blackKeysContainer}>
            {blackKeys.map(({ key, position }) => (
              <div
                key={key}
                style={{
                  ...styles.blackKey,
                  left: position,
                  ...(activeKeys.has(key) ? styles.blackKeyActive : {}),
                }}
                onMouseDown={() => playNote(key)}
                onMouseUp={() => stopNote(key)}
                onMouseLeave={() => stopNote(key)}>
                <div style={{ ...styles.keyLabel, ...styles.blackKeyLabel }}>({key})</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
