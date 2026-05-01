import 'dotenv/config';
import app from './app.js';
import { runUploadReminders }    from './services/reminderService.js';
import { runStudentReminders }   from './services/studentReminderService.js';
import { runExamStageAdvancement } from './services/examStageService.js';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`AC Exam Manager API running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

  // Run upload reminders once on boot, then every 24 hours
  runUploadReminders().catch(() => {});
  setInterval(() => runUploadReminders().catch(() => {}), 24 * 60 * 60 * 1000);

  // Run student exam reminders once on boot, then every 24 hours
  runStudentReminders().catch(() => {});
  setInterval(() => runStudentReminders().catch(() => {}), 24 * 60 * 60 * 1000);

  // Auto-advance exam stages every 1 minute
  runExamStageAdvancement().catch(() => {});
  setInterval(() => runExamStageAdvancement().catch(() => {}), 60 * 1000);
});
