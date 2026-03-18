package live.solia.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Ensure WebView content respects system bars (status bar + navigation buttons)
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);

        // Override WebViewClient to handle wallet deep link schemes as Android intents
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    Uri url = request.getUrl();
                    String scheme = url.getScheme();

                    // Forward wallet-related custom schemes to Android intent system
                    if (scheme != null
                            && !scheme.equals("https")
                            && !scheme.equals("http")
                            && !scheme.equals("about")
                            && !scheme.equals("blob")
                            && !scheme.equals("data")) {
                        try {
                            Intent intent = new Intent(Intent.ACTION_VIEW, url);
                            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            startActivity(intent);
                            return true;
                        } catch (ActivityNotFoundException e) {
                            return false;
                        }
                    }
                    return super.shouldOverrideUrlLoading(view, request);
                }
            });
        }
    }
}
