export const ROLES = {
  INSTITUTION_ADMIN: 'institution_admin',
  LEAD:              'lead',
  PROFESSOR:         'professor',
  STUDENT:           'student',
  COUNSELLOR:        'counsellor',
};

export const ROLE_PERMISSIONS = {
  institution_admin: ['manage_users', 'manage_settings', 'view_analytics', 'edit_exams', 'view_all'],
  lead:              ['edit_exams', 'send_emails', 'import_pdfs', 'view_all'],
  professor:         ['view_own_exams', 'upload_exam_files'],
  student:           ['view_own_appointments'],
  counsellor:        ['view_student_profiles', 'view_accommodation_reports'],
};
