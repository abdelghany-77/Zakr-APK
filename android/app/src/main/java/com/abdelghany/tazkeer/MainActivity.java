package com.abdelghany.tazkeer;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
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

        // Enable modern Edge-to-Edge window layout (app background extends behind status bar)
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(android.graphics.Color.TRANSPARENT);

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.setVerticalScrollBarEnabled(false);
            webView.setHorizontalScrollBarEnabled(false);
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        }

        View rootView = findViewById(android.R.id.content);
        if (rootView != null) {
            ViewCompat.setOnApplyWindowInsetsListener(rootView, (view, windowInsets) -> {
                Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
                float density = getResources().getDisplayMetrics().density;
                int topDp = density > 0 ? Math.round(bars.top / density) : 0;
                int bottomDp = density > 0 ? Math.round(bars.bottom / density) : 0;

                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().post(() -> {
                        getBridge().getWebView().evaluateJavascript(
                            "document.documentElement.style.setProperty('--safe-top', '" + topDp + "px');" +
                            "document.documentElement.style.setProperty('--safe-bottom', '" + bottomDp + "px');",
                            null
                        );
                    });
                }
                return windowInsets;
            });
            ViewCompat.requestApplyInsets(rootView);
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
