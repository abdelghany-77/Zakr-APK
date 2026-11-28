package com.abdelghany.tazkeer;

import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import com.abdelghany.tazkeer.adhan.AdhanPlaybackService;
import com.abdelghany.tazkeer.adhan.AdhanSchedulerPlugin;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

/**
 * Tazkeer host activity.
 *
 * Registers the custom native Adhan bridge before the Capacitor bridge is
 * created so `Capacitor.Plugins.AdhanScheduler` is available as soon as the
 * web layer boots, hides native WebView scrollbars, configures reliable
 * edge-to-edge safe-area CSS vars (`--safe-top` / `--safe-bottom`) across
 * page load and resume, and forwards `tazkeer://open/...` deep links.
 */
public class MainActivity extends BridgeActivity {

    private int safeTopDp = 0;
    private int safeBottomDp = 0;
    private String pendingDeepLinkUrl = null;

    private static String extractDeepLink(Intent intent) {
        if (intent == null) return null;
        Uri data = intent.getData();
        if (data != null) {
            String raw = data.toString();
            if (raw.startsWith("tazkeer://")) return raw;
        }
        String extraLink = intent.getStringExtra("tazkeer_deep_link");
        if (extraLink != null && extraLink.startsWith("tazkeer://")) {
            return extraLink;
        }
        String urlExtra = intent.getStringExtra("url");
        if (urlExtra != null && urlExtra.startsWith("tazkeer://")) {
            return urlExtra;
        }
        return null;
    }

    private void deliverPendingDeepLink() {
        if (pendingDeepLinkUrl == null || getBridge() == null || getBridge().getWebView() == null) return;
        final String url = pendingDeepLinkUrl;
        final String quoted = org.json.JSONObject.quote(url);
        final WebView webView = getBridge().getWebView();
        webView.post(() -> webView.evaluateJavascript(
                "window.__tazkeerPendingDeepLink = " + quoted + ";" +
                "if (typeof window.handleDeepLinkUrl === 'function') { window.handleDeepLinkUrl(" + quoted + "); }",
                null
        ));
    }

    private void applySafeAreaCssVars() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        final WebView webView = getBridge().getWebView();
        final int top = safeTopDp;
        final int bottom = safeBottomDp;
        webView.post(() -> webView.evaluateJavascript(
                "document.documentElement.style.setProperty('--safe-top', '" + top + "px');" +
                "document.documentElement.style.setProperty('--safe-bottom', '" + bottom + "px');",
                null
        ));
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        pendingDeepLinkUrl = extractDeepLink(getIntent());
        registerPlugin(AdhanSchedulerPlugin.class);
        super.onCreate(savedInstanceState);

        // Enable modern Edge-to-Edge window layout (app background extends behind system bars)
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(lp);
        }

        if (getBridge() != null) {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.setVerticalScrollBarEnabled(false);
                webView.setHorizontalScrollBarEnabled(false);
                webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            }

            // Re-inject safe-area CSS vars and deliver deep link after index.html finishes loading
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    applySafeAreaCssVars();
                    deliverPendingDeepLink();
                    pendingDeepLinkUrl = null;
                }
            });
        }

        View rootView = findViewById(android.R.id.content);
        if (rootView != null) {
            ViewCompat.setOnApplyWindowInsetsListener(rootView, (view, windowInsets) -> {
                Insets bars = windowInsets.getInsets(
                        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                float density = getResources().getDisplayMetrics().density;
                safeTopDp = density > 0 ? Math.round(bars.top / density) : 0;
                safeBottomDp = density > 0 ? Math.round(bars.bottom / density) : 0;
                applySafeAreaCssVars();
                return windowInsets;
            });
            ViewCompat.requestApplyInsets(rootView);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        applySafeAreaCssVars();
        deliverPendingDeepLink();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null) {
            setIntent(intent);
            String deepLink = extractDeepLink(intent);
            if (deepLink != null) {
                pendingDeepLinkUrl = deepLink;
                deliverPendingDeepLink();
            }
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event != null && event.getAction() == KeyEvent.ACTION_DOWN) {
            int keyCode = event.getKeyCode();
            if ((keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN)
                    && AdhanPlaybackService.isPlaying()
                    && AdhanPlaybackService.isVolumeStopEnabled(this)) {
                AdhanPlaybackService.stop(this);
                if (getBridge() != null && getBridge().getWebView() != null) {
                    final WebView webView = getBridge().getWebView();
                    webView.post(() -> webView.evaluateJavascript(
                            "if (typeof window.showNotification === 'function') { window.showNotification('تم إيقاف الأذان', 'info', 2500); }",
                            null
                    ));
                }
                return true;
            }
        }
        return super.dispatchKeyEvent(event);
    }
}
