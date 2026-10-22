#!/usr/bin/env python3
"""Exercise dealer HTTP journeys against disposable Compose services."""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = "http://localhost:8080"
owner = os.environ["DEALER_ACCEPTANCE_OWNER_SESSION"]
outsider = os.environ["DEALER_ACCEPTANCE_OTHER_SESSION"]
key = str(uuid.uuid4())


def request(method, path, body=None, token=owner, expected=200, idempotency=key):
    headers = {"Content-Type": "application/json", "Idempotency-Key": idempotency}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=20)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        status = response.status
        raw = response.read()
        payload = json.loads(raw) if raw else {}
        if "/staff-invitations" in path:
            assert response.headers.get("Cache-Control") == "no-store"
            assert response.headers.get("Referrer-Policy") == "no-referrer"
    assert status in (expected if isinstance(expected, tuple) else (expected,)), f"{method} {path}: expected {expected}, received {status} ({payload.get('code', '')})"
    return payload


profile = {"name": "Acceptance shop", "slug": "acceptance-" + uuid.uuid4().hex, "email": "shop@example.com", "accent_color": "#123456", "showroom_published": False}
created = request("POST", "/v1/dealers", profile, expected=201)["data"]
assert created["revision"] == 1
path = "/v1/dealers/" + created["id"]
assert request("GET", path)["data"]["id"] == created["id"]
assert any(row["id"] == created["id"] for row in request("GET", "/v1/dealers")["data"])
assert request("POST", "/v1/dealers", profile, expected=201)["data"]["id"] == created["id"]
request("POST", "/v1/dealers", {**profile, "name": "Changed retry"}, expected=409)
request("POST", "/v1/dealers", profile, expected=409, idempotency=str(uuid.uuid4()))
request("GET", path, token="", expected=401)
request("GET", path, token="malformed", expected=401)
request("GET", path, token=outsider, expected=404)
request("GET", "/v1/dealers/" + str(uuid.uuid4()), token=outsider, expected=404)
assert not request("GET", "/v1/dealers", token=outsider)["data"]
update = {**profile, "expectedRevision": 1, "name": "Updated acceptance shop", "phone": ""}
request("PUT", path, update, token=outsider, expected=404)
updated = request("PUT", path, update)["data"]
assert updated["revision"] == 2 and updated["name"] == update["name"]
request("PUT", path, update, expected=409)
request("PUT", path, {**update, "expectedRevision": 2, "email": "invalid"}, expected=400)
assert request("GET", path)["data"]["revision"] == 2
assert request("POST", "/v1/dealers", profile, expected=201)["data"]["revision"] == 2
seen = set()
query = "/v1/audit-events?limit=100"
for _ in range(10):
    page = request("GET", query)
    seen.update(e["action"] for e in page["data"] if e["targetId"] == created["id"])
    cursor = page.get("meta", {}).get("nextCursor")
    if not cursor:
        break
    query = "/v1/audit-events?limit=100&cursor=" + urllib.parse.quote(cursor)
assert {"resource.created", "authorization.relationship_applied", "resource.updated", "resource.viewed"} <= seen
print("Dealer creation, owner publication, private reads, optimistic edits, retries, cross-user denial and audit acceptance passed")

# Real opaque sessions, PostgreSQL and the SpiceDB outbox worker participate in
# this invitation -> grant -> role edit -> removal -> reinvitation journey.
other_id = request("GET", "/v1/me", token=outsider)["data"]["id"]
invites = path + "/staff-invitations"
request("POST", invites, {"role": "editor"}, token=outsider, expected=404)
issued = request("POST", invites, {"role": "editor"}, expected=201)["data"]
assert len(issued["token"]) == 43 and "digest" not in json.dumps(issued).lower()
invitation = invites + "/" + issued["id"]
secret = {"token": issued["token"]}
request("POST", invitation + "/preview", secret, token="", expected=401)
request("POST", invitation + "/preview", {"token": "malformed"}, token=outsider, expected=400)
preview = request("POST", invitation + "/preview", secret, token=outsider)["data"]
assert preview["dealerID"] == created["id"] and preview["role"] == "editor"
assert "token" not in preview
member = request("POST", invitation + "/accept", secret, token=outsider)["data"]
assert member["userID"] == other_id and member["revision"] == 1 and member["grantPending"]
request("POST", invitation + "/accept", secret, token=outsider, expected=400)


def await_private_access():
    for _ in range(40):
        result = request("GET", path, token=outsider, expected=(200, 404))
        if "data" in result:
            return
        time.sleep(0.5)
    raise AssertionError("membership grant did not become usable")


await_private_access()
staff = path + "/staff/" + urllib.parse.quote(other_id, safe="")
request("PUT", staff + "/role", {"role": "viewer", "expectedRevision": 1}, token=outsider, expected=404)
changed = request("PUT", staff + "/role", {"role": "viewer", "expectedRevision": 1})["data"]
assert changed["revision"] == 2 and changed["grantPending"]
request("PUT", staff + "/role", {"role": "viewer", "expectedRevision": 1}, expected=409)
await_private_access()
request("PUT", path, {**update, "expectedRevision": 2}, token=outsider, expected=404)
removed = request("POST", staff + "/revoke", {"expectedRevision": 2})["data"]
assert removed["revision"] == 3 and not removed["active"]
request("GET", path, token=outsider, expected=404)
replacement = request("POST", invites, {"role": "viewer"}, expected=201)["data"]
rejoined = request("POST", invites + "/" + replacement["id"] + "/accept", {"token": replacement["token"]}, token=outsider)["data"]
assert rejoined["revision"] == 4 and rejoined["grantPending"]
await_private_access()
revocable = request("POST", invites, {"role": "viewer"}, expected=201)["data"]
revocable_path = invites + "/" + revocable["id"]
request("POST", revocable_path + "/revoke", expected=204)
request("POST", revocable_path + "/preview", {"token": revocable["token"]}, token=outsider, expected=400)
print("Dealer staff invitation, pending grant, role edit, removal and reinvitation acceptance passed")

# Owner administration lists expose operational state, never invitation secrets.
request("GET", path + "/staff", token=outsider, expected=404)
request("GET", invites, token=outsider, expected=404)
request("GET", path + "/staff", token="", expected=401)
request("GET", invites, token="", expected=401)
member_page = request("GET", path + "/staff?limit=1")
assert len(member_page["data"]) == 1
member_cursor = member_page["meta"]["nextCursor"]
second_member_page = request("GET", path + "/staff?limit=1&cursor=" + urllib.parse.quote(member_cursor))
assert len(second_member_page["data"]) == 1 and not second_member_page["meta"].get("nextCursor")
assert {row["userID"] for row in member_page["data"] + second_member_page["data"]} == {other_id, request("GET", "/v1/me")["data"]["id"]}
request("GET", invites + "?cursor=" + urllib.parse.quote(member_cursor), expected=400)
listed = []
query = invites + "?limit=1"
for _ in range(4):
    page = request("GET", query)
    listed.extend(page["data"])
    cursor = page["meta"].get("nextCursor")
    if not cursor:
        break
    query = invites + "?limit=1&cursor=" + urllib.parse.quote(cursor)
assert len(listed) == 3
by_id = {row["id"]: row for row in listed}
assert by_id[issued["id"]]["consumedBy"] == other_id
assert by_id[replacement["id"]]["consumedBy"] == other_id
assert by_id[revocable["id"]]["revokedAt"]
serialized = json.dumps(listed).lower()
assert "token" not in serialized and "digest" not in serialized
print("Owner staff and invitation list pagination, terminal state and secret exclusion acceptance passed")
