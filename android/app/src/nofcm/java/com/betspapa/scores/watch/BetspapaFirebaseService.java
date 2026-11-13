package com.betspapa.scores.watch;

import android.app.Service;
import android.content.Intent;
import android.os.IBinder;

/** Placeholder so the manifest service resolves without the Firebase SDK. */
public class BetspapaFirebaseService extends Service {
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
