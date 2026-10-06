package pl.okstudy.mobile;

import android.content.Context;
import android.graphics.*;
import android.util.Base64;
import android.view.*;
import android.widget.*;
import java.util.function.Consumer;

/** Screenshot editor, entirely in memory. Sending is a separate explicit button. */
final class CropPanel extends LinearLayout {
  record Selection(RectF bounds, boolean remember) {}

  private final CropCanvas canvas;
  private final Runnable cancelAction;

  CropPanel(
      Context c,
      String jpeg,
      RectF initial,
      Consumer<Selection> accept,
      Runnable cancel,
      boolean allowRemember) {
    super(c);
    cancelAction = cancel;
    setFocusableInTouchMode(true);
    setOrientation(VERTICAL);
    setBackgroundColor(Design.BG);
    setPadding(Design.dp(c, 18), Design.dp(c, 42), Design.dp(c, 18), Design.dp(c, 28));
    addView(Design.text(c, "Wybierz swoje zadanie", 24, Design.TEXT, true));
    addView(
        Design.text(
            c,
            "Przesuń narożniki lub narysuj nowy kadr. Do AI trafi wybrany fragment.",
            12,
            Design.MUTED,
            false));
    canvas = new CropCanvas(c, jpeg, initial);
    LayoutParams area = new LayoutParams(-1, 0, 1);
    area.topMargin = Design.dp(c, 14);
    addView(canvas, area);
    CheckBox remember = new CheckBox(c);
    remember.setVisibility(allowRemember ? VISIBLE : GONE);
    remember.setText("Zapamiętaj kadr dla tej orientacji");
    remember.setTextColor(Design.TEXT);
    remember.setMinHeight(Design.dp(c, 48));
    addView(remember);
    Button send = Design.button(c, "Analizuj zaznaczony fragment", true);
    send.setOnClickListener(
        v -> accept.accept(new Selection(new RectF(canvas.selection), remember.isChecked())));
    addView(send);
    LinearLayout row = new LinearLayout(c);
    Button full = Design.button(c, "Cały obraz", false), back = Design.button(c, "Anuluj", false);
    full.setOnClickListener(
        v -> {
          canvas.selection.set(0, 0, 1, 1);
          canvas.invalidate();
        });
    back.setOnClickListener(v -> cancel.run());
    row.addView(full, new LayoutParams(0, Design.dp(c, 52), 1));
    row.addView(back, new LayoutParams(0, Design.dp(c, 52), 1));
    addView(row);
  }

  void dispose() {
    canvas.dispose();
  }

  @Override
  public boolean dispatchKeyEvent(KeyEvent event) {
    if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
      if (event.getAction() == KeyEvent.ACTION_UP) cancelAction.run();
      return true;
    }
    return super.dispatchKeyEvent(event);
  }

  static String orientation(String jpeg) {
    byte[] bytes = Base64.decode(jpeg, Base64.NO_WRAP);
    BitmapFactory.Options o = new BitmapFactory.Options();
    o.inJustDecodeBounds = true;
    BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
    return o.outWidth > o.outHeight ? "landscape" : "portrait";
  }

  static RectF saved(Prefs prefs, String jpeg) {
    String prefix = "crop." + orientation(jpeg) + ".";
    if (!prefs.store.contains(prefix + "left")) return null;
    RectF r =
        new RectF(
            prefs.store.getFloat(prefix + "left", 0),
            prefs.store.getFloat(prefix + "top", 0),
            prefs.store.getFloat(prefix + "right", 1),
            prefs.store.getFloat(prefix + "bottom", 1));
    return valid(r) ? r : null;
  }

  static void save(Prefs prefs, String jpeg, RectF r) {
    String prefix = "crop." + orientation(jpeg) + ".";
    prefs
        .store
        .edit()
        .putFloat(prefix + "left", r.left)
        .putFloat(prefix + "top", r.top)
        .putFloat(prefix + "right", r.right)
        .putFloat(prefix + "bottom", r.bottom)
        .putString("cropMode", "saved")
        .apply();
  }

  private static boolean valid(RectF r) {
    return r != null
        && r.left >= 0
        && r.top >= 0
        && r.right <= 1
        && r.bottom <= 1
        && r.width() >= .02f
        && r.height() >= .02f;
  }

  static String crop(String jpeg, RectF r) throws Exception {
    if (!valid(r)) throw new Exception("Zaznacz większy fragment zadania.");
    byte[] data = Base64.decode(jpeg, Base64.NO_WRAP);
    Bitmap source = BitmapFactory.decodeByteArray(data, 0, data.length), part = null;
    if (source == null) throw new Exception("Nie udało się odczytać zrzutu.");
    try {
      int left = Math.round(r.left * source.getWidth()),
          top = Math.round(r.top * source.getHeight());
      int width =
          Math.max(
              1, Math.min(source.getWidth() - left, Math.round(r.width() * source.getWidth())));
      int height =
          Math.max(
              1, Math.min(source.getHeight() - top, Math.round(r.height() * source.getHeight())));
      part = Bitmap.createBitmap(source, left, top, width, height);
      return ImageCodec.jpeg(part);
    } finally {
      if (part != null && part != source) part.recycle();
      source.recycle();
    }
  }

  private static final class CropCanvas extends View {
    final RectF selection;
    private Bitmap bitmap;
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final RectF imageRect = new RectF(), previous = new RectF();
    private float startX, startY;
    private int mode;

    CropCanvas(Context c, String jpeg, RectF initial) {
      super(c);
      byte[] bytes = Base64.decode(jpeg, Base64.NO_WRAP);
      bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
      selection = valid(initial) ? new RectF(initial) : new RectF(.08f, .15f, .92f, .75f);
      setContentDescription(
          "Podgląd zrzutu. Przeciągnij narożnik, aby zmienić kadr. Przycisk Cały obraz wybiera"
              + " wszystko.");
    }

    void dispose() {
      if (bitmap != null) {
        bitmap.recycle();
        bitmap = null;
      }
    }

    @Override
    protected void onDraw(Canvas c) {
      if (bitmap == null) return;
      float scale =
          Math.min(
              getWidth() / (float) bitmap.getWidth(), getHeight() / (float) bitmap.getHeight());
      float w = bitmap.getWidth() * scale, h = bitmap.getHeight() * scale;
      imageRect.set(
          (getWidth() - w) / 2, (getHeight() - h) / 2, (getWidth() + w) / 2, (getHeight() + h) / 2);
      paint.setStyle(Paint.Style.FILL);
      paint.setAlpha(255);
      c.drawBitmap(bitmap, null, imageRect, paint);
      RectF box =
          new RectF(
              imageRect.left + selection.left * w,
              imageRect.top + selection.top * h,
              imageRect.left + selection.right * w,
              imageRect.top + selection.bottom * h);
      Path mask = new Path();
      mask.setFillType(Path.FillType.EVEN_ODD);
      mask.addRect(imageRect, Path.Direction.CW);
      mask.addRect(box, Path.Direction.CW);
      paint.setColor(0xA0121716);
      c.drawPath(mask, paint);
      paint.setColor(Design.LIME);
      paint.setStyle(Paint.Style.STROKE);
      paint.setStrokeWidth(Design.dp(getContext(), 2));
      c.drawRoundRect(box, 5, 5, paint);
      paint.setStyle(Paint.Style.FILL);
      for (float x : new float[] {box.left, box.right})
        for (float y : new float[] {box.top, box.bottom})
          c.drawCircle(x, y, Design.dp(getContext(), 6), paint);
    }

    @Override
    public boolean performClick() {
      super.performClick();
      return true;
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
      if (bitmap == null || imageRect.isEmpty()) return false;
      float x = Math.max(0, Math.min(1, (event.getX() - imageRect.left) / imageRect.width()));
      float y = Math.max(0, Math.min(1, (event.getY() - imageRect.top) / imageRect.height()));
      if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
        getParent().requestDisallowInterceptTouchEvent(true);
        previous.set(selection);
        startX = x;
        startY = y;
        mode = 0;
        float tx = Design.dp(getContext(), 24) / imageRect.width(),
            ty = Design.dp(getContext(), 24) / imageRect.height();
        if (Math.abs(x - selection.left) < tx && Math.abs(y - selection.top) < ty) mode = 1;
        else if (Math.abs(x - selection.right) < tx && Math.abs(y - selection.top) < ty) mode = 2;
        else if (Math.abs(x - selection.left) < tx && Math.abs(y - selection.bottom) < ty) mode = 3;
        else if (Math.abs(x - selection.right) < tx && Math.abs(y - selection.bottom) < ty)
          mode = 4;
        else if (selection.contains(x, y)) mode = 5;
        return true;
      }
      if (event.getActionMasked() == MotionEvent.ACTION_MOVE) {
        if (mode == 5) {
          float dx = Math.max(-previous.left, Math.min(1 - previous.right, x - startX));
          float dy = Math.max(-previous.top, Math.min(1 - previous.bottom, y - startY));
          selection.set(previous);
          selection.offset(dx, dy);
        } else if (mode == 0)
          selection.set(
              Math.min(startX, x), Math.min(startY, y), Math.max(startX, x), Math.max(startY, y));
        else {
          if (mode == 1 || mode == 3) selection.left = Math.min(x, selection.right - .02f);
          else selection.right = Math.max(x, selection.left + .02f);
          if (mode == 1 || mode == 2) selection.top = Math.min(y, selection.bottom - .02f);
          else selection.bottom = Math.max(y, selection.top + .02f);
        }
        invalidate();
        return true;
      }
      if (event.getActionMasked() == MotionEvent.ACTION_UP
          || event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
        if (!valid(selection) || event.getActionMasked() == MotionEvent.ACTION_CANCEL)
          selection.set(previous);
        invalidate();
        getParent().requestDisallowInterceptTouchEvent(false);
        performClick();
        return true;
      }
      return true;
    }
  }
}
