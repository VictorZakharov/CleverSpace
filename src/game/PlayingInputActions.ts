import { AudioEngine } from '../audio/AudioEngine';
import { Input } from '../core/Input';
import { ChaseCamera } from '../rendering/ChaseCamera';

interface PlayingInputHost {
  readonly input: Input;
  readonly chaseCam: ChaseCamera;
  readonly audio: AudioEngine;
  readonly pendingOffer: unknown;
  readonly state: string;
  readonly jumpSpool: number;
  pause(): void;
  openLoadout(): void;
  startJump(): boolean;
  activateCloak(): boolean;
  activateEmp(): boolean;
  useNanobots(): boolean;
  toggleNavigationPoint(): boolean;
  acceptOffer(): boolean;
  hailNearestNeutral(): boolean;
  declineOffer(): void;
}

/** Dispatch one frame of discrete actions before continuous flight simulation. */
export function handlePlayingInput(host: PlayingInputHost): boolean {
  const input = host.input;
  if (input.wasPressed('Escape')) {
    host.pause();
    return false;
  }
  if (input.wasPressed('Tab')) {
    host.openLoadout();
    return false;
  }
  if (input.wasPressed('KeyV')) {
    host.chaseCam.toggleMode();
    host.audio.uiClick();
  }
  if (host.jumpSpool < 0 && input.wasPressed('KeyJ')) host.startJump();
  if (input.wasPressed('KeyF')) host.activateCloak();
  if (input.wasPressed('KeyG')) host.activateEmp();
  if (input.wasPressed('KeyH')) host.useNanobots();
  if (input.wasPressed('KeyN')) host.toggleNavigationPoint();
  if (input.wasPressed('KeyR')) {
    if (host.pendingOffer) host.acceptOffer();
    else host.hailNearestNeutral();
  }
  if (input.wasPressed('KeyX') && host.pendingOffer) host.declineOffer();
  // Docking changes state in the R handler. Do not restart engine audio.
  return host.state === 'playing';
}
