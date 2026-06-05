# ──────────────────────────────────────────────────────────
# ScholarDock – Development Makefile
# Local-first, privacy-first higher education app portal
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

# ──────────────────────────────────────────────────────────
# Help
# ──────────────────────────────────────────────────────────

.PHONY: help
help: ## Show this help message
	@echo ""
	@echo "  ScholarDock — Development Commands"
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
	@cd $(BACKEND_DIR) && $(realpath $(UVICORN)) app.main:app --reload --port $(BACKEND_PORT)

.PHONY: run-frontend
run-frontend: ## Start Vite frontend (port 5173)
	@echo "🚀 Starting frontend on http://localhost:$(FRONTEND_PORT) ..."
	@cd $(FRONTEND_DIR) && npm run dev -- --port $(FRONTEND_PORT)

# ──────────────────────────────────────────────────────────
# Run – Both Servers Together
# ──────────────────────────────────────────────────────────

.PHONY: run
run: ## Start backend + frontend concurrently (Ctrl-C stops both)
	@echo "🚀 Starting ScholarDock (backend + frontend)..."
	@echo "   Backend  → http://localhost:$(BACKEND_PORT)"
	@echo "   Frontend → http://localhost:$(FRONTEND_PORT)"
	@echo "   Press Ctrl-C to stop both."
	@echo ""
	@trap 'kill 0' INT TERM; \
		(cd $(BACKEND_DIR) && $(realpath $(UVICORN)) app.main:app --reload --port $(BACKEND_PORT)) & \
		(cd $(FRONTEND_DIR) && npm run dev -- --port $(FRONTEND_PORT)) & \
		wait

# ──────────────────────────────────────────────────────────
# Tests
# ──────────────────────────────────────────────────────────

.PHONY: test
test: test-backend ## Run all tests (backend)

.PHONY: test-backend
test-backend: ## Run backend pytest suite
	@echo "🧪 Running backend tests..."
	@cd $(BACKEND_DIR) && $(realpath $(PYTEST)) -v
	@echo "✅ Backend tests complete."

.PHONY: test-frontend-build
test-frontend-build: ## Verify frontend TypeScript compilation and build
	@echo "🧪 Checking frontend build..."
	@cd $(FRONTEND_DIR) && npm run build
	@echo "✅ Frontend build succeeded."

# ──────────────────────────────────────────────────────────
# Quality / Lint
# ──────────────────────────────────────────────────────────

.PHONY: check
check: test-backend test-frontend-build ## Run all tests + build check

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
