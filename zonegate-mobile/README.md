# ZoneGate Mobile

The field app. An operator at a gate requests authorization for a protected
action here, and sees what the network attested about them when the decision
came back.

It is one of three ZoneGate surfaces:

| Repository | What it is |
|---|---|
| [zonegate-backend](https://github.com/ZoneGate/zonegate-backend) | The authorization API, policy engine and evidence gateway |
| [zonegate-website](https://github.com/ZoneGate/zonegate-website) | The operations console, where a HOLD is resolved |
| **zonegate-mobile** | This app |

## What the app does

- **Sign in** as an enrolled actor. Enrolment is checked against the API, so an
  actor the backend does not know cannot get past this screen.
- **Request a release** for a cargo unit, and route on the outcome: an approval
  screen, a security alert, or a receipt showing which human authority now
  holds the decision.
- **Show the actor–device binding** the whole system rests on: the registered
  line and device, masked.
- **Read a receipt** for any past decision.

An evidence check the planner never requested renders as `NOT COLLECTED`, never
as a pass. "Came back clean" and "was never asked" are different facts, and the
screen keeps them apart.

## Building without installing Flutter

Docker is the only prerequisite -- no Flutter SDK, no Android SDK, no JDK.

```bash
docker compose --profile tools run --rm test
docker compose --profile tools run --rm flutter flutter build apk --release
```

The APK lands in `build/app/outputs/flutter-apk/`.

**Running the app is a host-side step.** An Android emulator needs KVM, which
Docker Desktop does not pass through on Windows or macOS. Install the built APK
on an emulator or handset yourself:

```bash
adb install -r build/app/outputs/flutter-apk/app-release.apk
adb reverse tcp:8000 tcp:8000
```

`adb reverse` is what lets the app on the device reach the API running on your
machine. On an emulator the app defaults to `http://10.0.2.2:8000`, which is
the host as seen from inside it.

## Building with a local Flutter install

Flutter 3.47.3 (Dart SDK ^3.12.2):

```bash
flutter pub get
flutter analyze
flutter test
flutter run
```

Point the app at a different API with a compile-time define:

```bash
flutter run --dart-define=ZONEGATE_API_URL=http://192.168.1.20:8000
```

## Tests

23 unit tests covering the projections and the API client -- how decisions are
grouped into cargo units, how a phone number is masked, and the client failure
paths that matter at a gate: an unreachable backend must say so, and a 404 on
an actor must mean "not enrolled" rather than a crash.

```bash
docker compose --profile tools run --rm test
```

The suite is hermetic; it never reaches a running backend.
