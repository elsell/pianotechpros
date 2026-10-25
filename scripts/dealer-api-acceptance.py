#!/usr/bin/env python3
"""Exercise dealer HTTP journeys against disposable Compose services."""
import json
import os
import struct
import subprocess
import zlib
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = "http://localhost:8080"
owner = os.environ["DEALER_ACCEPTANCE_OWNER_SESSION"]
outsider = os.environ["DEALER_ACCEPTANCE_OTHER_SESSION"]
key = str(uuid.uuid4())


def request(method, path, body=None, token=owner, expected=200, idempotency=key, content_type="application/json", binary=False):
    headers = {"Content-Type": content_type, "Idempotency-Key": idempotency}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(BASE + path, data=None if body is None else body if isinstance(body, bytes) else json.dumps(body).encode(), headers=headers, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=20)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        status = response.status
        raw = response.read()
        payload = raw if binary and status == 200 else json.loads(raw) if raw else {}
        if binary and status == 200:
            assert response.headers.get("Content-Type") == "image/jpeg" and raw.startswith(b"\xff\xd8")
        if "/staff-invitations" in path or "/inventory" in path or "/showrooms/" in path:
            assert response.headers.get("Cache-Control") == "no-store"
            assert response.headers.get("Referrer-Policy") == "no-referrer"
    assert status in (expected if isinstance(expected, tuple) else (expected,)), f"{method} {path}: expected {expected}, received {status} ({payload.get('code', '') if isinstance(payload, dict) else 'binary'})"
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

# Inventory uses the same confirmed dealer scope and real persistence/audit stack.
inventory_path = path + "/inventory"
piano = request("POST", inventory_path, expected=201)["data"]
piano_path = inventory_path + "/" + piano["id"]
assert request("POST", inventory_path, expected=201)["data"]["id"] == piano["id"]
assert piano["status"] == "draft" and piano["revision"] == 1
facts = {**piano["attributes"], "title": "Acceptance grand", "private_notes": "Private acceptance note", "asking_price": {"minor_units": 1234500, "currency": "USD"}, "manufactured": {"year": 1920, "month": 0, "day": 0}}
piano_edit = {"expectedRevision": 1, "attributes": facts}
request("GET", piano_path, token="", expected=401)
request("GET", piano_path, token=outsider, expected=404)
request("PUT", piano_path, piano_edit, token=outsider, expected=404)
revised = request("PUT", piano_path, piano_edit)["data"]
assert revised["revision"] == 2 and revised["status"] == "draft"
assert request("GET", piano_path)["data"]["attributes"]["private_notes"] == facts["private_notes"]
request("PUT", piano_path, piano_edit, expected=409)
request("PUT", piano_path, {"expectedRevision": 2, "attributes": {**facts, "asking_price": {"minor_units": 1, "currency": "ZZZ"}}}, expected=400)
assert request("POST", inventory_path, expected=201)["data"]["revision"] == 2
print("Inventory draft retry, private read, edit, conflict, currency and cross-user acceptance passed")
second_piano = request("POST", inventory_path, expected=201, idempotency=str(uuid.uuid4()))["data"]
request("PUT", piano_path, {"expectedRevision": 2, "attributes": {**facts, "featured": True}})
request("GET", inventory_path, token="", expected=401)
request("GET", inventory_path, token=outsider, expected=404)
first_page = request("GET", inventory_path + "?limit=1")
assert [item["id"] for item in first_page["data"]] == [piano["id"]]
continuation = first_page["meta"]["nextCursor"]
request("POST", inventory_path, expected=201, idempotency=str(uuid.uuid4()))
last_page = request("GET", inventory_path + "?limit=100&cursor=" + urllib.parse.quote(continuation))
assert [item["id"] for item in last_page["data"]] == [second_piano["id"]]
assert not last_page["meta"].get("nextCursor")
request("GET", inventory_path + "?includeInactive=true&cursor=" + urllib.parse.quote(continuation), expected=400)
assert request("GET", inventory_path + "?status=sold")["data"] == []
assert [item["id"] for item in request("GET", inventory_path + "?search=acceptance%20grand")["data"]] == [piano["id"]]
assert request("GET", inventory_path + "?search=Private%20acceptance%20note")["data"] == []
print("Inventory listing, featured pagination, creation ceiling, search, filters and denied access passed")


# Publish only storage-derived photo evidence; preserve the public snapshot on sale.
publication = piano_path + "/publication"
assert request("GET", publication)["data"]["publication"] is None
request("GET", publication, token=outsider, expected=404)
request("POST", piano_path + "/publish", {"expectedRevision": 3}, token="", expected=401)
request("POST", piano_path + "/publish", {"expectedRevision": 3}, token=outsider, expected=404)
not_ready = request("POST", piano_path + "/publish", {"expectedRevision": 3}, expected=422)
assert not_ready["code"] == "inventory_not_ready" and set(not_ready["missing"]) == {"form", "condition", "photo"}
ready_facts = {**request("GET", piano_path)["data"]["attributes"], "form": "grand", "condition": "used", "price_visible": True}
ready_record = request("PUT", piano_path, {"expectedRevision": 3, "attributes": ready_facts})["data"]


def png_chunk(kind, data):
    return struct.pack("!I", len(data)) + kind + data + struct.pack("!I", zlib.crc32(kind + data))


photo = (b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", struct.pack("!2I5B", 8, 8, 8, 2, 0, 0, 0))
         + png_chunk(b"IDAT", zlib.compress((b"\x00" + b"\x88\x66\x44" * 8) * 8)) + png_chunk(b"IEND", b""))
upload = request("POST", piano_path + "/photos?expectedRevision=" + str(ready_record["revision"]), photo,
                 expected=201, idempotency=str(uuid.uuid4()), content_type="application/octet-stream")["data"]
published = request("POST", piano_path + "/publish", {"expectedRevision": upload["record"]["revision"]})["data"]
snapshot = published["publication"]["snapshot"]
assert published["publication"]["visible"] and len(snapshot["photos"]) == 1
assert snapshot["title"] == "Acceptance grand" and snapshot["price"]["minor_units"] == 1234500
for forbidden in ("private_notes", "acquisition_cost", "serial", "salePrice", "location"):
    assert forbidden not in snapshot
showroom_path = "/v1/showrooms/" + profile["slug"]
public_piano = showroom_path + "/pianos/" + piano["id"]
public_photo = public_piano + "/photos/" + snapshot["photos"][0]["id"]
request("GET", public_piano, token="", expected=404)
public_profile = request("PUT", path, {**update, "expectedRevision": 2, "showroom_published": True})["data"]
assert request("GET", showroom_path, token="")["data"]["name"] == update["name"]
assert request("GET", public_piano, token="")["data"]["piano"] == snapshot
collection_path = showroom_path + "/pianos"
assert request("GET", collection_path, token="")["data"]["pianos"] == [snapshot]
assert request("GET", collection_path + "?currency=USD&minPrice=1234500&maxPrice=1234500", token="")["data"]["pianos"] == [snapshot]
assert request("GET", collection_path + "?currency=USD&maxPrice=0", token="")["data"]["pianos"] == []
assert request("GET", collection_path + "?search=does-not-match", token="")["data"]["pianos"] == []
request("GET", collection_path + "?cursor=tampered", token="", expected=400)
public_bytes = request("GET", public_photo, token="", binary=True)
request("GET", showroom_path + "/pianos/foreign", token="", expected=404)
request("GET", public_piano + "/photos/foreign", token="", expected=404)
private_edit = request("PUT", piano_path, {"expectedRevision": published["record"]["revision"],
                       "attributes": {**ready_facts, "title": "Unpublished replacement", "asking_price": {"minor_units": 2000000, "currency": "USD"}}})["data"]
sold = request("POST", piano_path + "/lifecycle", {"expectedRevision": private_edit["revision"], "status": "sold",
               "salePrice": {"minor_units": 1000000, "currency": "USD"}})["data"]
assert sold["record"]["status"] == "sold" and sold["publication"]["visible"]
assert sold["publication"]["snapshot"] == {**snapshot, "status": "sold"}
assert request("GET", public_piano, token="")["data"]["piano"] == {**snapshot, "status": "sold"}
assert request("GET", collection_path, token="")["data"]["pianos"] == []
assert request("GET", collection_path + "?availability=sold", token="")["data"]["pianos"] == [{**snapshot, "status": "sold"}]
assert request("GET", public_photo, token="", binary=True) == public_bytes
request("POST", piano_path + "/lifecycle", {"expectedRevision": private_edit["revision"], "status": "archived"}, expected=409)
hidden = request("POST", piano_path + "/unpublish", {"expectedRevision": sold["record"]["revision"]})["data"]
assert request("GET", collection_path + "?availability=all", token="")["data"]["pianos"] == []
request("GET", public_piano, token="", expected=404)
request("GET", public_photo, token="", expected=404)
corrected = request("POST", piano_path + "/lifecycle", {"expectedRevision": hidden["record"]["revision"],
                    "status": "available", "reason": "Acceptance sale correction"})["data"]
assert not corrected["publication"]["visible"]
request("GET", public_piano, token="", expected=404)
republished = request("POST", piano_path + "/publish", {"expectedRevision": corrected["record"]["revision"]})["data"]
assert republished["publication"]["visible"] and republished["publication"]["snapshot"]["title"] == "Unpublished replacement"
assert republished["publication"]["snapshot"]["price"]["minor_units"] == 2000000
assert request("GET", public_piano, token="")["data"]["piano"] == republished["publication"]["snapshot"]
hidden_profile = request("PUT", path, {**update, "expectedRevision": public_profile["revision"], "showroom_published": False})["data"]
for hidden_path in (showroom_path, collection_path, public_piano, public_photo):
    request("GET", hidden_path, token="", expected=404)
request("PUT", path, {**update, "expectedRevision": hidden_profile["revision"], "showroom_published": True})
print("Anonymous showroom/profile/listing/photo, private-edit isolation, sale snapshot and unpublish acceptance passed")
print("Inventory photo upload, readiness, publish, snapshot-preserving sale, unpublish, correction and explicit republish acceptance passed")


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
request("GET", publication, token=outsider)
for command, body in (("publish", {"expectedRevision": republished["record"]["revision"]}),
                      ("unpublish", {"expectedRevision": republished["record"]["revision"]}),
                      ("lifecycle", {"expectedRevision": republished["record"]["revision"], "status": "archived"})):
    request("POST", piano_path + "/" + command, body, token=outsider, expected=404)
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


# Reuse only this run's disposable published fixture; browser children sign in
# normally and receive no parent application session credentials.
browser_environment = {name: value for name, value in os.environ.items()
                       if name not in {"DEALER_ACCEPTANCE_OWNER_SESSION", "DEALER_ACCEPTANCE_OTHER_SESSION"}}
for script in ("photo-publication-persisted-acceptance.mjs",
               "inquiry-persisted-browser-acceptance.mjs",
               "inventory-history-persisted-acceptance.mjs",
               "inventory-scan-persisted-acceptance.mjs",
               "dealer-profile-persisted-acceptance.mjs"):
    # Each journey needs a fresh audit window after the preceding API/browser work.
    # Preserve production limits and fail on any limit exceeded within a journey.
    print("Waiting for a fresh audit window before " + script, flush=True)
    time.sleep(61)
    current_title = request("GET", piano_path)["data"]["attributes"]["title"]
    subprocess.run(["node", "scripts/" + script], check=True, env={
        **browser_environment,
        "INQUIRY_ACCEPTANCE_WEB_URL": "http://localhost:5173",
        "INQUIRY_ACCEPTANCE_SHOWROOM_SLUG": profile["slug"],
        "INQUIRY_ACCEPTANCE_PIANO_ID": piano["id"],
        "INQUIRY_ACCEPTANCE_DEALER_NAME": update["name"],
        "HISTORY_ACCEPTANCE_WEB_URL": "http://localhost:5173",
        "HISTORY_ACCEPTANCE_DEALER_NAME": update["name"],
        "HISTORY_ACCEPTANCE_EXISTING_TITLE": current_title,
        "SCAN_ACCEPTANCE_WEB_URL": "http://localhost:5173",
        "SCAN_ACCEPTANCE_DEALER_NAME": update["name"],
        "SCAN_ACCEPTANCE_EXISTING_TITLE": current_title,
    })
