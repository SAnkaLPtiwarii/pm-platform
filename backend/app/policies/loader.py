import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, ValidationError

from app.policies.conditions import CONDITIONS

ACTION_PATTERN = re.compile(r"^[a-z_]+:[a-z_]+$")


class PolicyConfigError(Exception):
    """Raised at startup when the policy file is missing or invalid."""


@dataclass(frozen=True)
class Leaf:
    name: str
    arg: Any = None


@dataclass(frozen=True)
class Group:
    op: Literal["all", "any", "not"]
    children: tuple["Node", ...]


Node = Leaf | Group


@dataclass(frozen=True)
class Policy:
    id: str
    action: str
    effect: Literal["allow", "deny"]
    description: str
    condition: Node


@dataclass(frozen=True)
class PolicySet:
    policies: tuple[Policy, ...]


class _PolicyModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    action: str
    effect: Literal["allow", "deny"] = "allow"
    description: str = ""
    conditions: Any


class _PolicyFileModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Literal[1]
    default_effect: Literal["deny"] = "deny"  # the only safe default
    policies: list[_PolicyModel]


def _leaf(name: Any, arg: Any, where: str) -> Leaf:
    spec = CONDITIONS.get(name) if isinstance(name, str) else None
    if spec is None:
        raise PolicyConfigError(f"{where}: unknown condition {name!r}")
    if spec.needs_arg and arg is None:
        raise PolicyConfigError(f"{where}: condition '{name}' requires an argument")
    if not spec.needs_arg and arg is not None:
        raise PolicyConfigError(f"{where}: condition '{name}' takes no argument")
    if spec.validate is not None:
        try:
            spec.validate(arg)
        except ValueError as exc:
            raise PolicyConfigError(f"{where}: condition '{name}' {exc}") from exc
    return Leaf(name, arg)


def _parse_node(raw: Any, where: str) -> Node:
    if isinstance(raw, str):
        return _leaf(raw, None, where)
    if isinstance(raw, dict):
        if len(raw) != 1:
            raise PolicyConfigError(f"{where}: a condition needs exactly one key, got {list(raw)}")
        ((key, value),) = raw.items()
        if key in ("all", "any"):
            if not isinstance(value, list) or not value:
                raise PolicyConfigError(f"{where}: '{key}' needs a non-empty list")
            children = tuple(
                _parse_node(item, f"{where}.{key}[{index}]") for index, item in enumerate(value)
            )
            return Group(key, children)
        if key == "not":
            return Group("not", (_parse_node(value, f"{where}.not"),))
        return _leaf(key, value, where)
    raise PolicyConfigError(f"{where}: invalid condition {raw!r}")


def parse_policy_set(data: Any) -> PolicySet:
    if not isinstance(data, dict):
        raise PolicyConfigError("Policy file must contain a mapping at the top level")
    try:
        parsed = _PolicyFileModel.model_validate(data)
    except ValidationError as exc:
        raise PolicyConfigError(f"Invalid policy file structure: {exc}") from exc

    seen: set[str] = set()
    policies: list[Policy] = []
    for item in parsed.policies:
        if item.id in seen:
            raise PolicyConfigError(f"Duplicate policy id '{item.id}'")
        seen.add(item.id)
        if not ACTION_PATTERN.match(item.action):
            raise PolicyConfigError(
                f"policy '{item.id}': action '{item.action}' must look like 'resource:verb'"
            )
        condition = _parse_node(item.conditions, f"policy '{item.id}'")
        policies.append(Policy(item.id, item.action, item.effect, item.description, condition))
    return PolicySet(tuple(policies))


def load_policy_file(path: Path) -> PolicySet:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise PolicyConfigError(f"Cannot read policy file {path}: {exc}") from exc
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise PolicyConfigError(f"Policy file {path} is not valid YAML: {exc}") from exc
    return parse_policy_set(data)
