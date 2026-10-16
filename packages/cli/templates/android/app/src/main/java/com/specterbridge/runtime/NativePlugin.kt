package com.specterbridge.runtime

import org.json.JSONObject

interface NativePlugin {
    val name: String

    /** Return a JSON-compatible value, or throw an IllegalArgumentException for invalid input. */
    fun invoke(method: String, args: JSONObject): Any?
}
