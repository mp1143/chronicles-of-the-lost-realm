import { useEffect, useState } from 'preact/hooks';
import { touchButtons, type InputAdapter } from '../platform/input';
import { hud } from './store';

/**
 * On-screen controls. Real DOM buttons so their geometry lives in CSS only —
 * one source of truth instead of hit-test rectangles duplicated in the input
 * layer. Every target is >= 56px with >= 8px gaps and sits clear of the safe
 * areas, which is the actual mobile requirement, not a nice-to-have.
 *
 * Labels are plain text rather than dingbats: a glyph like U+2694 is missing
 * from some Android font stacks and renders as tofu.
 */
export function TouchControls({ input }: { input: InputAdapter }) {
  const [, force] = useState(0);
  const h = hud.value;

  // The floating stick is drawn from the adapter's live state.
  useEffect(() => {
    let raf = 0;
    const loop = (): void => {
      force((n) => (n + 1) & 0xffff);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const press = (name: string) => ({
    onPointerDown: (e: PointerEvent) => {
      e.preventDefault();
      touchButtons[name] = true;
    },
    onPointerUp: () => {
      touchButtons[name] = false;
    },
    onPointerLeave: () => {
      touchButtons[name] = false;
    },
    onPointerCancel: () => {
      touchButtons[name] = false;
    },
  });

  const stick = input.stick;
  const dx = stick.x - stick.originX;
  const dy = stick.y - stick.originY;
  const len = Math.hypot(dx, dy);
  const clamped = len > 64 ? 64 / len : 1;

  return (
    <div class="touch-layer">
      {stick.active && (
        <>
          <div
            class="stick-base"
            style={{ left: `${stick.originX - 64}px`, top: `${stick.originY - 64}px` }}
          />
          <div
            class="stick-knob"
            style={{
              left: `${stick.originX + dx * clamped - 26}px`,
              top: `${stick.originY + dy * clamped - 26}px`,
            }}
          />
        </>
      )}

      <button
        class="touch-btn"
        style={{ right: 'calc(24px + var(--safe-r))', bottom: 'calc(112px + var(--safe-b))', width: '76px', height: '76px' }}
        aria-label="Attack"
        {...press('attack')}
      >
        ATK
      </button>
      <button
        class="touch-btn"
        style={{ right: 'calc(112px + var(--safe-r))', bottom: 'calc(152px + var(--safe-b))', width: '58px', height: '58px' }}
        aria-label={h.skills[1]?.name ?? 'Skill 1'}
        {...press('skill1')}
      >
        {h.skills[1] ? h.skills[1].name.slice(0, 3) : 'S1'}
      </button>
      <button
        class="touch-btn"
        style={{ right: 'calc(112px + var(--safe-r))', bottom: 'calc(76px + var(--safe-b))', width: '58px', height: '58px' }}
        aria-label={h.skills[2]?.name ?? 'Skill 2'}
        {...press('skill2')}
      >
        {h.skills[2] ? h.skills[2].name.slice(0, 3) : 'S2'}
      </button>
      <button
        class="touch-btn"
        style={{ right: 'calc(24px + var(--safe-r))', bottom: 'calc(30px + var(--safe-b))', width: '58px', height: '58px' }}
        aria-label="Dodge"
        {...press('dodge')}
      >
        DASH
      </button>
      <button
        class="touch-btn"
        style={{ right: 'calc(188px + var(--safe-r))', bottom: 'calc(112px + var(--safe-b))', width: '58px', height: '58px' }}
        aria-label="Tactical pause"
        {...press('pause')}
      >
        SLOW
      </button>
      {h.interactLabel && (
        <button
          class="touch-btn"
          style={{
            right: 'calc(188px + var(--safe-r))',
            bottom: 'calc(38px + var(--safe-b))',
            width: '58px',
            height: '58px',
            borderColor: 'var(--good)',
          }}
          aria-label={h.interactLabel}
          {...press('interact')}
        >
          USE
        </button>
      )}
    </div>
  );
}
