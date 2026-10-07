package pl.okstudy.mobile;

import android.graphics.*;

/** Local heuristics only. A warning never declares an image unreadable with certainty. */
final class ImageQuality {
  static String inspect(Bitmap bitmap, RectF selected) {
    int x =
        Math.max(0, Math.min(bitmap.getWidth() - 1, Math.round(selected.left * bitmap.getWidth())));
    int y =
        Math.max(
            0, Math.min(bitmap.getHeight() - 1, Math.round(selected.top * bitmap.getHeight())));
    int width =
        Math.max(
            1, Math.min(bitmap.getWidth() - x, Math.round(selected.width() * bitmap.getWidth())));
    int height =
        Math.max(
            1,
            Math.min(bitmap.getHeight() - y, Math.round(selected.height() * bitmap.getHeight())));
    if (width < 120 || height < 45)
      return "Kadr jest niewielki. Litery mogą być za małe — rozważ większy fragment lub"
                 + " przybliżenie zadania.";
    int w = Math.min(256, width), h = Math.min(256, height);
    float[] grey = new float[w * h];
    float min = 255, max = 0;
    for (int row = 0; row < h; row++)
      for (int col = 0; col < w; col++) {
        int pixel = bitmap.getPixel(x + col * width / w, y + row * height / h);
        float value =
            .2126f * Color.red(pixel) + .7152f * Color.green(pixel) + .0722f * Color.blue(pixel);
        grey[row * w + col] = value;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    if (max - min < 18) return "Kadr ma bardzo mało kontrastu. Sprawdź, czy widać całe zadanie.";
    double edge = 0;
    for (int row = 1; row < h - 1; row++)
      for (int col = 1; col < w - 1; col++) {
        int i = row * w + col;
        double laplace = grey[i - 1] + grey[i + 1] + grey[i - w] + grey[i + w] - 4 * grey[i];
        edge += laplace * laplace;
      }
    if (edge / ((w - 2.0) * (h - 2.0)) < 8)
      return "Obraz może być rozmazany lub mieć mało szczegółów. Sprawdź czytelność przed"
                 + " wysłaniem.";
    return "";
  }
}
