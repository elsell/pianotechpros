const {withMainActivity}=require('expo/config-plugins');
const marker='// PianoTechPros modal system-bar appearance';
const hook=`  ${marker}
  override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
    super.onConfigurationChanged(newConfig)
    val light = (newConfig.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) !=
      android.content.res.Configuration.UI_MODE_NIGHT_YES
    val visited = java.util.IdentityHashMap<android.view.View, Boolean>()
    fun update(view: android.view.View) {
      if (visited.put(view, true) != null) return
      if (view is com.facebook.react.views.modal.ReactModalHostView) {
        val dialogWindow = view.dialog?.takeIf { it.isShowing }?.window
        if (dialogWindow != null) {
          androidx.core.view.WindowInsetsControllerCompat(dialogWindow, dialogWindow.decorView)
            .isAppearanceLightStatusBars = light
          update(dialogWindow.decorView)
        }
      }
      if (view is android.view.ViewGroup) {
        for (index in 0 until view.childCount) view.getChildAt(index)?.let { update(it) }
      }
    }
    update(window.decorView)
  }
`;
function applyAppearanceHook(source){
 if(source.includes(marker)){
  if(!source.includes(hook))throw Error('modified_native_system_bar_hook');
  return source;
 }
 if(/override\s+fun\s+onConfigurationChanged\s*\(/.test(source))throw Error('existing_native_configuration_callback');
 const declaration=/class MainActivity\s*:\s*ReactActivity\(\)\s*\{/;
 if(!declaration.test(source))throw Error('unsupported_native_activity');
 return source.replace(declaration,match=>`${match}\n${hook}`);
}
module.exports=config=>withMainActivity(config,config=>{
 if(config.modResults.language!=='kt')throw Error('unsupported_native_activity');
 config.modResults.contents=applyAppearanceHook(config.modResults.contents);
 return config;
});
module.exports.applyAppearanceHook=applyAppearanceHook;
