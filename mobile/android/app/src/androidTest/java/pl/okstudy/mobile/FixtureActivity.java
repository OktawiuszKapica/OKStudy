package pl.okstudy.mobile;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.widget.LinearLayout;
import android.widget.TextView;

/** A separate test APK supplies an ordinary screen; protected Settings may hide overlays. */
public final class FixtureActivity extends Activity {
  @Override
  public void onCreate(Bundle state) {
    super.onCreate(state);
    LinearLayout page = new LinearLayout(this);
    page.setOrientation(LinearLayout.VERTICAL);
    page.setPadding(32, 70, 32, 32);
    page.setBackgroundColor(Color.rgb(248, 249, 246));
    TextView title = new TextView(this);
    title.setText("OKStudy · ekran testowy");
    title.setTextSize(24);
    title.setTextColor(Color.rgb(20, 32, 25));
    page.addView(title);
    TextView task = new TextView(this);
    task.setText("Który wynik jest poprawny?\n\n2 + 2 = ?\n\nA. 1\nB. 2\nC. 3\nD. 4");
    task.setTextSize(22);
    task.setTextColor(Color.BLACK);
    task.setPadding(0, 40, 0, 0);
    page.addView(task);
    setContentView(page);
  }
}
