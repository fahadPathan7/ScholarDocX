from unittest.mock import Mock, patch

from app.api.routes import AiActionExecutePayload, ai_action_execute, verify_model_permission


def test_verify_model_permission_maps_glm_models_to_glm_feature() -> None:
    current_user = {"id": 1, "roles": ["general_user"]}
    connection = Mock()
    connection.execute.return_value.fetchone.return_value = (1,)

    with patch("app.auth.limits.check_and_increment_limit") as mock_check:
        verify_model_permission("GLM-5.1", current_user, connection)

    mock_check.assert_called_once_with(current_user, "can_use_glm", 0, connection)


def test_verify_model_permission_maps_mistral_models_to_mistral_feature() -> None:
    current_user = {"id": 1, "roles": ["general_user"]}
    connection = Mock()
    connection.execute.return_value.fetchone.return_value = (1,)

    with patch("app.auth.limits.check_and_increment_limit") as mock_check:
        verify_model_permission("mistral:mistral-large-latest", current_user, connection)

    mock_check.assert_called_once_with(current_user, "can_use_mistral", 0, connection)


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
