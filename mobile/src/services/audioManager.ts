/**
 * WuzzChat Audio Manager Singleton
 * Coordinates audio recording modes and ensures single-instance audio playback across all chat bubbles.
 * Uses official modern Expo SDK 57 expo-audio.
 * Reference: docs/plans/active/DECISION_LOG.md DEC-M23
 */

import { setAudioModeAsync, AudioPlayer } from 'expo-audio';

type StopCallback = () => void;

class AudioManager {
  private activePlayer: AudioPlayer | null = null;
  private activeUri: string | null = null;
  private onStopCallback: StopCallback | null = null;

  /**
   * Configure global audio mode for seamless recording and playback.
   */
  public async configureAudioMode(forRecording: boolean = false): Promise<void> {
    try {
      await setAudioModeAsync({
        allowsRecording: forRecording,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
    } catch (err) {
      console.warn('[AudioManager] Failed to set audio mode:', err);
    }
  }

  /**
   * Register a player instance as the currently active playback.
   * If another player is currently playing, it will be paused and its UI callback triggered.
   */
  public registerActivePlayer(
    uri: string,
    player: AudioPlayer,
    onStop?: StopCallback
  ): void {
    if (this.activeUri === uri && this.activePlayer === player) {
      return;
    }

    this.stopActivePlayer();

    this.activePlayer = player;
    this.activeUri = uri;
    this.onStopCallback = onStop || null;
  }

  /**
   * Stop currently active player and notify previous listener to reset UI state.
   */
  public stopActivePlayer(): void {
    if (this.activePlayer) {
      try {
        if (this.activePlayer.playing) {
          this.activePlayer.pause();
        }
      } catch (err) {
        console.warn('[AudioManager] Error pausing previous player:', err);
      } finally {
        if (this.onStopCallback) {
          try {
            this.onStopCallback();
          } catch (callbackErr) {
            console.warn('[AudioManager] Error in onStopCallback:', callbackErr);
          }
        }
        this.activePlayer = null;
        this.activeUri = null;
        this.onStopCallback = null;
      }
    }
  }

  /**
   * Notify manager that a player has finished or was paused by user.
   */
  public unregisterPlayer(uri: string): void {
    if (this.activeUri === uri) {
      this.activePlayer = null;
      this.activeUri = null;
      this.onStopCallback = null;
    }
  }

  /**
   * Returns current active audio URI.
   */
  public getActiveUri(): string | null {
    return this.activeUri;
  }

  /**
   * Format seconds to mm:ss or m:ss.
   */
  public formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
}

export const audioManager = new AudioManager();
