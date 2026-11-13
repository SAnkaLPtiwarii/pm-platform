import enum


class ProjectStatus(enum.StrEnum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class TaskStatus(enum.StrEnum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class TaskPriority(enum.StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


def enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    """Store the lowercase values in Postgres, not the member names."""
    return [member.value for member in enum_cls]