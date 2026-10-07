package pl.okstudy.mobile;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.*;

/** An explicit session action; starting still uses Android's projection consent screen. */
public final class SessionTile extends TileService {
  static void update(android.content.Context c) {
    requestListeningState(c, new android.content.ComponentName(c, SessionTile.class));
  }

  @Override
  public void onStartListening() {
    Tile tile = getQsTile();
    if (tile == null) return;
    tile.setState(AppState.active ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
    tile.setLabel("OKStudy");
    if (Build.VERSION.SDK_INT >= 29)
      tile.setSubtitle(AppState.active ? "Zakończ sesję" : "Uruchom sesję");
    tile.setContentDescription(
        AppState.active ? "Zakończ pomoc OKStudy na ekranie" : "Uruchom pomoc OKStudy na ekranie");
    tile.updateTile();
  }

  @SuppressWarnings("deprecation")
  @android.annotation.SuppressLint("StartActivityAndCollapseDeprecated")
  @Override
  public void onClick() {
    super.onClick();
    if (isLocked()) {
      unlockAndRun(this::activate);
      return;
    }
    activate();
  }

  @SuppressWarnings("deprecation")
  @android.annotation.SuppressLint("StartActivityAndCollapseDeprecated")
  private void activate() {
    if (AppState.active) {
      startService(new Intent(this, CaptureService.class).setAction(CaptureService.STOP));
      return;
    }
    Intent intent =
        new Intent(this, MainActivity.class)
            .setAction("pl.okstudy.TILE_START")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    if (Build.VERSION.SDK_INT >= 34)
      startActivityAndCollapse(
          PendingIntent.getActivity(
              this,
              1704,
              intent,
              PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
    // The PendingIntent overload does not exist before API 34.
    else startActivityAndCollapse(intent);
  }
}
