package pl.okstudy.mobile;

import android.content.Context;
import android.graphics.*;
import android.view.*;

/** Drag the sample here; the real answer overlay stays non-interactive. */
final class AnswerPreview extends View {
  private final Prefs prefs;
  private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

  AnswerPreview(Context c) {
    super(c);
    prefs = new Prefs(c);
    setContentDescription(
        "Podgląd odpowiedzi. Przeciągnij D w wybrane miejsce. Położenie można także ustawić"
            + " suwakami poniżej.");
  }

  @Override
  protected void onDraw(Canvas c) {
    int pad = Design.dp(getContext(), 12);
    float w = getWidth(), h = getHeight();
    paint.setColor(Color.rgb(233, 239, 229));
    paint.setAlpha(255);
    c.drawRoundRect(0, 0, w, h, 24, 24, paint);
    paint.setColor(Color.rgb(118, 133, 120));
    paint.setTextSize(Design.dp(getContext(), 12));
    c.drawText("PODGLĄD TWOJEGO EKRANU", pad, pad + paint.getTextSize(), paint);
    paint.setColor(Color.rgb(198, 209, 195));
    for (int i = 0; i < 4; i++)
      c.drawRoundRect(
          pad, pad + 35 + i * 29, w * (i % 2 == 0 ? .77f : .58f), pad + 43 + i * 29, 4, 4, paint);
    float size = prefs.textSize() * getResources().getDisplayMetrics().scaledDensity;
    paint.setTypeface(Typeface.DEFAULT);
    paint.setTextSize(size);
    float boxW = paint.measureText("D") + 20, boxH = size + 18;
    boolean custom = prefs.position().equals("custom");
    float x = pad + (custom ? prefs.answerX() : 1) * Math.max(0, w - pad * 2 - boxW),
        y =
            pad
                + (custom ? prefs.answerY() : prefs.position().equals("top") ? 0 : 1)
                    * Math.max(0, h - pad * 2 - boxH);
    paint.setAlpha(Math.round(255 * prefs.opacity()));
    if (prefs.style().equals("card")) {
      paint.setColor(prefs.color().equals("dark") ? Design.TEXT : Design.BG);
      paint.setAlpha(Math.round(255 * prefs.opacity()));
      c.drawRoundRect(x, y, x + boxW, y + boxH, 9, 9, paint);
    }
    paint.setColor(prefs.color().equals("dark") ? Design.BG : Design.TEXT);
    paint.setAlpha(Math.round(255 * prefs.opacity()));
    c.drawText("D", x + 10, y + size + 4, paint);
    paint.setAlpha(255);
  }

  @Override
  public boolean performClick() {
    super.performClick();
    return true;
  }

  @Override
  public boolean onTouchEvent(MotionEvent e) {
    if (e.getActionMasked() == MotionEvent.ACTION_DOWN)
      getParent().requestDisallowInterceptTouchEvent(true);
    if (e.getActionMasked() == MotionEvent.ACTION_DOWN
        || e.getActionMasked() == MotionEvent.ACTION_MOVE) {
      float x = Math.max(0, Math.min(1, (e.getX() - 24) / Math.max(1, getWidth() - 48)));
      float y = Math.max(0, Math.min(1, (e.getY() - 24) / Math.max(1, getHeight() - 48)));
      prefs
          .store
          .edit()
          .putFloat("answerX", x)
          .putFloat("answerY", y)
          .putString("position", "custom")
          .apply();
      invalidate();
      return true;
    }
    if (e.getActionMasked() == MotionEvent.ACTION_UP
        || e.getActionMasked() == MotionEvent.ACTION_CANCEL) {
      getParent().requestDisallowInterceptTouchEvent(false);
      performClick();
      return true;
    }
    return true;
  }
}
