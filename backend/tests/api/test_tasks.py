from uuid import uuid4

import pytest

from tests.api.helpers import (
    API,
    FULL,
    create_task,
    error_code,
    get_task,
    update_task,
)


def tasks_url(project_id):
    return f"{API}/projects/{project_id}/tasks"


def task_titles(client, account, project_id, **params):
    response = client.get(tasks_url(project_id), params=params, headers=account.headers)
    assert response.status_code == 200, response.text
    return [item["title"] for item in response.json()["items"]]


@pytest.fixture
def task(client, team):
    """Created by bob, assigned to carol, with every field needed for completion."""
    response = create_task(
        client, team.bob, team.project_id, title="Ship it", assignee_id=team.carol.id, **FULL
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def board(client, team):
    """Three tasks created by alice; 'Write docs' is moved to in_progress."""
    specs = [
        {"title": "Fix login bug", "priority": "high"},
        {"title": "Write docs", "priority": "low", "description": "Explain the login page"},
        {"title": "Deploy", "priority": "high", "assignee_id": team.bob.id},
    ]
    ids = [create_task(client, team.alice, team.project_id, **spec).json()["id"] for spec in specs]
    assert update_task(client, team.alice, ids[1], status="in_progress").status_code == 200
    return ids


# --- create ---------------------------------------------------------------------------


def test_task_is_created_with_sensible_defaults(client, team):
    response = create_task(client, team.bob, team.project_id, title="  Write docs  ")
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Write docs"
    assert body["status"] == "todo"
    assert body["priority"] == "medium"
    assert body["assignee"] is None
    assert body["created_by"]["id"] == team.bob.id
    assert body["project_id"] == team.project_id


def test_tasks_always_start_as_todo(client, team):
    response = create_task(client, team.bob, team.project_id, status="completed")
    assert response.status_code == 201
    assert response.json()["status"] == "todo"


def test_non_members_cannot_create_tasks(client, team):
    response = create_task(client, team.dave, team.project_id)
    assert response.status_code == 404


def test_tasks_cannot_be_created_in_a_missing_project(client, team):
    assert create_task(client, team.bob, str(uuid4())).status_code == 404


def test_assignee_must_be_a_project_member(client, team):
    response = create_task(client, team.bob, team.project_id, assignee_id=team.dave.id)
    assert response.status_code == 422
    assert error_code(response) == "validation_error"
    assert response.json()["error"]["details"][0]["field"] == "assignee_id"


@pytest.mark.parametrize(
    "fields",
    [
        {"title": "   "},
        {"title": "x" * 201},
        {"priority": "urgent"},
        {"assignee_id": "not-a-uuid"},
        {"due_date": "tomorrow"},
    ],
)
def test_task_creation_validates_input(client, team, fields):
    response = create_task(client, team.bob, team.project_id, **fields)
    assert response.status_code == 422
    assert error_code(response) == "validation_error"


# --- list, filter, search, paginate -----------------------------------------------------


def test_filter_by_status(client, team, board):
    assert task_titles(client, team.alice, team.project_id, status="in_progress") == ["Write docs"]
    assert sorted(task_titles(client, team.alice, team.project_id, status="todo")) == [
        "Deploy",
        "Fix login bug",
    ]


def test_filter_by_priority(client, team, board):
    high = task_titles(client, team.alice, team.project_id, priority="high")
    assert sorted(high) == ["Deploy", "Fix login bug"]


def test_filters_combine(client, team, board):
    titles = task_titles(client, team.alice, team.project_id, status="todo", priority="low")
    assert titles == []


def test_filter_by_assignee(client, team, board):
    titles = task_titles(client, team.alice, team.project_id, assignee_id=team.bob.id)
    assert titles == ["Deploy"]


def test_search_matches_title_or_description_case_insensitively(client, team, board):
    assert sorted(task_titles(client, team.alice, team.project_id, search="LOGIN")) == [
        "Fix login bug",
        "Write docs",
    ]


def test_search_treats_wildcards_literally(client, team, board):
    assert task_titles(client, team.alice, team.project_id, search="%") == []


def test_tasks_are_paginated_newest_first(client, team, board):
    first = client.get(
        tasks_url(team.project_id), params={"page_size": 2}, headers=team.alice.headers
    ).json()
    assert first["total"] == 3
    assert [item["title"] for item in first["items"]] == ["Deploy", "Write docs"]
    second = client.get(
        tasks_url(team.project_id),
        params={"page": 2, "page_size": 2},
        headers=team.alice.headers,
    ).json()
    assert [item["title"] for item in second["items"]] == ["Fix login bug"]


@pytest.mark.parametrize(
    "params",
    [{"status": "bogus"}, {"priority": "bogus"}, {"page": 0}, {"page_size": 101}],
)
def test_invalid_list_parameters_are_rejected(client, team, params):
    response = client.get(tasks_url(team.project_id), params=params, headers=team.alice.headers)
    assert response.status_code == 422


def test_non_members_cannot_list_tasks(client, team, board):
    response = client.get(tasks_url(team.project_id), headers=team.dave.headers)
    assert response.status_code == 404


# --- read -----------------------------------------------------------------------------


def test_members_can_view_a_task(client, team, task):
    for member in (team.alice, team.bob, team.carol):
        response = get_task(client, member, task["id"])
        assert response.status_code == 200
        assert response.json()["title"] == "Ship it"


def test_hidden_and_missing_tasks_look_identical(client, team, task):
    hidden = get_task(client, team.dave, task["id"])
    missing = get_task(client, team.dave, str(uuid4()))
    assert hidden.status_code == missing.status_code == 404
    assert hidden.json() == missing.json()


def test_task_permissions_reflect_the_policies(client, team, task):
    def permissions(account):
        return get_task(client, account, task["id"]).json()["permissions"]

    assert permissions(team.alice) == {"update": False, "delete": True, "complete": False}
    assert permissions(team.bob) == {"update": True, "delete": False, "complete": True}
    assert permissions(team.carol) == {"update": True, "delete": False, "complete": True}


# --- update ---------------------------------------------------------------------------


def test_creator_and_assignee_can_update_a_task(client, team, task):
    by_creator = update_task(client, team.bob, task["id"], title="By creator", priority="high")
    assert by_creator.status_code == 200
    assert by_creator.json()["title"] == "By creator"
    assert by_creator.json()["priority"] == "high"
    by_assignee = update_task(client, team.carol, task["id"], status="in_progress")
    assert by_assignee.status_code == 200
    assert by_assignee.json()["status"] == "in_progress"


def test_project_owner_is_not_automatically_allowed_to_edit_tasks(client, team, task):
    response = update_task(client, team.alice, task["id"], title="Owner edit")
    assert response.status_code == 403
    assert response.json()["error"]["details"] == {"action": "task:update"}


def test_other_members_cannot_update_a_task(client, team):
    unassigned = create_task(client, team.alice, team.project_id, title="Mine").json()
    for member in (team.bob, team.carol):
        assert update_task(client, member, unassigned["id"], title="x").status_code == 403
    assert update_task(client, team.alice, unassigned["id"], title="Mine v2").status_code == 200


def test_non_members_cannot_update_a_task(client, team, task):
    assert update_task(client, team.dave, task["id"], title="x").status_code == 404


def test_assignee_can_be_changed_or_cleared(client, team, task):
    cleared = update_task(client, team.bob, task["id"], assignee_id=None)
    assert cleared.status_code == 200
    assert cleared.json()["assignee"] is None
    reassigned = update_task(client, team.bob, task["id"], assignee_id=team.alice.id)
    assert reassigned.json()["assignee"]["id"] == team.alice.id


def test_update_validates_the_assignee_and_payload(client, team, task):
    outsider = update_task(client, team.bob, task["id"], assignee_id=team.dave.id)
    assert outsider.status_code == 422
    for payload in ({}, {"title": None}, {"status": None}, {"status": "archived"}):
        assert update_task(client, team.bob, task["id"], **payload).status_code == 422


# --- completion policy ----------------------------------------------------------------


def test_assignee_can_complete_a_task(client, team, task):
    response = update_task(client, team.carol, task["id"], status="completed")
    assert response.status_code == 200
    assert response.json()["status"] == "completed"


def test_completion_requires_an_assignee(client, team):
    created = create_task(client, team.bob, team.project_id, title="No owner", **FULL).json()
    response = update_task(client, team.bob, created["id"], status="completed")
    assert response.status_code == 403
    assert response.json()["error"]["details"] == {"action": "task:complete"}


def test_completion_requires_all_required_fields(client, team):
    created = create_task(
        client, team.bob, team.project_id, title="Bare", assignee_id=team.carol.id
    ).json()
    assert update_task(client, team.bob, created["id"], status="completed").status_code == 403
    response = update_task(client, team.bob, created["id"], status="completed", **FULL)
    assert response.status_code == 200
    assert response.json()["status"] == "completed"


def test_assigning_and_completing_in_one_request(client, team):
    created = create_task(client, team.bob, team.project_id, title="One shot", **FULL).json()
    response = update_task(
        client, team.bob, created["id"], assignee_id=team.carol.id, status="completed"
    )
    assert response.status_code == 200
    assert response.json()["assignee"]["id"] == team.carol.id


def test_cannot_unassign_while_completing(client, team, task):
    response = update_task(client, team.bob, task["id"], assignee_id=None, status="completed")
    assert response.status_code == 403
    unchanged = get_task(client, team.bob, task["id"]).json()
    assert unchanged["assignee"]["id"] == team.carol.id
    assert unchanged["status"] == "todo"


# --- delete policy --------------------------------------------------------------------


def test_only_the_owner_can_delete_a_todo_task(client, team, task):
    url = f"{API}/tasks/{task['id']}"
    assert client.delete(url, headers=team.bob.headers).status_code == 403  # creator
    assert client.delete(url, headers=team.carol.headers).status_code == 403  # assignee
    assert client.delete(url, headers=team.alice.headers).status_code == 204
    assert get_task(client, team.alice, task["id"]).status_code == 404


@pytest.mark.parametrize("status", ["in_progress", "completed"])
def test_tasks_that_are_not_todo_cannot_be_deleted(client, team, task, status):
    assert update_task(client, team.carol, task["id"], status=status).status_code == 200
    response = client.delete(f"{API}/tasks/{task['id']}", headers=team.alice.headers)
    assert response.status_code == 403
    assert response.json()["error"]["details"] == {"action": "task:delete"}


def test_non_members_cannot_delete_a_task(client, team, task):
    response = client.delete(f"{API}/tasks/{task['id']}", headers=team.dave.headers)
    assert response.status_code == 404
