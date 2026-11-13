package com.betspapa.scores.watch;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.betspapa.watch.AlertPlanner;
import com.betspapa.watch.WatchMatch;
import com.betspapa.watch.WatchNote;
import com.betspapa.watch.WatchState;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "Watch",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class WatchPlugin extends Plugin {
    private static volatile JSObject pendingOpen;

    /** Cold start reads this once the web view is listening. A later tap also emits `open`. */
    public void emitOpen(String route, String matchId, String trendId) {
        JSObject data = new JSObject();
        data.put("route", route == null ? "" : route);
        data.put("matchId", matchId == null ? "" : matchId);
        data.put("trendId", trendId == null ? "" : trendId);
        pendingOpen = data;
        notifyListeners("open", data);
    }

    @PluginMethod
    public void pendingOpen(PluginCall call) {
        JSObject data = pendingOpen;
        pendingOpen = null;
        call.resolve(data == null ? new JSObject() : data);
    }

    @PluginMethod
    public void sync(PluginCall call) {
        String patch = call.getString("patch", "{}");
        if (getContext() == null) {
            call.reject("Watch is not ready");
            return;
        }
        try {
            synchronized (WatchState.FILE_LOCK) {
                WatchState state = WatchState.load(WatchFiles.file(getContext()));
                state.merge(new JSONObject(patch == null || patch.isEmpty() ? "{}" : patch));
                state.save(WatchFiles.file(getContext()));
            }
            WatchScheduler.ensureWatching(getContext());
            WatchScheduler.arm(getContext());
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not store the watch list", error);
        }
    }

    @PluginMethod
    public void pull(PluginCall call) {
        if (getContext() == null) {
            call.reject("Watch is not ready");
            return;
        }
        WatchState state = WatchState.load(WatchFiles.file(getContext()));
        JSObject result = new JSObject();
        result.put("state", state.toJson().toString());
        call.resolve(result);
    }

    @PluginMethod
    public void status(PluginCall call) {
        if (getContext() == null) {
            call.reject("Watch is not ready");
            return;
        }
        call.resolve(statusObject());
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            call.reject("Watch is not ready");
            return;
        }
        if (NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            call.resolve(statusObject());
            return;
        }
        SharedPreferences prefs = context.getSharedPreferences(WatchScheduler.PREFS, Context.MODE_PRIVATE);
        boolean asked = prefs.getBoolean(WatchScheduler.ASKED_NOTIFICATIONS, false);
        if (Build.VERSION.SDK_INT >= 33 && !asked && getPermissionState("notifications") != PermissionState.DENIED) {
            prefs.edit().putBoolean(WatchScheduler.ASKED_NOTIFICATIONS, true).apply();
            requestPermissionForAlias("notifications", call, "notificationsCallback");
            return;
        }
        openNotificationSettings(context, call);
    }

    private void openNotificationSettings(Context context, PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName());
        if (Build.VERSION.SDK_INT < 26) {
            intent.putExtra("app_package", context.getPackageName());
            intent.putExtra("app_uid", context.getApplicationInfo().uid);
        }
        if (getActivity() == null) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            if (getActivity() != null) getActivity().startActivity(intent);
            else context.startActivity(intent);
        } catch (RuntimeException error) {
            call.reject("Could not open notification settings", error);
            return;
        }
        call.resolve(statusObject());
    }

    @PermissionCallback
    private void notificationsCallback(PluginCall call) {
        if (getContext() != null) {
            AlertPoster.ensure(getContext());
            WatchScheduler.ensureWatching(getContext());
            WatchScheduler.arm(getContext());
        }
        call.resolve(statusObject());
    }

    @PluginMethod
    public void requestBattery(PluginCall call) {
        if (getContext() == null) {
            call.reject("Watch is not ready");
            return;
        }
        WatchScheduler.requestBatteryExemption(getActivity() != null ? getActivity() : getContext());
        call.resolve(statusObject());
    }

    @PluginMethod
    public void requestExactAlarm(PluginCall call) {
        if (getContext() == null) {
            call.reject("Watch is not ready");
            return;
        }
        WatchScheduler.requestExactAlarm(getActivity() != null ? getActivity() : getContext());
        call.resolve(statusObject());
    }

    @PluginMethod
    public void openAutostart(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            call.reject("Watch is not ready");
            return;
        }
        String opened = AutostartGuide.open(getActivity() != null ? getActivity() : context, oemId(context));
        JSObject result = statusObject();
        result.put("opened", opened);
        call.resolve(result);
    }

    @PluginMethod
    public void markSetup(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            call.reject("Watch is not ready");
            return;
        }
        Integer version = call.getInt("version", 0);
        Boolean finished = call.getBoolean("finished", Boolean.FALSE);
        context.getSharedPreferences(WatchScheduler.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putInt(WatchScheduler.SETUP_VERSION, version == null ? 0 : version)
            .putBoolean(WatchScheduler.SETUP_FINISHED, Boolean.TRUE.equals(finished))
            .apply();
        call.resolve(statusObject());
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        notifyListeners("resume", statusObject());
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        notifyListeners("pause", new JSObject());
    }

    @PluginMethod
    public void present(PluginCall call) {
        if (getContext() == null) {
            call.reject("Watch is not ready");
            return;
        }
        String payload = call.getString("payload", "{}");
        try {
            JSONObject json = new JSONObject(payload == null || payload.isEmpty() ? "{}" : payload);
            WatchNote note = new WatchNote(
                json.optString("id", ""),
                json.optString("matchId", ""),
                json.optString("kind", ""),
                json.optString("title", ""),
                json.optString("body", "")
            );
            if (json.has("minute") && !json.isNull("minute")) note.minute = json.optInt("minute");
            note.player = json.optString("player", "");
            note.varCheck = json.optBoolean("varCheck", "var".equals(note.kind));
            note.marketLabel = json.optString("marketLabel", "");
            note.oddsText = json.optString("odds", "");
            note.bookId = json.optString("bookId", "");
            note.bookCode = json.optString("code", "");
            note.fixture = json.optString("fixture", "");
            rememberMatch(json);
            String sound = json.optString("goalSound", "crowd");
            AlertPoster.post(getContext(), note, sound == null || sound.isEmpty() ? "crowd" : sound);
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not post the alert", error);
        }
    }

    private void rememberMatch(JSONObject json) throws java.io.IOException {
        String id = json.optString("matchId", "");
        if (id.isEmpty() || getContext() == null) return;
        synchronized (WatchState.FILE_LOCK) {
            WatchState state = WatchState.load(WatchFiles.file(getContext()));
            WatchMatch match = null;
            for (WatchMatch row : state.matches) {
                if (id.equals(row.id)) match = row;
            }
            if (match == null) {
                match = new WatchMatch();
                match.id = id;
                state.matches.add(match);
            }
            fillMatch(json, match);
            state.save(WatchFiles.file(getContext()));
        }
    }

    private static void fillMatch(JSONObject json, WatchMatch match) {
        if (!json.optString("home", "").isEmpty()) match.home = json.optString("home");
        if (!json.optString("away", "").isEmpty()) match.away = json.optString("away");
        if (!json.optString("homeFull", "").isEmpty()) match.homeFull = json.optString("homeFull");
        if (!json.optString("awayFull", "").isEmpty()) match.awayFull = json.optString("awayFull");
        if (!json.optString("homeAbbr", "").isEmpty()) match.homeAbbr = json.optString("homeAbbr");
        if (!json.optString("awayAbbr", "").isEmpty()) match.awayAbbr = json.optString("awayAbbr");
        if (!json.optString("homeColor", "").isEmpty()) match.homeColor = json.optString("homeColor");
        if (!json.optString("awayColor", "").isEmpty()) match.awayColor = json.optString("awayColor");
        if (!json.optString("homeCrest", "").isEmpty()) match.homeCrest = json.optString("homeCrest");
        if (!json.optString("awayCrest", "").isEmpty()) match.awayCrest = json.optString("awayCrest");
        if (!json.optString("competition", "").isEmpty()) match.competition = json.optString("competition");
        int beforeHome = match.homeScore == null ? 0 : match.homeScore;
        int beforeAway = match.awayScore == null ? 0 : match.awayScore;
        if (json.has("homeScore") && !json.isNull("homeScore")) match.homeScore = json.optInt("homeScore");
        if (json.has("awayScore") && !json.isNull("awayScore")) match.awayScore = json.optInt("awayScore");
        if (json.has("minute") && !json.isNull("minute")) match.minute = json.optInt("minute");
        if (match.status == null || match.status.isEmpty() || "scheduled".equals(match.status)) match.status = "live";
        int minute = match.minute == null ? -1 : match.minute;
        String player = json.optString("player", "");
        if (minute >= 0 && match.homeScore != null) {
            for (int index = beforeHome + 1; index <= match.homeScore; index++) {
                match.setGoal("home", index, minute, match.abbrHome(), player, false);
            }
        }
        if (minute >= 0 && match.awayScore != null) {
            for (int index = beforeAway + 1; index <= match.awayScore; index++) {
                match.setGoal("away", index, minute, match.abbrAway(), player, false);
            }
        }
        match.stampMissingGoals(minute);
        if (match.seenHome == null) match.seenHome = match.homeScore;
        if (match.seenAway == null) match.seenAway = match.awayScore;
    }

    @PluginMethod
    public void scheduleTest(PluginCall call) {
        if (getContext() == null) {
            call.reject("Watch is not ready");
            return;
        }
        AlertPoster.ensure(getContext());
        PushBridge.listen(getContext());
        WatchScheduler.scheduleTest(getContext(), call.getString("kind", "goal"), call.getString("goalSound", ""));
        call.resolve();
    }

    @PluginMethod
    public void pushToken(PluginCall call) {
        Context context = getContext();
        if (context != null) PushBridge.listen(context);
        JSObject result = new JSObject();
        boolean enabled = context != null && PushBridge.enabled();
        result.put("enabled", enabled);
        result.put("token", context == null ? "" : PushBridge.currentToken(context));
        call.resolve(result);
    }

    /** Opens the goal-sound channel, or the system sound screen when the ringer is what is muted. */
    @PluginMethod
    public void openNotificationSound(PluginCall call) {
        Context context = getContext();
        if (context == null) {
            call.reject("Watch is not ready");
            return;
        }
        AlertPoster.ensure(context);
        boolean channelMuted = false;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            NotificationChannel channel = manager == null ? null : manager.getNotificationChannel(AlertPoster.channelIdForSelected(context));
            channelMuted = channel == null || channel.getImportance() < NotificationManager.IMPORTANCE_DEFAULT || channel.getSound() == null;
        }
        Intent intent;
        if (channelMuted && Build.VERSION.SDK_INT >= 26) {
            intent = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName());
            intent.putExtra(Settings.EXTRA_CHANNEL_ID, AlertPoster.channelIdForSelected(context));
        } else {
            intent = new Intent(Settings.ACTION_SOUND_SETTINGS);
        }
        if (!(context instanceof android.app.Activity)) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(intent);
        } catch (RuntimeException error) {
            call.reject("Could not open sound settings");
            return;
        }
        call.resolve(statusObject());
    }

    private JSObject statusObject() {
        Context context = getContext();
        JSObject result = new JSObject();
        boolean enabled = context != null && NotificationManagerCompat.from(context).areNotificationsEnabled();
        boolean asked = false;
        if (context != null) {
            asked = context.getSharedPreferences(WatchScheduler.PREFS, Context.MODE_PRIVATE).getBoolean(WatchScheduler.ASKED_NOTIFICATIONS, false);
        }
        String notifications = enabled ? "granted" : asked ? "denied" : "prompt";
        if (Build.VERSION.SDK_INT < 33 && !enabled) notifications = "denied";
        result.put("notifications", notifications);
        boolean unrestricted = context != null && WatchScheduler.batteryUnrestricted(context);
        result.put("batteryUnrestricted", unrestricted);
        String exactOverride = "";
        if (context != null && WatchScheduler.isDebuggable(context)) {
            exactOverride = context.getSharedPreferences(WatchScheduler.PREFS, Context.MODE_PRIVATE).getString(WatchScheduler.QC_EXACT, "");
        }
        result.put("exactAlarms", context == null ? "unsupported" : WatchScheduler.exactAlarmState(context, exactOverride));
        result.put("oem", context == null ? "" : oemId(context));
        int setupVersion = 0;
        boolean setupFinished = false;
        if (context != null) {
            SharedPreferences setup = context.getSharedPreferences(WatchScheduler.PREFS, Context.MODE_PRIVATE);
            setupVersion = setup.getInt(WatchScheduler.SETUP_VERSION, 0);
            setupFinished = setup.getBoolean(WatchScheduler.SETUP_FINISHED, false);
        }
        result.put("setupVersion", setupVersion);
        result.put("setupFinished", setupFinished);
        result.put("watching", WatchRuntime.serviceRunning);
        int live = 0;
        long lastPollAt = 0L;
        if (context != null) {
            WatchState state = WatchState.load(WatchFiles.file(context));
            live = AlertPlanner.liveCount(state.matches, state);
            lastPollAt = state.lastPollAt;
        }
        result.put("liveCount", live);
        result.put("lastPollAt", lastPollAt);
        result.put("notificationSound", context != null && AlertPoster.notificationSoundOn(context) ? "on" : "off");
        result.put("soundBlocked", context != null && AlertPoster.notificationSoundBlocked(context));
        return result;
    }

    private String oemId(Context context) {
        String manufacturer = Build.MANUFACTURER;
        String brand = Build.BRAND;
        if (WatchScheduler.isDebuggable(context)) {
            SharedPreferences prefs = context.getSharedPreferences(WatchScheduler.PREFS, Context.MODE_PRIVATE);
            String forcedManufacturer = prefs.getString(WatchScheduler.QC_MANUFACTURER, "");
            String forcedBrand = prefs.getString(WatchScheduler.QC_BRAND, "");
            if (forcedManufacturer != null && !forcedManufacturer.isEmpty()) manufacturer = forcedManufacturer;
            if (forcedBrand != null && !forcedBrand.isEmpty()) brand = forcedBrand;
        }
        return AutostartGuide.brandId(manufacturer, brand);
    }
}
