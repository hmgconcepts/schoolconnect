#!/usr/bin/env node
const fs = require('fs');
const vm = require('vm');

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('assets/js/catalog.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync('assets/js/templates.js', 'utf8'), ctx);

const T = ctx.window.T;
const cfg = {
  schoolName: 'Role Test School', shortName: 'RTS', themeId: 'theme1',
  themePrimary: '#0f2a43', themeAccent: '#d4af37', fontId: 'plusjakarta',
  layout: 'sidebar', modules: [], campuses: [], logoExt: 'svg', hmgLink: '#'
};
const ids = T.allModules(cfg).map(m => m.id);
const adminRoles = new Set(['super_admin','admin','principal','proprietor','head_teacher','bursar']);
function can(id, role) {
  const allow = T.roleAllow(id).toLowerCase().split(/\s+/).filter(Boolean);
  if (adminRoles.has(role)) return true;
  if (allow.some(x => ['any','all','public'].includes(x))) return true;
  const set = new Set([role]);
  if (role === 'teacher') set.add('staff');
  if (role === 'staff') set.add('teacher');
  return allow.some(a => set.has(a));
}
function visible(role) { return ids.filter(id => can(id, role)); }
function assert(cond, msg) { if (!cond) { console.error('FAIL - ' + msg); process.exitCode = 1; } else console.log('OK   - ' + msg); }

const admin = visible('admin');
const staff = visible('staff');
const parent = visible('parent');
const student = visible('student');
console.log('Counts:', { admin: admin.length, staff: staff.length, parent: parent.length, student: student.length, total: ids.length });
assert(admin.length === ids.length, 'Admin/Super Admin can see every module for oversight');
assert(staff.length < admin.length, 'Staff menu is smaller than admin menu');
assert(parent.length < staff.length, 'Parent menu is smaller than staff menu');
assert(student.length < staff.length, 'Student menu is smaller than staff menu');
['approvals','admin-data','storage','payroll','staff_loans','staff_bonus','appraisals','activity_log','compliance','settings'].forEach(id => {
  assert(!parent.includes(id), 'Parent cannot see ' + id);
  assert(!student.includes(id), 'Student cannot see ' + id);
});
['staff','payroll','finance','approvals','admin-data','activity_log'].forEach(id => assert(!staff.includes(id), 'Staff cannot see admin-only ' + id));
['cbt-exam','assignments','results','timetable','student-profile','feature-guide'].forEach(id => assert(student.includes(id), 'Student can see safe student page ' + id));
const dash = T.dashboard(cfg);
assert(dash.includes('Staff / Teacher Dashboard Overview'), 'Admin dashboard contains staff overview');
assert(dash.includes('Parent & Payment Dashboard Overview'), 'Admin dashboard contains parent/payment overview');
assert(dash.includes('Student Dashboard Overview'), 'Admin dashboard contains student overview');
assert((dash.match(/data-dash-role=/g)||[]).length === 4, 'Only four dashboard role sections are rendered');
if (process.exitCode) process.exit(process.exitCode);
console.log('Role navigation verification passed.');
