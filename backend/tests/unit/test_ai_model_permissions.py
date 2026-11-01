from unittest.mock import Mock, patch

from app.api.routes import AiActionExecutePayload, ai_action_execute, verify_model_permission


def test_verify_model_permission_maps_glm_models_to_glm_feature() -> None:
    current_user = {"id": 1, "roles": ["general_user"]}
    connection = Mock()
    # The catalog lookup returns (provider, is_active).
    connection.execute.return_value.fetchone.return_value = ("glm", 1)

    with patch("app.auth.limits.check_and_increment_limit") as mock_check:
        verify_model_permission("GLM-5.1", current_user, connection)

    mock_check.assert_called_once_with(current_user, "can_use_glm", 0, connection)


def test_verify_model_permission_maps_mistral_models_to_mistral_feature() -> None:
    current_user = {"id": 1, "roles": ["general_user"]}
    connection = Mock()
    connection.execute.return_value.fetchone.return_value = ("mistral", 1)

    with patch("app.auth.limits.check_and_increment_limit") as mock_check:
        verify_model_permission("mistral:mistral-large-latest", current_user, connection)

    mock_check.assert_called_once_with(current_user, "can_use_mistral", 0, connection)


def test_verify_model_permission_uses_catalog_provider_over_prefix_guess() -> None:
    """A model catalogued in ai_models resolves to its canonical provider.

    Regression guard for the prefix-guessing defect: an OpenRouter-served
    model whose id happens to look like a groq name must be gated by
    can_use_openrouter (the provider that actually serves it), not by
    whichever provider the string prefixes happened to suggest.
    """
    current_user = {"id": 1, "roles": ["general_user"]}
    connection = Mock()
    connection.execute.return_value.fetchone.return_value = ("openrouter", 1)

    with patch("app.auth.limits.check_and_increment_limit") as mock_check:
        verify_model_permission("groq/llama-3-70b", current_user, connection)

    mock_check.assert_called_once_with(current_user, "can_use_openrouter", 0, connection)


def test_verify_model_permission_falls_back_to_prefixes_when_uncatalogued() -> None:
    """A model genuinely absent from ai_models falls back to the legacy
    prefix guess."""
    current_user = {"id": 1, "roles": ["general_user"]}
    connection = Mock()
    connection.execute.return_value.fetchone.return_value = None

    with patch("app.auth.limits.check_and_increment_limit") as mock_check:
        verify_model_permission("groq/llama-3-70b", current_user, connection)

    mock_check.assert_called_once_with(current_user, "can_use_groq", 0, connection)


def test_verify_model_permission_uncatalogued_defaults_to_glm() -> None:
    current_user = {"id": 1, "roles": ["general_user"]}
    connection = Mock()
    connection.execute.return_value.fetchone.return_value = None

    with patch("app.auth.limits.check_and_increment_limit") as mock_check:
        verify_model_permission("some-unknown-model", current_user, connection)

    mock_check.assert_called_once_with(current_user, "can_use_glm", 0, connection)


def test_verify_model_permission_blocks_inactive_catalog_model() -> None:
    current_user = {"id": 1, "roles": ["general_user"]}
    connection = Mock()
    connection.execute.return_value.fetchone.return_value = ("glm", 0)

    from app.auth.limits import UsageLimitExceeded

    with patch("app.auth.limits.check_and_increment_limit"):
        try:
            verify_model_permission("GLM-5.1", current_user, connection)
            raise AssertionError("expected UsageLimitExceeded")
        except UsageLimitExceeded as exc:
            assert exc.status_code == 403


def test_verify_model_permission_skips_empty_model() -> None:
    current_user = {"id": 1, "roles": ["general_user"]}
    connection = Mock()

    with patch("app.auth.limits.check_and_increment_limit") as mock_check:
        verify_model_permission(None, current_user, connection)

    mock_check.assert_not_called()


def test_ai_action_execute_checks_agent_permission_without_consuming_usage() -> None:
    current_user = {"id": 1, "roles": ["pro_user"]}
    store = Mock()
    store.db = Mock()
    settings = Mock()
    payload = AiActionExecutePayload(plan={"actions": []})

    with patch("app.auth.limits.check_and_increment_limit") as mock_check:
        with patch("app.api.routes.AiActionService") as mock_action_service:
            mock_action_service.return_value.execute.return_value = {"ok": True}

            response = ai_action_execute(payload, store=store, settings=settings, current_user=current_user)

    assert response == {"ok": True}
    mock_check.assert_called_once_with(current_user, "can_use_agents", 0, store.db)
