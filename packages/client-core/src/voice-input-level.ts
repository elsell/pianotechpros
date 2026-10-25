/** Transient display value, not a calibrated sound-pressure measurement. */
export function voiceInputLevel(decibels:unknown):number|null{
 if(decibels===-Infinity)return 0;
 if(typeof decibels!=='number'||!Number.isFinite(decibels))return null;
 return Math.round(Math.max(0,Math.min(1,(decibels+60)/60))*100);
}
