package com.betspapa.scores.watch;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class AutostartGuideTest {
    @Test
    public void mapsTheOemFamiliesFromManufacturerOrBrand() {
        assertEquals("transsion", AutostartGuide.brandId("TECNO", "TECNO"));
        assertEquals("transsion", AutostartGuide.brandId("INFINIX", "Infinix"));
        assertEquals("transsion", AutostartGuide.brandId("itel", "itel"));
        assertEquals("transsion", AutostartGuide.brandId("TRANSSION", "TECNO MOBILE"));
        assertEquals("xiaomi", AutostartGuide.brandId("Xiaomi", "Redmi"));
        assertEquals("xiaomi", AutostartGuide.brandId("POCO", "POCO"));
        assertEquals("oppo", AutostartGuide.brandId("OPPO", "OPPO"));
        assertEquals("oppo", AutostartGuide.brandId("realme", "realme"));
        assertEquals("vivo", AutostartGuide.brandId("vivo", "vivo"));
        assertEquals("vivo", AutostartGuide.brandId("iQOO", "iQOO"));
        assertEquals("huawei", AutostartGuide.brandId("HUAWEI", "HUAWEI"));
        assertEquals("huawei", AutostartGuide.brandId("HONOR", "HONOR"));
        assertEquals("samsung", AutostartGuide.brandId("samsung", "samsung"));
        assertEquals("", AutostartGuide.brandId("Google", "google"));
        assertEquals("", AutostartGuide.brandId(null, null));
    }

    @Test
    public void eachFamilyHasAKnownScreenAndUnknownPhonesDoNot() {
        assertEquals("com.transsion.phonemaster", AutostartGuide.candidates("transsion")[0][0]);
        assertEquals("com.cyin.himgr.autostart.AutoStartActivity", AutostartGuide.candidates("transsion")[0][1]);
        assertEquals("com.miui.securitycenter", AutostartGuide.candidates("xiaomi")[0][0]);
        assertEquals("com.oplus.safecenter", AutostartGuide.candidates("oppo")[0][0]);
        assertEquals("com.vivo.permissionmanager", AutostartGuide.candidates("vivo")[0][0]);
        assertEquals("com.huawei.systemmanager", AutostartGuide.candidates("huawei")[0][0]);
        assertTrue(AutostartGuide.candidates("huawei")[3][0].contains("hihonor"));
        assertEquals("com.samsung.android.lool", AutostartGuide.candidates("samsung")[0][0]);
        assertEquals(0, AutostartGuide.candidates("").length);
        assertEquals(0, AutostartGuide.candidates(null).length);
        assertEquals("android.settings.APPLICATION_DETAILS_SETTINGS", AutostartGuide.DETAILS_ACTION);
    }

    @Test
    public void openingAnOemScreenDoesNotThrow() {
        Activity activity = Robolectric.buildActivity(Activity.class).setup().get();
        String opened = AutostartGuide.open(activity, "samsung");
        assertTrue(opened.equals("autostart") || opened.equals("details") || opened.equals("none"));
        String plain = AutostartGuide.open(RuntimeEnvironment.getApplication(), "");
        assertTrue(plain.equals("details") || plain.equals("none"));
    }

    @Test
    @Config(sdk = 30)
    public void exactAlarmsAreUnsupportedBeforeAndroid12() {
        assertEquals("unsupported", WatchScheduler.exactAlarmState(RuntimeEnvironment.getApplication(), ""));
    }

    @Test
    public void aDeniedExactAlarmOverrideStaysDenied() {
        assertEquals("denied", WatchScheduler.exactAlarmState(RuntimeEnvironment.getApplication(), "denied"));
        assertEquals("granted", WatchScheduler.exactAlarmState(RuntimeEnvironment.getApplication(), "granted"));
    }
}
