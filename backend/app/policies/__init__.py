from app.policies.engine import (
    DEFAULT_POLICY_FILE,
    Decision,
    PolicyEngine,
    authorize,
    can,
    get_policy_engine,
)
from app.policies.loader import PolicyConfigError, load_policy_file, parse_policy_set

__all__ = [
    "DEFAULT_POLICY_FILE",
    "Decision",
    "PolicyConfigError",
    "PolicyEngine",
    "authorize",
    "can",
    "get_policy_engine",
    "load_policy_file",
    "parse_policy_set",
]


def test_can_is_a_non_raising_check(world):
    assert policy_can(world.alice, "project:delete", world.project) is True
    assert policy_can(world.bob, "project:delete", world.project) is False


def test_authorize_uses_a_custom_message(world):
    with pytest.raises(NotFoundError, match="Project not found"):
        authorize(
            world.dave,
            "project:view",
            world.project,
            on_deny=NotFoundError,
            message="Project not found",
        )
