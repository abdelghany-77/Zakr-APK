package com.abdelghany.tazkeer;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.abdelghany.tazkeer.adhan.AdhanSchedulerPlugin;
import com.getcapacitor.BridgeActivity;

/**
 * Tazkeer host activity.
 *
 * Registers the custom native Adhan bridge before the Capacitor bridge is
 * created so `Capacitor.Plugins.AdhanScheduler` is available as soon as the
 * web layer boots. Also applies system-bar and display-cutout insets on
 * Android 15+ (API 35) where edge-to-edge is enforced by the OS.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AdhanSchedulerPlugin.class);
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= 35) {
            View contentView = findViewById(android.R.id.content);
            if (contentView != null) {
                ViewCompat.setOnApplyWindowInsetsListener(contentView, (view, windowInsets) -> {
                    Insets bars = windowInsets.getInsets(
                            WindowInsetsCompat.Type.systemBars()
                                    | WindowInsetsCompat.Type.displayCutout()
                    );
                    Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
                    int bottom = Math.max(bars.bottom, ime.bottom);
                    view.setPadding(bars.left, bars.top, bars.right, bottom);
                    return WindowInsetsCompat.CONSUMED;
                });
            }
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null) {
            setIntent(intent);
        }
    }
}
