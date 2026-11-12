package com.betspapa.scores.watch;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;
import java.util.Locale;

/**
 * Deep links into the OEM autostart / app-launch screen.
 * Package visibility on Android 11+ needs the matching queries entries in the manifest.
 * Anything that does not resolve falls back to this app's details page.
 */
public final class AutostartGuide {
    public static final String DETAILS_ACTION = Settings.ACTION_APPLICATION_DETAILS_SETTINGS;

    private static final String[][] TRANSSION = {
        { "com.transsion.phonemaster", "com.cyin.himgr.autostart.AutoStartActivity" },
        { "com.transsion.phonemanager", "com.itel.autobootmanager.activity.AutoBootMgrActivity" },
    };
    private static final String[][] XIAOMI = {
        { "com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity" },
    };
    private static final String[][] OPPO = {
        { "com.oplus.safecenter", "com.oplus.safecenter.startupapp.view.StartupAppListActivity" },
        { "com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity" },
        { "com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity" },
        { "com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity" },
        { "com.coloros.oppoguardelf", "com.coloros.powermanager.fuelgaue.PowerUsageModelActivity" },
    };
    private static final String[][] VIVO = {
        { "com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity" },
        { "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager" },
        { "com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity" },
        { "com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.PurviewTabActivity" },
    };
    private static final String[][] HUAWEI = {
        { "com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity" },
        { "com.huawei.systemmanager", "com.huawei.systemmanager.appcontrol.activity.StartupAppControlActivity" },
        { "com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity" },
        { "com.hihonor.systemmanager", "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity" },
    };
    private static final String[][] SAMSUNG = {
        { "com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity" },
        { "com.samsung.android.sm", "com.samsung.android.sm.ui.battery.BatteryActivity" },
        { "com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity" },
    };

    private AutostartGuide() {}

    /** Manufacturer and brand together, so a Transsion phone reporting either name still matches. */
    public static String brandId(String manufacturer, String brand) {
        String blob = ((manufacturer == null ? "" : manufacturer) + " " + (brand == null ? "" : brand)).toLowerCase(Locale.US);
        if (contains(blob, "tecno") || contains(blob, "infinix") || contains(blob, "itel") || contains(blob, "transsion")) return "transsion";
        if (contains(blob, "xiaomi") || contains(blob, "redmi") || contains(blob, "poco")) return "xiaomi";
        if (contains(blob, "oppo") || contains(blob, "realme")) return "oppo";
        if (contains(blob, "vivo") || contains(blob, "iqoo")) return "vivo";
        if (contains(blob, "huawei") || contains(blob, "honor")) return "huawei";
        if (contains(blob, "samsung")) return "samsung";
        return "";
    }

    public static String[][] candidates(String brandId) {
        if ("transsion".equals(brandId)) return TRANSSION;
        if ("xiaomi".equals(brandId)) return XIAOMI;
        if ("oppo".equals(brandId)) return OPPO;
        if ("vivo".equals(brandId)) return VIVO;
        if ("huawei".equals(brandId)) return HUAWEI;
        if ("samsung".equals(brandId)) return SAMSUNG;
        return new String[0][];
    }

    /** @return "autostart" when an OEM screen opened, "details" for the fallback, "none" if both failed. */
    public static String open(Context context, String brandId) {
        for (String[] candidate : candidates(brandId)) {
            if (candidate.length < 2) continue;
            Intent intent = new Intent();
            intent.setComponent(new ComponentName(candidate[0], candidate[1]));
            if (start(context, intent)) return "autostart";
        }
        Intent details = new Intent(DETAILS_ACTION);
        details.setData(Uri.parse("package:" + context.getPackageName()));
        if (start(context, details)) return "details";
        return "none";
    }

    private static boolean start(Context context, Intent intent) {
        if (!(context instanceof Activity)) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PackageManager manager = context.getPackageManager();
        if (manager == null || intent.resolveActivity(manager) == null) return false;
        try {
            context.startActivity(intent);
            return true;
        } catch (RuntimeException error) {
            return false;
        }
    }

    private static boolean contains(String blob, String word) {
        return blob.contains(word);
    }
}
