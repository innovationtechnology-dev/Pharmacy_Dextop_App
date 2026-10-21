import { powerSaveBlocker } from 'electron';

/**
 * Main computer: other computers depend on it, so it must not fall asleep while the app runs.
 * 'prevent-app-suspension' keeps the system awake but still lets the screen turn off.
 * The block ends when the server stops or the app quits (the OS releases it with the process).
 */

let blockerId: number | null = null;

export const startKeepAwake = (): void => {
  if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) return;
  blockerId = powerSaveBlocker.start('prevent-app-suspension');
  console.log('Main computer: sleep prevented while the app is running');
};

export const stopKeepAwake = (): void => {
  if (blockerId === null) return;
  if (powerSaveBlocker.isStarted(blockerId)) powerSaveBlocker.stop(blockerId);
  blockerId = null;
};
