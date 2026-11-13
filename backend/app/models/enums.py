import enum


class ProjectStatus(str, enum.Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class TaskStatus(str, enum.Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class TaskPriority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


def enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    """Store the lowercase values in Postgres, not the member names."""
    return [member.value for member in enum_cls]
