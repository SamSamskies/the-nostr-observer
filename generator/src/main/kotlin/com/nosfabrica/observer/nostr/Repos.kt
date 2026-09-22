package com.nosfabrica.observer.nostr

import com.vitorpamplona.quartz.nip01Core.core.Event

/** Kind 30617 — a NIP-34 repository announcement. */
const val GIT_KIND = 30617

/**
 * gitworkshop.dev URLs derived from repositories we actually read.
 *
 * Same shape as [Apps]: the writer cites the digest's `repo:` line in writer
 * form (`/repo/<64-hex>`); [com.nosfabrica.observer.safe.Sanitizer] rewrites
 * that to gitworkshop's canonical `/<npub>/<d-tag>` afterwards. Built from
 * author pubkey + `d` — no naddr, and no publisher `web` tag (any URL the
 * maintainer wrote).
 */
object Repos {
    private val WRITER = Regex("""^https://gitworkshop\.dev/repo/([0-9a-f]{64})(?:[/?#].*)?$""", RegexOption.IGNORE_CASE)
    private val CANONICAL =
        Regex(
            """^https://gitworkshop\.dev/(npub1[0-9a-z]+)/([A-Za-z0-9][A-Za-z0-9._-]{0,200})(?:[/?#].*)?$""",
            RegexOption.IGNORE_CASE,
        )
    private val EVENT_ID = Regex("^[0-9a-f]{64}$")

    /** Repositories with a path-safe `d` tag — the only ones a gitworkshop link may name. */
    fun announced(corpus: Corpus): List<Event> = corpus.ranked[Desk.GIT].orEmpty().filter { isSafePathSegment(it.value("d")) }

    /** Writer form: event id hex. The sanitizer rewrites to npub/d afterwards. */
    fun writerUrl(eventId: String): String {
        val id = eventId.lowercase()
        require(EVENT_ID.matches(id)) { "Not an event id: ${eventId.take(16)}" }
        return "https://gitworkshop.dev/repo/$id"
    }

    /** Canonical gitworkshop page for a repository announcement. */
    fun canonicalUrl(event: Event): String {
        val d = event.value("d") ?: error("Not a repository address")
        require(event.kind == GIT_KIND) { "Not a repository address" }
        require(isSafePathSegment(d)) { "Repo id is not a safe path segment" }
        val npub = Names.npub(event.pubKey) ?: error("Not a repository address")
        return "https://gitworkshop.dev/$npub/$d"
    }

    /**
     * Event id if [href] is a verified gitworkshop link for one of [repos];
     * otherwise null.
     *
     * Two shapes: canonical `/<npub>/<d-tag>`, or the writer form the digest
     * prints. Either way the address must match a kind 30617 we read — not
     * merely appear in somebody's post.
     */
    fun gitLinkTarget(
        href: String,
        repos: Collection<Event>,
    ): String? {
        WRITER.find(href)?.groupValues?.get(1)?.lowercase()?.let { id ->
            if (repos.any { it.id.equals(id, ignoreCase = true) }) return id
        }
        val match = CANONICAL.find(href) ?: return null
        val npub = match.groupValues[1]
        val d = match.groupValues[2]
        return repos
            .find {
                Names.npub(it.pubKey).equals(npub, ignoreCase = true) && it.value("d") == d
            }?.id
            ?.lowercase()
    }
}
