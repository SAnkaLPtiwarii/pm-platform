from dataclasses import dataclass

from fastapi.testclient import TestClient
from httpx import Response

API = "/api/v1"
PASSWORD = "Passw0rd!123"
FULL = {"description": "Details", "due_date": "2030-01-31"}  # fields needed to complete


@dataclass
class Account:
    id: str
    name: str
    email: str
    access_token: str
    refresh_token: str

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.access_token}"}


def error_code(response: Response) -> str:
    return response.json()["error"]["code"]


def create_project(client: TestClient, owner: Account, name: str = "Website", **fields) -> Response:
    return client.post(f"{API}/projects", json={"name": name, **fields}, headers=owner.headers)


def add_member(client: TestClient, owner: Account, project_id: str, member: Account) -> Response:
    return client.post(
        f"{API}/projects/{project_id}/members",
        json={"email": member.email},
        headers=owner.headers,
    )


def create_task(client: TestClient, account: Account, project_id: str, **fields) -> Response:
    fields.setdefault("title", "Task")
    return client.post(f"{API}/projects/{project_id}/tasks", json=fields, headers=account.headers)


def update_task(client: TestClient, account: Account, task_id: str, **fields) -> Response:
    return client.patch(f"{API}/tasks/{task_id}", json=fields, headers=account.headers)


def get_task(client: TestClient, account: Account, task_id: str) -> Response:
    return client.get(f"{API}/tasks/{task_id}", headers=account.headers)
