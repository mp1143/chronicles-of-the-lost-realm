import { hud, openPanel, menuOpen, notices, banner, type PanelId } from './store';
import { Onboarding, openGuide } from './Onboarding';
import { drawMap } from './minimap';
import type { Game } from '../sim/game';
import * as C from '../sim/components';
import { getItem } from '../content/items';
import { RECIPES } from '../content/recipes';
import { STRUCTURES, getStructure } from '../content/structures';
import { CREATURES, getCreature } from '../content/creatures';
import { THREAD_COLOR } from '../content/threads';
import {
  craft, useItem, equip, build, canPlace, stationsInRange, setPartySlot,
  renameCreature, inventoryList, countItem, hasAll, deconstruct,
} from '../sim/actions';

/**
 * All UI. Responsive by container query rather than device sniffing: the same
 * markup is the mobile layout at narrow widths and the desktop layout wide.
 *
 * Touch targets are >= 48dp with >= 8dp gaps, and the safe-area insets keep
 * everything clear of notches and gesture bars (see styles.css).
 */

interface Props {
  game: Game;
  onSave: () => void;
}

export function App({ game, onSave }: Props) {
  const h = hud.value;
  return (
    <>
      <TopBar />
      <Vitals />
      <PartyBar game={game} />
      <NoticeStack />
      {banner.value && <div class="banner">{banner.value}</div>}
      {h.tameActive && <TameMinigame />}
      <MenuButtons onSave={onSave} />
      {openPanel.value && <Panel game={game} />}
      <Onboarding />
    </>
  );
}

function TopBar() {
  const h = hud.value;
  return (
    <div class="topbar">
      <span class="chip">{h.clock} {h.night ? '☾' : '☀'}</span>
      <span class="chip capitalize">{h.biome}</span>
      <span class="chip">◈ {h.threadsilver}</span>
      <span class="chip dim">{h.fps} fps</span>
    </div>
  );
}

function Bar({ value, max, cls, label }: { value: number; max: number; cls: string; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div class="meter" role="meter" aria-label={label} aria-valuenow={value} aria-valuemax={max}>
      <div class={`meter-fill ${cls}`} style={{ width: `${pct}%` }} />
      <span class="meter-label">{label} {Math.round(value)}</span>
    </div>
  );
}

function Vitals() {
  const h = hud.value;
  return (
    <div class="vitals">
      <Bar value={h.hp} max={h.hpMax} cls="hp" label="HP" />
      <Bar value={h.stamina} max={h.staminaMax} cls="st" label="ST" />
      <div class="vitals-row">
        <Bar value={h.hunger} max={100} cls="food" label="Food" />
        <Bar value={h.warmth} max={100} cls="warm" label="Warm" />
      </div>
      <div class="xp">
        <span>Lv {h.level}</span>
        <div class="xp-track"><div class="xp-fill" style={{ width: `${(h.xp / Math.max(1, h.xpNext)) * 100}%` }} /></div>
      </div>
    </div>
  );
}

function PartyBar({ game }: { game: Game }) {
  const h = hud.value;
  if (h.party.length === 0) return null;
  return (
    <div class="party">
      {h.party.map((p) => (
        <button
          key={p.uid}
          class="party-card"
          onClick={() => {
            openPanel.value = 'party';
          }}
          title={`${p.name} — bond ${p.bond}`}
        >
          <div class="party-name capitalize">{p.name}</div>
          <div class="party-meta">Lv{p.level} ♥{p.bond}</div>
          <div class="party-hp"><div style={{ width: `${(p.hp / Math.max(1, p.hpMax)) * 100}%` }} /></div>
        </button>
      ))}
      <button class="party-card stance" onClick={() => cycleStance(game)}>
        Stance
      </button>
    </div>
  );
}

const STANCES: C.Stance[] = ['aggressive', 'balanced', 'defensive', 'hold'];
function cycleStance(game: Game): void {
  const first = game.activePartyEntities()[0];
  const current = first !== undefined ? game.ecs.get(first, C.AIState)?.stance ?? 'balanced' : 'balanced';
  const next = STANCES[(STANCES.indexOf(current) + 1) % STANCES.length];
  for (const e of game.activePartyEntities()) {
    const ai = game.ecs.get(e, C.AIState);
    if (ai) ai.stance = next;
  }
  game.notice(`Stance: ${next}`, 'info');
}

function NoticeStack() {
  return (
    <div class="notices" aria-live="polite">
      {notices.value.map((n) => (
        <div key={n.id} class={`notice ${n.tone}`}>{n.text}</div>
      ))}
    </div>
  );
}

function TameMinigame() {
  const h = hud.value;
  // The ring shrinks; tapping inside the accuracy window scores a beat.
  const size = 160 - h.tameProgress * 120;
  return (
    <div class="tame">
      <div class="tame-ring" style={{ width: `${size}px`, height: `${size}px` }} />
      <div class="tame-target" />
      <div class="tame-hits">{'●'.repeat(h.tameHits)}{'○'.repeat(Math.max(0, 3 - h.tameHits))}</div>
      <div class="tame-hint">Tap on the beat</div>
    </div>
  );
}

const PANELS: Array<[PanelId, string]> = [
  ['inventory', 'Bag'],
  ['party', 'Party'],
  ['craft', 'Craft'],
  ['build', 'Build'],
  ['map', 'Map'],
  ['bestiary', 'Codex'],
  ['character', 'Char'],
  ['journal', 'Log'],
];

/**
 * Nine permanently visible buttons cover a quarter of a phone screen and sit on
 * top of any open panel. Below 620px they collapse behind a toggle; above it
 * they stay laid out, because a desktop has the room and the extra click is
 * pure friction there.
 */
function MenuButtons({ onSave }: { onSave: () => void }) {
  const choose = (id: PanelId): void => {
    openPanel.value = openPanel.value === id ? null : id;
    menuOpen.value = false;
  };

  // With a panel open the toggle would sit exactly on top of the panel's own
  // close button, so it stands down and lets the panel own that corner.
  const showToggle = openPanel.value === null;

  return (
    <>
      {showToggle && (
        <button
          class={`menu-toggle ${menuOpen.value ? 'active' : ''}`}
          aria-label={menuOpen.value ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen.value}
          onClick={() => (menuOpen.value = !menuOpen.value)}
        >
          {menuOpen.value ? '✕' : '☰'}
        </button>
      )}
      <div class={`menu ${menuOpen.value ? 'open' : ''}`}>
        {PANELS.map(([id, label]) => (
          <button
            key={id}
            class={`menu-btn ${openPanel.value === id ? 'active' : ''}`}
            onClick={() => choose(id)}
          >
            {label}
          </button>
        ))}
        <button
          class="menu-btn"
          onClick={() => {
            onSave();
            menuOpen.value = false;
          }}
        >
          Save
        </button>
      </div>
    </>
  );
}

function Panel({ game }: { game: Game }) {
  const id = openPanel.value;
  return (
    <div
      class="panel-scrim"
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        openPanel.value = null;
        menuOpen.value = false;
      }}
    >
      <section class="panel" role="dialog" aria-label={id ?? 'panel'}>
        <header class="panel-head">
          <h2 class="capitalize">{id}</h2>
          <button class="close" onClick={() => (openPanel.value = null)} aria-label="Close">✕</button>
        </header>
        <div class="panel-body">
          {id === 'inventory' && <InventoryPanel game={game} />}
          {id === 'party' && <PartyPanel game={game} />}
          {id === 'craft' && <CraftPanel game={game} />}
          {id === 'build' && <BuildPanel game={game} />}
          {id === 'map' && <MapPanel game={game} />}
          {id === 'bestiary' && <BestiaryPanel game={game} />}
          {id === 'character' && <CharacterPanel game={game} />}
          {id === 'journal' && <JournalPanel game={game} />}
        </div>
      </section>
    </div>
  );
}

// ---------- panels ----------

function InventoryPanel({ game }: { game: Game }) {
  const slots = inventoryList(game);
  const inv = game.ecs.get(game.player, C.Inventory);
  if (slots.length === 0) return <p class="empty">Nothing but the compass and good intentions.</p>;
  return (
    <div class="grid">
      {slots.map((s, i) => {
        const def = getItem(s.itemId);
        const equipped = inv && Object.values(inv.equipped).includes(s.itemId);
        return (
          <div key={`${s.itemId}-${i}`} class="card">
            <div class="swatch" style={{ background: `#${def.colour.toString(16).padStart(6, '0')}` }} />
            <div class="card-main">
              <div class="card-title">{def.name} <span class="dim">×{s.count}</span></div>
              <div class="card-desc">{def.description}</div>
            </div>
            <div class="card-actions">
              {def.use && <button onClick={() => report(game, useItem(game, s.itemId))}>Use</button>}
              {def.equip && (
                <button onClick={() => report(game, equip(game, s.itemId))}>
                  {equipped ? 'Equipped' : 'Equip'}
                </button>
              )}
              <button class="ghost" onClick={() => report(game, deconstruct(game, s.itemId))}>Break</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PartyPanel({ game }: { game: Game }) {
  if (game.roster.length === 0) {
    return <p class="empty">No companions yet. Weaken a creature below 40% health, then throw a Threadsnare.</p>;
  }
  return (
    <div class="grid">
      {game.roster.map((r) => {
        const def = getCreature(r.creatureId);
        return (
          <div key={r.uid} class="card">
            <div class="swatch" style={{ background: `#${def.sprite.primary.toString(16).padStart(6, '0')}` }} />
            <div class="card-main">
              <div class="card-title">
                {r.nickname ?? def.name} <span class="dim">Lv{r.level}</span>
              </div>
              <div class="card-desc">
                {def.threads.map((t) => (
                  <span key={t} class="thread" style={{ background: `#${THREAD_COLOR[t].toString(16).padStart(6, '0')}` }}>{t}</span>
                ))}
                <span class="dim"> {def.role} · bond {Math.floor(r.bond)}/10</span>
              </div>
              <div class="card-desc dim">{def.trait.name}: {def.trait.description}</div>
            </div>
            <div class="card-actions">
              {r.partySlot >= 0 ? (
                <button onClick={() => report(game, setPartySlot(game, r.uid, -1))}>Reserve</button>
              ) : (
                <button onClick={() => report(game, setPartySlot(game, r.uid, nextFreeSlot(game)))}>Summon</button>
              )}
              <button
                class="ghost"
                onClick={() => {
                  const name = prompt('Name this companion', r.nickname ?? def.name);
                  if (name) report(game, renameCreature(game, r.uid, name));
                }}
              >
                Name
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function nextFreeSlot(game: Game): number {
  const used = new Set(game.roster.filter((r) => r.partySlot >= 0).map((r) => r.partySlot));
  for (let i = 0; i < 3; i++) if (!used.has(i)) return i;
  return 0;
}

function CraftPanel({ game }: { game: Game }) {
  const available = stationsInRange(game);
  const known = [...game.knownRecipes].map((id) => RECIPES[id]).filter(Boolean);
  if (known.length === 0) return <p class="empty">No recipes known.</p>;
  return (
    <div class="grid">
      {known.map((r) => {
        const out = getItem(r.output.itemId);
        const ready = available.has(r.station) && hasAll(game, r.inputs);
        return (
          <div key={r.id} class={`card ${ready ? '' : 'disabled'}`}>
            <div class="swatch" style={{ background: `#${out.colour.toString(16).padStart(6, '0')}` }} />
            <div class="card-main">
              <div class="card-title">{out.name} <span class="dim">×{r.output.count}</span></div>
              <div class="card-desc">
                {r.inputs.map((i) => (
                  <span key={i.itemId} class={countItem(game, i.itemId) >= i.count ? 'have' : 'lack'}>
                    {getItem(i.itemId).name} {countItem(game, i.itemId)}/{i.count}{' '}
                  </span>
                ))}
              </div>
              <div class="card-desc dim">at {r.station}</div>
            </div>
            <div class="card-actions">
              <button disabled={!ready} onClick={() => report(game, craft(game, r.id))}>Craft</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BuildPanel({ game }: { game: Game }) {
  const pos = game.playerPos();
  return (
    <div class="grid">
      {Object.values(STRUCTURES).map((s) => {
        const affordable = hasAll(game, s.cost);
        const target = pos ? { x: Math.floor(pos.x) + 1, y: Math.floor(pos.y) } : null;
        const placement = target ? canPlace(game, s.id, target.x, target.y) : { ok: false, message: '' };
        return (
          <div key={s.id} class={`card ${affordable ? '' : 'disabled'}`}>
            <div class="swatch" style={{ background: `#${s.colour.toString(16).padStart(6, '0')}` }} />
            <div class="card-main">
              <div class="card-title">{s.name} <span class="dim">{s.w}×{s.h}</span></div>
              <div class="card-desc">{s.description}</div>
              <div class="card-desc">
                {s.cost.map((c) => (
                  <span key={c.itemId} class={countItem(game, c.itemId) >= c.count ? 'have' : 'lack'}>
                    {getItem(c.itemId).name} {countItem(game, c.itemId)}/{c.count}{' '}
                  </span>
                ))}
              </div>
              {!placement.ok && placement.message && <div class="card-desc lack">{placement.message}</div>}
            </div>
            <div class="card-actions">
              <button
                disabled={!affordable || !target}
                onClick={() => target && report(game, build(game, s.id, target.x, target.y))}
              >
                Place
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Shard map. Rendering lives in ./minimap.ts; this is just the frame. */
function MapPanel({ game }: { game: Game }) {
  const pos = game.playerPos();
  return (
    <div class="map-wrap">
      <canvas
        class="map"
        ref={(el) => {
          if (el) drawMap(game, el);
        }}
      />
      <p class="dim">
        Shard {game.shard.shardId} · seed {game.worldSeed}
      </p>
      <p class="dim">
        You are at {Math.round(pos?.x ?? 0)}, {Math.round(pos?.y ?? 0)} of {game.shard.size}.
        {game.shard.delta.structures.length > 0
          ? ' Gold marks your structures.'
          : ' Build something and it will show here.'}
      </p>
    </div>
  );
}

function BestiaryPanel({ game }: { game: Game }) {
  const all = Object.values(CREATURES);
  const seen = game.discoveredCreatures;
  return (
    <>
      <p class="dim">Discovered {seen.size} of {all.length}. Entries unlock at bond 1, 5 and 9.</p>
      <div class="grid">
        {all.map((c) => {
          const known = seen.has(c.id);
          const owned = game.roster.find((r) => r.creatureId === c.id);
          const bond = Math.floor(owned?.bond ?? 0);
          return (
            <div key={c.id} class={`card ${known ? '' : 'unknown'}`}>
              <div class="swatch" style={{ background: known ? `#${c.sprite.primary.toString(16).padStart(6, '0')}` : '#2a2733' }} />
              <div class="card-main">
                <div class="card-title">{known ? c.name : '???'}</div>
                {known && (
                  <>
                    <div class="card-desc">
                      {c.threads.map((t) => (
                        <span key={t} class="thread" style={{ background: `#${THREAD_COLOR[t].toString(16).padStart(6, '0')}` }}>{t}</span>
                      ))}
                      <span class="dim"> {c.role} · {c.biome.replace(/_/g, ' ')}</span>
                    </div>
                    <div class="card-desc">{c.bestiary[0]}</div>
                    {bond >= 5 && <div class="card-desc">{c.bestiary[1]}</div>}
                    {bond >= 9 && <div class="card-desc lore">{c.bestiary[2]}</div>}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function CharacterPanel({ game }: { game: Game }) {
  const p = game.ecs.get(game.player, C.PlayerTag);
  const stats = game.ecs.get(game.player, C.CombatStats);
  const inv = game.ecs.get(game.player, C.Inventory);
  if (!p || !stats || !inv) return null;
  const attrs: Array<[keyof typeof p.attributes, string]> = [
    ['vigor', 'Max health and carry weight'],
    ['focus', 'Stamina, crit, taming'],
    ['attunement', 'Magic damage and bond gain'],
    ['craft', 'Craft speed and quality'],
    ['grit', 'Damage and status resistance'],
  ];
  return (
    <>
      <p class="dim">Unspent points: {p.unspentPoints}</p>
      <div class="grid">
        {attrs.map(([key, desc]) => (
          <div key={key} class="card">
            <div class="card-main">
              <div class="card-title capitalize">{key} <span class="dim">{p.attributes[key]}</span></div>
              <div class="card-desc dim">{desc}</div>
            </div>
            <div class="card-actions">
              <button
                disabled={p.unspentPoints <= 0}
                onClick={() => {
                  p.attributes[key]++;
                  p.unspentPoints--;
                  game.notice(`${key} increased`, 'good');
                }}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <h3>Equipment</h3>
      <ul class="plain">
        {(['weapon', 'head', 'body', 'trinket'] as const).map((slot) => (
          <li key={slot} class="capitalize">
            {slot}: {inv.equipped[slot] ? getItem(inv.equipped[slot]!).name : <span class="dim">empty</span>}
          </li>
        ))}
      </ul>
      <h3>Combat</h3>
      <ul class="plain">
        <li>Attack {Math.round(stats.atk)}</li>
        <li>Defence {Math.round(stats.def)}</li>
        <li>Magic {Math.round(stats.mag)}</li>
        <li>Resistance {Math.round(stats.res)}</li>
        <li>Crit {(stats.critChance * 100).toFixed(1)}%</li>
      </ul>
    </>
  );
}

function JournalPanel({ game }: { game: Game }) {
  const built = new Set(game.shard.delta.structures.map((s) => s.structureId));
  const objectives: Array<[string, boolean]> = [
    ['Gather 8 Timber', countItem(game, 'timber') >= 8],
    ['Build a Campfire', built.has('campfire')],
    ['Craft a Hand Axe', countItem(game, 'axe') > 0],
    ['Tame your first companion', game.roster.length > 0],
    ['Build a Workbench', built.has('workbench')],
    ['Reach Wayfinder level 5', (game.ecs.get(game.player, C.PlayerTag)?.level ?? 1) >= 5],
    ['Raise a companion to bond 3', game.roster.some((r) => r.bond >= 3)],
  ];
  return (
    <>
      <h3>Shorebound</h3>
      <p class="dim">
        You woke on a shore that should not exist, holding a compass that points at nothing.
        Elder Ossa says the grove remembers a Keeper who would not leave. Find out what she means.
      </p>
      <ul class="objectives">
        {objectives.map(([text, done]) => (
          <li key={text} class={done ? 'done' : ''}>
            <span class="tick">{done ? '☑' : '☐'}</span> {text}
          </li>
        ))}
      </ul>
      <h3 class="dim">Help</h3>
      <button onClick={openGuide}>How to play</button>

      <h3 class="dim">Structures placed</h3>
      <ul class="plain">
        {game.shard.delta.structures.length === 0 && <li class="dim">None yet.</li>}
        {game.shard.delta.structures.map((s) => (
          <li key={s.id}>{getStructure(s.structureId).name} at {Math.round(s.x)}, {Math.round(s.y)}</li>
        ))}
      </ul>
    </>
  );
}

function report(game: Game, result: { ok: boolean; message?: string }): void {
  if (result.message) game.notice(result.message, result.ok ? 'good' : 'bad');
}
