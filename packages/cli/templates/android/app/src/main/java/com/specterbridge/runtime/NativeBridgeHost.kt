package com.specterbridge.runtime

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ExecutorService
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class NativeBridgeHost(
    private val allowedOrigin: String = APP_ORIGIN
) : AutoCloseable {
    private val plugins = ConcurrentHashMap<String, NativePlugin>()
    private val executor: ExecutorService = ThreadPoolExecutor(
        2,
        2,
        0L,
        TimeUnit.MILLISECONDS,
        ArrayBlockingQueue(64)
    )
    private val mainHandler = Handler(Looper.getMainLooper())

    fun register(plugin: NativePlugin): NativeBridgeHost {
        require(PLUGIN_NAME.matches(plugin.name)) { "Invalid native plugin name: ${plugin.name}" }
        check(plugins.putIfAbsent(plugin.name, plugin) == null) { "Plugin already registered: ${plugin.name}" }
        return this
    }

    fun install(webView: WebView) {
        check(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            "This Android System WebView does not support the Specter Bridge message listener. Update Android System WebView."
        }
        WebViewCompat.addWebMessageListener(
            webView,
            JS_OBJECT_NAME,
            setOf(allowedOrigin)
        ) { _, message, sourceOrigin, isMainFrame, replyProxy ->
            val replied = AtomicBoolean(false)
            val respond: (JSONObject) -> Unit = { response ->
                if (replied.compareAndSet(false, true)) {
                    mainHandler.post { runCatching { replyProxy.postMessage(response.toString()) } }
                }
            }

            if (!isMainFrame) {
                respond(errorEnvelope(null, "FRAME_NOT_ALLOWED", "Native calls are only allowed from the main frame."))
            } else if (!isAllowedOrigin(sourceOrigin)) {
                respond(errorEnvelope(null, "ORIGIN_NOT_ALLOWED", "Native calls from this origin are not allowed."))
            } else {
                val raw = message.data
                if (message.type != WebMessageCompat.TYPE_STRING || raw == null || raw.length > MAX_MESSAGE_CHARS) {
                    respond(errorEnvelope(null, "INVALID_REQUEST", "Bridge requests must be JSON strings under $MAX_MESSAGE_CHARS characters."))
                } else {
                    try {
                        executor.execute {
                            val request = parseRequest(raw)
                            if (request == null) {
                                respond(errorEnvelope(null, "INVALID_REQUEST", "Invalid Specter Bridge request."))
                            } else {
                                dispatch(request, respond)
                            }
                        }
                    } catch (_: java.util.concurrent.RejectedExecutionException) {
                        respond(errorEnvelope(null, "BRIDGE_CLOSED", "The native bridge is shutting down."))
                    }
                }
            }
        }
    }

    private fun isAllowedOrigin(sourceOrigin: Uri): Boolean = sourceOrigin.toString() == allowedOrigin

    private fun parseRequest(raw: String): BridgeRequest? {
        return try {
            val json = JSONObject(raw)
            val id = json.opt("id") as? String ?: return null
            val plugin = json.opt("plugin") as? String ?: return null
            val method = json.opt("method") as? String ?: return null
            val args = json.opt("args") as? JSONObject ?: return null
            if (json.optString("protocol") != PROTOCOL || !REQUEST_ID.matches(id) || !PLUGIN_NAME.matches(plugin) || !METHOD_NAME.matches(method)) return null
            BridgeRequest(id, plugin, method, args)
        } catch (_: Exception) {
            null
        }
    }

    private fun dispatch(request: BridgeRequest, respond: (JSONObject) -> Unit) {
        val plugin = plugins[request.plugin]
        if (plugin == null) {
            respond(errorEnvelope(request.id, "PLUGIN_NOT_FOUND", "No native plugin is registered as '${request.plugin}'."))
            return
        }

        try {
            val value = plugin.invoke(request.method, request.args)
            respond(JSONObject().put("protocol", PROTOCOL).put("id", request.id).put("ok", true).put("value", value ?: JSONObject.NULL))
        } catch (error: IllegalArgumentException) {
            respond(errorEnvelope(request.id, "INVALID_ARGUMENT", error.message ?: "Invalid plugin arguments."))
        } catch (_: Exception) {
            respond(errorEnvelope(request.id, "NATIVE_ERROR", "Native plugin '${request.plugin}' failed."))
        }
    }

    override fun close() {
        executor.shutdownNow()
    }

    private fun errorEnvelope(id: String?, code: String, message: String): JSONObject = JSONObject()
        .put("protocol", PROTOCOL)
        .put("id", id ?: "")
        .put("ok", false)
        .put("error", JSONObject().put("code", code).put("message", message))

    private data class BridgeRequest(
        val id: String,
        val plugin: String,
        val method: String,
        val args: JSONObject
    )

    companion object {
        private const val APP_ORIGIN = "https://appassets.androidplatform.net"
        private const val JS_OBJECT_NAME = "specterBridge"
        private const val PROTOCOL = "specter/1"
        private const val MAX_MESSAGE_CHARS = 262_144
        private val REQUEST_ID = Regex("^[A-Za-z0-9._:-]{1,128}$")
        private val PLUGIN_NAME = Regex("^[A-Za-z][A-Za-z0-9_-]{0,63}$")
        private val METHOD_NAME = Regex("^[A-Za-z][A-Za-z0-9_-]{0,63}$")
    }
}
