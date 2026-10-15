// Human-friendly description of every permission, grouped by module, plus the
// "requires" graph and ready-made presets used by the user/role screens.
//
// This is the single source of truth for:
//   - GET /api/permissions (what the admin sees in the permission picker)
//   - dependency expansion (granting timetable.create also grants the read
//     permissions the timetable screen needs to load its dropdowns)
//
// Permissions that exist in permission.constants.js but are not listed here
// are still enforced by the API; they just are not offered in the picker.
import P from './permission.constants.js';

const g = (key, label, items) => ({ key, label, items });

export const GROUPS = [
  g('users', 'Users & access', [
    [P.USERS_VIEW, 'View users'],
    [P.USERS_CREATE, 'Create users'],
    [P.USERS_UPDATE, 'Edit users & their access'],
    [P.USERS_DEACTIVATE, 'Activate / deactivate users'],
    [P.ROLES_VIEW, 'View roles'],
    [P.ROLES_CREATE, 'Create roles'],
    [P.ROLES_UPDATE, 'Edit roles'],
    [P.ROLES_DELETE, 'Delete roles'],
  ]),
  g('staff', 'Staff', [
    [P.STAFF_VIEW, 'View staff'],
    [P.STAFF_CREATE, 'Create staff'],
    [P.STAFF_UPDATE, 'Edit staff'],
    [P.STAFF_DEACTIVATE, 'Deactivate staff'],
  ]),
  g('subjects', 'Subjects', [
    [P.SUBJECTS_VIEW, 'View subjects'],
    [P.SUBJECTS_CREATE, 'Create subjects'],
    [P.SUBJECTS_UPDATE, 'Edit subjects'],
    [P.SUBJECTS_DELETE, 'Delete subjects'],
  ]),
  g('standards', 'Standards / classes', [
    [P.STANDARDS_VIEW, 'View standards'],
    [P.STANDARDS_CREATE, 'Create standards'],
    [P.STANDARDS_UPDATE, 'Edit standards'],
    [P.STANDARDS_DELETE, 'Delete standards'],
  ]),
  g('subject_allocation', 'Subject allocation to standards', [
    [P.SUBJECT_ALLOCATION_VIEW, 'View allocations'],
    [P.SUBJECT_ALLOCATION_CREATE, 'Allocate subjects to a standard'],
    [P.SUBJECT_ALLOCATION_UPDATE, 'Edit allocations'],
    [P.SUBJECT_ALLOCATION_DELETE, 'Remove subjects from a standard'],
  ]),
  g('staff_assignment', 'Staff assignment to subjects', [
    [P.STAFF_ASSIGNMENT_VIEW, 'View staff assignments'],
    [P.STAFF_ASSIGNMENT_CREATE, 'Assign staff'],
    [P.STAFF_ASSIGNMENT_UPDATE, 'Change assigned staff'],
    [P.STAFF_ASSIGNMENT_DELETE, 'Remove staff assignment'],
  ]),
  g('timetable', 'Timetable', [
    [P.TIMETABLE_VIEW, 'View timetable'],
    [P.TIMETABLE_CREATE, 'Create timetable entries'],
    [P.TIMETABLE_UPDATE, 'Edit timetable entries'],
    [P.TIMETABLE_DELETE, 'Delete timetable entries'],
    [P.TIMETABLE_VALIDATE, 'Validate timetable'],
    [P.TIMETABLE_PUBLISH, 'Publish timetable'],
    [P.TIMETABLE_SETTINGS, 'Change timetable settings'],
  ]),
  g('period', 'Periods', [
    [P.PERIOD_VIEW, 'View periods'],
    [P.PERIOD_CREATE, 'Create / generate periods'],
    [P.PERIOD_UPDATE, 'Edit periods'],
    [P.PERIOD_DELETE, 'Delete periods'],
  ]),
  g('academic_year', 'Academic years', [
    [P.ACADEMIC_YEAR_VIEW, 'View academic years'],
    [P.ACADEMIC_YEAR_CREATE, 'Create academic years'],
    [P.ACADEMIC_YEAR_UPDATE, 'Edit academic years'],
    [P.ACADEMIC_YEAR_ACTIVATE, 'Activate academic years'],
    [P.ACADEMIC_YEAR_COMPLETE, 'Complete academic years'],
  ]),
  g('calendar', 'Calendar', [
    [P.CALENDAR_VIEW, 'View calendar'],
    [P.CALENDAR_CREATE, 'Create calendar entries'],
    [P.CALENDAR_UPDATE, 'Edit calendar entries'],
    [P.CALENDAR_DELETE, 'Delete calendar entries'],
  ]),
  g('students', 'Students', [
    [P.STUDENTS_VIEW, 'View students'],
    [P.STUDENTS_CREATE, 'Create students'],
    [P.STUDENTS_UPDATE, 'Edit students'],
    [P.STUDENTS_IMPORT, 'Import students'],
    [P.STUDENTS_ARCHIVE, 'Archive students'],
    [P.STUDENTS_ENROLL, 'Enrol students'],
    [P.STUDENTS_PROMOTE, 'Promote students'],
  ]),
  g('attendance', 'Attendance', [
    [P.ATTENDANCE_VIEW, 'View attendance'],
    [P.ATTENDANCE_MARK, 'Mark attendance'],
    [P.ATTENDANCE_SESSION_GENERATE, 'Generate attendance sessions'],
    [P.ATTENDANCE_CORRECT, 'Request corrections'],
    [P.ATTENDANCE_APPROVE_CORRECTION, 'Approve / reject corrections'],
    [P.ATTENDANCE_ADJUST, 'Adjust attendance'],
    [P.ATTENDANCE_AUDIT, 'View attendance audit'],
  ]),
  g('absence_type', 'Absence types', [
    [P.ABSENCE_TYPE_VIEW, 'View absence types'],
    [P.ABSENCE_TYPE_CREATE, 'Create absence types'],
    [P.ABSENCE_TYPE_UPDATE, 'Edit absence types'],
    [P.ABSENCE_TYPE_DEACTIVATE, 'Deactivate absence types'],
  ]),
  g('reports', 'Reports', [
    [P.REPORTS_ATTENDANCE_VIEW, 'View attendance reports'],
    [P.REPORTS_ATTENDANCE_EXPORT, 'Export attendance reports'],
    [P.REPORTS_STAFF_VIEW, 'View staff reports'],
    [P.REPORTS_STAFF_EXPORT, 'Export staff reports'],
    [P.REPORTS_AUDIT_VIEW, 'View audit reports'],
    [P.REPORTS_AUDIT_EXPORT, 'Export audit reports'],
  ]),
];

// permission -> list of permissions it needs in order to work in the UI.
// Every non-"view" permission automatically requires its group's "view"
// permission (added below). Entries here are the extra, cross-module needs.
const EXTRA_REQUIRES = {
  [P.ACADEMIC_YEAR_VIEW]: [],
  [P.STANDARDS_VIEW]: [P.SUBJECTS_VIEW, P.ACADEMIC_YEAR_VIEW],
  [P.SUBJECT_ALLOCATION_VIEW]: [P.STANDARDS_VIEW, P.SUBJECTS_VIEW, P.ACADEMIC_YEAR_VIEW],
  [P.STAFF_ASSIGNMENT_VIEW]: [P.ACADEMIC_YEAR_VIEW],
  [P.TIMETABLE_VIEW]: [
    P.ACADEMIC_YEAR_VIEW, P.STANDARDS_VIEW, P.SUBJECTS_VIEW, P.PERIOD_VIEW, P.CALENDAR_VIEW,
  ],
  [P.PERIOD_VIEW]: [P.ACADEMIC_YEAR_VIEW],
  [P.CALENDAR_VIEW]: [P.ACADEMIC_YEAR_VIEW],
  [P.STUDENTS_ENROLL]: [P.STANDARDS_VIEW, P.ACADEMIC_YEAR_VIEW],
  [P.ATTENDANCE_SESSION_GENERATE]: [P.ACADEMIC_YEAR_VIEW],
};

export const CATALOG_NAMES = new Set(GROUPS.flatMap((x) => x.items.map(([n]) => n)));

const REQUIRES = {};
for (const group of GROUPS) {
  const view = group.items.map(([n]) => n).find((n) => n.endsWith('.view'));
  for (const [name] of group.items) {
    const list = new Set(EXTRA_REQUIRES[name] || []);
    if (view && name !== view) list.add(view);
    REQUIRES[name] = [...list];
  }
}

/** Direct requirements of one permission. */
export const requiresOf = (name) => REQUIRES[name] || [];

/** Add every (transitive) requirement to a list of permission names. */
export function expandPermissions(names) {
  const out = new Set();
  const visit = (n) => {
    if (out.has(n)) return;
    out.add(n);
    requiresOf(n).forEach(visit);
  };
  names.forEach(visit);
  return [...out].sort();
}

const bundle = (key, label, description, permissions) => ({
  key,
  label,
  description,
  permissions: expandPermissions(permissions),
});

export const PRESETS = [
  bundle('staff_manager', 'Staff manager', 'Create and edit staff accounts.', [
    P.STAFF_VIEW, P.STAFF_CREATE, P.STAFF_UPDATE,
  ]),
  bundle('subjects_standards', 'Subjects & standards', 'Manage subjects, standards and allocate subjects to standards.', [
    P.SUBJECTS_VIEW, P.SUBJECTS_CREATE, P.SUBJECTS_UPDATE, P.SUBJECTS_DELETE,
    P.STANDARDS_VIEW, P.STANDARDS_CREATE, P.STANDARDS_UPDATE, P.STANDARDS_DELETE,
    P.SUBJECT_ALLOCATION_VIEW, P.SUBJECT_ALLOCATION_CREATE, P.SUBJECT_ALLOCATION_DELETE,
  ]),
  bundle('staff_assignment', 'Staff assignment', 'Assign staff to subject-standard combinations.', [
    P.STAFF_ASSIGNMENT_VIEW, P.STAFF_ASSIGNMENT_CREATE, P.STAFF_ASSIGNMENT_UPDATE,
    P.STAFF_ASSIGNMENT_DELETE, P.STAFF_VIEW,
  ]),
  bundle('timetable_manager', 'Timetable manager', 'Create, edit, validate and publish timetables.', [
    P.TIMETABLE_VIEW, P.TIMETABLE_CREATE, P.TIMETABLE_UPDATE, P.TIMETABLE_DELETE,
    P.TIMETABLE_VALIDATE, P.TIMETABLE_PUBLISH,
  ]),
];

export const permissionCatalog = () => ({
  groups: GROUPS.map((x) => ({
    key: x.key,
    label: x.label,
    permissions: x.items.map(([name, label]) => ({ name, label, requires: requiresOf(name) })),
  })),
  presets: PRESETS,
});

export const labelOf = (name) => {
  for (const x of GROUPS) {
    const hit = x.items.find(([n]) => n === name);
    if (hit) return hit[1];
  }
  return name.replaceAll('_', ' ').replaceAll('.', ' ');
};
