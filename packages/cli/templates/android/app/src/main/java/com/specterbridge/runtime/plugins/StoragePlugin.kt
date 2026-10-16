package com.specterbridge.runtime.plugins

import android.content.Context
import android.content.SharedPreferences
import com.specterbridge.runtime.NativePlugin
import org.json.JSONObject

class StoragePlugin(context: Context) : NativePlugin {
    override val name: String = "Storage"
    private val preferences: SharedPreferences = context.getSharedPreferences("specter-bridge-storage", Context.MODE_PRIVATE)

    override fun invoke(method: String, args: JSONObject): Any? {
        return when (method) {
            "get" -> {
                val key = requiredKey(args)
                val encoded = preferences.getString(key, null) ?: return JSONObject.NULL
                JSONObject(encoded).opt("value") ?: JSONObject.NULL
            }
            "set" -> {
                val key = requiredKey(args)
                require(args.has("value")) { "value is required." }
                val encoded = JSONObject().put("value", args.opt("value") ?: JSONObject.NULL).toString()
                preferences.edit().putString(key, encoded).apply()
                JSONObject.NULL
            }
            "remove" -> {
                preferences.edit().remove(requiredKey(args)).apply()
                JSONObject.NULL
            }
            "clear" -> {
                preferences.edit().clear().apply()
                JSONObject.NULL
            }
            else -> throw IllegalArgumentException("Unknown Storage method: $method")
        }
    }

    private fun requiredKey(args: JSONObject): String {
        val key = args.opt("key") as? String
        require(!key.isNullOrEmpty()) { "key must be a non-empty string." }
        return key
    }
}
