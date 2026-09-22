package com.nosfabrica.observer

import com.nosfabrica.observer.nostr.Desk
import com.nosfabrica.observer.nostr.Names
import com.nosfabrica.observer.nostr.Repos
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ReposTest {
    private val repo = Fixtures.gitRepo()
    private val corpus = Fixtures.corpus(listOf(repo), Desk.GIT)

    @Test
    fun `writer form is event id hex under repo`() {
        assertEquals(
            "https://gitworkshop.dev/repo/${Fixtures.REPO_ID}",
            Repos.writerUrl(Fixtures.REPO_ID),
        )
    }

    @Test
    fun `canonical form is npub and d tag`() {
        val url = Repos.canonicalUrl(repo)
        val npub = Names.npub(Fixtures.ALICE)!!
        assertEquals("https://gitworkshop.dev/$npub/${Fixtures.REPO_D}", url)
        assertEquals(
            Fixtures.REPO_ID.lowercase(),
            Repos.gitLinkTarget(url, listOf(repo)),
        )
    }

    @Test
    fun `writer form resolves against repos we read`() {
        val writer = Repos.writerUrl(Fixtures.REPO_ID)
        assertEquals(Fixtures.REPO_ID, Repos.gitLinkTarget(writer, listOf(repo)))
        assertNull(Repos.gitLinkTarget(writer, emptyList()))
    }

    @Test
    fun `a gitworkshop url copied from a post body is not verified`() {
        val invented =
            Repos.canonicalUrl(
                Fixtures.event(
                    "f".repeat(64),
                    "dd44".repeat(16),
                    "",
                    kind = 30617,
                    tags = listOf(listOf("d", "fake-repo")),
                ),
            )
        assertNull(Repos.gitLinkTarget(invented, listOf(repo)))
    }

    @Test
    fun `a repo without a d tag is not linkable`() {
        val bare =
            Fixtures.event(
                "f".repeat(64),
                Fixtures.ALICE,
                "",
                kind = 30617,
                tags = listOf(listOf("name", "Nameless")),
            )
        assertTrue(Repos.announced(Fixtures.corpus(listOf(bare), Desk.GIT)).isEmpty())
    }
}
