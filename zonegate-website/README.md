# ZoneGate

ZoneGate is a security-first logistics authorization platform designed to support secure access and cargo handoff operations.

The web dashboard provides a centralized interface for monitoring authorization requests, reviewing personnel and courier access, analyzing security decisions, and managing operational policies and zones.

## Features

- Operations dashboard
- Authorization request monitoring
- APPROVE / HOLD / DENY decision tracking
- Courier and employee access directory
- Request and security statistics
- Location and operational zone monitoring
- Authorization policy configuration
- Security event and audit views
- Responsive web interface

## Tech Stack

- Next.js 16
- React
- TypeScript
- Tailwind CSS
- Lucide React
- Recharts
- Next.js App Router

## Running with Docker

Docker is the only prerequisite -- no Node, no npm.

```bash
docker compose up -d --build
```

The console is then on <http://localhost:3000>.

The console is a browser app: it calls the API from the visitor's browser, not
from the container. `NEXT_PUBLIC_API_URL` therefore has to be an address the
browser can reach, and Next inlines it **at build time** -- changing it means
rebuilding, not restarting:

```bash
NEXT_PUBLIC_API_URL=http://192.168.1.20:8000 docker compose up -d --build
```

The default, `http://127.0.0.1:8000`, is already correct when the backend is
running from its own compose file on the same machine.

### Tests

```bash
docker compose --profile tools run --rm test
```

43 unit tests over the API client and the projections behind every figure the
dashboard shows. A bug in those is a wrong number on a security operator's
screen rather than a visible crash, which is why they are tested apart from the
pages that render them.

## The rest of the system

| Repository | What it is |
|---|---|
| [zonegate-backend](https://github.com/ZoneGate/zonegate-backend) | The authorization API, policy engine and evidence gateway |
| **zonegate-website** | This console |
| [zonegate-mobile](https://github.com/ZoneGate/zonegate-mobile) | The field app, where an authorization is requested |

The console reads and writes live API data -- decisions, the actor roster and
the policy thresholds. With no backend reachable it says so in the header
rather than rendering an empty dashboard.

## Requirements

To run without Docker, make sure the following tools are installed:

- Node.js 20 or later
- npm

You can check your installed versions with:

```bash
node -v
npm -v
```

## Installation

### 1. Clone the repository

```bash
git clone <repository-url>
```

Then navigate into the project directory:

```bash
cd zonegate-web
```

### 2. Install dependencies

Install all dependencies defined in `package.json`:

```bash
npm install
```

This will install the required packages, including Next.js, React, Lucide React, and Recharts.

> You do not need to manually copy or share the `node_modules` directory. It will be generated automatically by `npm install`.

### 3. Start the development server

Run:

```bash
npm run dev
```

After the server starts, open:

```text
http://localhost:3000
```

in your browser.

## Available Pages

| Page | Route |
|---|---|
| Dashboard | `/` |
| Requests | `/requests` |
| Couriers / Employees | `/employees` |
| Statistics | `/statistics` |
| Settings | `/settings` |

## Project Structure

```text
zonegate-web/
├── public/
│
├── src/
│   ├── app/
│   │   ├── employees/
│   │   │   └── page.tsx
│   │   ├── requests/
│   │   │   └── page.tsx
│   │   ├── settings/
│   │   │   └── page.tsx
│   │   ├── statistics/
│   │   │   └── page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   └── components/
│       ├── Header.tsx
│       └── Sidebar.tsx
│
├── .gitignore
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── package-lock.json
├── postcss.config.mjs
├── tsconfig.json
└── README.md
```

## Development

The project uses the Next.js App Router.

Main application pages are located under:

```text
src/app/
```

Shared interface components such as the sidebar and header are located under:

```text
src/components/
```

When the development server is running, changes to the source files are automatically reflected in the browser.

## Build

To create a production build:

```bash
npm run build
```

To run the production build locally:

```bash
npm start
```

## Linting

To check the project for linting issues:

```bash
npm run lint
```

## UI

The ZoneGate interface follows a security-oriented enterprise dashboard design.

Primary interface colors:

```text
Primary:   #0D9488
Secondary: #0F172A
Accent:    #1FD1A8
Background:#F8FAFC
```

Decision states are represented as:

- **APPROVE** — verified authorization
- **HOLD** — requires additional or human review
- **DENY** — authorization rejected

## Client-Only Demo & GitHub Pages

To run the client-only demo locally with mock data and zero backend requirements:

```bash
cd zonegate-web
npm run dev:demo
```

To build the static export for GitHub Pages locally:

```bash
cd zonegate-web
npm run build:demo
```

This outputs static HTML/CSS/JS to `zonegate-web/out`.

### Automated GitHub Pages Deployment

The repository includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml`:
1. In your GitHub repository, go to **Settings** > **Pages**.
2. Under **Build and deployment** > **Source**, select **GitHub Actions**.
3. Pushes to `main` (or manual triggers under the **Actions** tab) automatically build and publish the demo.

## Notes

Do not commit sensitive configuration or credentials to the repository.

Files such as the following should remain excluded from Git:

```text
node_modules/
.next/
.env
.env.local
```

Environment variables and API credentials should be stored locally using environment files and must not be committed to the repository.