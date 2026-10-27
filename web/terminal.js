// IBM PC / DOS colors in ANSI SGR order (normal, then bright).
const colors=['#000000','#aa0000','#00aa00','#aa5500','#0000aa','#aa00aa','#00aaaa','#aaaaaa','#555555','#ff5555','#55ff55','#ffff55','#5555ff','#ff55ff','#55ffff','#ffffff'];
// xterm's 6×6×6 color cube and 24 grayscale levels fill indices 16–255.
const hex=value=>value.toString(16).padStart(2,'0');
for(const r of [0,95,135,175,215,255])for(const g of [0,95,135,175,215,255])for(const b of [0,95,135,175,215,255])colors.push(`#${hex(r)}${hex(g)}${hex(b)}`);
for(let i=0;i<24;i++){const level=hex(8+i*10);colors.push(`#${level}${level}${level}`);}
export const extended='ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ';
export function toBytes(text,encoding){if(encoding==='utf8')return new TextEncoder().encode(text);return Uint8Array.from(Array.from(text,c=>{const n=c.codePointAt(0);if(n<128)return n;const i=extended.indexOf(c);if(i<0)throw Error(`“${c}” is not in CP437. Choose UTF-8 to preserve it.`);return i+128;}));}
export function fromBytes(bytes,encoding){return encoding==='utf8'?new TextDecoder().decode(bytes):Array.from(bytes,b=>b<128?String.fromCharCode(b):extended[b-128]).join('');}
export function renderTerminal(canvas,text){
 const ctx=canvas.getContext('2d');const cells=Array.from({length:24},()=>Array.from({length:80},()=>({c:' ',fg:7,bg:0})));
 let x=0,y=0,fg=7,bg=0,bold=false,saved=[0,0];
 const clear=()=>({c:' ',fg,bg});
 function scroll(){if(y>=24){cells.shift();cells.push(Array.from({length:80},clear));y=23;}}
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='\x1b'){
   const m=text.slice(i).match(/^\x1b\[([0-9;?]*)([ -/]*)([@-~])/);
   if(m){i+=m[0].length-1;const args=m[1].replace('?','').split(';').map(v=>Number(v)||0),a=args[0],n=a||1;
    switch(m[3]){
     case 'm': for(let j=0;j<args.length;j++){const v=args[j];if((v===38||v===48)&&args[j+1]===5){const color=args[j+2];if(Number.isInteger(color)&&color>=0&&color<256){if(v===38)fg=color;else bg=color;}j+=2;}else if(v===0){fg=7;bg=0;bold=false;}else if(v===1)bold=true;else if(v===22)bold=false;else if(v===39)fg=7;else if(v===49)bg=0;else if(v>=30&&v<=37)fg=v-30;else if(v>=40&&v<=47)bg=v-40;else if(v>=90&&v<=97)fg=v-90+8;else if(v>=100&&v<=107)bg=v-100+8;}break;
     case 'H':case 'f':y=Math.min(23,Math.max(0,(a||1)-1));x=Math.min(79,Math.max(0,(args[1]||1)-1));break;
     case 'A':y=Math.max(0,y-n);break;case 'B':y=Math.min(23,y+n);break;case 'C':x=Math.min(79,x+n);break;case 'D':x=Math.max(0,x-n);break;
     case 'J':for(let row=0;row<24;row++)for(let col=0;col<80;col++)if(a===2||a===3||(a===0&&(row>y||row===y&&col>=x))||(a===1&&(row<y||row===y&&col<=x)))cells[row][col]=clear();break;
     case 'K':for(let col=0;col<80;col++)if(a===2||(a===0&&col>=x)||(a===1&&col<=x))cells[y][col]=clear();break;
     case 's':saved=[x,y];break;case 'u':[x,y]=saved;break;
    }continue;
   }continue;
  }
  if(c==='\r'){x=0;continue;}if(c==='\n'){x=0;y++;scroll();continue;}if(c==='\b'){x=Math.max(0,x-1);continue;}if(c==='\t'){x=Math.min(80,(Math.floor(x/8)+1)*8);continue;}if(c.charCodeAt(0)<32||c.charCodeAt(0)===127)continue;
  if(x>=80){x=0;y++;scroll();}cells[y][x++]={c,fg:bold&&fg<8?fg+8:fg,bg};
 }
 ctx.fillStyle=colors[0];ctx.fillRect(0,0,960,432);ctx.font='17px DeskMono, monospace';ctx.textBaseline='top';
 cells.forEach((row,r)=>row.forEach((cell,c)=>{if(cell.bg){ctx.fillStyle=colors[cell.bg];ctx.fillRect(c*12,r*18,12,18);}ctx.fillStyle=colors[cell.fg];ctx.fillText(cell.c,c*12,r*18);}));
 ctx.fillStyle=colors[11];ctx.fillRect(Math.min(x,79)*12,y*18+16,10,2);
 return cells.map(row=>row.map(c=>c.c).join('')).join('\n');
}
