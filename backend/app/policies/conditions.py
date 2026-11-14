from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class EvalContext:
    """Everything a condition may look at.

    `resource` is a Project or a Task (duck-typed, so unit tests need no database).
    `changes` holds proposed field values (e.g. from an update request), so a
    policy is checked against the state the task WOULD have after the change.
    """

    user: Any
    action: str
    resource: Any
    changes: Mapping[str, Any] = field(default_factory=dict)

    @property
    def user_id(self) -> Any:
        return getattr(self.user, "id", None)

    @property
    def task(self) -> Any | None:
        return self.resource if hasattr(self.resource, "assignee_id") else None

    @property
    def project(self) -> Any:
        # A Task points at its project; a Project is its own project.
        return getattr(self.resource, "project", self.resource)

    def task_value(self, name: str) -> Any:
        if name in self.changes:
            return self.changes[name]
        return getattr(self.task, name, None)


ConditionFn = Callable[[EvalContext, Any], bool]


@dataclass(frozen=True)
class ConditionSpec:
    fn: ConditionFn
    needs_arg: bool
    validate: Callable[[Any], None] | None = None


CONDITIONS: dict[str, ConditionSpec] = {}


def condition(
    name: str, *, needs_arg: bool = False, validate: Callable[[Any], None] | None = None
) -> Callable[[ConditionFn], ConditionFn]:
    def register(fn: ConditionFn) -> ConditionFn:
        CONDITIONS[name] = ConditionSpec(fn, needs_arg, validate)
        return fn

    return register


def _normalize(value: Any) -> Any:
    return getattr(value, "value", value)  # Enum member -> its plain value


def _is_blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def _validate_str_or_list(arg: Any) -> None:
    values = arg if isinstance(arg, list) else [arg]
    if not values or not all(isinstance(v, str) and v for v in values):
        raise ValueError("expects a string or a list of strings")


def _validate_field_list(arg: Any) -> None:
    if not isinstance(arg, list) or not arg or not all(isinstance(v, str) and v for v in arg):
        raise ValueError("expects a non-empty list of field names")


@condition("is_authenticated")
def is_authenticated(ctx: EvalContext, _arg: Any) -> bool:
    return ctx.user_id is not None


@condition("is_project_owner")
def is_project_owner(ctx: EvalContext, _arg: Any) -> bool:
    return ctx.user_id is not None and ctx.project.owner_id == ctx.user_id


@condition("is_project_member")
def is_project_member(ctx: EvalContext, _arg: Any) -> bool:
    if ctx.user_id is None:
        return False
    return any(member.user_id == ctx.user_id for member in ctx.project.members)


@condition("is_task_creator")
def is_task_creator(ctx: EvalContext, _arg: Any) -> bool:
    return (
        ctx.task is not None and ctx.user_id is not None and ctx.task.created_by_id == ctx.user_id
    )


@condition("is_task_assignee")
def is_task_assignee(ctx: EvalContext, _arg: Any) -> bool:
    return ctx.task is not None and ctx.user_id is not None and ctx.task.assignee_id == ctx.user_id


@condition("task_status_is", needs_arg=True, validate=_validate_str_or_list)
def task_status_is(ctx: EvalContext, arg: Any) -> bool:
    if ctx.task is None:
        return False
    allowed = arg if isinstance(arg, list) else [arg]
    return _normalize(ctx.task_value("status")) in allowed


@condition("has_assignee")
def has_assignee(ctx: EvalContext, _arg: Any) -> bool:
    return ctx.task is not None and ctx.task_value("assignee_id") is not None


@condition("required_fields_present", needs_arg=True, validate=_validate_field_list)
def required_fields_present(ctx: EvalContext, arg: Any) -> bool:
    if ctx.task is None:
        return False
    return all(not _is_blank(ctx.task_value(name)) for name in arg)
