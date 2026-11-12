package com.betspapa.scores.watch;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.betspapa.watch.WatchState;
import org.json.JSONObject;

@CapacitorPlugin(name = "Watch")
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
}
