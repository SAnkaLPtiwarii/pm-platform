from sqlalchemy import func, select

from app.models.audit_log import AuditLog
from tests.api.helpers import API, FULL, add_member, create_task, update_task


def activity_url(project_id):
    return f"{API}/projects/{project_id}/activity"


def count_actions(db, action):
    query = select(func.count()).select_from(AuditLog).where(AuditLog.action == action)
    return db.scalar(query)


def test_timeline_lists_actions_newest_first(client, team):
    task = create_task(
        client, team.bob, team.project_id, title="Ship", assignee_id=team.carol.id, **FULL
    ).json()
    update_task(client, team.carol, task["id"], status="in_progress")

    response = client.get(activity_url(team.project_id), headers=team.alice.headers)
    assert response.status_code == 200
    body = response.json()
    assert [item["action"] for item in body["items"]] == [
        "task.updated",
        "task.created",
        "member.added",
        "member.added",
        "project.created",
    ]
    assert body["total"] == 5

    latest = body["items"][0]
    assert latest["actor"]["name"] == "carol"
    assert latest["resource_id"] == task["id"]
    assert latest["detail"] == {
        "fields": ["status"],
        "status": {"from": "todo", "to": "in_progress"},
    }


def test_timeline_is_paginated(client, team):
    response = client.get(
        activity_url(team.project_id), params={"page_size": 2}, headers=team.alice.headers
    )
    body = response.json()
    assert len(body["items"]) == 2
    assert body["total"] == 3


def test_timeline_is_visible_to_members_only(client, team):
    assert client.get(activity_url(team.project_id), headers=team.bob.headers).status_code == 200
    assert client.get(activity_url(team.project_id), headers=team.dave.headers).status_code == 404


def test_denied_actions_are_not_recorded(client, team):
    denied = client.patch(
        f"{API}/projects/{team.project_id}", json={"name": "Hacked"}, headers=team.bob.headers
    )
    assert denied.status_code == 403
    items = client.get(activity_url(team.project_id), headers=team.alice.headers).json()["items"]
    assert "project.updated" not in [item["action"] for item in items]


def test_failed_actions_leave_no_audit_entry(client, db, team):
    assert add_member(client, team.alice, team.project_id, team.bob).status_code == 409
    assert count_actions(db, "member.added") == 2  # bob and carol, from the fixture


def test_authentication_events_are_recorded(db, make_user):
    make_user("alice")
    assert count_actions(db, "user.registered") == 1
    assert count_actions(db, "user.logged_in") == 1


def test_audit_trail_survives_deleting_the_project(client, db, team):
    client.delete(f"{API}/projects/{team.project_id}", headers=team.alice.headers)
    assert count_actions(db, "project.deleted") == 1
    assert count_actions(db, "project.created") == 1
