#!/usr/bin/env python3
"""Exercise dealer HTTP journeys against disposable Compose services."""
import json
import os
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
        status, payload = response.status, json.load(response)
    assert status == expected, f"{method} {path}: expected {expected}, received {status} ({payload.get('code', '')})"
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
