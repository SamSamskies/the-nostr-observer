#!/bin/sh
# Agent shells and GUI git clients often skip the user's zshrc, so Homebrew
# OpenJDK is installed but JAVA_HOME is empty and macOS reports
# "Unable to locate a Java Runtime." Resolve it before any ./gradlew call.
#
# Cursor also injects GRADLE_USER_HOME and PLAYWRIGHT_BROWSERS_PATH into a
# per-session tmpdir — even when the filesystem sandbox is off — so every
# commit/push re-downloads Gradle and Chromium. Drop those redirects; a
# user-set cache directory that is not Cursor's tmpdir is left alone.

for var in GRADLE_USER_HOME PLAYWRIGHT_BROWSERS_PATH; do
  eval "val=\${$var-}"
  case "$val" in
    *cursor-sandbox-cache*) unset "$var" ;;
  esac
done
#
# This repo pins jvmToolchain(21). Gradle will not invent a JDK 21 from an
# unversioned Homebrew openjdk that has moved to 26 — and agent shells that
# export JAVA_HOME to that path make the mismatch worse, because this script
# used to trust any pre-set home. Prefer a real @21 install whenever one is
# present, even if JAVA_HOME already points at a different major version.
#
# Prefer Homebrew before /usr/libexec/java_home: the unversioned helper can
# return an older registered macOS JDK that still has a working java binary,
# which then shadows a JDK 17+ install already on PATH and breaks this repo's
# Kotlin 2.4 / Gradle 9.6 toolchain in pre-commit/pre-push.

java_major() {
  # shellcheck disable=SC2039
  "$1" -version 2>&1 | sed -n 's/.*version "\([0-9][0-9]*\).*/\1/p' | head -n 1
}

jdk21=""
for candidate in \
  /opt/homebrew/opt/openjdk@21 \
  /usr/local/opt/openjdk@21
do
  if [ -x "$candidate/bin/java" ]; then
    jdk21="$candidate"
    break
  fi
done

if [ -n "$jdk21" ]; then
  if [ -z "${JAVA_HOME:-}" ] || [ ! -x "${JAVA_HOME}/bin/java" ]; then
    JAVA_HOME="$jdk21"
  else
    major="$(java_major "${JAVA_HOME}/bin/java")"
    if [ "$major" != "21" ]; then
      JAVA_HOME="$jdk21"
    fi
  fi
elif [ -z "${JAVA_HOME:-}" ] || [ ! -x "${JAVA_HOME}/bin/java" ]; then
  for candidate in \
    /opt/homebrew/opt/openjdk \
    /usr/local/opt/openjdk
  do
    if [ -x "$candidate/bin/java" ]; then
      JAVA_HOME="$candidate"
      break
    fi
  done
fi

if [ -z "${JAVA_HOME:-}" ] || [ ! -x "${JAVA_HOME}/bin/java" ]; then
  if [ -x /usr/libexec/java_home ]; then
    JAVA_HOME="$(/usr/libexec/java_home 2>/dev/null)" || true
  fi
fi

if [ -n "${JAVA_HOME:-}" ] && [ -x "${JAVA_HOME}/bin/java" ]; then
  export JAVA_HOME
  export PATH="$JAVA_HOME/bin:$PATH"
fi
