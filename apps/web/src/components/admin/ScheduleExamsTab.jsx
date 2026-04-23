import { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api.js";
import { toast } from "../ui/Toast.jsx";
import Spinner from "../ui/Spinner.jsx";

const EXAM_TYPES = [
  { value: "final", label: "Final" },
  { value: "midterm", label: "Midterm" },
  { value: "quiz_1", label: "Quiz 1" },
  { value: "quiz_2", label: "Quiz 2" },
  { value: "quiz_3", label: "Quiz 3" },
  { value: "quiz_4", label: "Quiz 4" },
  { value: "test_1", label: "Test 1" },
  { value: "test_2", label: "Test 2" },
  { value: "test_3", label: "Test 3" },
  { value: "assignment", label: "Assignment" },
];

export default function ScheduleExamsTab() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState(null);

  // Courses dropdown state
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [courseSearch, setCourseSearch] = useState("");
  const [showCourseDropdown, setShowCourseDropdown] = useState(false);
  const courseDropdownRef = useRef(null);

  // Form state
  const [formData, setFormData] = useState({
    courseCode: "",
    courseProfessor: "",
    examDate: "",
    examTime: "",
    examType: "final",
    baseDurationMins: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchSchedules();
    fetchCourses();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        courseDropdownRef.current &&
        !courseDropdownRef.current.contains(e.target)
      ) {
        setShowCourseDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function fetchSchedules() {
    setLoading(true);
    api
      .get("/institution/exam-schedules")
      .then((res) => setSchedules(res.data ?? []))
      .catch((err) => toast(err.message, "error"))
      .finally(() => setLoading(false));
  }

  function fetchCourses() {
    setCoursesLoading(true);
    api
      .get("/institution/courses")
      .then((res) => setCourses(res.data ?? []))
      .catch((err) => toast(err.message, "error"))
      .finally(() => setCoursesLoading(false));
  }

  // Filter courses based on search
  const filteredCourses = courses.filter((c) =>
    c.course_code.toLowerCase().includes(courseSearch.toLowerCase()),
  );

  function handleSelectCourse(course) {
    setFormData((prev) => ({
      ...prev,
      courseCode: course.course_code,
      courseProfessor: `${course.first_name} ${course.last_name}`,
    }));
    setCourseSearch("");
    setShowCourseDropdown(false);
  }

  function handleFormChange(e) {
    const { name, value } = e.target;
    if (name === "courseSearch") {
      setCourseSearch(value);
      setShowCourseDropdown(true);
      return;
    }
    setFormData((prev) => ({
      ...prev,
      [name]:
        name === "baseDurationMins"
          ? value
            ? parseInt(value, 10)
            : ""
          : value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!formData.courseCode || !formData.examDate) {
      toast("Course and exam date are required", "error");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        courseCode: formData.courseCode.toUpperCase(),
        examDate: formData.examDate,
        examTime: formData.examTime || null,
        examType: formData.examType,
        baseDurationMins: formData.baseDurationMins || null,
      };

      const res = await api.post("/institution/exam-schedules", payload);
      const { autoApprovedCount, confirmedCount } = res.data;

      toast(
        `Exam scheduled! Auto-approved ${autoApprovedCount} request(s), confirmed ${confirmedCount}.`,
        "success",
      );

      setFormData({
        courseCode: "",
        courseProfessor: "",
        examDate: "",
        examTime: "",
        examType: "final",
        baseDurationMins: "",
      });
      setCourseSearch("");
      setShowForm(false);
      fetchSchedules();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this exam schedule?")) return;

    setDeleting(id);
    try {
      await api.delete(`/institution/exam-schedules/${id}`);
      toast("Exam schedule deleted");
      fetchSchedules();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setDeleting(null);
    }
  }

  if (loading)
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Schedule Exams
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Admin-scheduled exams auto-approve matching student requests (no
            prof/accommodation review needed)
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-2 text-sm font-medium text-white bg-brand-600
                     hover:bg-brand-700 rounded-lg transition-colors"
        >
          {showForm ? "Cancel" : "+ Schedule exam"}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Course Code Dropdown */}
              <div className="relative" ref={courseDropdownRef}>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Course *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="courseSearch"
                    value={courseSearch || formData.courseCode}
                    onChange={handleFormChange}
                    onFocus={() => setShowCourseDropdown(true)}
                    placeholder="Search course..."
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                               focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                  {showCourseDropdown && (
                    <div
                      className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300
                                    rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto"
                    >
                      {coursesLoading ? (
                        <div className="p-3 text-xs text-gray-500">
                          Loading courses...
                        </div>
                      ) : filteredCourses.length === 0 ? (
                        <div className="p-3 text-xs text-gray-500">
                          No courses found
                        </div>
                      ) : (
                        filteredCourses.map((course) => (
                          <button
                            key={course.course_code}
                            type="button"
                            onClick={() => handleSelectCourse(course)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-100 text-xs
                                       border-b border-gray-100 last:border-b-0 transition-colors"
                          >
                            <div className="font-medium text-gray-900">
                              {course.course_code}
                            </div>
                            <div className="text-gray-500 text-[11px]">
                              {course.first_name} {course.last_name}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {formData.courseProfessor && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    Prof: {formData.courseProfessor}
                  </p>
                )}
              </div>

              {/* Exam Date */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Exam date *
                </label>
                <input
                  type="date"
                  name="examDate"
                  value={formData.examDate}
                  onChange={handleFormChange}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                             focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>

              {/* Exam Time */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Exam time (optional)
                </label>
                <input
                  type="time"
                  name="examTime"
                  value={formData.examTime}
                  onChange={handleFormChange}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                             focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>

              {/* Exam Type */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Exam type
                </label>
                <select
                  name="examType"
                  value={formData.examType}
                  onChange={handleFormChange}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                             focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {EXAM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Base Duration */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Base duration (mins, optional)
                </label>
                <input
                  type="number"
                  name="baseDurationMins"
                  value={formData.baseDurationMins}
                  onChange={handleFormChange}
                  placeholder="e.g., 120"
                  min="1"
                  max="600"
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2
                             focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100
                           hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-brand-600
                           hover:bg-brand-700 rounded-lg disabled:opacity-50 transition-colors"
              >
                {submitting ? "Scheduling..." : "Schedule exam"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {schedules.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <p className="text-sm font-medium text-gray-700">
            No exams scheduled yet
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Create a schedule to auto-approve matching student requests.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {schedules.map((sched) => (
            <div
              key={sched.id}
              className="bg-white rounded-lg border border-gray-200 p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {sched.course_code}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 font-medium">
                      Auto-approval ON
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-gray-600">
                    <div>
                      <p className="text-gray-400 mb-0.5">Date</p>
                      <p className="font-medium">
                        {new Date(sched.exam_date).toLocaleDateString("en-CA")}
                      </p>
                    </div>

                    {sched.exam_time && (
                      <div>
                        <p className="text-gray-400 mb-0.5">Time</p>
                        <p className="font-medium">
                          {sched.exam_time.slice(0, 5)}
                        </p>
                      </div>
                    )}

                    <div>
                      <p className="text-gray-400 mb-0.5">Type</p>
                      <p className="font-medium">
                        {EXAM_TYPES.find((t) => t.value === sched.exam_type)
                          ?.label || sched.exam_type}
                      </p>
                    </div>

                    {sched.base_duration_mins && (
                      <div>
                        <p className="text-gray-400 mb-0.5">Base Duration</p>
                        <p className="font-medium">
                          {sched.base_duration_mins} min
                        </p>
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-gray-400 mt-2">
                    Created by {sched.first_name} {sched.last_name}{" "}
                    {new Date(sched.created_at).toLocaleDateString("en-CA")}
                  </p>
                </div>

                <button
                  onClick={() => handleDelete(sched.id)}
                  disabled={deleting === sched.id}
                  className="ml-4 px-2 py-1.5 text-xs font-medium text-red-600
                             hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                >
                  {deleting === sched.id ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
