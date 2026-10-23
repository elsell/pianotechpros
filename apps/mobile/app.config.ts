import en from '../../packages/i18n/src/locales/en.json';
import es from '../../packages/i18n/src/locales/es.json';

const permissionStrings=(catalog:typeof en)=>({ios:{
 NSCameraUsageDescription:catalog['inventory.photos.cameraPermission'],
 NSPhotoLibraryUsageDescription:catalog['inventory.photos.libraryPermission'],
}});

export default ({ config }: { config: Record<string, unknown> }) => ({
  ...config,
  plugins:[...(Array.isArray(config.plugins)?config.plugins:[]),
   ['expo-image-picker',{cameraPermission:en['inventory.photos.cameraPermission'],photosPermission:en['inventory.photos.libraryPermission'],microphonePermission:false}],
   ['expo-localization',{supportedLocales:{ios:['en','es'],android:['en','es']}}]],
  locales:{en:permissionStrings(en),es:permissionStrings(es)},
  ios:{...((config.ios as Record<string,unknown>|undefined)??{}),infoPlist:{
   ...(((config.ios as Record<string,unknown>|undefined)?.infoPlist as Record<string,unknown>|undefined)??{}),CFBundleAllowMixedLocalizations:true,
  }},
  extra: {
    ...((config.extra as Record<string, unknown> | undefined) ?? {}),
    application: {
      environment: process.env.PIANOTECHPROS_APP_ENV ?? 'development',
      apiURL: process.env.PIANOTECHPROS_API_URL ?? 'http://localhost:8080',
      oidcIssuer: process.env.PIANOTECHPROS_OIDC_ISSUER ?? 'http://localhost:5556/dex',
      oidcClientId: process.env.PIANOTECHPROS_MOBILE_OIDC_CLIENT_ID ?? 'pianotechpros-mobile',
    },
  },
});
