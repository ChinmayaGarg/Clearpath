/**
 * Exam service — re-exports from bookService for backward compatibility.
 * All exam business logic lives in bookService.js.
 */
export {
  getOneExam,
  addExam,
  editExam,
  removeExam,
  changeExamStatus,
  saveExamRoom,
  removeExamRoom,
  getExamHistory,
} from './bookService.js';
