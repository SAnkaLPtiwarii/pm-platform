from datetime import date
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.core.exceptions import ForbiddenError, NotFoundError
from app.models.enums import TaskPriority, TaskStatus
from app.policies import (
    DEFAULT_POLICY_FILE,
    PolicyConfigError,
    PolicyEngine,
    authorize,
    load_policy_file,
    parse_policy_set,
)
from app.policies import can as policy_can

EXPECTED_ACTIONS = {
    "project:create",
    "project:view",
    "project:update",
    "project:delete",
    "project:manage_members",
    "task:create",
    "task:view",
    "task:update",
    "task:delete",
    "task:complete",
}


# --- helpers: lightweight stand-ins for ORM objects (no database needed) ------------


def make_user():
    return SimpleNamespace(id=uuid4())


def make_project(owner, members):
    return SimpleNamespace(
        id=uuid4(),
        owner_id=owner.id,
        members=[SimpleNamespace(user_id=member.id) for member in members],
    )


def make_task(project, creator, assignee=None, **overrides):
    fields = {
        "project": project,
        "project_id": project.id,
        "created_by_id": creator.id,
        "assignee_id": assignee.id if assignee else None,
        "title": "Write report",
        "description": "Quarterly numbers",
        "status": TaskStatus.TODO,
        "priority": TaskPriority.MEDIUM,
        "due_date": date(2030, 1, 31),
    }
    fields.update(overrides)
    return SimpleNamespace(**fields)


def can(engine, user, action, resource, changes=None):
    return engine.evaluate(user, action, resource, changes).allowed


@pytest.fixture(scope="module")
def engine():
    return PolicyEngine.from_file(DEFAULT_POLICY_FILE)


@pytest.fixture
def world():
    """alice owns the project; bob and carol are members; dave is an outsider."""
    alice, bob, carol, dave = (make_user() for _ in range(4))
    project = make_project(owner=alice, members=[alice, bob, carol])
    return SimpleNamespace(alice=alice, bob=bob, carol=carol, dave=dave, project=project)


def policy(conditions, *, policy_id="p", action="project:view", effect="allow"):
    return {
        "id": policy_id,
        "action": action,
        "effect": effect,
        "conditions": conditions,
    }


# --- project policies ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("who", "action", "expected"),
    [
        ("alice", "project:view", True),  # owner is a member
        ("bob", "project:view", True),
        ("dave", "project:view", False),  # non-member cannot view
        ("alice", "project:update", True),
        ("bob", "project:update", False),  # member but not owner
        ("dave", "project:update", False),
        ("alice", "project:delete", True),
        ("bob", "project:delete", False),
        ("dave", "project:delete", False),
        ("alice", "project:manage_members", True),
        ("bob", "project:manage_members", False),
        ("dave", "project:manage_members", False),
    ],
)
def test_project_policies(engine, world, who, action, expected):
    assert can(engine, getattr(world, who), action, world.project) is expected


def test_any_authenticated_user_can_create_a_project(engine, world):
    assert can(engine, world.dave, "project:create", None) is True


def test_anonymous_user_cannot_create_a_project(engine):
    assert can(engine, None, "project:create", None) is False


# --- task creation and viewing ------------------------------------------------------


@pytest.mark.parametrize(
    ("who", "action", "expected"),
    [
        ("alice", "task:create", True),
        ("bob", "task:create", True),
        ("dave", "task:create", False),  # only members may create tasks
        ("bob", "task:view", True),
        ("dave", "task:view", False),
    ],
)
def test_task_create_and_view(engine, world, who, action, expected):
    # task:create is checked against the project; task:view against the task.
    resource = world.project
    if action == "task:view":
        resource = make_task(world.project, creator=world.bob)
    assert can(engine, getattr(world, who), action, resource) is expected


# --- task update --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("who", "expected"),
    [
        ("bob", True),  # creator
        ("carol", True),  # assignee
        ("alice", False),  # project owner is neither creator nor assignee
        ("dave", False),
    ],
)
def test_task_update(engine, world, who, expected):
    task = make_task(world.project, creator=world.bob, assignee=world.carol)
    assert can(engine, getattr(world, who), "task:update", task) is expected


def test_unassigned_task_cannot_be_updated_by_other_members(engine, world):
    task = make_task(world.project, creator=world.bob)
    assert can(engine, world.carol, "task:update", task) is False


# --- task delete --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("status", "who", "expected"),
    [
        (TaskStatus.TODO, "alice", True),  # owner + Todo
        (TaskStatus.TODO, "bob", False),  # Todo but not the owner (even the creator)
        (TaskStatus.TODO, "dave", False),
        (TaskStatus.IN_PROGRESS, "alice", False),  # owner but not Todo
        (TaskStatus.COMPLETED, "alice", False),
    ],
)
def test_task_delete(engine, world, status, who, expected):
    task = make_task(world.project, creator=world.bob, assignee=world.carol, status=status)
    assert can(engine, getattr(world, who), "task:delete", task) is expected


# --- task completion ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({}, True),  # assignee set and every required field filled
        ({"assignee_id": None}, False),  # no assignee
        ({"description": None}, False),
        ({"description": "   "}, False),  # whitespace only counts as empty
        ({"title": ""}, False),
        ({"due_date": None}, False),
        ({"priority": None}, False),
    ],
)
def test_task_completion(engine, world, overrides, expected):
    task = make_task(world.project, creator=world.bob, assignee=world.carol, **overrides)
    assert can(engine, world.carol, "task:complete", task) is expected


def test_completion_is_checked_against_the_proposed_state_assigning(engine, world):
    task = make_task(world.project, creator=world.bob)  # currently unassigned
    changes = {"assignee_id": world.carol.id}
    assert can(engine, world.bob, "task:complete", task) is False
    assert can(engine, world.bob, "task:complete", task, changes) is True


def test_completion_is_checked_against_the_proposed_state_unassigning(engine, world):
    task = make_task(world.project, creator=world.bob, assignee=world.carol)
    assert can(engine, world.bob, "task:complete", task, {"assignee_id": None}) is False


def test_completion_is_checked_against_the_proposed_state_blanking_a_field(engine, world):
    task = make_task(world.project, creator=world.bob, assignee=world.carol)
    assert can(engine, world.bob, "task:complete", task, {"description": ""}) is False


# --- engine behaviour ---------------------------------------------------------------


def test_shipped_policy_file_covers_every_action(engine):
    assert engine.actions == EXPECTED_ACTIONS


def test_unknown_action_is_denied_by_default(engine, world):
    decision = engine.evaluate(world.alice, "project:launch_rocket", world.project)
    assert decision.allowed is False
    assert decision.policy_id is None


def test_missing_user_is_denied_without_crashing(engine, world):
    assert can(engine, None, "project:view", world.project) is False


def test_decision_reports_the_matching_policy(engine, world):
    decision = engine.evaluate(world.alice, "project:update", world.project)
    assert decision.allowed is True
    assert decision.policy_id == "project-update"


def test_deny_policy_overrides_allow(world):
    engine = PolicyEngine(
        parse_policy_set(
            {
                "version": 1,
                "policies": [
                    policy("is_authenticated", policy_id="allow-all"),
                    policy("is_project_owner", policy_id="block-owner", effect="deny"),
                ],
            }
        )
    )
    assert can(engine, world.bob, "project:view", world.project) is True
    decision = engine.evaluate(world.alice, "project:view", world.project)
    assert decision.allowed is False
    assert decision.policy_id == "block-owner"


def test_not_operator(world):
    engine = PolicyEngine(
        parse_policy_set(
            {"version": 1, "policies": [policy({"not": "is_project_owner"})]},
        )
    )
    assert can(engine, world.bob, "project:view", world.project) is True
    assert can(engine, world.alice, "project:view", world.project) is False


def test_rules_are_configuration_not_code(world):
    """Changing the YAML changes behaviour: here the owner may also update any task."""
    custom = {
        "version": 1,
        "policies": [
            policy(
                {"any": ["is_task_creator", "is_task_assignee", "is_project_owner"]},
                policy_id="task-update",
                action="task:update",
            )
        ],
    }
    engine = PolicyEngine(parse_policy_set(custom))
    task = make_task(world.project, creator=world.bob, assignee=world.carol)
    assert can(engine, world.alice, "task:update", task) is True


# --- policy file validation (fail fast at startup) ----------------------------------


@pytest.mark.parametrize(
    "bad_data",
    [
        [],  # not a mapping
        {"version": 1, "policies": [policy("is_wizard")]},  # unknown condition
        {"version": 1, "policies": [policy({"task_status_is": None})]},  # missing argument
        {"version": 1, "policies": [policy({"is_project_owner": "yes"})]},  # unexpected argument
        {"version": 1, "policies": [policy({"required_fields_present": []})]},  # empty list
        {"version": 1, "policies": [policy({"all": []})]},  # empty group
        {
            "version": 1,
            "policies": [policy({"all": ["is_project_owner"], "any": ["is_authenticated"]})],
        },
        {"version": 1, "policies": [policy("is_authenticated", action="ProjectView")]},
        {"version": 1, "policies": [policy("is_authenticated"), policy("is_authenticated")]},
        {"version": 1, "polices": []},  # typo in a top-level key
        {"version": 2, "policies": []},  # unsupported version
    ],
)
def test_invalid_policy_files_are_rejected(bad_data):
    with pytest.raises(PolicyConfigError):
        parse_policy_set(bad_data)


def test_invalid_yaml_is_rejected(tmp_path: Path):
    path = tmp_path / "broken.yaml"
    path.write_text("policies: [unclosed", encoding="utf-8")
    with pytest.raises(PolicyConfigError):
        load_policy_file(path)


def test_missing_policy_file_is_rejected(tmp_path: Path):
    with pytest.raises(PolicyConfigError):
        load_policy_file(tmp_path / "does-not-exist.yaml")


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


# --- the authorize() entry point ----------------------------------------------------


def test_authorize_returns_the_decision_when_allowed(world):
    decision = authorize(world.alice, "project:delete", world.project)
    assert decision.allowed is True


def test_authorize_raises_forbidden_when_denied(world):
    with pytest.raises(ForbiddenError) as excinfo:
        authorize(world.bob, "project:delete", world.project)
    assert excinfo.value.details == {"action": "project:delete"}


def test_authorize_can_hide_the_resource_with_not_found(world):
    with pytest.raises(NotFoundError):
        authorize(world.dave, "project:view", world.project, on_deny=NotFoundError)
