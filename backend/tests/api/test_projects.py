from uuid import uuid4

import pytest
from sqlalchemy import func, select

from app.models.project_member import ProjectMember
from app.models.task import Task
from tests.api.helpers import API, add_member, create_project, create_task, error_code

PROJECTS = f"{API}/projects"


def project_url(project_id, suffix=""):
    return f"{PROJECTS}/{project_id}{suffix}"


def project_names(client, account, **params):
    response = client.get(PROJECTS, params=params, headers=account.headers)
    return sorted(item["name"] for item in response.json()["items"])


PROTECTED_ENDPOINTS = [
    ("get", "/projects"),
    ("post", "/projects"),
    ("get", f"/projects/{uuid4()}"),
    ("patch", f"/projects/{uuid4()}"),
    ("delete", f"/projects/{uuid4()}"),
    ("get", f"/projects/{uuid4()}/members"),
    ("get", f"/projects/{uuid4()}/tasks"),
    ("post", f"/projects/{uuid4()}/tasks"),
    ("get", f"/tasks/{uuid4()}"),
    ("patch", f"/tasks/{uuid4()}"),
    ("delete", f"/tasks/{uuid4()}"),
    ("get", "/dashboard/stats"),
]


@pytest.mark.parametrize(("method", "path"), PROTECTED_ENDPOINTS)
def test_endpoints_require_authentication(client, method, path):
    response = client.request(method, f"{API}{path}", json={})
    assert response.status_code == 401
    assert error_code(response) == "unauthorized"


# --- create ---------------------------------------------------------------------------


def test_creating_a_project_makes_the_creator_owner_and_member(client, make_user):
    alice = make_user("alice")
    response = create_project(client, alice, description="Marketing site")
    assert response.status_code == 201
    body = response.json()
    assert body["owner_id"] == alice.id
    assert body["status"] == "active"
    assert body["member_count"] == 1
    assert body["permissions"] == {"update": True, "delete": True, "manage_members": True}


@pytest.mark.parametrize("payload", [{}, {"name": "   "}, {"name": "x" * 151}])
def test_project_creation_validates_input(client, make_user, payload):
    alice = make_user("alice")
    response = client.post(PROJECTS, json=payload, headers=alice.headers)
    assert response.status_code == 422
    assert error_code(response) == "validation_error"


# --- list -----------------------------------------------------------------------------


def test_list_only_shows_projects_the_user_belongs_to(client, team):
    mine = client.get(PROJECTS, headers=team.bob.headers).json()
    assert mine["total"] == 1
    assert mine["items"][0]["id"] == team.project_id
    outsider = client.get(PROJECTS, headers=team.dave.headers).json()
    assert outsider == {"items": [], "total": 0, "page": 1, "page_size": 20}


def test_project_list_is_paginated_newest_first(client, make_user):
    alice = make_user("alice")
    for index in range(5):
        create_project(client, alice, name=f"P{index}")
    first = client.get(PROJECTS, params={"page_size": 2}, headers=alice.headers).json()
    assert first["total"] == 5
    assert [item["name"] for item in first["items"]] == ["P4", "P3"]
    last = client.get(PROJECTS, params={"page": 3, "page_size": 2}, headers=alice.headers).json()
    assert [item["name"] for item in last["items"]] == ["P0"]
    beyond = client.get(PROJECTS, params={"page": 9}, headers=alice.headers).json()
    assert beyond["items"] == []
    assert beyond["total"] == 5


@pytest.mark.parametrize("params", [{"page": 0}, {"page_size": 0}, {"page_size": 101}])
def test_invalid_pagination_is_rejected(client, make_user, params):
    alice = make_user("alice")
    response = client.get(PROJECTS, params=params, headers=alice.headers)
    assert response.status_code == 422


def test_project_list_filters_by_status_and_search(client, make_user):
    alice = make_user("alice")
    create_project(client, alice, name="Website redesign")
    old = create_project(client, alice, name="Old campaign").json()
    client.patch(project_url(old["id"]), json={"status": "archived"}, headers=alice.headers)

    assert project_names(client, alice, status="active") == ["Website redesign"]
    assert project_names(client, alice, status="archived") == ["Old campaign"]
    assert project_names(client, alice, search="WEBSITE") == ["Website redesign"]
    assert project_names(client, alice, search="nothing") == []


def test_search_treats_wildcards_literally(client, make_user):
    alice = make_user("alice")
    create_project(client, alice, name="100% done")
    create_project(client, alice, name="Other")
    assert project_names(client, alice, search="%") == ["100% done"]
    assert project_names(client, alice, search="_") == []


def test_list_reports_member_and_task_counts(client, team):
    create_task(client, team.alice, team.project_id, title="One")
    create_task(client, team.alice, team.project_id, title="Two")
    item = client.get(PROJECTS, headers=team.alice.headers).json()["items"][0]
    assert item["member_count"] == 3
    assert item["task_count"] == 2
    assert item["completed_task_count"] == 0


# --- read -----------------------------------------------------------------------------


def test_member_can_view_a_project_but_has_no_edit_permissions(client, team):
    response = client.get(project_url(team.project_id), headers=team.bob.headers)
    assert response.status_code == 200
    assert response.json()["permissions"] == {
        "update": False,
        "delete": False,
        "manage_members": False,
    }


def test_hidden_and_missing_projects_look_identical(client, team):
    hidden = client.get(project_url(team.project_id), headers=team.dave.headers)
    missing = client.get(project_url(uuid4()), headers=team.dave.headers)
    assert hidden.status_code == missing.status_code == 404
    assert hidden.json() == missing.json()


def test_invalid_project_id_is_a_validation_error(client, make_user):
    alice = make_user("alice")
    response = client.get(project_url("not-a-uuid"), headers=alice.headers)
    assert response.status_code == 422


# --- update ---------------------------------------------------------------------------


def test_owner_can_update_a_project(client, team):
    response = client.patch(
        project_url(team.project_id),
        json={"name": "Renamed", "status": "archived"},
        headers=team.alice.headers,
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"
    assert response.json()["status"] == "archived"


def test_member_cannot_update_a_project(client, team):
    response = client.patch(
        project_url(team.project_id), json={"name": "Hacked"}, headers=team.bob.headers
    )
    assert response.status_code == 403
    assert error_code(response) == "forbidden"
    assert response.json()["error"]["details"] == {"action": "project:update"}
    unchanged = client.get(project_url(team.project_id), headers=team.alice.headers)
    assert unchanged.json()["name"] == "Website"


def test_non_member_cannot_update_a_project(client, team):
    response = client.patch(
        project_url(team.project_id), json={"name": "Hacked"}, headers=team.dave.headers
    )
    assert response.status_code == 404


@pytest.mark.parametrize(
    "payload",
    [{}, {"name": None}, {"status": None}, {"status": "deleted"}, {"name": ""}],
)
def test_project_update_rejects_invalid_payloads(client, team, payload):
    response = client.patch(project_url(team.project_id), json=payload, headers=team.alice.headers)
    assert response.status_code == 422


# --- delete ---------------------------------------------------------------------------


def test_owner_can_delete_a_project(client, team):
    response = client.delete(project_url(team.project_id), headers=team.alice.headers)
    assert response.status_code == 204
    gone = client.get(project_url(team.project_id), headers=team.alice.headers)
    assert gone.status_code == 404


def test_member_cannot_delete_a_project(client, team):
    response = client.delete(project_url(team.project_id), headers=team.bob.headers)
    assert response.status_code == 403
    still_there = client.get(project_url(team.project_id), headers=team.alice.headers)
    assert still_there.status_code == 200


def test_non_member_cannot_delete_a_project(client, team):
    response = client.delete(project_url(team.project_id), headers=team.dave.headers)
    assert response.status_code == 404


def test_deleting_a_project_removes_its_tasks_and_memberships(client, db, team):
    create_task(client, team.alice, team.project_id, title="Doomed")
    client.delete(project_url(team.project_id), headers=team.alice.headers)
    assert db.scalar(select(func.count()).select_from(Task)) == 0
    assert db.scalar(select(func.count()).select_from(ProjectMember)) == 0


# --- members --------------------------------------------------------------------------


def test_members_can_list_the_team(client, team):
    response = client.get(project_url(team.project_id, "/members"), headers=team.bob.headers)
    assert response.status_code == 200
    members = response.json()
    assert sorted(member["name"] for member in members) == ["alice", "bob", "carol"]
    assert [member["name"] for member in members if member["is_owner"]] == ["alice"]


def test_non_members_cannot_list_the_team(client, team):
    response = client.get(project_url(team.project_id, "/members"), headers=team.dave.headers)
    assert response.status_code == 404


def test_owner_can_add_a_member_by_email(client, make_user, team):
    response = client.post(
        project_url(team.project_id, "/members"),
        json={"email": "DAVE@example.com"},
        headers=team.alice.headers,
    )
    assert response.status_code == 201
    assert response.json()["user_id"] == team.dave.id
    visible = client.get(project_url(team.project_id), headers=team.dave.headers)
    assert visible.status_code == 200


def test_adding_the_same_member_twice_conflicts(client, team):
    response = add_member(client, team.alice, team.project_id, team.bob)
    assert response.status_code == 409


def test_adding_an_unknown_email_is_not_found(client, team):
    response = client.post(
        project_url(team.project_id, "/members"),
        json={"email": "nobody@example.com"},
        headers=team.alice.headers,
    )
    assert response.status_code == 404


def test_only_the_owner_can_add_members(client, team):
    by_member = add_member(client, team.bob, team.project_id, team.dave)
    assert by_member.status_code == 403
    by_outsider = add_member(client, team.dave, team.project_id, team.dave)
    assert by_outsider.status_code == 404


def test_owner_can_remove_a_member(client, team):
    response = client.delete(
        project_url(team.project_id, f"/members/{team.bob.id}"), headers=team.alice.headers
    )
    assert response.status_code == 204
    lost_access = client.get(project_url(team.project_id), headers=team.bob.headers)
    assert lost_access.status_code == 404


def test_the_owner_cannot_be_removed(client, team):
    response = client.delete(
        project_url(team.project_id, f"/members/{team.alice.id}"), headers=team.alice.headers
    )
    assert response.status_code == 409


def test_removing_someone_who_is_not_a_member_is_not_found(client, team):
    response = client.delete(
        project_url(team.project_id, f"/members/{uuid4()}"), headers=team.alice.headers
    )
    assert response.status_code == 404


def test_members_cannot_remove_other_members(client, team):
    response = client.delete(
        project_url(team.project_id, f"/members/{team.carol.id}"), headers=team.bob.headers
    )
    assert response.status_code == 403


def test_removing_a_member_unassigns_their_tasks(client, team):
    created = create_task(
        client, team.alice, team.project_id, title="Task", assignee_id=team.bob.id
    ).json()
    client.delete(
        project_url(team.project_id, f"/members/{team.bob.id}"), headers=team.alice.headers
    )
    task = client.get(f"{API}/tasks/{created['id']}", headers=team.alice.headers).json()
    assert task["assignee"] is None
