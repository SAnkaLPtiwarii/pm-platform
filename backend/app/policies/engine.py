import logging
from collections import defaultdict
from collections.abc import Mapping
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.core.exceptions import AppError, ForbiddenError
from app.policies.conditions import CONDITIONS, EvalContext
from app.policies.loader import Leaf, Node, Policy, PolicySet, load_policy_file

logger = logging.getLogger(__name__)

DEFAULT_POLICY_FILE = Path(__file__).with_name("policies.yaml")


@dataclass(frozen=True)
class Decision:
    allowed: bool
    action: str
    policy_id: str | None
    reason: str


def _evaluate_node(node: Node, ctx: EvalContext) -> bool:
    if isinstance(node, Leaf):
        return CONDITIONS[node.name].fn(ctx, node.arg)
    if node.op == "all":
        return all(_evaluate_node(child, ctx) for child in node.children)
    if node.op == "any":
        return any(_evaluate_node(child, ctx) for child in node.children)
    return not _evaluate_node(node.children[0], ctx)  # "not"


class PolicyEngine:
    def __init__(self, policy_set: PolicySet) -> None:
        self._by_action: dict[str, list[Policy]] = defaultdict(list)
        for policy in policy_set.policies:
            self._by_action[policy.action].append(policy)

    @classmethod
    def from_file(cls, path: Path) -> "PolicyEngine":
        return cls(load_policy_file(path))

    @property
    def actions(self) -> frozenset[str]:
        return frozenset(self._by_action)

    def evaluate(
        self,
        user: Any,
        action: str,
        resource: Any,
        changes: Mapping[str, Any] | None = None,
    ) -> Decision:
        policies = self._by_action.get(action)
        if not policies:
            return Decision(False, action, None, "no policy defined for this action")

        ctx = EvalContext(user, action, resource, changes or {})
        allow_match: Policy | None = None
        for policy in policies:
            if not _evaluate_node(policy.condition, ctx):
                continue
            if policy.effect == "deny":  # deny always overrides allow
                return Decision(False, action, policy.id, "denied by policy")
            allow_match = allow_match or policy

        if allow_match is not None:
            return Decision(True, action, allow_match.id, "allowed by policy")
        return Decision(False, action, None, "no policy granted access")


@lru_cache
def get_policy_engine() -> PolicyEngine:
    settings = get_settings()
    path = Path(settings.policy_file) if settings.policy_file else DEFAULT_POLICY_FILE
    engine = PolicyEngine.from_file(path)
    logger.info("Loaded %d policy actions from %s", len(engine.actions), path)
    return engine


def authorize(
    user: Any,
    action: str,
    resource: Any,
    *,
    changes: Mapping[str, Any] | None = None,
    on_deny: type[AppError] = ForbiddenError,
) -> Decision:
    """The single authorization entry point: raises `on_deny` unless a policy allows it.

    Use on_deny=NotFoundError where the existence of the resource must not leak
    (e.g. viewing a project you are not a member of).
    """
    decision = get_policy_engine().evaluate(user, action, resource, changes)
    logger.info(
        "authz user=%s action=%s allowed=%s policy=%s",
        getattr(user, "id", None),
        action,
        decision.allowed,
        decision.policy_id,
    )
    if not decision.allowed:
        details = {"action": action} if on_deny is ForbiddenError else None
        raise on_deny(details=details)
    return decision
