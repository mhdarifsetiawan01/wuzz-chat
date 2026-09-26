/**
 * WuzzChat Call Audio Manager Singleton
 * Manages call audio lifecycle, microphone permissions, audio routing (Speaker vs Earpiece),
 * and audible incoming/outgoing ringtones via Expo SDK 57 expo-audio.
 * Reference: docs/plans/active/DECISION_LOG.md DEC-M29 & DEC-M31
 */

import {
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  createAudioPlayer,
  AudioPlayer,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { fromByteArray } from 'base64-js';

function createToneWavBase64(durationSec: number, freq1: number, freq2: number, onDuration: number): string {
  const sampleRate = 8000;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');

  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const isPlaying = t < onDuration;
    const amp = isPlaying ? 0.35 : 0;
    const val = 0.5 * Math.sin(2 * Math.PI * freq1 * t) + 0.5 * Math.sin(2 * Math.PI * freq2 * t);
    const sample = Math.floor(amp * val * 32767);
    view.setInt16(44 + i * 2, sample, true);
  }

  return fromByteArray(new Uint8Array(buffer));
}

class CallAudioManager {
  private isSpeakerphoneOn: boolean = false;
  private isMuted: boolean = false;
  private activePlayer: AudioPlayer | null = null;
  private incomingRingtoneUri: string | null = null;
  private outgoingRingbackUri: string | null = null;

  /**
   * Pre-generates tone WAV files in cache if not yet generated.
   */
  private async ensureTonesGenerated(): Promise<{ ringtoneUri: string; ringbackUri: string }> {
    const cacheDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
    const ringtonePath = `${cacheDir}wuzz_incoming_ring.wav`;
    const ringbackPath = `${cacheDir}wuzz_outgoing_ringback.wav`;

    if (!this.incomingRingtoneUri) {
      try {
        const info = await FileSystem.getInfoAsync(ringtonePath);
        if (!info.exists) {
          // Melodic ringtone (C5 + G5, 1.2s cadence)
          const b64 = createToneWavBase64(1.5, 523.25, 783.99, 1.0);
          await FileSystem.writeAsStringAsync(ringtonePath, b64, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
        this.incomingRingtoneUri = ringtonePath;
      } catch (err) {
        console.warn('[CallAudioManager] Failed to generate incoming ringtone wav:', err);
      }
    }

    if (!this.outgoingRingbackUri) {
      try {
        const info = await FileSystem.getInfoAsync(ringbackPath);
        if (!info.exists) {
          // Classic telephone ringback (440Hz + 480Hz, 1.5s on, 1.5s cadence)
          const b64 = createToneWavBase64(2.0, 440, 480, 1.0);
          await FileSystem.writeAsStringAsync(ringbackPath, b64, {
            encoding: FileSystem.EncodingType.Base64,
          });
        }
        this.outgoingRingbackUri = ringbackPath;
      } catch (err) {
        console.warn('[CallAudioManager] Failed to generate ringback tone wav:', err);
      }
    }

    return {
      ringtoneUri: this.incomingRingtoneUri || ringtonePath,
      ringbackUri: this.outgoingRingbackUri || ringbackPath,
    };
  }

  /**
   * Check if microphone permission is currently granted.
   */
  public async checkMicrophonePermission(): Promise<boolean> {
    try {
      const res = await getRecordingPermissionsAsync();
      console.log(`[CallAudioManager] Current mic permission status: ${res.status}, granted=${res.granted}`);
      return !!res.granted;
    } catch (err) {
      console.warn('[CallAudioManager] Failed to check microphone permission:', err);
      return false;
    }
  }

  /**
   * Request microphone permission from user.
   */
  public async requestMicrophonePermission(): Promise<boolean> {
    try {
      const current = await getRecordingPermissionsAsync();
      if (current.granted) {
        console.log('[CallAudioManager] Microphone permission is already granted');
        return true;
      }

      console.log('[CallAudioManager] Requesting microphone permission from user...');
      const res = await requestRecordingPermissionsAsync();
      console.log(`[CallAudioManager] Permission prompt response: ${res.status}, granted=${res.granted}`);
      return !!res.granted;
    } catch (err) {
      console.warn('[CallAudioManager] Failed to request microphone permission:', err);
      return false;
    }
  }

  /**
   * Initialize audio session for active voice call.
   * Enables microphone recording, silent mode playback, and initial routing.
   */
  public async startCallAudioSession(speakerphone: boolean = false): Promise<void> {
    this.stopAllCallTones();
    this.isSpeakerphoneOn = speakerphone;
    this.isMuted = false;
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        shouldRouteThroughEarpiece: !speakerphone,
      });
      console.log(`[CallAudioManager] Call audio session initialized (speaker=${speakerphone})`);
    } catch (err) {
      console.warn('[CallAudioManager] Error starting call audio session:', err);
    }
  }

  /**
   * Toggle or set speakerphone / earpiece audio routing.
   */
  public async setSpeakerphone(enabled: boolean): Promise<void> {
    this.isSpeakerphoneOn = enabled;
    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        shouldRouteThroughEarpiece: !enabled,
      });
      console.log(`[CallAudioManager] Audio routing updated: speakerphone=${enabled}`);
    } catch (err) {
      console.warn('[CallAudioManager] Failed to set speakerphone mode:', err);
    }
  }

  /**
   * Get current speakerphone status.
   */
  public getSpeakerphone(): boolean {
    return this.isSpeakerphoneOn;
  }

  /**
   * End call audio session and reset audio mode to default state.
   */
  public async endCallAudioSession(): Promise<void> {
    this.stopAllCallTones();
    this.isSpeakerphoneOn = false;
    this.isMuted = false;
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
      console.log('[CallAudioManager] Call audio session ended & reset to default');
    } catch (err) {
      console.warn('[CallAudioManager] Error resetting audio mode after call:', err);
    }
  }

  /**
   * Play incoming melodic ringtone loop.
   */
  public async playIncomingRingtone(): Promise<void> {
    this.stopAllCallTones();
    console.log('[CallAudioManager] Playing audible incoming ringtone...');

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        shouldRouteThroughEarpiece: false,
      });

      const { ringtoneUri } = await this.ensureTonesGenerated();
      const player = createAudioPlayer(ringtoneUri);
      player.loop = true;
      player.play();
      this.activePlayer = player;
    } catch (err) {
      console.warn('[CallAudioManager] Error playing incoming ringtone:', err);
    }
  }

  /**
   * Play outgoing ringback tone loop (beeps while waiting for remote peer to answer).
   */
  public async playOutgoingRingback(): Promise<void> {
    this.stopAllCallTones();
    console.log('[CallAudioManager] Playing audible outgoing ringback tone...');

    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        shouldRouteThroughEarpiece: !this.isSpeakerphoneOn,
      });

      const { ringbackUri } = await this.ensureTonesGenerated();
      const player = createAudioPlayer(ringbackUri);
      player.loop = true;
      player.play();
      this.activePlayer = player;
    } catch (err) {
      console.warn('[CallAudioManager] Error playing outgoing ringback tone:', err);
    }
  }

  /**
   * Stop all active ringtone / ringback tones.
   */
  public stopAllCallTones(): void {
    if (this.activePlayer) {
      try {
        if (this.activePlayer.playing) {
          this.activePlayer.pause();
        }
      } catch {}
      this.activePlayer = null;
    }
  }
}

export const callAudioManager = new CallAudioManager();
