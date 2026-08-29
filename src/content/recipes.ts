import type { ItemStack } from './items';

export type StationId = 'campfire' | 'workbench' | 'forge' | 'kitchen' | 'alchemy';

export interface RecipeDef {
  id: string;
  station: StationId;
  output: ItemStack;
  inputs: ItemStack[];
  craftMs: number;
  /** Learned by discovery (harvesting an input), by blueprint, or known from the start. */
  known: 'start' | 'discovery' | 'blueprint';
}

const R = (d: RecipeDef): RecipeDef => d;

export const RECIPES: Record<string, RecipeDef> = Object.fromEntries(
  [
    // Campfire
    R({ id: 'cook_meat', station: 'campfire', output: { itemId: 'cooked_meat', count: 1 }, inputs: [{ itemId: 'raw_meat', count: 1 }, { itemId: 'timber', count: 1 }], craftMs: 2500, known: 'start' }),
    R({ id: 'salve', station: 'campfire', output: { itemId: 'healing_salve', count: 1 }, inputs: [{ itemId: 'fiber', count: 3 }, { itemId: 'sunberry', count: 2 }], craftMs: 3000, known: 'start' }),
    R({ id: 'antidote', station: 'campfire', output: { itemId: 'antidote', count: 1 }, inputs: [{ itemId: 'bog_cap', count: 2 }, { itemId: 'fiber', count: 2 }], craftMs: 3000, known: 'discovery' }),
    R({ id: 'warm_draught', station: 'campfire', output: { itemId: 'warm_draught', count: 1 }, inputs: [{ itemId: 'char_root', count: 2 }, { itemId: 'fiber', count: 1 }], craftMs: 3000, known: 'discovery' }),

    // Workbench
    R({ id: 'axe', station: 'workbench', output: { itemId: 'axe', count: 1 }, inputs: [{ itemId: 'timber', count: 6 }, { itemId: 'stone_block', count: 4 }], craftMs: 4000, known: 'start' }),
    R({ id: 'pick', station: 'workbench', output: { itemId: 'pick', count: 1 }, inputs: [{ itemId: 'timber', count: 6 }, { itemId: 'stone_block', count: 6 }], craftMs: 4000, known: 'start' }),
    R({ id: 'threadsnare', station: 'workbench', output: { itemId: 'threadsnare', count: 3 }, inputs: [{ itemId: 'fiber', count: 8 }, { itemId: 'timber', count: 2 }], craftMs: 3500, known: 'start' }),
    R({ id: 'fiber_wrap', station: 'workbench', output: { itemId: 'fiber_wrap', count: 1 }, inputs: [{ itemId: 'fiber', count: 12 }], craftMs: 5000, known: 'start' }),
    R({ id: 'worn_blade', station: 'workbench', output: { itemId: 'worn_blade', count: 1 }, inputs: [{ itemId: 'timber', count: 4 }, { itemId: 'stone_block', count: 8 }], craftMs: 5000, known: 'start' }),
    R({ id: 'hide_hood', station: 'workbench', output: { itemId: 'hide_hood', count: 1 }, inputs: [{ itemId: 'leather', count: 5 }, { itemId: 'fiber', count: 6 }], craftMs: 6000, known: 'discovery' }),
    R({ id: 'hide_jerkin', station: 'workbench', output: { itemId: 'hide_jerkin', count: 1 }, inputs: [{ itemId: 'leather', count: 10 }, { itemId: 'fiber', count: 8 }], craftMs: 8000, known: 'discovery' }),

    // Forge
    R({ id: 'copper_ingot', station: 'forge', output: { itemId: 'copper_ingot', count: 1 }, inputs: [{ itemId: 'copper_ore', count: 2 }, { itemId: 'timber', count: 1 }], craftMs: 3500, known: 'start' }),
    R({ id: 'iron_ingot', station: 'forge', output: { itemId: 'iron_ingot', count: 1 }, inputs: [{ itemId: 'iron_ore', count: 2 }, { itemId: 'timber', count: 2 }], craftMs: 5000, known: 'start' }),
    R({ id: 'copper_blade', station: 'forge', output: { itemId: 'copper_blade', count: 1 }, inputs: [{ itemId: 'copper_ingot', count: 6 }, { itemId: 'timber', count: 2 }], craftMs: 8000, known: 'start' }),
    R({ id: 'iron_blade', station: 'forge', output: { itemId: 'iron_blade', count: 1 }, inputs: [{ itemId: 'iron_ingot', count: 8 }, { itemId: 'leather', count: 3 }], craftMs: 12000, known: 'discovery' }),
    R({ id: 'iron_spear', station: 'forge', output: { itemId: 'iron_spear', count: 1 }, inputs: [{ itemId: 'iron_ingot', count: 6 }, { itemId: 'timber', count: 4 }], craftMs: 12000, known: 'discovery' }),
    R({ id: 'iron_mail', station: 'forge', output: { itemId: 'iron_mail', count: 1 }, inputs: [{ itemId: 'iron_ingot', count: 14 }, { itemId: 'leather', count: 6 }], craftMs: 18000, known: 'discovery' }),
    R({ id: 'sling_focus', station: 'forge', output: { itemId: 'sling_focus', count: 1 }, inputs: [{ itemId: 'threadstone_shard', count: 1 }, { itemId: 'fiber', count: 10 }, { itemId: 'copper_ingot', count: 4 }], craftMs: 15000, known: 'blueprint' }),
    R({ id: 'wardlight_charm', station: 'forge', output: { itemId: 'wardlight_charm', count: 1 }, inputs: [{ itemId: 'threadstone_shard', count: 2 }, { itemId: 'copper_ingot', count: 4 }], craftMs: 14000, known: 'blueprint' }),
  ].map((r) => [r.id, r]),
);

export const RECIPE_IDS = Object.keys(RECIPES);

/** Deconstruction returns 60% of inputs, rounded down. No dead inventory. */
export const DECONSTRUCT_RATIO = 0.6;

export type Quality = 'crude' | 'standard' | 'fine' | 'superb';
export const QUALITY_MULT: Record<Quality, number> = {
  crude: 0.85, standard: 1, fine: 1.1, superb: 1.2,
};

/** GDD §11.2. Crafting never destroys materials — quality varies, success does not. */
export function rollQuality(craftAttr: number, stationTier: number, roll: number): Quality {
  const q = 0.5 + craftAttr * 0.01 + stationTier * 0.1 + (roll * 0.2 - 0.1);
  if (q >= 1.15) return 'superb';
  if (q >= 0.95) return 'fine';
  if (q >= 0.7) return 'standard';
  return 'crude';
}
