import type { Thread } from './threads';
import type { StatusId } from './statuses';

export type ItemCategory = 'material' | 'food' | 'consumable' | 'weapon' | 'armour' | 'trinket' | 'key' | 'tool';

export interface ItemDef {
  id: string;
  name: string;
  category: ItemCategory;
  /** Base vendor buy price in Threadsilver. Sell is always 40% of this (GDD §9.2). */
  value: number;
  stack: number;
  description: string;
  /** Weapons/armour. */
  equip?: {
    slot: 'weapon' | 'head' | 'body' | 'trinket';
    atk?: number; def?: number; mag?: number; res?: number; spd?: number; hp?: number;
    thread?: Thread;
    /** Weapon art granted while equipped. */
    skill?: string;
  };
  /** Consumables. */
  use?: {
    healPercent?: number;
    staminaPercent?: number;
    hungerRestore?: number;
    warmthRestore?: number;
    cures?: StatusId[];
    buff?: { stat: 'atk' | 'def' | 'mag' | 'res' | 'spd'; amount: number; durationMs: number };
    /** Bond gained when fed to a creature that prefers it. */
    bondGain?: number;
  };
  colour: number;
}

const I = (d: ItemDef): ItemDef => d;

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(
  [
    // ---------- Materials ----------
    I({ id: 'timber', name: 'Timber', category: 'material', value: 2, stack: 999, colour: 0x8b6b3a, description: 'Cut wood. The whole Realm is built on it.' }),
    I({ id: 'fiber', name: 'Plant Fiber', category: 'material', value: 2, stack: 999, colour: 0x9bbf5a, description: 'Twisted into cord, cloth, and snare mesh.' }),
    I({ id: 'stone_block', name: 'Stone', category: 'material', value: 2, stack: 999, colour: 0x8a8a92, description: 'Heavy, dull, indispensable.' }),
    I({ id: 'copper_ore', name: 'Copper Ore', category: 'material', value: 8, stack: 999, colour: 0xc87a3a, description: 'Green-streaked rock with metal inside.' }),
    I({ id: 'copper_ingot', name: 'Copper Ingot', category: 'material', value: 22, stack: 999, colour: 0xd98f4a, description: 'Smelted and ready.' }),
    I({ id: 'iron_ore', name: 'Iron Ore', category: 'material', value: 16, stack: 999, colour: 0x9a8478, description: 'Heavier than it looks.' }),
    I({ id: 'iron_ingot', name: 'Iron Ingot', category: 'material', value: 45, stack: 999, colour: 0xb0b0bc, description: 'Good steel starts here.' }),
    I({ id: 'leather', name: 'Cured Hide', category: 'material', value: 14, stack: 999, colour: 0xa0763f, description: 'Tanned, supple, faintly unpleasant.' }),
    I({ id: 'threadstone_shard', name: 'Threadstone Shard', category: 'material', value: 180, stack: 99, colour: 0x9a7fd4, description: 'A fragment of the Loom. It hums when you are asleep.' }),
    I({ id: 'heartwood_sap', name: 'Heartwood Sap', category: 'material', value: 90, stack: 99, colour: 0xd9b23c, description: 'Amber and slow. Drawn only from a Bramblewarden’s ground.' }),
    I({ id: 'obsidian_heart', name: 'Obsidian Heart', category: 'material', value: 320, stack: 9, colour: 0x2b2226, description: 'Still warm. It should not still be warm.' }),
    I({ id: 'rime_crystal', name: 'Rime Crystal', category: 'material', value: 320, stack: 9, colour: 0xbfe4f0, description: 'Cold that does not melt.' }),
    I({ id: 'relic_fragment', name: 'Relic Fragment', category: 'material', value: 260, stack: 99, colour: 0xe2c044, description: 'Part of a machine nobody living can name.' }),
    I({ id: 'mire_pearl', name: 'Mire Pearl', category: 'material', value: 300, stack: 9, colour: 0x7fc4a8, description: 'Grown around something that was swallowed.' }),

    // ---------- Foods (creature-preferred foods are the fastest bond gain in the game) ----------
    I({ id: 'sunberry', name: 'Sunberry', category: 'food', value: 6, stack: 99, colour: 0xe8543c, description: 'Sharp and warm.', use: { hungerRestore: 8, healPercent: 0.04, bondGain: 0.25 } }),
    I({ id: 'grain_cake', name: 'Grain Cake', category: 'food', value: 10, stack: 99, colour: 0xd8c48a, description: 'Dense, dull, filling.', use: { hungerRestore: 22, bondGain: 0.25 } }),
    I({ id: 'raw_meat', name: 'Raw Meat', category: 'food', value: 8, stack: 99, colour: 0xc25b5b, description: 'Better cooked. Creatures disagree.', use: { hungerRestore: 10, bondGain: 0.25 } }),
    I({ id: 'cooked_meat', name: 'Roast', category: 'food', value: 24, stack: 99, colour: 0xa8663a, description: 'Hot food. It matters more than you would think.', use: { hungerRestore: 38, healPercent: 0.12, warmthRestore: 20, bondGain: 0.15 } }),
    I({ id: 'nectar', name: 'Nectar', category: 'food', value: 14, stack: 99, colour: 0xffd76b, description: 'Thick and floral.', use: { hungerRestore: 10, staminaPercent: 0.3, bondGain: 0.25 } }),
    I({ id: 'raw_fish', name: 'Raw Fish', category: 'food', value: 8, stack: 99, colour: 0x7fb3c4, description: 'Slippery.', use: { hungerRestore: 12, bondGain: 0.25 } }),
    I({ id: 'frozen_fish', name: 'Frozen Fish', category: 'food', value: 12, stack: 99, colour: 0xa7cfe4, description: 'Hard as a plank.', use: { hungerRestore: 12, bondGain: 0.25 } }),
    I({ id: 'char_root', name: 'Char Root', category: 'food', value: 12, stack: 99, colour: 0x8a4a2c, description: 'Grows in vents. Tastes like it.', use: { hungerRestore: 14, warmthRestore: 25, bondGain: 0.25 } }),
    I({ id: 'ash_grain', name: 'Ash Grain', category: 'food', value: 12, stack: 99, colour: 0xb0a08a, description: 'Grey, gritty, nourishing.', use: { hungerRestore: 16, bondGain: 0.25 } }),
    I({ id: 'sulfur_cake', name: 'Sulfur Cake', category: 'food', value: 14, stack: 99, colour: 0xd8c04a, description: 'Do not ask.', use: { hungerRestore: 14, bondGain: 0.25 } }),
    I({ id: 'pine_seed', name: 'Pine Seed', category: 'food', value: 10, stack: 99, colour: 0x6f8f5e, description: 'Resinous.', use: { hungerRestore: 10, bondGain: 0.25 } }),
    I({ id: 'bog_cap', name: 'Bog Cap', category: 'food', value: 10, stack: 99, colour: 0x7a8f4a, description: 'Edible. Barely.', use: { hungerRestore: 12, bondGain: 0.25 } }),
    I({ id: 'marsh_fly', name: 'Marsh Fly', category: 'food', value: 6, stack: 99, colour: 0x6a7a3a, description: 'For someone else.', use: { hungerRestore: 4, bondGain: 0.25 } }),
    I({ id: 'dust_grain', name: 'Dust Grain', category: 'food', value: 10, stack: 99, colour: 0xd8bd7a, description: 'Survives anything.', use: { hungerRestore: 14, bondGain: 0.25 } }),
    I({ id: 'glass_beetle', name: 'Glass Beetle', category: 'food', value: 12, stack: 99, colour: 0xc9d8e0, description: 'Crunches.', use: { hungerRestore: 10, bondGain: 0.25 } }),
    I({ id: 'sun_glass', name: 'Sun Glass', category: 'food', value: 18, stack: 99, colour: 0xf0e0b0, description: 'Not food. Mirageling insists otherwise.', use: { hungerRestore: 2, bondGain: 0.25 } }),
    I({ id: 'deep_fungus', name: 'Deep Fungus', category: 'food', value: 16, stack: 99, colour: 0x8fd4a8, description: 'Glows on the way down.', use: { hungerRestore: 18, bondGain: 0.25 } }),
    I({ id: 'rime_marrow', name: 'Rime Marrow', category: 'food', value: 60, stack: 99, colour: 0xe8f6ff, description: 'A delicacy in the Spire. Elsewhere, an emergency.', use: { hungerRestore: 30, warmthRestore: 40, bondGain: 0.6 } }),
    I({ id: 'emberglass_dust', name: 'Emberglass Dust', category: 'food', value: 60, stack: 99, colour: 0xff7a3c, description: 'Eaten only by things that should not eat.', use: { hungerRestore: 4, bondGain: 0.6 } }),
    I({ id: 'relic_dust', name: 'Relic Dust', category: 'food', value: 70, stack: 99, colour: 0xffe9a8, description: 'Ground machine. Some creatures crave it.', use: { bondGain: 0.6 } }),
    I({ id: 'threadstone_dust', name: 'Threadstone Dust', category: 'food', value: 90, stack: 99, colour: 0x9a7fd4, description: 'The Loom, powdered. Feeding it to something is a decision.', use: { bondGain: 0.8 } }),

    // ---------- Consumables ----------
    I({ id: 'healing_salve', name: 'Healing Salve', category: 'consumable', value: 80, stack: 20, colour: 0x8fd48f, description: 'Closes what is open.', use: { healPercent: 0.45 } }),
    I({ id: 'antidote', name: 'Antidote', category: 'consumable', value: 55, stack: 20, colour: 0x9bd45a, description: 'Bitter. Works.', use: { cures: ['poison', 'bleed'] } }),
    I({ id: 'warm_draught', name: 'Warm Draught', category: 'consumable', value: 45, stack: 20, colour: 0xe08a4a, description: 'Holds off the cold for a while.', use: { warmthRestore: 60, cures: ['chill', 'freeze'] } }),
    I({ id: 'threadsnare', name: 'Threadsnare', category: 'consumable', value: 60, stack: 30, colour: 0xc0a0e0, description: 'A mesh of fiber and Loom-thread. Throw it at something weakened.' }),
    I({ id: 'focus_tonic', name: 'Focus Tonic', category: 'consumable', value: 120, stack: 10, colour: 0x7fb3e0, description: 'Everything slows down a little.', use: { buff: { stat: 'atk', amount: 0.25, durationMs: 45000 } } }),

    // ---------- Gear ----------
    I({ id: 'worn_blade', name: 'Worn Blade', category: 'weapon', value: 60, stack: 1, colour: 0x9a9aa8, description: 'Someone else’s, once.', equip: { slot: 'weapon', atk: 8, skill: 'cleave' } }),
    I({ id: 'copper_blade', name: 'Copper Blade', category: 'weapon', value: 260, stack: 1, colour: 0xd98f4a, description: 'Soft metal, sharp enough.', equip: { slot: 'weapon', atk: 18, skill: 'cleave' } }),
    I({ id: 'iron_blade', name: 'Iron Blade', category: 'weapon', value: 780, stack: 1, colour: 0xc0c0cc, description: 'Honest steel.', equip: { slot: 'weapon', atk: 34, spd: 2, skill: 'cleave' } }),
    I({ id: 'iron_spear', name: 'Iron Spear', category: 'weapon', value: 820, stack: 1, colour: 0xb8bcc8, description: 'Reach beats strength more often than strength likes.', equip: { slot: 'weapon', atk: 30, skill: 'thrust' } }),
    I({ id: 'sling_focus', name: 'Sling-Focus', category: 'weapon', value: 900, stack: 1, colour: 0xc0a0e0, description: 'A stone on a cord, and a Threadstone chip in the stone.', equip: { slot: 'weapon', atk: 12, mag: 32, skill: 'emberlance' } }),
    I({ id: 'fiber_wrap', name: 'Fiber Wrap', category: 'armour', value: 70, stack: 1, colour: 0x9bbf5a, description: 'Better than nothing, marginally.', equip: { slot: 'body', def: 6, hp: 10 } }),
    I({ id: 'hide_jerkin', name: 'Hide Jerkin', category: 'armour', value: 300, stack: 1, colour: 0xa0763f, description: 'Warm and quiet.', equip: { slot: 'body', def: 16, res: 6, hp: 26 } }),
    I({ id: 'iron_mail', name: 'Iron Mail', category: 'armour', value: 950, stack: 1, colour: 0xb0b0bc, description: 'Heavy. Reassuring.', equip: { slot: 'body', def: 34, res: 12, hp: 60, spd: -3 } }),
    I({ id: 'hide_hood', name: 'Hide Hood', category: 'armour', value: 180, stack: 1, colour: 0x8f6a3a, description: 'Keeps the weather off.', equip: { slot: 'head', def: 8, res: 8, hp: 14 } }),
    I({ id: 'wardlight_charm', name: 'Wardlight Charm', category: 'trinket', value: 400, stack: 1, colour: 0xf2e9c9, description: 'The dark keeps a polite distance.', equip: { slot: 'trinket', res: 14, hp: 20 } }),
    I({ id: 'bond_token', name: 'Bond Token', category: 'trinket', value: 650, stack: 1, colour: 0xd48fa8, description: 'Carved by a Keeper. Creatures trust you faster.', equip: { slot: 'trinket', mag: 10, res: 8 } }),

    // ---------- Tools & keys ----------
    I({ id: 'axe', name: 'Hand Axe', category: 'tool', value: 90, stack: 1, colour: 0x9a7a4a, description: 'Fells trees. Also arguments.' }),
    I({ id: 'pick', name: 'Pick', category: 'tool', value: 110, stack: 1, colour: 0x8a8a92, description: 'For rock, ore, and stubbornness.' }),
    I({ id: 'loomcompass', name: 'Loomcompass', category: 'key', value: 0, stack: 1, colour: 0xc0a0e0, description: 'It points at things that are wrong. It is always pointing at something.' }),
  ].map((it) => [it.id, it]),
);

export function getItem(id: string): ItemDef {
  const it = ITEMS[id];
  if (!it) throw new Error(`Unknown item: ${id}`);
  return it;
}

/** Sell price is always 40% of buy price — removes the buy-low/sell-high arbitrage loop. */
export const SELL_RATIO = 0.4;
export const sellPrice = (id: string): number => Math.max(1, Math.floor(getItem(id).value * SELL_RATIO));

export interface ItemStack {
  itemId: string;
  count: number;
}
