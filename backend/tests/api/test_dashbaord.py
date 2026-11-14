from tests.api.helpers import API, FULL, create_project, create_task, update_task

STATS = f"{API}/dashboard/stats"


def stats(client, account):
    response = client.get(STATS, headers=account.headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_dashboard_counts_only_my_projects_and_tasks(client, make_user, team):
    erin = make_user("erin")
    other = create_project(client, erin, name="Other").json()["id"]
    create_task(client, erin, other, title="Hidden")

    first = create_task(
        client, team.alice, team.project_id, title="A", assignee_id=team.bob.id, **FULL
    ).json()
    create_task(client, team.alice, team.project_id, title="B")
    assert update_task(client, team.bob, first["id"], status="completed").status_code == 200

    expected = {
        "total_projects": 1,
        "active_projects": 1,
        "total_tasks": 2,
        "completed_tasks": 1,
        "pending_tasks": 1,
    }
    assert stats(client, team.alice) == expected
    assert stats(client, team.bob) == expected  # members see the same project


def test_non_members_see_empty_statistics(client, team):
    assert stats(client, team.dave) == {
        "total_projects": 0,
        "active_projects": 0,
        "total_tasks": 0,
        "completed_tasks": 0,
        "pending_tasks": 0,
    }


def test_archived_projects_are_not_active(client, team):
    client.patch(
        f"{API}/projects/{team.project_id}",
        json={"status": "archived"},
        headers=team.alice.headers,
    )
    result = stats(client, team.alice)
    assert result["total_projects"] == 1
    assert result["active_projects"] == 0
