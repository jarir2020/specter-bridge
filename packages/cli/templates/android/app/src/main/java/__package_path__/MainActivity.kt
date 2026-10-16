package PACKAGE_NAME

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Build
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import com.specterbridge.runtime.NativeBridgeHost
import com.specterbridge.runtime.plugins.StoragePlugin

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var bridgeHost: NativeBridgeHost

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.allowFileAccessFromFileURLs = false
            settings.allowUniversalAccessFromFileURLs = false
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.safeBrowsingEnabled = true
        }
        setContentView(webView)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                return uri.scheme != "https" || uri.host != APP_ASSET_HOST || uri.port != -1 || uri.userInfo != null
            }
        }

        bridgeHost = NativeBridgeHost()
            .register(StoragePlugin(applicationContext))
        bridgeHost.install(webView)

        webView.loadUrl("$APP_ORIGIN/assets/public/index.html")
    }

    override fun onDestroy() {
        if (::bridgeHost.isInitialized) bridgeHost.close()
        if (::webView.isInitialized) {
            (webView.parent as? ViewGroup)?.removeView(webView)
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }

    companion object {
        private const val APP_ASSET_HOST = "appassets.androidplatform.net"
        private const val APP_ORIGIN = "https://appassets.androidplatform.net"
    }
}
