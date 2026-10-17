import type { AudioPlayer } from 'expo-audio';

type PlaybackHandle = Pick<AudioPlayer, 'currentTime' | 'duration' | 'seekTo' | 'play'>;

/** Expo Audio stays at the end after completion. Resume a pause, but rewind a completed clip before replay. */
export async function playOrReplayAudio(
  player: PlaybackHandle,
  finished: boolean,
  isCurrent: () => boolean
): Promise<boolean> {
  if (!isCurrent()) return false;
  if (finished || (player.duration > 0 && player.currentTime >= player.duration)) {
    await player.seekTo(0);
  }
  // A seek is asynchronous: another voice note or an unmount may have superseded this tap.
  if (!isCurrent()) return false;
  player.play();
  return true;
}
