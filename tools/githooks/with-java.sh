#!/bin/sh
# Agent shells and GUI git clients often skip the user's zshrc, so Homebrew
# OpenJDK is installed but JAVA_HOME is empty and macOS reports
# "Unable to locate a Java Runtime." Resolve it before any ./gradlew call.
#
# Prefer Homebrew before /usr/libexec/java_home: the unversioned helper can
# return an older registered macOS JDK that still has a working java binary,
# which then shadows a JDK 17+ install already on PATH and breaks this repo's
# Kotlin 2.4 / Gradle 9.6 toolchain in pre-commit/pre-push.
if [ -z "${JAVA_HOME:-}" ] || [ ! -x "${JAVA_HOME}/bin/java" ]; then
  for candidate in \
    /opt/homebrew/opt/openjdk@21 \
    /opt/homebrew/opt/openjdk@17 \
    /opt/homebrew/opt/openjdk \
    /usr/local/opt/openjdk@21 \
    /usr/local/opt/openjdk@17 \
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
