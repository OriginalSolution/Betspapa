package com.betspapa.scores;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class TextZoomTest {
    @Test
    public void followsSmallBoosts() {
        assertEquals(100, MainActivity.textZoomFor(1.0f));
        assertEquals(110, MainActivity.textZoomFor(1.1f));
        assertEquals(115, MainActivity.textZoomFor(1.15f));
    }

    @Test
    public void capsLargeAndTinyScales() {
        assertEquals(115, MainActivity.textZoomFor(1.3f));
        assertEquals(115, MainActivity.textZoomFor(2.0f));
        assertEquals(85, MainActivity.textZoomFor(0.7f));
    }

    @Test
    public void badScaleIsNormal() {
        assertEquals(100, MainActivity.textZoomFor(0f));
        assertEquals(100, MainActivity.textZoomFor(Float.NaN));
    }
}
