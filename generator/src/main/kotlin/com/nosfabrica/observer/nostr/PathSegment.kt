package com.nosfabrica.observer.nostr

/**
 * Path segment safe for Zapstore / gitworkshop URLs.
 *
 * Reverse-domain app ids and kebab-case repo ids are fine. A `d` with a slash
 * or query character would invent a different path; refuse those rather than
 * percent-encode a publisher-controlled string into an open-redirect shape.
 */
fun isSafePathSegment(value: String?): Boolean = value != null && value.matches(Regex("^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$"))
