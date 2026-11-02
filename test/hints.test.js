import test from 'node:test';
import assert from 'node:assert/strict';
import { TRAIL_HINTS } from '../src/hints.js';

test('hints introduce only the current trail mechanics in encounter order',()=>{
  assert.deepEqual(TRAIL_HINTS.map(hints=>hints.length),[1,1,1,3,3]);
  assert.match(TRAIL_HINTS[3][0],/linked bridge/);assert.match(TRAIL_HINTS[3][1],/shed/);assert.match(TRAIL_HINTS[3][2],/flag/);
  assert.match(TRAIL_HINTS[4][0],/bell/);assert.match(TRAIL_HINTS[4][1],/sliding/);assert.match(TRAIL_HINTS[4][2],/bush/);
  assert.ok(TRAIL_HINTS.slice(0,4).flat().every(hint=>!hint.includes('goose')));
});
