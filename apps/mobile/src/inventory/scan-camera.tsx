import {CameraView,useCameraPermissions} from 'expo-camera';
/** The scanner capability exposes QR results and permission, never recording. */
export function NativeScanCamera({ticket,torch,onResult,onFailure}:{ticket:number;torch:boolean;onResult(ticket:number,value:string):void;onFailure(ticket:number):void}){
 return <CameraView style={{height:320,borderRadius:16,overflow:'hidden'}} facing="back" autofocus="on" enableTorch={torch} barcodeScannerSettings={{barcodeTypes:['qr']}} onBarcodeScanned={event=>onResult(ticket,event.data)} onMountError={()=>onFailure(ticket)} />;
}
export function useNativeScanPermission(){return useCameraPermissions();}
