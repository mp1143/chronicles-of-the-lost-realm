import { signal } from '@preact/signals';
import { isTouchDevice } from '../platform/input';

/**
 * First-run guide.
 *
 * A survival RPG with no instructions is not a shipped game — a new player who
 * installs this needs to know what a Threadsnare is before they meet one. Shown
 * once, dismissible, and re-openable from the Log panel afterwards.
 */

const SEEN_KEY = 'chronicles:seen-guide';

export const guideOpen = signal(false);

export function shouldShowGuideOnBoot(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    // Private mode with storage blocked: show it, do not crash.
    return true;
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* nothing to do; it will simply show again next time */
  }
}

export function openGuide(): void {
  guideOpen.value = true;
}

const TOUCH_CONTROLS: Array<[string, string]> = [
  ['Left thumb, anywhere', 'Move — the stick appears where you touch'],
  ['ATK', 'Attack. Drag on the right to aim'],
  ['Skill buttons', 'Your two equipped abilities'],
  ['USE', 'Gather, open, or throw a Threadsnare'],
  ['DASH', 'Dodge'],
  ['SLOW', 'Tactical pause — time drops to 15%, not zero'],
];

const KEY_CONTROLS: Array<[string, string]> = [
  ['W A S D', 'Move'],
  ['Mouse', 'Aim'],
  ['Click / J', 'Attack'],
  ['1 / 2', 'Skills'],
  ['E', 'Gather, open, or throw a Threadsnare'],
  ['Shift', 'Dodge'],
  ['Space', 'Tactical pause — time drops to 15%, not zero'],
];

const FIRST_STEPS: Array<[string, string]> = [
  ['1', 'Walk up to a tree or bush and press USE to gather. Timber and Fiber are everything.'],
  ['2', 'Open Build, place a Campfire. Stand next to it to unlock crafting.'],
  ['3', 'Open Craft, make a Hand Axe and a few Threadsnares.'],
  ['4', 'Find a creature. Fight it down below 40% health — the bar turns short and red.'],
  ['5', 'Press USE to throw a snare, then tap on each beat of the shrinking ring.'],
  ['6', 'Feed your new companion its favourite food to raise its bond. Bond changes how it fights for you.'],
];

export function Onboarding() {
  if (!guideOpen.value) return null;
  const touch = isTouchDevice();
  const controls = touch ? TOUCH_CONTROLS : KEY_CONTROLS;

  const close = (): void => {
    markSeen();
    guideOpen.value = false;
  };

  return (
    <div class="panel-scrim guide-scrim" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <section class="panel guide" role="dialog" aria-label="How to play" aria-modal="true">
        <header class="panel-head">
          <h2>Chronicles of the Lost Realm</h2>
          <button class="close" onClick={close} aria-label="Close guide">✕</button>
        </header>
        <div class="panel-body">
          <p class="guide-intro">
            You wake on a shore that should not exist, holding a compass that points at nothing.
            Survive the Realm, and tame what the Loom left behind.
          </p>

          <h3>Controls</h3>
          <ul class="plain guide-keys">
            {controls.map(([key, what]) => (
              <li key={key}>
                <span class="kbd">{key}</span> {what}
              </li>
            ))}
          </ul>

          <h3>Your first ten minutes</h3>
          <ol class="guide-steps">
            {FIRST_STEPS.map(([n, text]) => (
              <li key={n}>{text}</li>
            ))}
          </ol>

          <h3>Two things that will save you</h3>
          <ul class="plain guide-keys">
            <li>
              <span class="kbd">Threads</span> Every creature and skill has an element. Verdant beats
              Stone beats Storm beats Tide beats Ember beats Verdant. Radiance and Umbra savage each
              other. Attacking into an advantage does half again the damage.
            </li>
            <li>
              <span class="kbd">Night</span> The dark is genuinely more dangerous. Build a Campfire
              before dusk, and a Wardlight when you can afford one.
            </li>
          </ul>

          <p class="dim">
            Death costs you nothing permanent — you wake on the shore. Progress saves automatically
            every three minutes and whenever you leave. You can reopen this guide from the Log panel.
          </p>

          <button class="guide-start" onClick={close}>Begin</button>
        </div>
      </section>
    </div>
  );
}
