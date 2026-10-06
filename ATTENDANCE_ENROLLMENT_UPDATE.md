# StudentAttendance -> StudentEnrollment backend update

The Prisma schema now defines `StudentAttendance.enrollmentId` as the attendance student's identity:

- `StudentAttendance.enrollmentId -> StudentEnrollment.id`
- unique key: `(attendanceSessionId, enrollmentId)`
- `StudentAttendance.studentId` is no longer used

## Canonical marking payload

New clients should send:

```json
{
  "records": [
    { "enrollmentId": "enrollment-uuid", "status": "PRESENT" },
    { "enrollmentId": "enrollment-uuid-2", "status": "ABSENT", "absenceTypeId": "absence-type-uuid" }
  ]
}
```

For compatibility, the marking and staff-leave marking services still accept `studentId`; the service resolves it to the current session's enrollment before creating `StudentAttendance`.

## Important schema note

The supplied migration also removes `StudentAttendance.remarks`. The updated backend therefore does not write `remarks` to `StudentAttendance`. Report/staff-response shapes return `remarks: null` for compatibility. If remarks are required again, add `remarks String?` to `StudentAttendance` in Prisma and create a separate migration before enabling persistence.
