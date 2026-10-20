import { expect, it } from 'vitest';
import { hasCompleteMonthlyModes, sourceServiceMix } from '../serviceMix';

it('retains the provider all-time FCL/LCL counts without allocating them across months', () => {
  const mix = sourceServiceMix([{load_type:'LCL',shipments:2312},{load_type:'FCL',shipments:31900}]);
  expect(mix).toEqual({fcl:31900,lcl:2312,total:34212});
  expect((mix!.fcl / mix!.total * 100).toFixed(2)).toBe('93.24');
  expect(hasCompleteMonthlyModes([{services:{unknown:300}},{services:{unknown:0}}])).toBe(false);
});

it('only permits FCL/LCL stacked bars when every monthly classification is complete', () => {
  expect(hasCompleteMonthlyModes([{services:{unknown:0}}])).toBe(true);
  expect(sourceServiceMix(undefined)).toBeNull();
  expect(sourceServiceMix([{load_type:'FCL',shipments:null}])).toBeNull();
  expect(sourceServiceMix([{load_type:'FCL',shipments:-5}])).toBeNull();
});
