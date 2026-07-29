# ──────────────────────────────────────────────────────────
# ScholarDocX – Development Makefile
# Secure personal workspace, privacy-first higher education app portal
# ──────────────────────────────────────────────────────────

SHELL        := /bin/zsh
.DEFAULT_GOAL := help

# Paths
BACKEND_DIR  := backend
FRONTEND_DIR := frontend
VENV         := $(BACKEND_DIR)/.venv
VENV_BIN     := $(VENV)/bin
PYTHON       := $(VENV_BIN)/python
PIP          := $(VENV_BIN)/pip
PYTEST       := $(VENV_BIN)/pytest
UVICORN      := $(VENV_BIN)/uvicorn

# Ports
BACKEND_PORT  := 8000
FRONTEND_PORT := 5173

# Bind the dev servers to all interfaces so the app is reachable from other
# devices on the LAN (e.g. a phone for mobile testing). The frontend already
# binds 0.0.0.0 (see frontend/package.json "dev" script). The backend MUST
# match — otherwise opening the app via a non-localhost origin (e.g.
# http://192.168.x.x:5173) loads the page but every API call to
# http://192.168.x.x:8000 is refused, surfacing as "Failed to fetch" on login.
# Data stays local: this is a LAN-only dev server, not a remote backend.
BACKEND_HOST  := 0.0.0.0

# ──────────────────────────────────────────────────────────
# Help
# ──────────────────────────────────────────────────────────

.PHONY: help
help: ## Show this help message
	@echo ""
	@echo "  ScholarDocX — Development Commands"
	@echo "  ───────────────────────────────────"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ──────────────────────────────────────────────────────────
# Setup / Install
# ──────────────────────────────────────────────────────────

.PHONY: setup
setup: setup-backend setup-frontend ## Install all dependencies (backend + frontend)

.PHONY: setup-backend
setup-backend: ## Create venv and install backend dependencies
	@echo "⚙️  Setting up backend virtual environment..."
	@test -d $(VENV) || python3 -m venv $(VENV)
	@$(PIP) install --upgrade pip -q
	@$(PIP) install -r $(BACKEND_DIR)/requirements.txt -q
	@echo "✅ Backend dependencies installed."

.PHONY: setup-frontend
setup-frontend: ## Install frontend npm packages
	@echo "⚙️  Installing frontend packages..."
	@cd $(FRONTEND_DIR) && npm install --silent
	@echo "✅ Frontend packages installed."

# ──────────────────────────────────────────────────────────
# Run – Individual Servers
# ──────────────────────────────────────────────────────────

.PHONY: run-backend
run-backend: ## Start FastAPI backend (port 8000)
	@echo "🚀 Starting backend on http://localhost:$(BACKEND_PORT) ..."
	@cd $(BACKEND_DIR) && $(realpath $(UVICORN)) app.main:app --reload --host $(BACKEND_HOST) --port $(BACKEND_PORT)

.PHONY: run-frontend
run-frontend: ## Start Vite frontend (port 5173)
	@echo "🚀 Starting frontend on http://localhost:$(FRONTEND_PORT) ..."
	@cd $(FRONTEND_DIR) && npm run dev -- --port $(FRONTEND_PORT)

# ──────────────────────────────────────────────────────────
# Run – Both Servers Together
# ──────────────────────────────────────────────────────────

.PHONY: run
run: ## Start backend + frontend concurrently (Ctrl-C stops both)
	@echo "🚀 Starting ScholarDocX (backend + frontend)..."
	@echo "   Backend  → http://localhost:$(BACKEND_PORT)"
	@echo "   Frontend → http://localhost:$(FRONTEND_PORT)"
	@echo "   Press Ctrl-C to stop both."
	@echo ""
	@trap 'kill 0' INT TERM; \
		(cd $(BACKEND_DIR) && $(realpath $(UVICORN)) app.main:app --reload --host $(BACKEND_HOST) --port $(BACKEND_PORT)) & \
		(cd $(FRONTEND_DIR) && npm run dev -- --port $(FRONTEND_PORT)) & \
		wait

# ──────────────────────────────────────────────────────────
# Tests
# ──────────────────────────────────────────────────────────

.PHONY: test
test: test-backend test-frontend ## Run all tests (backend + frontend)

.PHONY: test-backend
test-backend: ## Run backend pytest suite
	@echo "🧪 Running backend tests..."
	@cd $(BACKEND_DIR) && $(realpath $(PYTEST)) -v
	@echo "✅ Backend tests complete."

.PHONY: test-frontend
test-frontend: ## Run frontend vitest suite
	@echo "🧪 Running frontend tests..."
	@cd $(FRONTEND_DIR) && npm test
	@echo "✅ Frontend tests complete."

.PHONY: smoke
smoke: ## Fast core-path subset (workspace, persistence, path safety, auth basics)
	@echo "🧪 Running smoke tests (backend @pytest.mark.smoke)..."
	@cd $(BACKEND_DIR) && $(realpath $(PYTEST)) -m smoke -v
	@echo "✅ Smoke tests complete."

.PHONY: regression
regression: ## Run all regression-guarded tests (@pytest.mark.regression)
	@echo "🧪 Running regression tests (backend @pytest.mark.regression)..."
	@cd $(BACKEND_DIR) && $(realpath $(PYTEST)) -m regression -v
	@echo "✅ Regression tests complete."

.PHONY: test-fast
test-fast: ## Run backend tests except slow ones (-m "not slow")
	@echo "🧪 Running backend tests (excluding slow)..."
	@cd $(BACKEND_DIR) && $(realpath $(PYTEST)) -m "not slow" -v
	@echo "✅ Fast tests complete."

.PHONY: test-frontend-build
test-frontend-build: ## Verify frontend TypeScript compilation and build
	@echo "🧪 Checking frontend build..."
	@cd $(FRONTEND_DIR) && npm run build
	@echo "✅ Frontend build succeeded."

# ──────────────────────────────────────────────────────────
# Quality / Lint
# ──────────────────────────────────────────────────────────

# Static guard: every external provider call must charge the user (BD-011).
# Runs first in `check` because it is instant and catches the failure mode that
# code review kept missing — billing that is present in the file but never on
# the path taken (SCHOLARDOCX-0204).
.PHONY: guard-billing
guard-billing: ## Verify every provider call charges the user
	@python3 scripts/check-provider-call-billing.py

# Full regression gate: billing guard + both test suites + frontend build. This
# is the same command the CI workflow (.github/workflows/ci.yml) runs, so a
# green `make check` locally means CI will be green too.
.PHONY: check
check: guard-billing test-backend test-frontend test-frontend-build ## Regression gate: guard + both suites + build (matches CI)

# Alias for `check` — documents the exact command CI runs, in case you want to
# reproduce a CI run locally without remembering the target name.
.PHONY: ci
ci: check ## Run the same regression gate as CI

# ──────────────────────────────────────────────────────────
# Clean
# ──────────────────────────────────────────────────────────

.PHONY: clean
clean: ## Remove build artifacts, caches, and venv
	@echo "🧹 Cleaning up..."
	@rm -rf $(VENV)
	@rm -rf $(BACKEND_DIR)/.pytest_cache
	@rm -rf $(FRONTEND_DIR)/dist
	@rm -rf $(FRONTEND_DIR)/node_modules
	@find $(BACKEND_DIR) -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	@echo "✅ Clean complete. Run 'make setup' to reinstall."
