import test from 'node:test';
import assert from 'node:assert/strict';
import {nativePalette,nativeButtonColor} from './native-palette';
function luminance(color:string){const values=color.slice(1).match(/../g)!.map(hex=>{const s=Number.parseInt(hex,16)/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});return .2126*values[0]+.7152*values[1]+.0722*values[2];}
function contrast(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
for(const dark of [false,true])for(const platform of ['android','ios'])for(const tone of ['primary','destructive'] as const){
 test(`${platform} ${dark?'dark':'light'} ${tone} native label remains readable`,()=>{
  const palette=nativePalette(dark),color=nativeButtonColor(palette,platform,tone);
  if(platform==='android')assert.ok(contrast('#ffffff',color)>=4.5);
  else for(const background of [palette.background,palette.surface])assert.ok(contrast(color,background)>=4.5);
 });
}
