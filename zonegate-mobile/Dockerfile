# Flutter toolchain for ZoneGate Mobile.
#
# This exists so nobody has to install the Flutter SDK, an Android SDK or a
# matching JDK to work on the app: the container runs `flutter analyze`,
# `flutter test` and builds a release APK.
#
# It deliberately does NOT run the app. An Android emulator needs KVM, which
# Docker Desktop on Windows and macOS does not pass through — build the APK
# here, then install it on an emulator or handset from the host:
#
#   docker compose run --rm mobile build-apk
#   adb install -r build/app/outputs/flutter-apk/app-release.apk

FROM debian:bookworm-slim

# Pinned so a fresh clone gets the same toolchain the app was written against.
ARG FLUTTER_VERSION=3.47.3
ARG ANDROID_SDK_TOOLS=13114758
# Flutter resolves compileSdk itself; both platforms are baked in so a
# build never stops to download one.
ARG ANDROID_PLATFORM=android-35
ARG ANDROID_PLATFORM_FALLBACK=android-34
ARG ANDROID_BUILD_TOOLS=35.0.0

ENV DEBIAN_FRONTEND=noninteractive
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV FLUTTER_HOME=/opt/flutter
ENV PATH=$FLUTTER_HOME/bin:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools:$PATH

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl git unzip xz-utils zip ca-certificates \
        openjdk-17-jdk-headless \
        libglu1-mesa \
    && rm -rf /var/lib/apt/lists/*

# Flutter SDK
RUN curl -fsSL "https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_${FLUTTER_VERSION}-stable.tar.xz" \
        -o /tmp/flutter.tar.xz \
    && tar -xJf /tmp/flutter.tar.xz -C /opt \
    && rm /tmp/flutter.tar.xz \
    && git config --global --add safe.directory /opt/flutter

# Android command-line tools, platform and build-tools
RUN mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools" \
    && curl -fsSL "https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_SDK_TOOLS}_latest.zip" \
        -o /tmp/tools.zip \
    && unzip -q /tmp/tools.zip -d "$ANDROID_SDK_ROOT/cmdline-tools" \
    && mv "$ANDROID_SDK_ROOT/cmdline-tools/cmdline-tools" "$ANDROID_SDK_ROOT/cmdline-tools/latest" \
    && rm /tmp/tools.zip \
    && yes | sdkmanager --licenses > /dev/null \
    && sdkmanager --install \
        "platform-tools" \
        "platforms;${ANDROID_PLATFORM}" \
        "platforms;${ANDROID_PLATFORM_FALLBACK}" \
        "build-tools;${ANDROID_BUILD_TOOLS}" > /dev/null

# Warm the SDK caches so the first real command is not a download.
RUN flutter config --no-analytics \
    && flutter precache --android \
    && flutter doctor

WORKDIR /app

# Resolve packages against the manifest before the source is copied, so an
# edit to a .dart file does not invalidate the dependency layer.
COPY pubspec.yaml pubspec.lock ./
RUN flutter pub get

COPY . .

# `analyze` is the default because it is the fastest signal that a change is
# sound; the compose file exposes the other commands by name.
CMD ["flutter", "analyze"]
