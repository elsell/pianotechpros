#!/usr/bin/env bash
# Sourced by the macOS runner. The caller supplies run_journey, restart_app,
# verify_inventory and record_journey; each must return its actual exit status.
schedule_journey() {
  local name="$1" method="$2"
  if restart_app && run_journey "$name" "$method"; then
    record_journey "$name" passed || return 1
    return 0
  fi
  record_journey "$name" failed || return 1
  return 1
}
run_ios_real_inventory_schedule() {
  local failed=0
  schedule_journey inventory testBrowseInventoryThroughNormalNavigation || failed=1
  schedule_journey readiness testIncompletePublicationReturnsToRequiredControls || failed=1
  if schedule_journey edit testEditInventoryRecord; then
    if verify_inventory; then
      record_journey persisted passed || return 1
      schedule_journey reopen testReopenEditedInventoryAfterProcessRestart || failed=1
    else
      record_journey persisted failed
      record_journey reopen blocked
      failed=1
    fi
  else
    record_journey persisted blocked
    record_journey reopen blocked
    failed=1
  fi
  return "$failed"
}
run_ios_real_lifecycle_schedule() {
  if ! schedule_journey sale testSellAvailableInventory; then
    record_journey sale-persisted blocked
    record_journey correction blocked
    record_journey correction-persisted blocked
    return 1
  fi
  if verify_lifecycle sale; then record_journey sale-persisted passed || return 1
  else
    record_journey sale-persisted failed
    record_journey correction blocked
    record_journey correction-persisted blocked
    return 1
  fi
  if ! schedule_journey correction testCorrectSoldInventoryAfterRestart; then
    record_journey correction-persisted blocked
    return 1
  fi
  if verify_lifecycle correction; then record_journey correction-persisted passed || return 1
  else record_journey correction-persisted failed; return 1; fi
}
run_ios_real_profile_schedule() {
  local failed=0
  if restart_app && run_journey create testCreateProfilesAndProtectPartialDraft; then
    record_journey create passed || return 1
  else
    record_journey create failed
    record_journey restore blocked
    record_journey persisted blocked
    return 1
  fi
  if restart_app && run_journey restore testRestorePartialDraftAfterProcessRestart; then
    record_journey restore passed || return 1
  else
    record_journey restore failed || return 1
    failed=1
  fi
  if verify_profiles; then record_journey persisted passed || return 1
  else record_journey persisted failed || return 1; failed=1; fi
  return "$failed"
}
run_ios_journey_schedule() {
  local failed=0 profile_ready=false edit_ready=false
  schedule_journey public testBrowsePublicShowroomWithoutSigningIn || failed=1
  if schedule_journey create testCreateProfilesAndProtectPartialDraft; then
    profile_ready=true
  else
    failed=1
  fi
  if [[ "$profile_ready" == true ]]; then
    schedule_journey restore testRestorePartialDraftAfterProcessRestart || failed=1
    schedule_journey inventory testBrowseInventoryThroughNormalNavigation || failed=1
    schedule_journey readiness testIncompletePublicationReturnsToRequiredControls || failed=1
    if schedule_journey edit testEditInventoryRecord; then
      if verify_inventory; then
        record_journey persisted passed || failed=1
        edit_ready=true
      else
        record_journey persisted failed || failed=1
        failed=1
      fi
    else
      record_journey persisted blocked || failed=1
      failed=1
    fi
    if [[ "$edit_ready" == true ]]; then
      schedule_journey reopen testReopenEditedInventoryAfterProcessRestart || failed=1
    else
      record_journey reopen blocked || failed=1
      failed=1
    fi
  else
    local name
    for name in restore inventory readiness edit persisted reopen; do
      record_journey "$name" blocked || failed=1
    done
  fi
  schedule_journey accessibility testPublicAccessibility || failed=1
  return "$failed"
}
