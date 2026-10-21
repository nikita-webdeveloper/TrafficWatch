# Contributing to TrafficWatch

Thank you for your interest in contributing to TrafficWatch! We welcome contributions from developers of all experience levels to help make urban traffic monitoring, route planning, and predictive analytics accessible and accurate.

---

## Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Please be respectful, constructive, and collaborative in all discussions, issues, and pull requests.

---

## Getting Started

### 1. Prerequisites

Before setting up your local development environment, ensure you have:

- **Python**: 3.11, 3.12, or 3.13
- **JavaScript Runtime & Package Manager**: [Bun](https://bun.sh/) 1.x (recommended) or Node.js 20+ with npm/pnpm
- **Git**: Installed and configured
- **TomTom Developer Account**: Free API key from [TomTom Developer Portal](https://developer.tomtom.com/)

### 2. Fork and Clone the Repository

```bash
git clone https://github.com/nikita-webdeveloper/TrafficWatch.git
cd TrafficWatch
```

### 3. Backend Setup

Create and activate an isolated Python virtual environment:

**Windows PowerShell:**
```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

**macOS / Linux:**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Configure environment variables:
```powershell
copy .env.example .env
```
Edit `.env` and set your TomTom API key:
```env
TOMTOM_API_KEY=your_tomtom_api_key_here
```

### 4. Frontend Setup

In a separate terminal, navigate to the frontend directory:

```bash
cd fronted
bun install
# Alternatively, if using npm:
# npm install
```

Configure frontend environment variables:
```bash
cp .env.example .env
# On Windows PowerShell:
# copy .env.example .env
```
Verify `fronted/.env` points to your backend instance:
```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

---

## Development Workflow

### Starting the Services

1. **Backend Server:**
   ```powershell
   # From repository root with .venv activated
   python -m uvicorn main:app --reload --port 8000
   ```
   - Interactive Swagger API docs: `http://127.0.0.1:8000/docs`
   - Health check: `http://127.0.0.1:8000/health`

2. **Frontend Dev Server:**
   ```bash
   cd fronted
   bun run dev
   ```
   - Web application: `http://localhost:5173`

---

## Coding Standards

### Python (Backend & ML)

- Follow **PEP 8** style guidelines.
- Use explicit type annotations (`typing` / Python 3.10+ union types `X | Y`).
- Document functions and modules with clear docstrings explaining arguments, return values, and failure modes.
- Use Python's standard `logging` library instead of raw `print` statements in production services.
- Never hardcode API keys, passwords, or secrets. Always read configuration from environment variables via `os.getenv()`.
- Keep ML model inference strictly decoupled from model retraining. Live API requests must never trigger heavy retraining passes synchronously.

### TypeScript & React (Frontend)

- Use **TypeScript** with strict mode enabled.
- Build UI components using **Tailwind CSS 4** and Radix UI primitives.
- Manage server state with `@tanstack/react-query` and routing with `@tanstack/react-router`.
- Format code using Prettier:
  ```bash
  cd fronted
  bun run format
  ```
- Run ESLint to catch syntax and styling issues:
  ```bash
  cd fronted
  bun run lint
  ```

---

## Running Automated Tests

All tests must pass before submitting a pull request.

### Backend Tests (pytest)

Run the full pytest suite (55 tests across routing, analytics, data pipeline, ML, and API endpoints):

```powershell
# From repository root with .venv activated
pytest -v
```

Run specific test modules:
```powershell
# Test ML forecasting and pipeline integrity
pytest tests/test_ml_pipeline.py -v

# Test routing calculations and TomTom integration
pytest tests/test_routing_service.py -v

# Test data freshness and retraining safeguards
pytest tests/test_freshness_and_retraining.py -v
```

### Frontend Tests (Vitest)

Run all 136 frontend unit and component tests:

```bash
cd fronted
bun run test
```

### Production Build Verification

Verify that the frontend builds cleanly without TypeScript or asset bundling errors:

```bash
cd fronted
bun run build
```

---

## Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` A new feature (e.g., `feat: add weather overlay to live traffic map`)
- `fix:` A bug fix (e.g., `fix: resolve division by zero in corridor delay calculation`)
- `docs:` Documentation improvements (e.g., `docs: update API authentication guide`)
- `test:` Adding or updating tests (e.g., `test: add edge cases for route alternative sorting`)
- `refactor:` Code restructuring that does not change external behavior (e.g., `refactor: optimize data pipeline deduplication`)
- `chore:` Routine maintenance or dependency bumps (e.g., `chore: update dependencies`)

---

## Pull Request Process

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make small, focused commits with clear messages.
3. Verify all backend and frontend tests pass locally.
4. Verify the production frontend build succeeds.
5. Push your branch to your fork:
   ```bash
   git push origin feat/your-feature-name
   ```
6. Open a Pull Request against the `main` branch of TrafficWatch.
7. Fill out the PR template explaining the problem, the solution, and test verification steps.

---

## Reporting Issues & Requesting Features

- **Bug Reports**: Open an issue detailing the steps to reproduce, expected behavior, actual behavior, and system environment (OS, Python version, Bun/Node version).
- **Feature Requests**: Open an issue explaining the proposed use case, architectural considerations, and why it benefits TrafficWatch users.
- **Security Vulnerabilities**: Please do NOT open public GitHub issues for security vulnerabilities. See our Security Notes in [README.md](README.md) for reporting guidelines.
