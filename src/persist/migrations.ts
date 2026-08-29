/**
 * Save schema migrations.
 *
 * Rules, and they are not negotiable:
 *  1. Append only. A migration is never edited or deleted once shipped.
 *  2. Every migration ships with a fixture test that loads a real save written
 *     by the previous version (tests/save.test.ts).
 *  3. Bump CURRENT_SCHEMA in the same commit as the migration.
 *
 * The cost of getting this wrong is a player's 40-hour save. There is no
 * cheaper insurance in the project.
 */

export const CURRENT_SCHEMA = 1;

export type Migration = (save: any) => any;

export const MIGRATIONS: Record<number, Migration> = {
  // v1 is the initial schema; the first real entry will be `1: (s) => ...`
  // migrating v1 -> v2.
};
