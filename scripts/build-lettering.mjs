// Original, uneven pen lettering. No downloaded fonts or font dependencies.
import { writeFileSync } from 'node:fs';
const strokes={
 A:[[[20,0],[260,705],[520,5]],[[115,260],[420,275]]],
 B:[[[35,0],[27,700],[300,690],[450,585],[420,430],[50,365]],[[60,365],[350,370],[480,240],[440,75],[290,0],[35,0]]],
 C:[[[500,610],[380,710],[160,685],[35,520],[25,190],[145,30],[370,0],[500,90]]],
 D:[[[35,0],[30,700],[235,690],[450,540],[485,335],[420,115],[270,15],[35,0]]],
 E:[[[480,700],[35,685],[30,0],[490,12]],[[37,355],[400,370]]],
 F:[[[40,0],[30,695],[490,705]],[[35,370],[390,355]]],
 G:[[[495,605],[365,710],[165,680],[35,510],[25,180],[165,20],[390,10],[505,125],[500,330],[300,335]]],
 H:[[[30,700],[40,0]],[[490,705],[480,5]],[[40,355],[485,370]]],
 I:[[[80,700],[430,695]],[[250,695],[260,0]],[[85,5],[430,0]]],
 J:[[[115,695],[480,705]],[[420,700],[410,165],[330,15],[135,0],[35,125]]],
 K:[[[40,700],[30,0]],[[480,700],[42,320],[500,0]]],
 L:[[[35,705],[30,0],[480,10]]],
 M:[[[30,0],[35,700],[265,300],[490,700],[505,0]]],
 N:[[[40,0],[25,700],[490,5],[480,705]]],
 O:[[[270,710],[90,655],[25,425],[45,145],[200,0],[385,30],[500,235],[485,520],[370,685],[270,710]]],
 P:[[[40,0],[30,700],[300,695],[470,570],[460,425],[315,325],[40,340]]],
 Q:[[[270,710],[90,655],[25,425],[45,145],[200,0],[385,30],[500,235],[485,520],[370,685],[270,710]],[[300,180],[530,-60]]],
 R:[[[40,0],[30,700],[300,695],[470,570],[450,415],[315,325],[40,340]],[[270,330],[510,0]]],
 S:[[[485,620],[345,710],[140,665],[35,530],[85,390],[405,275],[475,140],[370,15],[160,0],[25,85]]],
 T:[[[5,695],[535,705]],[[270,700],[255,0]]],
 U:[[[35,700],[25,190],[125,30],[280,0],[440,90],[480,270],[485,705]]],
 V:[[[25,700],[250,0],[505,710]]],
 W:[[[15,700],[115,0],[270,360],[395,0],[515,700]]],
 X:[[[25,700],[500,0]],[[505,700],[20,0]]],
 Y:[[[20,700],[270,350],[505,705]],[[270,350],[265,0]]],
 Z:[[[20,690],[500,705],[25,0],[510,10]]],
 '0':[[[265,700],[90,625],[35,340],[85,55],[260,0],[435,75],[480,360],[420,640],[265,700]],[[120,105],[405,590]]],
 '1':[[[100,540],[275,705],[260,0]],[[95,0],[440,10]]],
 '2':[[[40,550],[115,680],[320,700],[475,570],[450,405],[30,0],[500,10]]],
 '3':[[[35,640],[220,705],[440,620],[455,455],[280,350],[460,255],[460,110],[300,0],[80,35],[25,120]]],
 '4':[[[390,0],[400,710],[20,230],[510,240]]],
 '5':[[[485,700],[65,685],[35,365],[295,390],[465,275],[460,100],[300,0],[75,20],[20,80]]],
 '6':[[[430,670],[280,710],[95,550],[30,200],[120,35],[305,0],[465,115],[475,290],[340,390],[145,365],[45,230]]],
 '7':[[[25,695],[500,705],[180,0]],[[150,345],[390,360]]],
 '8':[[[270,710],[80,625],[55,460],[420,250],[460,100],[300,0],[100,30],[30,150],[70,300],[425,470],[455,610],[270,710]]],
 '9':[[[460,440],[350,330],[155,340],[35,470],[60,625],[230,710],[405,650],[480,510],[415,190],[260,0],[85,20]]],
 '.':[[[240,15],[250,25]]],',':[[[265,25],[220,-95]]],':':[[[245,480],[250,485]],[[245,60],[250,65]]],';':[[[245,480],[250,485]],[[265,65],[220,-70]]],
 '!':[[[260,700],[245,200]],[[240,20],[250,30]]], '?':[[[45,545],[115,680],[310,710],[465,605],[440,450],[260,320],[250,190]],[[245,20],[255,30]]],
 '-':[[[90,320],[440,330]]], '_':[[[40,-50],[500,-45]]],'/':[[[20,0],[480,700]]], '\\':[[[40,700],[480,0]]],
 '(':[[[350,735],[170,550],[125,300],[190,50],[360,-65]]],')':[[[150,735],[340,550],[385,300],[320,50],[145,-65]]],
 '[':[[[370,730],[130,730],[120,-50],[370,-45]]],']':[[[150,735],[390,730],[400,-45],[150,-50]]],
 "'":[[[255,700],[235,535]]], '"':[[[175,700],[160,535]],[[335,705],[320,540]]],
 '+':[[[60,330],[470,340]],[[265,540],[255,110]]], '=':[[[60,420],[470,430]],[[60,230],[470,240]]],
 '&':[[[490,0],[90,450],[85,610],[235,705],[355,640],[340,495],[65,200],[65,65],[230,0],[410,120],[490,340]]],
 '*':[[[260,700],[260,200]],[[40,590],[470,315]],[[40,315],[470,590]]],
 '|':[[[260,750],[250,-80]]], '<':[[[440,610],[70,350],[440,85]]], '>':[[[80,610],[450,350],[80,85]]],
 '#':[[[200,710],[120,-10]],[[410,710],[330,-10]],[[20,465],[520,480]],[[5,220],[500,235]]],
};
const u16=(b,o,v)=>b.writeUInt16BE(v&65535,o),i16=(b,o,v)=>b.writeInt16BE(Math.round(v),o),u32=(b,o,v)=>b.writeUInt32BE(v>>>0,o);
const pad=b=>Buffer.concat([b,Buffer.alloc((4-b.length%4)%4)]);
function glyph(char){
 const paths=strokes[char.toUpperCase()]||[]; const polygons=[];
 for(const path of paths){
  for(let i=1;i<path.length;i++){
   const [ax,ay]=path[i-1],[bx,by]=path[i],dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1,r=24+(i%3)*2,nx=-dy/len*r,ny=dx/len*r;
   polygons.push([[ax+nx,ay+ny],[ax-nx,ay-ny],[bx-nx,by-ny],[bx+nx,by+ny]]);
  }
  for(const [x,y]of path)polygons.push(Array.from({length:7},(_,i)=>[x+Math.cos(i/7*Math.PI*2)*24,y+Math.sin(i/7*Math.PI*2)*24]));
 }
 if(!polygons.length)return Buffer.alloc(0);
 const points=polygons.flat().map(([x,y])=>[Math.round(x+45),Math.round(y)]),n=points.length;
 const out=Buffer.alloc(10+polygons.length*2+2+n+n*4);i16(out,0,polygons.length);
 [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))].forEach((v,i)=>i16(out,2+i*2,v));
 let offset=10,count=0;for(const poly of polygons){count+=poly.length;u16(out,offset,count-1);offset+=2;}u16(out,offset,0);offset+=2;
 out.fill(1,offset,offset+n);offset+=n;
 for(const axis of [0,1]){let last=0;for(const p of points){i16(out,offset,p[axis]-last);offset+=2;last=p[axis];}}
 return pad(out);
}
const glyphs=[glyph('?'),...Array.from({length:95},(_,i)=>glyph(String.fromCharCode(i+32)))],num=glyphs.length;
const tables={}; tables.glyf=Buffer.concat(glyphs);tables.loca=Buffer.alloc((num+1)*4);
let position=0;glyphs.forEach((g,i)=>{u32(tables.loca,i*4,position);position+=g.length;});u32(tables.loca,num*4,position);
tables.hmtx=Buffer.alloc(num*4);for(let i=0;i<num;i++){const char=String.fromCharCode(i+31);u16(tables.hmtx,i*4,char===' '?335:'.:,;!\'|'.includes(char)?330:620);i16(tables.hmtx,i*4+2,20);}
tables.head=Buffer.alloc(54);u32(tables.head,0,0x10000);u32(tables.head,4,0x10000);u32(tables.head,12,0x5f0f3cf5);u16(tables.head,16,11);u16(tables.head,18,1000);i16(tables.head,36,0);i16(tables.head,38,-180);i16(tables.head,40,650);i16(tables.head,42,850);u16(tables.head,46,8);i16(tables.head,48,2);i16(tables.head,50,1);
tables.hhea=Buffer.alloc(36);u32(tables.hhea,0,0x10000);i16(tables.hhea,4,850);i16(tables.hhea,6,-180);u16(tables.hhea,10,650);i16(tables.hhea,18,1);u16(tables.hhea,34,num);
tables.maxp=Buffer.alloc(32);u32(tables.maxp,0,0x10000);u16(tables.maxp,4,num);u16(tables.maxp,6,1000);u16(tables.maxp,8,150);u16(tables.maxp,14,2);
tables.cmap=Buffer.alloc(44);u16(tables.cmap,2,1);u16(tables.cmap,4,3);u16(tables.cmap,6,1);u32(tables.cmap,8,12);const cm=tables.cmap.subarray(12);u16(cm,0,4);u16(cm,2,32);u16(cm,6,4);u16(cm,8,4);u16(cm,10,1);u16(cm,14,126);u16(cm,16,65535);u16(cm,20,32);u16(cm,22,65535);u16(cm,24,-31);u16(cm,26,1);
tables['OS/2']=Buffer.alloc(78);const os=tables['OS/2'];i16(os,2,600);u16(os,4,400);u16(os,6,5);i16(os,10,650);i16(os,12,600);i16(os,18,650);i16(os,20,600);i16(os,26,45);i16(os,28,300);os.write('ECHO',58);u16(os,62,64);u16(os,64,32);u16(os,66,126);i16(os,68,850);i16(os,70,-180);u16(os,74,1000);u16(os,76,200);
const names=[[1,'Echoes Field Notes'],[2,'Regular'],[3,'EchoesFieldNotes-1'],[4,'Echoes Field Notes'],[5,'Version 1.0'],[6,'EchoesFieldNotes']];
const strings=names.map(([,s])=>{const b=Buffer.from(s,'utf16le');return b.swap16();});tables.name=Buffer.alloc(6+names.length*12+strings.reduce((n,b)=>n+b.length,0));u16(tables.name,2,names.length);u16(tables.name,4,6+names.length*12);let stringOffset=0;
names.forEach(([id],i)=>{const o=6+i*12;u16(tables.name,o,3);u16(tables.name,o+2,1);u16(tables.name,o+4,0x409);u16(tables.name,o+6,id);u16(tables.name,o+8,strings[i].length);u16(tables.name,o+10,stringOffset);strings[i].copy(tables.name,6+names.length*12+stringOffset);stringOffset+=strings[i].length;});
tables.post=Buffer.alloc(32);u32(tables.post,0,0x30000);
const checksum=b=>{const data=pad(b);let sum=0;for(let i=0;i<data.length;i+=4)sum=(sum+data.readUInt32BE(i))>>>0;return sum;};
const tags=Object.keys(tables).sort(),directory=Buffer.alloc(12+tags.length*16);u32(directory,0,0x10000);u16(directory,4,tags.length);u16(directory,6,128);u16(directory,8,3);u16(directory,10,tags.length*16-128);
let cursor=directory.length,headOffset=0;tags.forEach((tag,i)=>{const data=tables[tag],o=12+i*16;directory.write(tag,o);u32(directory,o+4,checksum(data));u32(directory,o+8,cursor);u32(directory,o+12,data.length);if(tag==='head')headOffset=cursor;cursor+=pad(data).length;});
const font=Buffer.concat([directory,...tags.map(tag=>pad(tables[tag]))]);u32(font,headOffset+8,0xb1b0afba-checksum(font));
writeFileSync(new URL('../src/lettering.css',import.meta.url),`/* Original lettering; regenerate with node scripts/build-lettering.mjs. */\n@font-face{font-family:'Field Notes';src:url(data:font/ttf;base64,${font.toString('base64')}) format('truetype');font-style:normal;font-weight:100 900;font-display:swap;unicode-range:U+0020-007E}\n`);
console.log(`Built original pen lettering (${font.length} bytes).`);

