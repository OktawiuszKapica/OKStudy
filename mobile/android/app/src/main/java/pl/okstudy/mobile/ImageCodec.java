package pl.okstudy.mobile;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.Image;
import android.net.Uri;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;

final class ImageCodec {
  static final int MAX_EDGE = 2000;

  static String fromUri(Context context, Uri uri) throws Exception {
    if (uri == null || !"content".equals(uri.getScheme()))
      throw new Exception("Wybierz obraz z systemowego okna udostępniania.");
    BitmapFactory.Options bounds = new BitmapFactory.Options();
    bounds.inJustDecodeBounds = true;
    try (InputStream stream = context.getContentResolver().openInputStream(uri)) {
      BitmapFactory.decodeStream(stream, null, bounds);
    }
    if (bounds.outWidth < 1 || bounds.outHeight < 1)
      throw new Exception("Nie udało się odczytać obrazu.");
    BitmapFactory.Options options = new BitmapFactory.Options();
    options.inSampleSize = 1;
    while (Math.max(bounds.outWidth, bounds.outHeight) / options.inSampleSize > MAX_EDGE * 2)
      options.inSampleSize *= 2;
    try (InputStream stream = context.getContentResolver().openInputStream(uri)) {
      Bitmap bitmap = BitmapFactory.decodeStream(stream, null, options);
      if (bitmap == null) throw new Exception("Nie udało się odczytać obrazu.");
      try {
        return jpeg(bitmap);
      } finally {
        bitmap.recycle();
      }
    }
  }

  static String fromFrame(Image image) throws Exception {
    Image.Plane plane = image.getPlanes()[0];
    if (plane.getPixelStride() != 4) throw new Exception("Nieobsługiwany format przechwytywania.");
    int paddedWidth = plane.getRowStride() / plane.getPixelStride();
    Bitmap padded = Bitmap.createBitmap(paddedWidth, image.getHeight(), Bitmap.Config.ARGB_8888);
    Bitmap cropped = null;
    try {
      padded.copyPixelsFromBuffer(plane.getBuffer());
      cropped = Bitmap.createBitmap(padded, 0, 0, image.getWidth(), image.getHeight());
      boolean black = true;
      for (int y = 0; y < cropped.getHeight() && black; y += Math.max(1, cropped.getHeight() / 40))
        for (int x = 0; x < cropped.getWidth(); x += Math.max(1, cropped.getWidth() / 40))
          if ((cropped.getPixel(x, y) & 0x00ffffff) != 0) {
            black = false;
            break;
          }
      if (black)
        throw new Exception(
            "Ekran jest pusty albo ta aplikacja chroni swój obraz. Wybierz inny ekran lub"
                + " udostępnij zrzut.");
      return jpeg(cropped);
    } finally {
      if (cropped != null && cropped != padded) cropped.recycle();
      padded.recycle();
    }
  }

  static String jpeg(Bitmap source) throws Exception {
    float scale = Math.min(1f, MAX_EDGE / (float) Math.max(source.getWidth(), source.getHeight()));
    Bitmap image =
        scale < 1
            ? Bitmap.createScaledBitmap(
                source,
                Math.max(1, Math.round(source.getWidth() * scale)),
                Math.max(1, Math.round(source.getHeight() * scale)),
                true)
            : source;
    try (ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
      if (!image.compress(Bitmap.CompressFormat.JPEG, 88, bytes))
        throw new Exception("Nie udało się przygotować obrazu.");
      return Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
    } finally {
      if (image != source) image.recycle();
    }
  }
}
