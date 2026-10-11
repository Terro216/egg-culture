import test from 'node:test';
import assert from 'node:assert/strict';
import { swapFrame } from '../src/features/EggUntangle/motion.ts';
import { campaignSeed, generatePuzzle, swapNodes } from '../src/features/EggUntangle/engine.ts';

test('swap presentation lands exactly, leaves other eggs fixed and never mutates the saved layout', () => {
  const from = [{x:200,y:500},{x:800,y:500},{x:500,y:200}], to = swapNodes(from, 0, 1);
  const snapshot = JSON.stringify({from,to});
  assert.deepEqual(swapFrame(from,to,0),from);
  assert.deepEqual(swapFrame(from,to,1),to);
  const middle = swapFrame(from,to,.5);
  assert.ok(middle[0].y > 500 && middle[1].y < 500, 'two distinct opposing paths');
  assert.ok(Math.hypot(middle[0].x-middle[1].x,middle[0].y-middle[1].y) >= 72, 'shells remain separate when they pass');
  for(let step=0;step<=30;step++) assert.deepEqual(swapFrame(from,to,step/30)[2],from[2]);
  assert.equal(JSON.stringify({from,to}),snapshot);
});

test('animated swaps of every fixed slot pair remain inside the visible board', () => {
  for(const level of [1,3,12,24]) {
    const puzzle=generatePuzzle(campaignSeed(level,'swap'));
    for(let a=0;a<puzzle.initial.length;a++) for(let b=a+1;b<puzzle.initial.length;b++) {
      const to=swapNodes(puzzle.initial,a,b);
      for(const t of [.1,.25,.5,.75,.9]) for(const p of swapFrame(puzzle.initial,to,t)) {
        assert.ok(p.x>=45&&p.x<=955&&p.y>=45&&p.y<=955, 'visual shells stay inside the board');
      }
      assert.deepEqual(swapFrame(puzzle.initial,to,1),to);
    }
  }
});
