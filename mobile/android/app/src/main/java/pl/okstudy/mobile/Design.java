package pl.okstudy.mobile;

import android.content.Context;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.view.*;
import android.widget.*;

final class Design {
  static final int BG = Color.rgb(18, 23, 22),
      CARD = Color.rgb(28, 37, 33),
      LIME = Color.rgb(188, 243, 90);
  static final int TEXT = Color.rgb(242, 244, 235),
      MUTED = Color.rgb(170, 190, 178),
      BORDER = Color.rgb(53, 70, 61);

  static int dp(Context c, float n) {
    return Math.round(n * c.getResources().getDisplayMetrics().density);
  }

  static GradientDrawable shape(Context c, int color, int radius) {
    GradientDrawable result = new GradientDrawable();
    result.setColor(color);
    result.setCornerRadius(dp(c, radius));
    result.setStroke(dp(c, 1), BORDER);
    return result;
  }

  static LinearLayout column(Context c) {
    LinearLayout v = new LinearLayout(c);
    v.setOrientation(LinearLayout.VERTICAL);
    return v;
  }

  static TextView text(Context c, String text, int size, int color, boolean bold) {
    TextView view = new TextView(c);
    view.setText(text);
    view.setTextSize(size);
    view.setTextColor(color);
    view.setFontFeatureSettings("kern");
    view.setLineSpacing(dp(c, 3), 1f);
    if (bold) view.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
    return view;
  }

  static Button button(Context c, String title, boolean primary) {
    Button view = new Button(c);
    view.setText(title);
    view.setAllCaps(false);
    view.setTextSize(15);
    view.setTextColor(primary ? BG : TEXT);
    view.setBackground(
        new android.graphics.drawable.RippleDrawable(
            android.content.res.ColorStateList.valueOf(primary ? 0x33000000 : 0x33BCF35A),
            shape(c, primary ? LIME : CARD, 18),
            null));
    view.setPadding(dp(c, 16), dp(c, 9), dp(c, 16), dp(c, 9));
    view.setMinHeight(dp(c, 52));
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
    p.topMargin = dp(c, 10);
    view.setLayoutParams(p);
    return view;
  }

  static void art(Context c, LinearLayout parent, int resource, int height) {
    ImageView image = new ImageView(c);
    image.setImageResource(resource);
    image.setScaleType(ImageView.ScaleType.CENTER_CROP);
    image.setBackground(shape(c, BG, 24));
    image.setClipToOutline(true);
    image.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, dp(c, height));
    p.topMargin = dp(c, 18);
    p.bottomMargin = dp(c, 12);
    parent.addView(image, p);
  }

  static void row(Context c, LinearLayout parent, Button... buttons) {
    LinearLayout row = new LinearLayout(c);
    parent.addView(row);
    for (int i = 0; i < buttons.length; i++) {
      buttons[i].setTextSize(12);
      LinearLayout.LayoutParams cell = new LinearLayout.LayoutParams(0, dp(c, 48), 1);
      cell.setMargins(i == 0 ? 0 : dp(c, 4), dp(c, 8), i == buttons.length - 1 ? 0 : dp(c, 4), 0);
      row.addView(buttons[i], cell);
    }
  }

  static TextView chip(Context c, String label) {
    TextView v = text(c, label, 10, LIME, true);
    v.setLetterSpacing(.08f);
    v.setPadding(dp(c, 12), dp(c, 7), dp(c, 12), dp(c, 7));
    v.setBackground(shape(c, CARD, 18));
    return v;
  }

  static LinearLayout card(Context c, LinearLayout parent, String title, String subtitle) {
    LinearLayout card = column(c);
    card.setPadding(dp(c, 18), dp(c, 18), dp(c, 18), dp(c, 20));
    card.setBackground(shape(c, CARD, 22));
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(-1, -2);
    p.topMargin = dp(c, 18);
    parent.addView(card, p);
    card.addView(text(c, title, 19, TEXT, true));
    if (!subtitle.isEmpty()) {
      TextView hint = text(c, subtitle, 12, MUTED, false);
      hint.setPadding(0, dp(c, 7), 0, dp(c, 12));
      card.addView(hint);
    }
    return card;
  }

  static final class Mark extends View {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

    Mark(Context c) {
      super(c);
      setContentDescription("OKStudy");
    }

    @Override
    protected void onDraw(Canvas canvas) {
      super.onDraw(canvas);
      canvas.save();
      float scale = Math.min(getWidth() / 112f, getHeight() / 72f);
      canvas.translate((getWidth() - 112 * scale) / 2, (getHeight() - 72 * scale) / 2);
      canvas.scale(scale, scale);
      paint.setColor(LIME);
      paint.setStrokeWidth(10);
      paint.setStyle(Paint.Style.STROKE);
      paint.setStrokeJoin(Paint.Join.ROUND);
      paint.setStrokeCap(Paint.Cap.SQUARE);
      Path p = new Path();
      p.moveTo(61, 21);
      p.lineTo(61, 18);
      p.quadTo(61, 8, 51, 8);
      p.lineTo(20, 8);
      p.quadTo(8, 8, 8, 20);
      p.lineTo(8, 52);
      p.quadTo(8, 64, 20, 64);
      p.lineTo(51, 64);
      p.quadTo(61, 64, 61, 54);
      p.lineTo(61, 51);
      canvas.drawPath(p, paint);
      canvas.drawLine(61, 45, 99, 8, paint);
      canvas.drawLine(75, 31, 103, 64, paint);
      canvas.restore();
    }
  }
}
