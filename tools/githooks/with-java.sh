#!/bin/sh
# Agent shells and GUI git clients often skip the user's zshrc, so Homebrew
# OpenJDK is installed but JAVA_HOME is empty and macOS reports
# "Unable to locate a Java Runtime." Resolve it before any ./gradlew call.
if [ -z "${JAVA_HOME:-}" ] || [ ! -x "${JAVA_HOME}/bin/java" ]; then
  if [ -x /usr/libexec/java_home ]; then
    JAVA_HOME="$(/usr/libexec/java_home 2>/dev/null)" || true
  fi
fi
if [ -z "${JAVA_HOME:-}" ] || [ ! -x "${JAVA_HOME}/bin/java" ]; then
  for candidate in \
    /opt/homebrew/opt/openjdk \
    /opt/homebrew/opt/openjdk@21 \
    /opt/homebrew/opt/openjdk@17 \
    /usr/local/opt/openjdk \
    /usr/local/opt/openjdk@21 \
    /usr/local/opt/openjdk@17
  do
    if [ -x "$candidate/bin/java" ]; then
      JAVA_HOME="$candidate"
      break
    fi
  done
fi
if [ -n "${JAVA_HOME:-}" ] && [ -x "${JAVA_HOME}/bin/java" ]; then
  export JAVA_HOME
  export PATH="$JAVA_HOME/bin:$PATH"
fi
