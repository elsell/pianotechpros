export function nativePalette(dark:boolean){
 return dark
  ? {statusBarStyle:'light' as const,background:'#111815',surface:'#1c2721',text:'#f1f5f2',secondary:'#b8c9bf',border:'#42574a',accent:'#9cddb6',androidButton:'#347a55',destructive:'#ff8a80'}
  : {statusBarStyle:'dark' as const,background:'#f4f6f3',surface:'#ffffff',text:'#162b20',secondary:'#52645a',border:'#cbd7ce',accent:'#245b43',androidButton:'#245b43',destructive:'#b42318'};
}
export function nativeButtonColor(palette:ReturnType<typeof nativePalette>,platform:string,tone:'primary'|'destructive'){
 if(platform==='android')return tone==='destructive'?'#b42318':palette.androidButton;
 return tone==='destructive'?palette.destructive:palette.accent;
}
