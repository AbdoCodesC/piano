import assert from 'assert';
import Phaser from 'phaser';
import PlayerController from '../../classes/PlayerController';
import TownController from '../../classes/TownController';
import { PlayerLocation } from '../../types/CoveyTownSocket';
import { Callback } from '../VideoCall/VideoFrontend/types';
import Interactable from './Interactable';
import ConversationArea from './interactables/ConversationArea';
import Transporter from './interactables/Transporter';
import ViewingArea from './interactables/ViewingArea';

// Still not sure what the right type is here... "Interactable" doesn't do it
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function interactableTypeForObjectType(type: string): any {
  if (type === 'ConversationArea') {
    return ConversationArea;
  } else if (type === 'Transporter') {
    return Transporter;
  } else if (type === 'ViewingArea') {
    return ViewingArea;
  } else {
    throw new Error(`Unknown object type: ${type}`);
  }
}

// Original inspiration and code from:
// https://medium.com/@michaelwesthadley/modular-game-worlds-in-phaser-3-tilemaps-1-958fc7e6bbd6

export default class TownGameScene extends Phaser.Scene {
  private _pendingOverlapExits = new Map<Interactable, () => void>();

  addOverlapExit(interactable: Interactable, callback: () => void) {
    this._pendingOverlapExits.set(interactable, callback);
  }

  private _isInteracting = false;

  private _players: PlayerController[] = [];

  private _interactables: Interactable[] = [];

  private _cursors: Phaser.Types.Input.Keyboard.CursorKeys[] = [];

  private _cursorKeys?: Phaser.Types.Input.Keyboard.CursorKeys;

  /*
   * A "captured" key doesn't send events to the browser - they are trapped by Phaser
   * When pausing the game, we uncapture all keys, and when resuming, we re-capture them.
   * This is the list of keys that are currently captured by Phaser.
   */
  private _previouslyCapturedKeys: number[] = [];

  private _lastLocation?: PlayerLocation;

  private _ready = false;

  private _paused = false;

  public coveyTownController: TownController;

  private _onGameReadyListeners: Callback[] = [];

  public isMuted = false;

  private _pianoOverlayActive = false;

  private _gameIsReady = new Promise<void>(resolve => {
    if (this._ready) {
      resolve();
    } else {
      this._onGameReadyListeners.push(resolve);
    }
  });

  public get gameIsReady() {
    return this._gameIsReady;
  }

  public get cursorKeys() {
    const ret = this._cursorKeys;
    if (!ret) {
      throw new Error('Unable to access cursors before game scene is loaded');
    }
    return ret;
  }

  private _resourcePathPrefix: string;

  // Initializing the sprite we are adding
  private _piano?: Phaser.Physics.Arcade.Sprite;

  constructor(coveyTownController: TownController, resourcePathPrefix = '') {
    super('TownGameScene');
    this._resourcePathPrefix = resourcePathPrefix;
    this.coveyTownController = coveyTownController;
    this._players = this.coveyTownController.players;
  }

  preload() {
    this.load.image(
      'Room_Builder_32x32',
      this._resourcePathPrefix + '/assets/tilesets/Room_Builder_32x32.png',
    );
    this.load.image(
      '22_Museum_32x32',
      this._resourcePathPrefix + '/assets/tilesets/22_Museum_32x32.png',
    );
    this.load.image(
      '5_Classroom_and_library_32x32',
      this._resourcePathPrefix + '/assets/tilesets/5_Classroom_and_library_32x32.png',
    );
    this.load.image(
      '12_Kitchen_32x32',
      this._resourcePathPrefix + '/assets/tilesets/12_Kitchen_32x32.png',
    );
    this.load.image(
      '1_Generic_32x32',
      this._resourcePathPrefix + '/assets/tilesets/1_Generic_32x32.png',
    );
    this.load.image(
      '13_Conference_Hall_32x32',
      this._resourcePathPrefix + '/assets/tilesets/13_Conference_Hall_32x32.png',
    );
    this.load.image(
      '14_Basement_32x32',
      this._resourcePathPrefix + '/assets/tilesets/14_Basement_32x32.png',
    );
    this.load.image(
      '16_Grocery_store_32x32',
      this._resourcePathPrefix + '/assets/tilesets/16_Grocery_store_32x32.png',
    );
    this.load.tilemapTiledJSON('map', this._resourcePathPrefix + '/assets/tilemaps/indoors.json');
    this.load.atlas(
      'atlas',
      this._resourcePathPrefix + '/assets/atlas/atlas.png',
      this._resourcePathPrefix + '/assets/atlas/atlas.json',
    );

    this.load.image('piano', '/assets/tilesets/piano.png');
  }

  updatePlayers(players: PlayerController[]) {
    //Make sure that each player has sprites
    players.map(eachPlayer => this.createPlayerSprites(eachPlayer));

    // Remove disconnected players from board
    const disconnectedPlayers = this._players.filter(
      player => !players.find(p => p.id === player.id),
    );

    disconnectedPlayers.forEach(disconnectedPlayer => {
      if (disconnectedPlayer.gameObjects) {
        const { sprite, label } = disconnectedPlayer.gameObjects;
        if (sprite && label) {
          sprite.destroy();
          label.destroy();
        }
      }
    });
    // Remove disconnected players from list
    this._players = players;
  }

  getNewMovementDirection() {
    if (this._cursors.find(keySet => keySet.left?.isDown)) {
      return 'left';
    }
    if (this._cursors.find(keySet => keySet.right?.isDown)) {
      return 'right';
    }
    if (this._cursors.find(keySet => keySet.down?.isDown)) {
      return 'front';
    }
    if (this._cursors.find(keySet => keySet.up?.isDown)) {
      return 'back';
    }
    return undefined;
  }

  moveOurPlayerTo(destination: Partial<PlayerLocation>) {
    const gameObjects = this.coveyTownController.ourPlayer.gameObjects;
    if (!gameObjects) {
      throw new Error('Unable to move player without game objects created first');
    }
    if (!this._lastLocation) {
      this._lastLocation = { moving: false, rotation: 'front', x: 0, y: 0 };
    }
    if (destination.x !== undefined) {
      gameObjects.sprite.x = destination.x;
      this._lastLocation.x = destination.x;
    }
    if (destination.y !== undefined) {
      gameObjects.sprite.y = destination.y;
      this._lastLocation.y = destination.y;
    }
    if (destination.moving !== undefined) {
      this._lastLocation.moving = destination.moving;
    }
    if (destination.rotation !== undefined) {
      this._lastLocation.rotation = destination.rotation;
    }
    this.coveyTownController.emitMovement(this._lastLocation);
  }

  update() {
    if (this._paused || this._isInteracting) {
      return;
    }
    const gameObjects = this.coveyTownController.ourPlayer.gameObjects;
    if (gameObjects && this._cursors) {
      const speed = 300; // original: 175 Testing: 300

      const prevVelocity = gameObjects.sprite.body.velocity.clone();
      const body = gameObjects.sprite.body as Phaser.Physics.Arcade.Body;

      // Stop any previous movement from the last frame
      body.setVelocity(0);

      const primaryDirection = this.getNewMovementDirection();
      switch (primaryDirection) {
        case 'left':
          body.setVelocityX(-speed);
          gameObjects.sprite.anims.play('misa-left-walk', true);
          break;
        case 'right':
          body.setVelocityX(speed);
          gameObjects.sprite.anims.play('misa-right-walk', true);
          break;
        case 'front':
          body.setVelocityY(speed);
          gameObjects.sprite.anims.play('misa-front-walk', true);
          break;
        case 'back':
          body.setVelocityY(-speed);
          gameObjects.sprite.anims.play('misa-back-walk', true);
          break;
        default:
          // Not moving
          gameObjects.sprite.anims.stop();
          // If we were moving, pick and idle frame to use
          if (prevVelocity.x < 0) {
            gameObjects.sprite.setTexture('atlas', 'misa-left');
          } else if (prevVelocity.x > 0) {
            gameObjects.sprite.setTexture('atlas', 'misa-right');
          } else if (prevVelocity.y < 0) {
            gameObjects.sprite.setTexture('atlas', 'misa-back');
          } else if (prevVelocity.y > 0) gameObjects.sprite.setTexture('atlas', 'misa-front');
          break;
      }

      // Normalize and scale the velocity so that player can't move faster along a diagonal
      gameObjects.sprite.body.velocity.normalize().scale(speed);

      const isMoving = primaryDirection !== undefined;
      gameObjects.label.setX(body.x);
      gameObjects.label.setY(body.y - 20);
      const x = gameObjects.sprite.getBounds().centerX;
      const y = gameObjects.sprite.getBounds().centerY;
      //Move the sprite
      if (
        !this._lastLocation ||
        this._lastLocation.x !== x ||
        this._lastLocation.y !== y ||
        (isMoving && this._lastLocation.rotation !== primaryDirection) ||
        this._lastLocation.moving !== isMoving
      ) {
        if (!this._lastLocation) {
          this._lastLocation = {
            x,
            y,
            rotation: primaryDirection || 'front',
            moving: isMoving,
          };
        }
        this._lastLocation.x = x;
        this._lastLocation.y = y;
        this._lastLocation.rotation = primaryDirection || this._lastLocation.rotation || 'front';
        this._lastLocation.moving = isMoving;
        this._pendingOverlapExits.forEach((cb, interactable) => {
          if (
            !Phaser.Geom.Rectangle.Overlaps(
              interactable.getBounds(),
              gameObjects.sprite.getBounds(),
            )
          ) {
            this._pendingOverlapExits.delete(interactable);
            cb();
          }
        });
        this.coveyTownController.emitMovement(this._lastLocation);
      }
    }
  }

  private _map?: Phaser.Tilemaps.Tilemap;

  public get map(): Phaser.Tilemaps.Tilemap {
    const map = this._map;
    if (!map) {
      throw new Error('Cannot access map before it is initialized');
    }
    return map;
  }

  getInteractables(): Interactable[] {
    const typedObjects = this.map.filterObjects('Objects', obj => obj.type !== '');
    assert(typedObjects);
    const gameObjects = this.map.createFromObjects(
      'Objects',
      typedObjects.map(obj => ({
        id: obj.id,
        classType: interactableTypeForObjectType(obj.type),
      })),
    );

    return gameObjects as Interactable[];
  }

  private _shakePiano() {
    if (this._piano) {
      const originalX = 2187; // Use the exact piano coordinates
      const originalY = 1033;

      // shake effect
      this.tweens.add({
        targets: this._piano,
        x: [originalX - 2, originalX + 2, originalX - 1, originalX + 1, originalX],
        duration: 200,
        ease: 'Power1',
        onComplete: () => {
          // Force reset to original position
          if (this._piano) {
            this._piano.setPosition(originalX, originalY);
          }
        },
      });
    }
  }

  private _createListeningEffect(player: PlayerController) {
    if (!player.gameObjects?.sprite) return;

    const sprite = player.gameObjects.sprite;

    if (!this.isMuted) {
      // Create unmuted effect (musical notes)
      const notes = [
        { symbol: '♪', x: -10, y: -35, size: '20px' },
        { symbol: '♫', x: 10, y: -40, size: '24px' },
        { symbol: '♪', x: -5, y: -45, size: '22px' },
      ];

      const indicators = notes.map(note => {
        return this.add
          .text(sprite.x + note.x, sprite.y + note.y, note.symbol, {
            fontSize: note.size,
            color: '#FFFFFF',
            stroke: '#000000',
            strokeThickness: 3,
            shadow: {
              color: '#000000',
              fill: true,
              offsetX: 2,
              offsetY: 2,
              blur: 4,
            },
          })
          .setDepth(30);
      });

      indicators.forEach((indicator, index) => {
        this.tweens.add({
          targets: indicator,
          y: sprite.y - 55 - index * 5,
          alpha: { from: 1, to: 0 },
          duration: 800,
          ease: 'Sine.easeOut',
          delay: index * 100,
        });
      });

      this.time.delayedCall(1000, () => {
        indicators.forEach(indicator => indicator.destroy());
      });
    }
  }

  create() {
    this._map = this.make.tilemap({ key: 'map' });

    // to prevent scrolling:: without, makes the piano not really visible
    this.cameras.main.centerOn(this.cameras.main.centerX, this.cameras.main.centerY);
    window.addEventListener(
      'keydown', // Listen for any key press
      e => {
        // Event handler function
        // Check if the pressed key is in our list of game control keys
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) > -1) {
          e.preventDefault(); // Stop default browser behavior
        }
      },
      false,
    );

    // shows you where you are on the map x-axis and y-axis when pressing P
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-P', () => {
        // Press 'P' to log position :: for finding where to put piano
        const playerSprite = this.coveyTownController.ourPlayer.gameObjects?.sprite; // this is the player running by the way
        if (playerSprite) {
          console.log(
            `Player position - X: ${Math.round(playerSprite.x)}, Y: ${Math.round(playerSprite.y)}`,
          );
        }
      });
    }

    /* Parameters are the name you gave the tileset in Tiled and then the key of the
         tileset image in Phaser's cache (i.e. the name you used in preload)
         */
    const tileset = [
      'Room_Builder_32x32',
      '22_Museum_32x32',
      '5_Classroom_and_library_32x32',
      '12_Kitchen_32x32',
      '1_Generic_32x32',
      '13_Conference_Hall_32x32',
      '14_Basement_32x32',
      '16_Grocery_store_32x32',
    ].map(v => {
      const ret = this.map.addTilesetImage(v);
      assert(ret);
      return ret;
    });

    // Parameters: layer name (or index) from Tiled, tileset, x, y
    const belowLayer = this.map.createLayer('Below Player', tileset, 0, 0);
    assert(belowLayer);
    belowLayer.setDepth(-10);
    const wallsLayer = this.map.createLayer('Walls', tileset, 0, 0);
    const onTheWallsLayer = this.map.createLayer('On The Walls', tileset, 0, 0);
    assert(wallsLayer);
    assert(onTheWallsLayer);
    wallsLayer.setCollisionByProperty({ collides: true });
    onTheWallsLayer.setCollisionByProperty({ collides: true });

    const worldLayer = this.map.createLayer('World', tileset, 0, 0);
    assert(worldLayer);
    worldLayer.setCollisionByProperty({ collides: true });
    const aboveLayer = this.map.createLayer('Above Player', tileset, 0, 0);
    assert(aboveLayer);
    aboveLayer.setCollisionByProperty({ collides: true });

    const veryAboveLayer = this.map.createLayer('Very Above Player', tileset, 0, 0);
    assert(veryAboveLayer);
    /* By default, everything gets depth sorted on the screen in the order we created things.
         Here, we want the "Above Player" layer to sit on top of the player, so we explicitly give
         it a depth. Higher depths will sit on top of lower depth objects.
         */
    worldLayer.setDepth(5);
    aboveLayer.setDepth(10);
    veryAboveLayer.setDepth(15);

    // Object layers in Tiled let you embed extra info into a map - like a spawn point or custom
    // collision shapes. In the tmx file, there's an object layer with a point named "Spawn Point"
    const spawnPoint = this.map.findObject(
      'Objects',
      obj => obj.name === 'Spawn Point',
    ) as unknown as Phaser.GameObjects.Components.Transform;

    const labels = this.map.filterObjects('Objects', obj => obj.name === 'label');
    labels?.forEach(label => {
      if (label.x && label.y) {
        this.add.text(label.x, label.y, label.text.text, {
          color: '#FFFFFF',
          backgroundColor: '#000000',
        });
      }
    });
    assert(this.input.keyboard);
    this._cursorKeys = this.input.keyboard.createCursorKeys();
    this._cursors.push(this._cursorKeys);
    this._cursors.push(
      this.input.keyboard.addKeys(
        {
          up: Phaser.Input.Keyboard.KeyCodes.W,
          down: Phaser.Input.Keyboard.KeyCodes.S,
          left: Phaser.Input.Keyboard.KeyCodes.A,
          right: Phaser.Input.Keyboard.KeyCodes.D,
        },
        false,
      ) as Phaser.Types.Input.Keyboard.CursorKeys,
    );
    this._cursors.push(
      this.input.keyboard.addKeys(
        {
          up: Phaser.Input.Keyboard.KeyCodes.H,
          down: Phaser.Input.Keyboard.KeyCodes.J,
          left: Phaser.Input.Keyboard.KeyCodes.K,
          right: Phaser.Input.Keyboard.KeyCodes.L,
        },
        false,
      ) as Phaser.Types.Input.Keyboard.CursorKeys,
    );

    // Create a sprite with physics enabled via the physics system. The image used for the sprite
    // has a bit of whitespace, so I'm using setSize & setOffset to control the size of the
    // player's body.
    const sprite = this.physics.add
      .sprite(spawnPoint.x, spawnPoint.y, 'atlas', 'misa-front')
      .setSize(30, 40)
      .setOffset(0, 24)
      .setDepth(6);
    const label = this.add
      .text(spawnPoint.x, spawnPoint.y - 20, `(You)${this.isMuted ? '🔇' : '🔊'}`, {
        font: '18px monospace',
        color: '#000000',
        backgroundColor: '#ffffff',
      })
      .setDepth(6);
    this.coveyTownController.ourPlayer.gameObjects = {
      sprite,
      label,
      locationManagedByGameScene: true,
    };

    this._interactables = this.getInteractables();

    this.moveOurPlayerTo({ rotation: 'front', moving: false, x: spawnPoint.x, y: spawnPoint.y });

    // Watch the player and worldLayer for collisions, for the duration of the scene:
    this.physics.add.collider(sprite, worldLayer);
    this.physics.add.collider(sprite, wallsLayer);
    this.physics.add.collider(sprite, aboveLayer);
    this.physics.add.collider(sprite, onTheWallsLayer);

    // Create the player's walking animations from the texture atlas. These are stored in the global
    // animation manager so any sprite can access them.
    const { anims } = this;
    anims.create({
      key: 'misa-left-walk',
      frames: anims.generateFrameNames('atlas', {
        prefix: 'misa-left-walk.',
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    anims.create({
      key: 'misa-right-walk',
      frames: anims.generateFrameNames('atlas', {
        prefix: 'misa-right-walk.',
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    anims.create({
      key: 'misa-front-walk',
      frames: anims.generateFrameNames('atlas', {
        prefix: 'misa-front-walk.',
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    anims.create({
      key: 'misa-back-walk',
      frames: anims.generateFrameNames('atlas', {
        prefix: 'misa-back-walk.',
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });

    const camera = this.cameras.main;
    camera.startFollow(this.coveyTownController.ourPlayer.gameObjects.sprite);
    camera.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

    // Help text that has a "fixed" position on the screen
    this.add
      .text(16, 16, `Arrow keys to move`, {
        font: '18px monospace',
        color: '#000000',
        padding: {
          x: 20,
          y: 10,
        },
        backgroundColor: '#ffffff',
      })
      .setScrollFactor(0)
      .setDepth(30);

    this._ready = true;
    this.updatePlayers(this.coveyTownController.players);

    this._onGameReadyListeners.forEach(listener => listener());
    this._onGameReadyListeners = [];
    this.coveyTownController.addListener('playersChanged', players => this.updatePlayers(players));

    // DEBUG piano creation
    console.log('Starting create method');
    console.log('Current scene dimensions:', this.scale.width, this.scale.height);

    // Position of the piano X: 2187, Y: 1033
    this._piano = this.physics.add.sprite(2187, 1033, 'piano');
    if (this._piano) {
      this._piano.setScale(0.3, 0.3); // this sets the size of the piano
      this._piano.setDepth(5);
      this._piano.setImmovable(true); // Make sure piano doesn't move when collided with

      // styling the label of the piano, 1053 is -20 y-axis wise under the position of the piano
      const pianoLabel = this.add.text(2187, 1053, 'Piano', {
        font: 'bold 16px Arial',
        color: '#FFFFFF',
        backgroundColor: '#000000',
        padding: { x: 8, y: 4 },
        align: 'center',
      });

      pianoLabel.setOrigin(0.77, -0.26); // where to put it 0.77 is the x axis and -0.26 is the y axis
      pianoLabel.setDepth(5); // z-index (layering) of the piano label in the Phaser game scene

      this.input.keyboard.on('keydown-SPACE', () => {
        this._handlePianoToggle();
      });

      this.physics.add.collider(this.coveyTownController.ourPlayer.gameObjects.sprite, this._piano); // Prevents the player from walking through the piano
    }

    //  event listeners for piano effects
    this.game.events.on('pianoPlayed', () => {
      this._shakePiano();
    });

    this.game.events.on('playerListening', ({ playerId }: { playerId: string }) => {
      const player = this._players.find(p => p.id === playerId);
      if (player) {
        this._createListeningEffect(player);
      }
    });

    // Add mute instructions text
    this.add
      .text(16, 46, `M key to mute`, {
        // Position it below the movement instructions
        font: '18px monospace',
        color: '#000000',
        padding: {
          x: 20,
          y: 10,
        },
        backgroundColor: '#ffffff',
      })
      .setScrollFactor(0)
      .setDepth(30);

      if (this.input.keyboard) {
        const handleMuteKey = (event: KeyboardEvent) => {
          if (!this._pianoOverlayActive && event.key.toLowerCase() === 'm') {
            this.isMuted = !this.isMuted;
            this._updateMuteStatus();
          }
        };
      
        window.addEventListener('keydown', handleMuteKey);
      
        this.events.on('shutdown', () => {
          window.removeEventListener('keydown', handleMuteKey);
        });
      }

    // Prevents Browser Defaults, We want these keys for game controls only
    const preventDefaultKeys = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) > -1) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', preventDefaultKeys, false); // any key that gets used, don't refresh the page

    // When scene shuts down remove the event listener:: memory management
    this.events.on('shutdown', () => {
      window.removeEventListener('keydown', preventDefaultKeys, false);

      // Clean up other events
      if (this.input.keyboard) {
        this.input.keyboard.off('keydown-SPACE');
        this.input.keyboard.off('keydown-ESC');
      }
    });
  }

  private _updateMuteStatus() {
    // Update only player label
    const ourPlayer = this.coveyTownController.ourPlayer;
    if (ourPlayer.gameObjects?.label) {
      ourPlayer.gameObjects.label.setText(this.isMuted ? '(You)🔇' : '(You)🔊');
    }
  }

  private _handlePianoToggle() {
    const playerSprite = this.coveyTownController.ourPlayer.gameObjects?.sprite;
    if (!playerSprite || !this._piano) {
      return;
    }
  
    const distance = Phaser.Math.Distance.Between(
      playerSprite.x,
      playerSprite.y,
      this._piano.x,
      this._piano.y,
    );
  
    if (distance < 100) {
      this._pianoOverlayActive = true;
      this.pause();
      this.game.events.emit('showPiano');
  
      this.game.events.once('closePiano', () => {
        this._pianoOverlayActive = false;
        this.resume();
      });
    }
  }

  createPlayerSprites(player: PlayerController) {
    if (!player.gameObjects) {
      const sprite = this.physics.add
        .sprite(player.location.x, player.location.y, 'atlas', 'misa-front')
        .setSize(30, 40)
        .setOffset(0, 24);
      const label = this.add.text(
        player.location.x,
        player.location.y - 20,
        player === this.coveyTownController.ourPlayer ? '(You)🔊' : player.userName,
        {
          font: '18px monospace',
          color: '#000000',
          // padding: {x: 20, y: 10},
          backgroundColor: '#ffffff',
        },
      );
      player.gameObjects = {
        sprite,
        label,
        locationManagedByGameScene: false,
      };
    }
  }

  pause() {
    if (!this._paused) {
      this._paused = true;
      this._isInteracting = true;
      const gameObjects = this.coveyTownController.ourPlayer.gameObjects;
      if (gameObjects) {
        gameObjects.sprite.anims.stop();
        const body = gameObjects.sprite.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(0);
        body.moves = false; // prevent movement
      }
      assert(this.input.keyboard);
      this._previouslyCapturedKeys = this.input.keyboard.getCaptures();
      this.input.keyboard.clearCaptures();
    }
  }

  resume() {
    if (this._paused) {
      this._paused = false;
      this._isInteracting = false;
      const gameObjects = this.coveyTownController.ourPlayer.gameObjects;
      if (gameObjects) {
        const body = gameObjects.sprite.body as Phaser.Physics.Arcade.Body;
        body.moves = true; // re-enable movement
      }
      if (this.input && this.input.keyboard) {
        this.input.keyboard.addCapture(this._previouslyCapturedKeys);
      }
      this._previouslyCapturedKeys = [];
    }
  }
}
