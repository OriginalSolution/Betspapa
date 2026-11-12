package com.betspapa.scores;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import androidx.appcompat.content.res.AppCompatResources;
import androidx.core.content.ContextCompat;
import java.io.File;
import java.io.FileOutputStream;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class SplashMarkTest {
    private static void assertClose(String label, int expected, int actual) {
        int distance = Math.abs(Color.red(expected) - Color.red(actual))
            + Math.abs(Color.green(expected) - Color.green(actual))
            + Math.abs(Color.blue(expected) - Color.blue(actual));
        assertTrue(label + " was #" + Integer.toHexString(actual), Color.alpha(actual) > 240 && distance <= 24);
    }

    @Test
    public void splashIsTheRedMarkOnPureBlack() throws Exception {
        android.content.Context context = RuntimeEnvironment.getApplication();
        int black = ContextCompat.getColor(context, R.color.splashBlack);
        assertEquals(0xFF000000, black);

        Drawable icon = AppCompatResources.getDrawable(context, R.drawable.splash_icon);
        assertNotNull(icon);

        int width = 1080;
        int height = 1920;
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawColor(Color.BLACK);
        int size = 1080;
        int top = (height - size) / 2;
        icon.setBounds(0, top, size, top + size);
        icon.draw(canvas);

        assertEquals("corner should stay black, with no white flash", Color.BLACK, bitmap.getPixel(0, 0));
        assertEquals(Color.BLACK, bitmap.getPixel(width - 1, height - 1));
        assertEquals(Color.BLACK, bitmap.getPixel(8, top + 8));

        int redX = Math.round(width * (90f / 288f));
        int redY = top + Math.round(size * (160f / 288f));
        int stemX = Math.round(width * (123f / 288f));
        int stemY = top + Math.round(size * (160f / 288f));
        assertClose("red field", Color.parseColor("#E11D2E"), bitmap.getPixel(redX, redY));
        assertClose("block B stem", Color.WHITE, bitmap.getPixel(stemX, stemY));

        File out = new File("build/qc-splash.png");
        File parent = out.getParentFile();
        if (parent != null && !parent.isDirectory()) parent.mkdirs();
        FileOutputStream stream = new FileOutputStream(out);
        try {
            assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream));
        } finally {
            stream.close();
        }
    }
}
