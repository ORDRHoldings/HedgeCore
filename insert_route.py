target_file = r"D:\Synexiun\1-SynexFund\HedgeCalc\FXDemo\backend\app\api\routes\v1_positions.py"

new_block = '''\
@router.patch("/bulk-assign-policy", response_model=BulkAssignResult)

async def bulk_assign_policy(

    data:         BulkAssignPolicyRequest,

    request:      Request,

    session:      AsyncSession = Depends(get_async_session),

    current_user: User         = Depends(get_current_user),

):

    """

    Assign one policy instance to many positions in a single request.

    Processes up to 500 positions. Positions already beyond POLICY_ASSIGNED

    in the lifecycle (READY_TO_EXECUTE, HEDGED, REJECTED) are skipped.

    Returns counts of assigned / skipped / failed with error messages.

    Required permission: trades.edit

    """

    await _check_permission(session, current_user, "trades.edit")

    all_branches = await _resolve_scope(session, current_user)

    assigned = 0

    skipped  = 0

    failed   = 0

    errors: list[str] = []

    skip_statuses = {"READY_TO_EXECUTE", "HEDGED", "REJECTED"}

    for pos_id in data.position_ids:

        try:

            assign_data = AssignPolicyRequest(policy_instance_id=data.policy_instance_id)

            pos = await position_service.assign_policy(

                session, current_user, pos_id, assign_data, all_branches

            )

            await _emit_lifecycle_audit(

                session, current_user,

                event_type  = "LIFECYCLE",

                description = f"Position {pos.record_id} bulk policy assigned -> POLICY_ASSIGNED",

                position_id = str(pos.id),

                payload     = {

                    "transition":         "POLICY_ASSIGNED",

                    "policy_instance_id": str(data.policy_instance_id),

                    "record_id":          pos.record_id,

                    "bulk":               True,

                },

                request     = request,

            )

            assigned += 1

        except HTTPException as e:

            if e.status_code == 409:

                skipped += 1

            else:

                failed += 1

                errors.append(f"{pos_id}: {e.detail}")

        except ValueError as e:

            msg = str(e)

            if any(s in msg for s in skip_statuses):

                skipped += 1

            else:

                failed += 1

                errors.append(f"{pos_id}: {msg}")

        except Exception as e:

            failed += 1

            errors.append(f"{pos_id}: {str(e)}")

    return BulkAssignResult(

        assigned=assigned,

        skipped=skipped,

        failed=failed,

        errors=errors,

    )

'''

SEARCH = '@router.patch("/{position_id}/ready", response_model=PositionResponse)'

with open(target_file, "r", encoding="utf-8") as f:
    lines = f.readlines()

target_idx = None
for i, line in enumerate(lines):
    if SEARCH in line:
        target_idx = i
        break

if target_idx is None:
    raise RuntimeError(f"Could not find target line: {SEARCH!r}")

print(f"Found target line at index {target_idx} (1-based line {target_idx + 1}): {lines[target_idx].rstrip()}")

# Build lines to insert: the new block as individual lines, preceded by a blank line
insert_lines = (new_block).splitlines(keepends=True)

# Insert before target_idx
lines[target_idx:target_idx] = insert_lines

with open(target_file, "w", encoding="utf-8") as f:
    f.writelines(lines)

print(f"Inserted {len(insert_lines)} lines before original line {target_idx + 1}.")
print(f"File written successfully. Total lines now: {len(lines)}")
