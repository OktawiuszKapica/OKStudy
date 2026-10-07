package pl.okstudy.mobile;

import android.app.Activity;
import android.content.Intent;
import android.os.*;

/** Opening an activity closes the notification shade before taking the frame. */
public final class CaptureTriggerActivity extends Activity {
  @Override public void onCreate(Bundle state){
    super.onCreate(state);
    String action=getIntent().getAction();
    if(!CaptureService.FULL.equals(action)&&!CaptureService.SELECT.equals(action)){finish();return;}
    if(!AppState.active){startActivity(new Intent(this,MainActivity.class));finish();return;}
    var context=getApplicationContext();finish();
    new Handler(Looper.getMainLooper()).postDelayed(()->{
      if(!AppState.active)return;
      try{context.startService(new Intent(context,CaptureService.class).setAction(action));}
      catch(IllegalStateException error){AppState.error="Sesja zakończona. Uruchom ją ponownie w OKStudy.";}
    },350);
  }
}
