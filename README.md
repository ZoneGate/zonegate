# ZoneGate

Network-attested authorization for critical human actions such as cargo
release. Before a protected action is authorized, ZoneGate collects live
network evidence from Nokia Network as Code (CAMARA), lets an advisory AI agent
plan and interpret that evidence, and has a deterministic, LLM-free policy
engine return APPROVE, HOLD or DENY. A HOLD is handed to the human authority
the policy names.

This repository holds the three surfaces, one folder each:

| Folder | What it is |
|---|---|
| [`zonegate-backend/`](zonegate-backend) | The authorization API, policy engine and evidence gateway |
| [`zonegate-website/`](zonegate-website) | The operations console for supervisors and officers, where a HOLD is resolved |
| [`zonegate-mobile/`](zonegate-mobile) | The field app for cargo personnel, where an authorization is requested |

Each folder also runs on its own, with its own `Dockerfile`,
`docker-compose.yml`, tests and README. The `docker-compose.yml` at the root
wires the three together so one command brings up the whole system.

## Running the whole thing

Docker is the only prerequisite. No Python, Node, Flutter or Android SDK has to
be installed on your machine.

```bash
CARRIER_KEY=<your Nokia Network as Code key> docker compose up -d
```

One command brings up all three surfaces:

- Console — <http://127.0.0.1:3000>
- API — <http://127.0.0.1:8000>
- Mobile — the `mobile` container builds the release APK into
  `zonegate-mobile/build/app/outputs/flutter-apk/app-release.apk` and exits.
  Follow it with `docker compose logs -f mobile`. The first build downloads
  Gradle dependencies and takes several minutes; later ones reuse the cache.

Every carrier check goes to the Nokia Network as Code gateway with that key;
no carrier is simulated inside the stack. Without `CARRIER_KEY` the API refuses
to start rather than decide on nothing.

Stop it with `docker compose down`. Decisions are written to
`zonegate-backend/.docker/zonegate.zova` on the host, so they survive a restart.

### First run: enrol an actor

The store starts empty, and an unenrolled actor is denied by design. Enrol one:

```bash
curl -X POST http://127.0.0.1:8000/v1/actors -H 'Content-Type: application/json' -d '{"actor":{"actor_id":"usr_cargo_operator_01","role":"ROLE_CARGO_OPERATOR","permissions":["cargo:release","cargo:inspect"],"registered_phone_number":"+14155550199","registered_device_id":"dev_imei_99887766","enrollment_status":"ACTIVE"}}'
```

## Tests

```bash
docker compose --profile tools run --rm api-test     # backend
docker compose --profile tools run --rm web-test     # console
docker compose --profile tools run --rm mobile-test  # mobile analyze + tests
```

The suites are hermetic: they never reach a live Gemini, Ollama or Nokia
endpoint, whatever a local `.env` says.

## Mobile

`docker compose up -d` already builds the release APK, so nobody has to install
Flutter. To rebuild it on its own:

```bash
docker compose up mobile
```

The APK lands in `zonegate-mobile/build/app/outputs/flutter-apk/`. It reaches
the API at `http://10.0.2.2:8000` on an emulator; to bake in another address,
for a handset on the same Wi-Fi for instance:

```bash
MOBILE_API_URL=http://192.168.1.20:8000 docker compose up mobile
```

**Running the app is a host-side step.** An Android emulator needs KVM, which
Docker Desktop does not pass through on Windows or macOS, so install the built
APK on an emulator or handset yourself:

```bash
adb install -r zonegate-mobile/build/app/outputs/flutter-apk/app-release.apk
adb reverse tcp:8000 tcp:8000
```

`adb reverse` is what lets the app on the device reach the API on your machine.
On an emulator the app defaults to `http://10.0.2.2:8000`, which is the host as
seen from inside it.

## Using a real agent runtime

The pipeline runs without one: evidence planning falls back to the mandatory
baseline and decisions are made on network facts alone. Checks the planner
never requested are shown as "not requested", never as passes.

### Ollama, on your own machine

Compose already defaults to Ollama and reaches the host daemon through
`host.docker.internal`, so the only setup is the model itself:

```bash
ollama pull qwen2.5:7b
docker compose up -d api
```

`GET /health` reports `ollama_agent_runtime: available` once the daemon
answers. Note that this only means the daemon is reachable -- it does not mean a
model is installed. With no model pulled, planning fails and the pipeline falls
back to the mandatory baseline.

A first generation has to load the model into memory, which on CPU measured
around 30 seconds against roughly 3 seconds warm. `OLLAMA_TIMEOUT` (default 120
seconds) covers that; raise it on a slower machine, or pick a different model
with `OLLAMA_MODEL`.

**The model you choose changes what the engine gets to see.** The planner
decides which optional carrier checks are requested at all, and evidence that
was never requested cannot be judged.

Measured on the same four scenarios, same carrier state, same policy engine:

| | `llama3.2` (3B) | `qwen2.5:7b` |
|---|---|---|
| Optional evidence requested on risky requests | never | SIM_SWAP each time |
| $480,000 at 02:30 UTC | "standard value during business hours" | "high value ... necessitates additional security measures" |
| Latency, warm | ~2s | ~10s |

That gap has a security consequence. With a SIM swap active on the operator
device, a $480,000 release in business hours:

- `qwen2.5:7b` requests SIM_SWAP, the carrier reports it, and the engine holds
  the release for a security officer.
- `llama3.2` never requests it, so the engine sees no SIM swap, and the release
  is **approved with a valid token**.

The deterministic rules are identical in both runs. The engine cannot rule on
evidence nobody asked for -- which is why an uncollected check shows a dash and
"Not requested for this decision" rather than a tick.

Treat `llama3.2` as a smoke-test model. Anything load-bearing wants at least a
7B model, or the SIM_SWAP and DEVICE_SWAP checks promoted into the mandatory
baseline in `workflow_policy.py` so they never depend on an agent at all.

### Gemini

```bash
LLM_PROVIDER=gemini GEMINI_API_KEY=your-key docker compose up -d api
```

`.env` is excluded from the image, so a provider set there does not reach the
container -- pass it to compose instead.

The agent's assessment is advisory in every direction. It cannot move a
deterministic outcome — see `zonegate-backend/tests/test_policy_rules_exhaustive.py`.
