package com.betspapa.scores.watch

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Log
import com.betspapa.watch.WatchMatch
import java.net.URL
import com.betspapa.watch.WatchNote
import com.betspapa.watch.WatchState
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Data-only FCM. Android would draw a plain card itself if the payload
 * included a notification block, and this method would not run.
 * The shade id is marked sent only after the card is posted. An in-app
 * inbox row (seen) is not a shade notification, so it must not swallow the push.
 */
class BetspapaFirebaseService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        PushBridge.remember(this, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val id = data["id"]?.trim().orEmpty()
        if (id.isEmpty()) return
        val kind = data["kind"]?.takeIf { it.isNotEmpty() } ?: "goal"
        val title = data["title"]?.takeIf { it.isNotEmpty() } ?: "Betspapa"
        val body = data["body"].orEmpty()
        val file = WatchFiles.file(this)
        val sound: String
        val note: WatchNote
        // FCM's own send time, so a phone clock that is off does not matter. A Doze-delayed goal
        // that lands 40 minutes late goes in the Alerts inbox but does not ring.
        val sentAt = if (message.sentTime > 0L) message.sentTime else data["sentAt"]?.toLongOrNull() ?: System.currentTimeMillis()
        val ageMs = System.currentTimeMillis() - sentAt
        val stale = AlertGate.stale(kind, ageMs)
        synchronized(WatchState.FILE_LOCK) {
            val state = WatchState.load(file)
            if (state.sent.contains(id)) {
                Log.i(TAG, "skip duplicate id=$id")
                return
            }
            rememberMatch(state, data)
            note = WatchNote(id, data["matchId"].orEmpty(), kind, title, body)
            data["minute"]?.toIntOrNull()?.let { note.minute = it }
            data["marketLabel"]?.takeIf { it.isNotEmpty() }?.let { note.marketLabel = it }
            data["fixture"]?.takeIf { it.isNotEmpty() }?.let { note.fixture = it }
            data["odds"]?.takeIf { it.isNotEmpty() }?.let { note.oddsText = it }
            data["code"]?.takeIf { it.isNotEmpty() }?.let { note.bookCode = it }
            if (kind == "var") note.varCheck = true
            if (data["disallowed"] == "1") {
                note.disallowed = true
                note.replaces = data["replaces"].orEmpty()
            }
            state.record(note, System.currentTimeMillis())
            if (stale) state.markSent(id)
            try {
                state.save(file)
            } catch (_: Exception) {
                /* the shade card still posts if the seen-file cannot be written */
            }
            sound = state.goalSound?.takeIf { it.isNotEmpty() } ?: "crowd"
        }
        if (stale) {
            Log.i(TAG, "stale id=$id kind=$kind ageMs=$ageMs kept in inbox, not posted")
            return
        }
        // The native poller or the WebView may be posting the same id right now.
        if (!AlertGate.claim(this, id)) {
            Log.i(TAG, "skip duplicate in flight id=$id")
            return
        }
        var posted = false
        try {
            posted = if (kind == "promo") {
                val picture = download(data["image"])
                AlertPoster.postPromo(this, note, sound, picture, data["code"], data["route"])
            } else {
                AlertPoster.post(this, note, sound)
            }
        } finally {
            AlertGate.finish(this, id, posted)
        }
        if (posted) AlertSound.await(8_000L)
        val channel = AlertPoster.channelFor(if (kind == "promo") "goal" else kind, sound)
        Log.i(TAG, "posted=$posted id=$id kind=$kind channel=$channel sound=$sound match=${note.matchId} priority=${message.priority}/${message.originalPriority} ageMs=$ageMs")
    }

    private fun rememberMatch(state: WatchState, data: Map<String, String>) {
        val id = data["matchId"]?.trim().orEmpty()
        if (id.isEmpty()) return
        val match = state.matches.firstOrNull { it.id == id } ?: WatchMatch().also {
            it.id = id
            state.matches.add(it)
        }
        put(data["home"]) { match.home = it; match.homeFull = it }
        put(data["away"]) { match.away = it; match.awayFull = it }
        put(data["homeCrest"]) { match.homeCrest = it }
        put(data["awayCrest"]) { match.awayCrest = it }
        put(data["competition"]) { match.competition = it }
        put(data["status"]) { match.status = it }
        data["homeScore"]?.toIntOrNull()?.let { match.homeScore = it }
        data["awayScore"]?.toIntOrNull()?.let { match.awayScore = it }
        data["minute"]?.toIntOrNull()?.let { match.minute = it }
        if (match.status.isNullOrEmpty()) match.status = "live"
        val minute = match.minute
        val kind = data["kind"].orEmpty()
        if (minute != null && (kind == "goal" || kind == "var" || kind == "red" || kind == "penalty")) {
            val type = if (kind == "goal") "goal" else kind
            match.addMarker(type, minute, match.abbrHome())
        }
    }

    private fun download(url: String?): Bitmap? {
        if (url.isNullOrBlank() || !(url.startsWith("https://") || url.startsWith("http://"))) return null
        return try {
            val connection = URL(url).openConnection()
            connection.connectTimeout = 8_000
            connection.readTimeout = 12_000
            connection.getInputStream().use { BitmapFactory.decodeStream(it) }
        } catch (_: Exception) {
            null
        }
    }

    private fun put(value: String?, write: (String) -> Unit) {
        if (!value.isNullOrEmpty()) write(value)
    }

    companion object {
        private const val TAG = "BetspapaFcm"
    }
}
