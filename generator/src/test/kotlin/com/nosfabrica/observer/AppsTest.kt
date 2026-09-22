package com.nosfabrica.observer

import com.nosfabrica.observer.nostr.Apps
import com.nosfabrica.observer.nostr.Desk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AppsTest {
    private val app = Fixtures.appRelease()
    private val corpus = Fixtures.corpus(listOf(app), Desk.APPS)

    @Test
    fun `writer form is event id hex`() {
        assertEquals(
            "https://zapstore.dev/apps/${Fixtures.APP_ID}",
            Apps.writerUrl(Fixtures.APP_ID),
        )
    }

    @Test
    fun `canonical form is the d tag`() {
        val url = Apps.canonicalUrl(app)
        assertEquals("https://zapstore.dev/apps/${Fixtures.APP_D}", url)
        assertEquals(
            Fixtures.APP_ID.lowercase(),
            Apps.appLinkTarget(url, listOf(app)),
        )
    }

    @Test
    fun `writer form resolves against apps we read`() {
        val writer = Apps.writerUrl(Fixtures.APP_ID)
        assertEquals(Fixtures.APP_ID, Apps.appLinkTarget(writer, listOf(app)))
        assertNull(Apps.appLinkTarget(writer, emptyList()))
    }

    @Test
    fun `a zapstore url copied from a post body is not verified`() {
        val invented =
            Apps.canonicalUrl(
                Fixtures.event(
                    "f".repeat(64),
                    "dd44".repeat(16),
                    "",
                    kind = 32267,
                    tags = listOf(listOf("d", "com.evil.app")),
                ),
            )
        assertNull(Apps.appLinkTarget(invented, listOf(app)))
    }

    @Test
    fun `an app without a d tag is not linkable`() {
        val bare =
            Fixtures.event(
                "f".repeat(64),
                Fixtures.ALICE,
                "no id",
                kind = 32267,
                tags = listOf(listOf("name", "Nameless")),
            )
        assertTrue(Apps.released(Fixtures.corpus(listOf(bare), Desk.APPS)).isEmpty())
    }
}
