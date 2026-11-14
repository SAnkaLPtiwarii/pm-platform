from tests.api.helpers import API, FULL, add_member, create_project, create_task, update_task


def test_end_to_end_project_workflow(client, make_user):
    maya, noah = make_user("maya"), make_user("noah")

    project = create_project(client, maya, name="Launch").json()
    assert add_member(client, maya, project["id"], noah).status_code == 201

    task = create_task(
        client, maya, project["id"], title="Ship", assignee_id=noah.id, priority="high", **FULL
    ).json()
    assert update_task(client, noah, task["id"], status="in_progress").status_code == 200
    assert update_task(client, noah, task["id"], status="completed").status_code == 200

    done = client.get(
        f"{API}/projects/{project['id']}/tasks",
        params={"status": "completed"},
        headers=noah.headers,
    ).json()
    assert done["total"] == 1

    stats = client.get(f"{API}/dashboard/stats", headers=maya.headers).json()
    assert stats["completed_tasks"] == 1
    assert stats["pending_tasks"] == 0

    # a completed task can no longer be deleted, even by the owner
    assert client.delete(f"{API}/tasks/{task['id']}", headers=maya.headers).status_code == 403

    # removing noah revokes his access
    removed = client.delete(
        f"{API}/projects/{project['id']}/members/{noah.id}", headers=maya.headers
    )
    assert removed.status_code == 204
    assert client.get(f"{API}/projects/{project['id']}", headers=noah.headers).status_code == 404

    # deleting the project removes its tasks
    assert client.delete(f"{API}/projects/{project['id']}", headers=maya.headers).status_code == 204
    assert client.get(f"{API}/tasks/{task['id']}", headers=maya.headers).status_code == 404
