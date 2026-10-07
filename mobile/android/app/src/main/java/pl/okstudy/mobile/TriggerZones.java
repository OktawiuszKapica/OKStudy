package pl.okstudy.mobile;

import android.content.Context;
import android.graphics.*;
import android.os.*;
import android.view.*;
import java.util.ArrayList;

/** Only the small configured targets consume touches; no full-screen touch listener. */
final class TriggerZones implements AutoCloseable {
  private final Context context;
  private final WindowManager windows;
  private final Prefs prefs;
  private final Runnable full, crop;
  private final ArrayList<View> views = new ArrayList<>();
  private long lastTrigger;

  TriggerZones(Context context, WindowManager windows, Prefs prefs, Runnable full, Runnable crop) {
    this.context=context;this.windows=windows;this.prefs=prefs;this.full=full;this.crop=crop;
  }

  void rebuild(Point screen, boolean hidden) {
    close();
    if (!prefs.launcher().equals("edge") && !prefs.launcher().equals("corners")) return;
    String corner=prefs.store.getString("zoneCorner","top-right");
    boolean right=corner.endsWith("right"),bottom=corner.startsWith("bottom");
    add(screen,right,bottom,false,hidden);
    if (prefs.launcher().equals("corners")) add(screen,!right,bottom,true,hidden);
  }

  @android.annotation.SuppressLint("ClickableViewAccessibility")
  private void add(Point screen, boolean right, boolean bottom, boolean cropOnly, boolean hidden) {
    int size=Design.dp(context,prefs.zoneSize());
    View view=new View(context) {
      @Override protected void onDraw(Canvas canvas) {
        if (!prefs.store.getBoolean("zoneVisible",true)) return;
        Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);paint.setColor(Design.LIME);paint.setAlpha(130);
        float d=Design.dp(context,3),h=Design.dp(context,18),x=right?getWidth()-d:0;
        canvas.drawRoundRect(x,(getHeight()-h)/2,x+d,(getHeight()+h)/2,d,d,paint);
      }
    };
    view.setContentDescription(cropOnly?"OKStudy: dwa stuknięcia lub przytrzymanie wybiera fragment":"OKStudy: dwa stuknięcia analizują ekran, przytrzymanie wybiera fragment");
    view.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
    view.setOnClickListener(v->trigger(view,cropOnly?crop:full));
    GestureDetector detector=new GestureDetector(context,new GestureDetector.SimpleOnGestureListener(){
      @Override public boolean onDown(MotionEvent event){return true;}
      @Override public boolean onDoubleTap(MotionEvent event){view.performClick();return true;}
      @Override public void onLongPress(MotionEvent event){trigger(view,crop);}
    });
    view.setOnTouchListener((v,event)->{detector.onTouchEvent(event);return true;});
    WindowManager.LayoutParams layout=new WindowManager.LayoutParams(size,size,WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE|WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,PixelFormat.TRANSLUCENT);
    layout.gravity=Gravity.TOP|Gravity.LEFT;
    layout.x=right?Math.max(0,screen.x-size):0;
    layout.y=bottom?Math.max(0,screen.y-size-Design.dp(context,88)):Design.dp(context,52);
    layout.y=Math.max(0,Math.min(screen.y-size,layout.y));
    view.setVisibility(hidden?View.INVISIBLE:View.VISIBLE);
    windows.addView(view,layout);views.add(view);
  }

  private void trigger(View view,Runnable action) {
    long now=SystemClock.elapsedRealtime();if(now-lastTrigger<650)return;lastTrigger=now;
    if(prefs.store.getBoolean("gestureHaptic",true))view.performHapticFeedback(Build.VERSION.SDK_INT>=30?HapticFeedbackConstants.CONFIRM:HapticFeedbackConstants.LONG_PRESS);
    action.run();
  }

  void visible(boolean visible){for(View v:views)v.setVisibility(visible?View.VISIBLE:View.INVISIBLE);}
  @Override public void close(){for(View v:views)try{windows.removeView(v);}catch(IllegalArgumentException ignored){}views.clear();}
}
