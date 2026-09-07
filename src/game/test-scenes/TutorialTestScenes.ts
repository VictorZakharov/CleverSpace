import { Game } from '../Game';
import { stageTutorial } from './UiTestScenes';

export const tutorialTestScenes = {
  tutorial: stageTutorial,
  'tutorial-transition': stageTutorialTransition,
};

/** Midpoint of a real EMP-to-mining relocation, with LYRA and HUD above the blend. */
export function stageTutorialTransition(game: Game): void {
  game.startTutorial();
  game.tutorial.stageForTest('emp');
  game.tutorial.browse(1);
  const animation = document.querySelector('.tutorial-scene-transition')?.getAnimations()[0];
  if (animation) {
    animation.pause();
    animation.currentTime = 250;
  }
  game.renderHudOnce();
}
