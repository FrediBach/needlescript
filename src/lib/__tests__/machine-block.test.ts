import { describe, expect, it } from 'vitest';
import { MACHINES } from '../../data.ts';
import {
  applyBlock,
  findBlock,
  findConflicts,
  generateBlock,
  removeBlock,
} from '../../machineBlock.ts';
import { run } from '../engine.ts';

describe('machine block codec', () => {
  it('generates runnable blocks for every preset hoop', () => {
    for (const machine of MACHINES) {
      for (const hoop of machine.hoops) {
        const block = generateBlock(machine, hoop, { budgetMode: true });
        expect(findBlock(block)).toMatchObject({
          id: machine.id,
          hoopId: hoop.id,
          budgetMode: true,
        });
        expect(run(block).activeHoop).toBeDefined();
      }
    }
  });

  it('inserts after a leading comment banner and remains idempotent', () => {
    const machine = MACHINES[0];
    const block = generateBlock(machine, machine.hoops[0]);
    const once = applyBlock('// title\n// by you\nfd 5', block);
    expect(once).toBe(`// title\n// by you\n\n${block}\n\nfd 5`);
    expect(applyBlock(once, block)).toBe(once);
  });

  it('finds outside directives without touching an existing block', () => {
    const block = generateBlock(MACHINES[0], MACHINES[0].hoops[0]);
    expect(findConflicts(`${block}\nhoop '4x4'\noverride 'stitches' 20000`)).toEqual({
      hoop: true,
      stitchesOverride: true,
    });
    expect(removeBlock(`// note\n${block}\nfd 2`)).toBe('// note\nfd 2');
  });

  it('leaves orphaned markers alone', () => {
    const source = '// @machine old hoop=4x4 v1\nfd 1';
    expect(findBlock(source)).toBeNull();
    const applied = applyBlock(source, generateBlock(MACHINES[0], MACHINES[0].hoops[0]));
    expect(applied).toContain('// @machine old hoop=4x4 v1');
    expect(applied).toContain('fd 1');
  });
});
