package com.betspapa.scores.watch;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.betspapa.watch.AlertPlanner;
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
        if (NotificationManagerCompat.from(context).areNotificationsEnabled() || Build.VERSION.SDK_INT < 33) {
            call.resolve(statusObject());
            return;
        }
        SharedPreferences prefs = context.getSharedPreferences(WatchScheduler.PREFS, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(WatchScheduler.ASKED_NOTIFICATIONS, false) && getPermissionState("notifications") != PermissionState.DENIED) {
            prefs.edit().putBoolean(WatchScheduler.ASKED_NOTIFICATIONS, true).apply();
            requestPermissionForAlias("notifications", call, "notificationsCallback");
            return;
        }
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName());
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
    public void scheduleTest(PluginCall call) {
        if (getContext() == null) {
            call.reject("Watch is not ready");
            return;
        }
        AlertPoster.ensure(getContext());
        WatchScheduler.scheduleTest(getContext());
        call.resolve();
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
        boolean unrestricted = false;
        if (context != null) {
            PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            unrestricted = power != null && power.isIgnoringBatteryOptimizations(context.getPackageName());
        }
        result.put("batteryUnrestricted", unrestricted);
        result.put("watching", WatchRuntime.serviceRunning);
        int live = 0;
        if (context != null) {
            WatchState state = WatchState.load(WatchFiles.file(context));
            live = AlertPlanner.liveCount(state.matches, state);
        }
        result.put("liveCount", live);
        return result;
    }
}
