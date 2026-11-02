export const BUSH_ATLAS={columns:7,rows:2,cellWidth:512,cellHeight:384,anchorX:256,anchorY:360,scale:.63};
export { BUSH_MOUTHS } from './assets/bush-killer-frames.js';

/** The supplied sheet has one moving row and one attack row, seven drawings each. */
export function bushSpriteFrame(bush){
  if(bush.phase==='opening')return {row:1,column:Math.min(4,Math.floor(bush.age/.22*4))};
  if(bush.phase==='closing')return {row:1,column:Math.min(4,Math.floor(bush.reveal*4))};
  if(bush.phase==='chewing')return {row:1,column:bush.age<.38?4:bush.age<.9?5:6};
  if(bush.phase==='stalking')return {row:0,column:Math.floor((bush.stride||0)/150*7)%7};
  return {row:0,column:0};
}
