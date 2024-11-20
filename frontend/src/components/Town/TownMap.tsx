import Phaser from 'phaser';
import React, { useEffect, useState } from 'react';
import * as Tone from 'tone';
import useTownController from '../../hooks/useTownController';
import SocialSidebar from '../SocialSidebar/SocialSidebar';
import KeyboardOverlay from './interactables/KeyboardOverlay';
import NewConversationModal from './interactables/NewCoversationModal';
import TownGameScene from './TownGameScene';

// global receiver piano that exists outside of any component
const globalReceiverPiano = new Tone.Sampler({
  urls: {
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
    console.log('Global receiver piano loaded!');
  },
  release: 1,
}).toDestination();

const MAX_HEARING_DISTANCE = 400; // Maximum distance to hear piano
const MIN_HEARING_DISTANCE = 50; // Distance for full volume
const pianoPosition = {
  x: 2187, // Piano X coordinate
  y: 1033, // Piano Y coordinate
};

export const setGlobalPianoVolume = (volume: number) => {
  globalReceiverPiano.volume.value = Tone.gainToDb(volume);
};

export default function TownMap(): JSX.Element {
  const coveyTownController = useTownController();
  const [showPiano, setShowPiano] = useState(false);

  useEffect(() => {
    const config = {
      type: Phaser.AUTO,
      backgroundColor: '#000000',
      parent: 'map-container',
      render: { pixelArt: true, powerPreference: 'high-performance' },
      scale: {
        expandParent: false,
        mode: Phaser.Scale.ScaleModes.WIDTH_CONTROLS_HEIGHT,
        autoRound: true,
      },
      width: 800,
      height: 600,
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { y: 0 },
        },
      },
    };

    const game = new Phaser.Game(config);
    const newGameScene = new TownGameScene(coveyTownController);
    game.scene.add('coveyBoard', newGameScene, true);

    const handlePlayNote = (noteData: { note: string; playerId: string }) => {
      const ourPlayer = coveyTownController.ourPlayer;

      // If we're the one playing, don't apply distance-based volume
      if (noteData.playerId === ourPlayer.id) {
        return;
      }

      if (ourPlayer.location) {
        // Get the game scene to check mute state
        const gameScene = coveyTownController.ourPlayer.gameObjects?.sprite?.scene as TownGameScene;
        const isMuted = gameScene?.isMuted ?? false;

        // Calculate only listener distance
        const listenerDistance = Phaser.Math.Distance.Between(
          pianoPosition.x,
          pianoPosition.y,
          ourPlayer.location.x,
          ourPlayer.location.y,
        );

        // Only play if within hearing range
        if (listenerDistance <= MAX_HEARING_DISTANCE) {
          // Always show visual effects, even when muted
          if (gameScene) {
            gameScene.game.events.emit('pianoPlayed');
            gameScene.game.events.emit('playerListening', {
              playerId: ourPlayer.id,
            });
          }

          // Only play audio if not muted
          if (!isMuted) {
            let volume = 100; // Default volume

            // Apply volume falloff based only on listener distance
            if (listenerDistance > MIN_HEARING_DISTANCE) {
              volume *= Math.max(
                0,
                1 -
                  (listenerDistance - MIN_HEARING_DISTANCE) /
                    (MAX_HEARING_DISTANCE - MIN_HEARING_DISTANCE),
              );
            }

            // Play the note with calculated volume
            globalReceiverPiano.volume.value = Tone.gainToDb(volume / 100);
            globalReceiverPiano.triggerAttack(noteData.note);
          }
        }
      }
    };

    const handleStopNote = (noteData: { note: string; playerId: string }) => {
      const ourPlayer = coveyTownController.ourPlayer;
      if (noteData.playerId === ourPlayer.id) {
        return;
      }

      if (globalReceiverPiano) {
        globalReceiverPiano.triggerRelease(noteData.note, Tone.now() + 0.01);
      } else {
        throw new Error('Cannot stop a note on a nonexistent piano!');
      }
    };

    coveyTownController.socket.on('playNote', handlePlayNote);
    coveyTownController.socket.on('stopNote', handleStopNote);

    game.events.on('showPiano', () => {
      setShowPiano(true);
    });

    return () => {
      coveyTownController.socket.off('playNote', handlePlayNote);
      coveyTownController.socket.off('stopNote', handleStopNote);
      game.events.off('showPiano');
      game.destroy(true);
    };
  }, [coveyTownController]);

  return (
    <div id='app-container'>
      <NewConversationModal />
      <div id='map-container' />
      <div id='social-container'>
        <SocialSidebar />
      </div>
      {showPiano && (
        <KeyboardOverlay
          onClose={() => {
            setShowPiano(false);
            const gameScene = coveyTownController.ourPlayer.gameObjects?.sprite?.scene;
            if (gameScene) {
              gameScene.game.events.emit('closePiano');
            }
          }}
        />
      )}
    </div>
  );
}
