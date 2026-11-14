from dataclasses import dataclass

from pydantic import BaseModel


class Page[T](BaseModel):
    """Standard paginated list envelope, shared by projects and tasks."""

    items: list[T]
    total: int
    page: int
    page_size: int


@dataclass(frozen=True)
class PageParams:
    page: int = 1
    page_size: int = 20

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size
