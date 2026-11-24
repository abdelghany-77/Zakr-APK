package com.abdelghany.tazkeer;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

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
 * web layer boots, hides native WebView scrollbars, handles Android 15+
 * edge-to-edge system bar insets, and forwards new intents for
 * `tazkeer://open/...` deep links.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AdhanSchedulerPlugin.class);
        super.onCreate(savedInstanceState);

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.setVerticalScrollBarEnabled(false);
            webView.setHorizontalScrollBarEnabled(false);
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        }

        if (Build.VERSION.SDK_INT >= 35) {
            View rootView = findViewById(android.R.id.content);
            if (rootView != null) {
                ViewCompat.setOnApplyWindowInsetsListener(rootView, (view, windowInsets) -> {
                    Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
                    view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                    return windowInsets;
                });
                ViewCompat.requestApplyInsets(rootView);
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
