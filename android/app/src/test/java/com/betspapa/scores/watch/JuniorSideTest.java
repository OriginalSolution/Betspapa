package com.betspapa.scores.watch;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class JuniorSideTest {
    private static void senior(String name, String senior, String kind) {
        JuniorSide side = JuniorSide.of(name);
        assertEquals(name, senior, side == null ? null : side.senior);
        assertEquals(name, kind, side.kind);
    }

    @Test
    public void juniorSidesMapToTheSeniorClub() {
        senior("Birmingham U21", "birmingham", JuniorSide.YOUTH);
        senior("Gillingham U23", "gillingham", JuniorSide.YOUTH);
        senior("Chelsea U-18", "chelsea", JuniorSide.YOUTH);
        senior("Flamengo Sub-20", "flamengo", JuniorSide.YOUTH);
        senior("Jong Ajax", "ajax", JuniorSide.RESERVE);
        senior("Bayern Munich II", "bayern munich", JuniorSide.RESERVE);
        senior("Barcelona B", "barcelona", JuniorSide.RESERVE);
        senior("Manchester United Reserves", "manchester united", JuniorSide.RESERVE);
        senior("Arsenal Women", "arsenal", JuniorSide.WOMEN);
    }

    @Test
    public void seniorSidesStayAsTheyAre() {
        for (String name : new String[] {"Hearts of Oak", "Asante Kotoko", "Wolverhampton Wanderers", "Young Boys", "Boys Town", "FC B", ""}) {
            assertNull(name, JuniorSide.of(name));
        }
    }
}
