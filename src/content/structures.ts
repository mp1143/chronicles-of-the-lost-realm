import type { ItemStack } from './items';
import type { StationId } from './recipes';

/**
 * Buildable structures. Placement rules matter (GDD §7.4): a Wardlight needs
 * open sky, a farm plot needs adjacent water. Building well is a puzzle;
 * building badly still works, just worse.
 */
export interface StructureDef {
  id: string;
  name: string;
  cost: ItemStack[];
  /** Footprint in tiles. */
  w: number;
  h: number;
  /** Crafting station this structure provides, if any. */
  station?: StationId;
  /** Radius in tiles within which Duskveil spawns are suppressed. */
  wardRadius?: number;
  /** Light radius in tiles. */
  lightRadius?: number;
  /** Extra storage slots. */
  storage?: number;
  /** Placement constraint checked by sim/systems/build.ts. */
  requires?: 'open_sky' | 'adjacent_water' | 'none';
  colour: number;
  accent: number;
  description: string;
}

const S = (d: StructureDef): StructureDef => d;

export const STRUCTURES: Record<string, StructureDef> = Object.fromEntries(
  [
    S({
      id: 'campfire', name: 'Campfire', w: 1, h: 1, station: 'campfire',
      cost: [{ itemId: 'timber', count: 8 }, { itemId: 'stone_block', count: 4 }],
      lightRadius: 5, wardRadius: 3, requires: 'none',
      colour: 0x5a4a3a, accent: 0xffa14a,
      description: 'Light, warmth, cooking. The first thing anyone builds.',
    }),
    S({
      id: 'bedroll', name: 'Bedroll', w: 1, h: 1,
      cost: [{ itemId: 'fiber', count: 12 }],
      requires: 'none', colour: 0x8a6a4a, accent: 0xc4a878,
      description: 'Sleep through the night. Sets your respawn point.',
    }),
    S({
      id: 'chest', name: 'Storage Chest', w: 1, h: 1, storage: 40,
      cost: [{ itemId: 'timber', count: 14 }, { itemId: 'fiber', count: 4 }],
      requires: 'none', colour: 0x7a5a34, accent: 0xc09050,
      description: 'Forty slots and no judgement.',
    }),
    S({
      id: 'workbench', name: 'Workbench', w: 2, h: 1, station: 'workbench',
      cost: [{ itemId: 'timber', count: 20 }, { itemId: 'stone_block', count: 8 }],
      requires: 'none', colour: 0x6b4a2a, accent: 0xa8834a,
      description: 'Tools, gear, and building parts.',
    }),
    S({
      id: 'forge', name: 'Forge', w: 2, h: 2, station: 'forge',
      cost: [{ itemId: 'stone_block', count: 40 }, { itemId: 'copper_ingot', count: 6 }, { itemId: 'timber', count: 10 }],
      lightRadius: 4, requires: 'open_sky',
      colour: 0x4a4048, accent: 0xff7a3c,
      description: 'Smelting and steel. Needs open sky above it — the smoke has to go somewhere.',
    }),
    S({
      id: 'kitchen', name: 'Kitchen', w: 2, h: 1, station: 'kitchen',
      cost: [{ itemId: 'timber', count: 24 }, { itemId: 'stone_block', count: 12 }, { itemId: 'copper_ingot', count: 2 }],
      requires: 'none', colour: 0x6a5a44, accent: 0xd8c48a,
      description: 'Buff meals and creature-preferred food. The fastest bond gain in the game.',
    }),
    S({
      id: 'wardlight', name: 'Wardlight', w: 1, h: 1,
      cost: [{ itemId: 'timber', count: 10 }, { itemId: 'copper_ingot', count: 3 }, { itemId: 'threadstone_shard', count: 1 }],
      lightRadius: 9, wardRadius: 11, requires: 'open_sky',
      colour: 0x4a4458, accent: 0xf2e9c9,
      description: 'Holds the Duskveil back. Coverage is line-of-sight — plan the placements.',
    }),
    S({
      id: 'creature_pen', name: 'Creature Pen', w: 3, h: 3,
      cost: [{ itemId: 'timber', count: 30 }, { itemId: 'fiber', count: 20 }],
      requires: 'none', colour: 0x7a5f3d, accent: 0x9bbf5a,
      description: 'Reserve creatures rest here and recover between expeditions.',
    }),
    S({
      id: 'farm_plot', name: 'Farm Plot', w: 2, h: 2,
      cost: [{ itemId: 'timber', count: 8 }, { itemId: 'fiber', count: 10 }],
      requires: 'adjacent_water',
      colour: 0x5a4632, accent: 0x7ac74f,
      description: 'Grows what the Kitchen needs. Must touch water.',
    }),
  ].map((s) => [s.id, s]),
);

export function getStructure(id: string): StructureDef {
  const s = STRUCTURES[id];
  if (!s) throw new Error(`Unknown structure: ${id}`);
  return s;
}
