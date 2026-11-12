package com.betspapa.scores;

import android.os.Bundle;
import com.betspapa.scores.watch.WatchPlugin;
import com.betspapa.scores.watch.WatchScheduler;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WatchPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        WatchScheduler.setUiForeground(this, true);
    }

    @Override
    public void onPause() {
        super.onPause();
        WatchScheduler.setUiForeground(this, false);
    }
}
