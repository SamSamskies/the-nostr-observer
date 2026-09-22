package com.nosfabrica.observer.nostr

import com.vitorpamplona.quartz.nip01Core.core.Event

/** Kind 32267 — a NIP-82 software application. */
const val APP_KIND = 32267

/**
 * Zapstore app URLs derived from releases we actually read.
 *
 * Same shape as [Streams]: the writer cites the digest's `app:` line in writer
 * form (`/apps/<64-hex>`); [com.nosfabrica.observer.safe.Sanitizer] rewrites
 * that to Zapstore's canonical `/apps/<d-tag>` afterwards. The `d` tag is the
 * reverse-domain app id — no naddr encoding.
 */
object Apps {
    private val WRITER = Regex("""^https://zapstore\.dev/apps/([0-9a-f]{64})(?:[/?#].*)?$""", RegexOption.IGNORE_CASE)
    private val CANONICAL =
        Regex("""^https://zapstore\.dev/apps/([A-Za-z0-9][A-Za-z0-9._-]{0,200})(?:[/?#].*)?$""", RegexOption.IGNORE_CASE)
    private val EVENT_ID = Regex("^[0-9a-f]{64}$")

    /** App releases with a path-safe `d` tag — the only ones a Zapstore link may name. */
    fun released(corpus: Corpus): List<Event> = corpus.ranked[Desk.APPS].orEmpty().filter { isSafePathSegment(it.value("d")) }

    /** Writer form: event id hex. The sanitizer rewrites to the app id afterwards. */
    fun writerUrl(eventId: String): String {
        val id = eventId.lowercase()
        require(EVENT_ID.matches(id)) { "Not an event id: ${eventId.take(16)}" }
        return "https://zapstore.dev/apps/$id"
    }

    /** Canonical Zapstore page for an app release. */
    fun canonicalUrl(event: Event): String {
        val d = event.value("d") ?: error("Not an app address")
        require(event.kind == APP_KIND) { "Not an app address" }
        require(isSafePathSegment(d)) { "App id is not a safe path segment" }
        return "https://zapstore.dev/apps/$d"
    }

    /**
     * Event id if [href] is a verified Zapstore link for one of [apps];
     * otherwise null.
     *
     * Two shapes: canonical `/apps/<d-tag>`, or the writer form the digest
     * prints. Either way the address must match a kind 32267 we read — not
     * merely appear in somebody's post.
     */
    fun appLinkTarget(
        href: String,
        apps: Collection<Event>,
    ): String? {
        WRITER.find(href)?.groupValues?.get(1)?.lowercase()?.let { id ->
            if (apps.any { it.id.equals(id, ignoreCase = true) }) return id
        }
        val d = CANONICAL.find(href)?.groupValues?.get(1) ?: return null
        // Writer form also matches CANONICAL (64 hex is a legal path segment);
        // membership by id was already tried above.
        if (EVENT_ID.matches(d.lowercase())) return null
        return apps.find { it.value("d") == d }?.id?.lowercase()
    }
}
