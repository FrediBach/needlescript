import type { FillConnectorRecord } from './fill-profile.ts';
import type { StitchEvent } from '../core/types.ts';

export type ConstructionLayer = 'underlay' | 'edge-run' | 'topping' | 'travel';

/** Internal event identity retained across travel planning and autotrim. */
export interface ConstructionEventRecord {
  readonly event: StitchEvent;
  readonly layer: ConstructionLayer;
  /** Split satin lanes have independent underlay/topping ordering. */
  readonly lane?: number;
}

interface ConstructionRecordBase {
  readonly id: number;
  readonly line?: number;
  readonly events: ConstructionEventRecord[];
  /** Construction policy captured when generation began. */
  readonly compensationMode?: 'legacy' | 'directional';
}

export interface FillConstructionRecord extends ConstructionRecordBase {
  readonly kind: 'fill';
  readonly underlayMode?: 'off' | 'auto' | 'tatami' | 'edge';
  readonly underlayPasses?: readonly ('tatami' | 'edge')[];
  /** Complete resolved topping/underlay construction region in hoop space. */
  readonly region: [number, number][][];
  /** Pre-fillinset authored boundary used to associate an explicit satin border. */
  readonly authoredRegion: [number, number][][];
  readonly fillInsetMM: number;
  readonly edgeRunInsetMM: number;
  readonly connectors: FillConnectorRecord[];
}

export interface SatinEnvelopeSection {
  readonly a: readonly [number, number];
  readonly b: readonly [number, number];
}

export interface SatinConstructionRecord extends ConstructionRecordBase {
  readonly kind: 'satin';
  readonly underlayMode?: 'off' | 'auto' | 'center' | 'edge' | 'zigzag';
  readonly underlayPasses?: readonly ('center' | 'edge' | 'zigzag')[];
  /** Ordered topping rails in hoop space; together they form the topping envelope. */
  readonly sections: SatinEnvelopeSection[];
  splitColumnCount?: number;
  splitOverlapMM?: number;
}

export type ConstructionRecord = FillConstructionRecord | SatinConstructionRecord;

export const cloneRegion = (rings: readonly (readonly (readonly [number, number])[])[]) =>
  rings.map((ring) => ring.map(([x, y]) => [x, y] as [number, number]));
