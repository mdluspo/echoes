import { readFile, writeFile } from 'node:fs/promises';
import { inflateSync, deflateSync } from 'node:zlib';

// Repack the supplied drawings without scaling or repainting their pixels.
const root=new URL('../src/assets/',import.meta.url),source=await readFile(new URL('bush-supplied-sheet.png',root));
const width=source.readUInt32BE(16),height=source.readUInt32BE(20);
if(source[24]!==8||source[25]!==6||source[28]!==0)throw new Error('Expected a non-interlaced 8-bit RGBA PNG.');
const chunks=[];
for(let offset=8;offset<source.length;){const size=source.readUInt32BE(offset),kind=source.toString('ascii',offset+4,offset+8);if(kind==='IDAT')chunks.push(source.subarray(offset+8,offset+8+size));offset+=12+size;}
const raw=inflateSync(Buffer.concat(chunks)),pixels=Buffer.alloc(width*height*4),pitch=width*4;
const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
for(let y=0;y<height;y++){
  const filter=raw[y*(pitch+1)];
  for(let x=0;x<pitch;x++){
    const i=y*pitch+x,a=x>=4?pixels[i-4]:0,b=y?pixels[i-pitch]:0,c=y&&x>=4?pixels[i-pitch-4]:0;
    const predictor=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];if(predictor===undefined)throw new Error('Unknown PNG row filter.');
    pixels[i]=(raw[y*(pitch+1)+1+x]+predictor)&255;
  }
}
const labels=new Int32Array(width*height),queue=new Int32Array(width*height),components=[];
let serial=0;
for(let origin=0;origin<labels.length;origin++){
  if(labels[origin]||pixels[origin*4+3]<30)continue;
  const id=++serial;let head=0,end=1,left=width,top=height,right=0,bottom=0;queue[0]=origin;labels[origin]=id;
  while(head<end){
    const i=queue[head++],x=i%width,y=Math.floor(i/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    for(const n of [i-1,i+1,i-width,i+width])if(n>=0&&n<labels.length&&!labels[n]&&pixels[n*4+3]>=30&&Math.abs(n%width-x)<=1){labels[n]=id;queue[end++]=n;}
  }
  if(end>1000)components.push({id,left,top,right,bottom,pixels:end});
}
const rows=[components.filter(c=>c.top<192),components.filter(c=>c.top>=192)].map(row=>row.sort((a,b)=>a.left-b.left));
if(rows.some(row=>row.length!==7))throw new Error('Expected seven separate drawings in each of the two supplied rows.');
const cellWidth=512,cellHeight=384,anchor={x:256,y:360},outWidth=7*cellWidth,outHeight=2*cellHeight,output=Buffer.alloc(outWidth*outHeight*4),frames=[];
const mouths=[null,[406,536,485,566],[625,514,732,566],[849,446,992,566],[1100,347,1394,566],[1298,389,1542,566],[1669,533,1758,565]];
for(let row=0;row<2;row++)for(let column=0;column<7;column++){
  const component=rows[row][column];let footLeft=width,footRight=0;
  for(let y=component.bottom-7;y<=component.bottom;y++)for(let x=component.left;x<=component.right;x++)if(labels[y*width+x]===component.id){footLeft=Math.min(footLeft,x);footRight=Math.max(footRight,x);}
  const sourceAnchor={x:Math.round((footLeft+footRight)/2),y:component.bottom+1};
  for(let y=Math.max(0,component.top-2);y<=Math.min(height-1,component.bottom+2);y++)for(let x=Math.max(0,component.left-2);x<=Math.min(width-1,component.right+2);x++){
    const i=y*width+x;if(!pixels[i*4+3]||labels[i]&&labels[i]!==component.id)continue;
    let belongs=labels[i]===component.id;
    if(!belongs)for(let dy=-2;dy<=2&&!belongs;dy++)for(let dx=-2;dx<=2&&!belongs;dx++)if(x+dx>=0&&x+dx<width&&y+dy>=0&&y+dy<height)belongs=labels[(y+dy)*width+x+dx]===component.id;
    if(!belongs)continue;
    const localX=anchor.x+x-sourceAnchor.x,localY=anchor.y+y-sourceAnchor.y;
    if(localX<3||localX>=cellWidth-3||localY<3||localY>=cellHeight-3)throw new Error(`Frame ${row},${column} needs more padding.`);
    const dest=((row*cellHeight+localY)*outWidth+column*cellWidth+localX)*4;pixels.copy(output,dest,i*4,i*4+4);
  }
  const mouth=row===1?mouths[column]:null;
  frames.push({row,column,sourceBounds:{x:component.left,y:component.top,w:component.right-component.left+1,h:component.bottom-component.top+1},sourceAnchor,mouth:mouth?{x:mouth[0]-sourceAnchor.x,y:mouth[1]-sourceAnchor.y,w:mouth[2]-mouth[0],h:mouth[3]-mouth[1]}:null});
}
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const chunk=(kind,data)=>{const name=Buffer.from(kind),bytes=Buffer.concat([name,data]);let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);bytes.copy(out,4);out.writeUInt32BE((crc^0xffffffff)>>>0,out.length-4);return out;};
const header=Buffer.alloc(13);header.writeUInt32BE(outWidth);header.writeUInt32BE(outHeight,4);header[8]=8;header[9]=6;
const scanlines=Buffer.alloc(outHeight*(outWidth*4+1));for(let y=0;y<outHeight;y++)output.copy(scanlines,y*(outWidth*4+1)+1,y*outWidth*4,(y+1)*outWidth*4);
await writeFile(new URL('bush-killer-sheet.png',root),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(scanlines)),chunk('IEND',Buffer.alloc(0))]));
await writeFile(new URL('bush-killer-sheet.json',root),JSON.stringify({image:'bush-killer-sheet.png',source:'bush-supplied-sheet.png',columns:7,rows:2,cellWidth,cellHeight,anchor,background:'transparent',defaultFrame:{row:0,column:0},animations:{creep:{row:0,frames:7,distancePerCycle:150,loop:true},eat:{row:1,frames:7,loop:false}},frames},null,2)+'\n');
await writeFile(new URL('bush-killer-frames.js',root),'// Generated from the supplied sheet by scripts/build-bush-sheet.mjs.\nexport const BUSH_MOUTHS='+JSON.stringify(frames.map(frame=>frame.mouth))+';\n');
console.log('Repacked the supplied seven moving and seven attack drawings, with original pixels and padded ground anchors.');
