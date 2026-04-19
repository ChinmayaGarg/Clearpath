import { useState, useEffect, useRef } from "react";
import Modal from "../ui/Modal.jsx";
import { api } from "../../lib/api.js";
import { toast } from "../ui/Toast.jsx";

const EXAM_TYPES = [
  { value: "midterm", label: "Midterm" },
  { value: "endterm", label: "End term" },
  { value: "tutorial", label: "Tutorial" },
  { value: "lab", label: "Lab" },
  { value: "quiz", label: "Quiz" },
  { value: "assignment", label: "Assignment" },
  { value: "other", label: "Other" },
];

const DELIVERIES = [
  { value: "pending", label: "Not sure yet" },
  { value: "dropped", label: "I will drop it off" },
  { value: "delivery", label: "Delivered to room" },
  { value: "file_upload", label: "I will upload the file" },
];

const EXAM_FORMATS = [
  { value: "", label: "Select…" },
  { value: "paper", label: "Paper" },
  { value: "crowdmark", label: "Crowdmark" },
  { value: "brightspace", label: "Brightspace" },
];

const BOOKLET_TYPES = [
  { value: "", label: "Select…" },
  { value: "not_needed", label: "Not needed" },
  { value: "engineering_booklet", label: "Engineering booklet" },
  { value: "essay_booklet", label: "Essay booklet" },
];

export default function UploadForm({ uploadId, onClose, onSaved }) {
  const isEdit = !!uploadId;

  const [form, setForm] = useState({
    courseCode:        "",
    examTypeLabel:     "midterm",
    delivery:          "pending",
    materials:         "",
    password:          "",
    isMakeup:          false,
    makeupNotes:       "",
    estimatedCopies:   "",
    examDurationMins:  "",
    examFormat:        "",
    bookletType:       "",
    scantronNeeded:    "",
    calculatorAllowed: "",
  });
  const [dates, setDates] = useState([]);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [uploadId_, setUploadId_] = useState(uploadId);
  const [loading, setLoading] = useState(!!uploadId);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState("details"); // 'details' | 'dates'

  // Multi-file state
  const [uploadedFiles, setUploadedFiles] = useState([]); // server-side files
  const [pendingFile, setPendingFile] = useState(null);   // selected but not yet uploaded
  const [fileUploading, setFileUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Load existing upload if editing
  useEffect(() => {
    if (!uploadId) return;
    api
      .get(`/portal/uploads/${uploadId}`)
      .then((d) => {
        const u = d.upload;
        setForm({
          courseCode:        u.course_code,
          examTypeLabel:     u.exam_type_label,
          delivery:          u.delivery,
          materials:         u.materials          ?? "",
          password:          u.password           ?? "",
          isMakeup:          u.is_makeup,
          makeupNotes:       u.makeup_notes       ?? "",
          estimatedCopies:   u.estimated_copies   ?? "",
          examDurationMins:  u.exam_duration_mins ?? "",
          examFormat:        u.exam_format        ?? "",
          bookletType:       u.booklet_type       ?? "",
          scantronNeeded:    u.scantron_needed    === true ? "yes" : u.scantron_needed === false ? "no" : "",
          calculatorAllowed: u.calculator_allowed === true ? "yes" : u.calculator_allowed === false ? "no" : "",
        });
        setDates(u.dates ?? []);
        setUploadedFiles(u.files ?? []);
      })
      .catch((err) => toast(err.message, "error"))
      .finally(() => setLoading(false));
  }, [uploadId]); // eslint-disable-line

  useEffect(() => {
    let mounted = true;
    api
      .get("/portal/courses")
      .then((data) => {
        if (!mounted) return;
        setCourses(data.courses ?? []);
      })
      .catch((err) => {
        toast(err.message, "error");
      })
      .finally(() => {
        if (!mounted) return;
        setCoursesLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  function buildPayload() {
    return {
      ...form,
      estimatedCopies:   form.estimatedCopies   !== "" ? Number(form.estimatedCopies)   : null,
      examDurationMins:  form.examDurationMins  !== "" ? Number(form.examDurationMins)  : null,
      examFormat:        form.examFormat        || null,
      bookletType:       form.bookletType       || null,
      scantronNeeded:    form.scantronNeeded    === "" ? null : form.scantronNeeded    === "yes",
      calculatorAllowed: form.calculatorAllowed === "" ? null : form.calculatorAllowed === "yes",
    };
  }

  async function handleUploadFile() {
    if (!pendingFile) return;

    // If no upload exists yet, create the draft first
    let currentUploadId = uploadId_;
    if (!currentUploadId) {
      if (!form.courseCode)        { toast("Please select a course before uploading", "error"); return; }
      if (!form.examDurationMins)  { toast("Exam duration is required", "error"); return; }
      if (!form.examFormat)        { toast("Exam type is required", "error"); return; }
      if (!form.bookletType)       { toast("Booklet selection is required", "error"); return; }
      if (form.scantronNeeded === "") { toast("Scantron selection is required", "error"); return; }
      if (form.calculatorAllowed === "") { toast("Calculator selection is required", "error"); return; }
      try {
        const data = await api.post("/portal/uploads", buildPayload());
        currentUploadId = data.uploadId;
        setUploadId_(currentUploadId);
      } catch (err) {
        toast(err.message, "error");
        return;
      }
    }

    setFileUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      const result = await api.upload(`/portal/uploads/${currentUploadId}/files`, formData);
      setUploadedFiles((prev) => [...prev, result.file]);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast("File uploaded", "success");
    } catch (err) {
      toast(err.message || "Failed to upload file", "error");
    } finally {
      setFileUploading(false);
    }
  }

  async function handleRemoveFile(fileId) {
    try {
      await api.delete(`/portal/uploads/${uploadId_}/files/${fileId}`);
      setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async function handleSaveDetails() {
    if (!form.examDurationMins)  { toast("Exam duration is required", "error"); return; }
    if (!form.examFormat)        { toast("Exam type is required", "error"); return; }
    if (!form.bookletType)       { toast("Booklet selection is required", "error"); return; }
    if (form.scantronNeeded === "") { toast("Scantron selection is required", "error"); return; }
    if (form.calculatorAllowed === "") { toast("Calculator selection is required", "error"); return; }
    if (form.delivery === "file_upload" && uploadedFiles.length === 0) {
      toast("Please upload at least one exam file before continuing", "error");
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload();
      let currentUploadId = uploadId_;
      if (currentUploadId) {
        await api.put(`/portal/uploads/${currentUploadId}`, payload);
      } else {
        const data = await api.post("/portal/uploads", payload);
        currentUploadId = data.uploadId;
        setUploadId_(currentUploadId);
      }
      setStep("dates");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddDate() {
    if (!newDate) return;

    // Enforce 1-hour minimum from now when a time is specified
    if (newTime) {
      const examDateTime = new Date(`${newDate}T${newTime}`);
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
      if (examDateTime < oneHourFromNow) {
        toast("Exam time must be at least 1 hour from now", "error");
        return;
      }
    }

    try {
      const data = await api.post(`/portal/uploads/${uploadId_}/dates`, {
        examDate: newDate,
        timeSlot: newTime || null,
      });
      setDates((d) => [
        ...d,
        {
          id: data.dateId,
          exam_date: newDate,
          time_slot: newTime || null,
          match_status: "unmatched",
        },
      ]);
      setNewDate("");
      setNewTime("");
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async function handleRemoveDate(dateId) {
    try {
      await api.delete(`/portal/uploads/${uploadId_}/dates/${dateId}`);
      setDates((d) => d.filter((x) => x.id !== dateId));
    } catch (err) {
      toast(err.message, "error");
    }
  }

  const courseOptions =
    form.courseCode && !courses.includes(form.courseCode)
      ? [form.courseCode, ...courses]
      : courses;

  async function handleSubmit() {
    if (!dates.length) {
      toast("Add at least one exam date before saving", "warning");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/portal/uploads/${uploadId_}/submit`, {});
      toast("Exam saved successfully", "success");
      onSaved?.();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;

  return (
    <Modal
      title={isEdit ? "Edit exam upload" : "New exam upload"}
      onClose={onClose}
      width="max-w-lg"
    >
      {/* Step indicator */}
      <div className="flex gap-2 mb-5">
        {["details", "dates"].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center
                             text-xs font-medium ${
                               step === s
                                 ? "bg-brand-600 text-white"
                                 : uploadId_ || i === 0
                                   ? "bg-green-100 text-green-700"
                                   : "bg-gray-100 text-gray-400"
                             }`}
            >
              {i + 1}
            </div>
            <span
              className={`text-xs ${step === s ? "text-gray-900 font-medium" : "text-gray-400"}`}
            >
              {s === "details" ? "Exam details" : "Exam dates"}
            </span>
            {i === 0 && <span className="text-gray-300">→</span>}
          </div>
        ))}
      </div>

      {step === "details" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Course code
              </label>
              <select
                value={form.courseCode}
                onChange={(e) =>
                  setForm((f) => ({ ...f, courseCode: e.target.value }))
                }
                disabled={coursesLoading || courses.length === 0}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                <option value="" disabled>
                  {coursesLoading
                    ? "Loading courses…"
                    : "Select your assigned course"}
                </option>
                {courseOptions.map((course) => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
              </select>
              {!coursesLoading && courses.length === 0 && (
                <p className="text-xs text-red-600 mt-2">
                  No assigned courses found. Contact your lead to assign your
                  courses.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Exam type
              </label>
              <select
                value={form.examTypeLabel}
                onChange={(e) =>
                  setForm((f) => ({ ...f, examTypeLabel: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {EXAM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              How will the exam be delivered?
            </label>
            <select
              value={form.delivery}
              onChange={(e) => {
                const newDelivery = e.target.value;
                setForm((f) => ({ ...f, delivery: newDelivery }));
                if (newDelivery !== "dropped") {
                  setForm((f) => ({ ...f, estimatedCopies: "" }));
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              {DELIVERIES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* Estimated copies - shown when delivery is dropped */}
          {form.delivery === "dropped" && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Estimated copies to drop off{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="number"
                min="1"
                value={form.estimatedCopies}
                onChange={(e) =>
                  setForm((f) => ({ ...f, estimatedCopies: e.target.value }))
                }
                placeholder="e.g. 30"
                className="w-28 px-3 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
              <p className="text-xs text-amber-700 mt-1">
                Helps the lead prepare for receiving your exam.
              </p>
            </div>
          )}

          {/* File upload section - shown when delivery is file_upload */}
          {form.delivery === "file_upload" && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
              <label className="block text-xs font-medium text-gray-700">
                Exam files <span className="text-red-500">*</span>
              </label>

              {/* List of uploaded files */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-1.5">
                  {uploadedFiles.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-blue-100"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {f.file_original_name}
                        </p>
                        <p className="text-xs text-gray-400">
                          {f.file_size ? `${(f.file_size / 1024).toFixed(1)} KB` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {f.url && (
                          <a
                            href={f.url}
                            download
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            Download
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(f.id)}
                          className="text-xs text-red-400 hover:text-red-600"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add new file */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPendingFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm
                               font-medium rounded-lg transition-colors"
                  >
                    {pendingFile ? "Change file" : "Add PDF file"}
                  </button>
                  {pendingFile && (
                    <button
                      type="button"
                      onClick={handleUploadFile}
                      disabled={fileUploading}
                      className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm
                                 font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {fileUploading ? "Uploading…" : "Upload"}
                    </button>
                  )}
                </div>
                {pendingFile && (
                  <p className="text-xs text-gray-600 mt-1">
                    Selected: {pendingFile.name} ({(pendingFile.size / 1024).toFixed(1)} KB)
                  </p>
                )}
                <p className="text-xs text-blue-600 mt-1">
                  PDF files up to 10 MB each.
                </p>
              </div>
            </div>
          )}

          {/* Exam duration + format */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Exam duration <span className="text-red-500">*</span>{" "}
                <span className="text-gray-400 font-normal">(minutes)</span>
              </label>
              <input
                type="number"
                min="1"
                max="600"
                value={form.examDurationMins}
                onChange={(e) =>
                  setForm((f) => ({ ...f, examDurationMins: e.target.value }))
                }
                placeholder="e.g. 120"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Exam type <span className="text-red-500">*</span>
              </label>
              <select
                value={form.examFormat}
                onChange={(e) =>
                  setForm((f) => ({ ...f, examFormat: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {EXAM_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Booklet + scantron + calculator */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Booklet required? <span className="text-red-500">*</span>
            </label>
            <select
              value={form.bookletType}
              onChange={(e) =>
                setForm((f) => ({ ...f, bookletType: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              {BOOKLET_TYPES.map((b) => (
                <option key={b.value} value={b.value}>{b.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Scantron needed? <span className="text-red-500">*</span>
              </label>
              <select
                value={form.scantronNeeded}
                onChange={(e) =>
                  setForm((f) => ({ ...f, scantronNeeded: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                <option value="">Select…</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Calculator? <span className="text-red-500">*</span>
              </label>
              <select
                value={form.calculatorAllowed}
                onChange={(e) =>
                  setForm((f) => ({ ...f, calculatorAllowed: e.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                <option value="">Select…</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Materials permitted
            </label>
            <textarea
              value={form.materials}
              onChange={(e) =>
                setForm((f) => ({ ...f, materials: e.target.value }))
              }
              rows={2}
              placeholder="e.g. one double-sided cue sheet"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         resize-none focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Password{" "}
              <span className="text-gray-400 font-normal">
                (if Brightspace or online exam)
              </span>
            </label>
            <input
              type="text"
              value={form.password}
              onChange={(e) =>
                setForm((f) => ({ ...f, password: e.target.value }))
              }
              placeholder="Leave blank if paper exam"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isMakeup}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isMakeup: e.target.checked }))
                }
                className="accent-purple-600"
              />
              <span className="text-sm text-gray-700">This is a makeup exam</span>
            </label>
          </div>

          {form.isMakeup && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Makeup notes{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                value={form.makeupNotes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, makeupNotes: e.target.value }))
                }
                placeholder="e.g. For student who missed the April 14th sitting"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
            </div>
          )}

          <button
            onClick={handleSaveDetails}
            disabled={
              saving ||
              fileUploading ||
              !form.courseCode ||
              !form.examDurationMins ||
              !form.examFormat ||
              !form.bookletType ||
              form.scantronNeeded === "" ||
              form.calculatorAllowed === "" ||
              (form.delivery === "file_upload" && uploadedFiles.length === 0)
            }
            className="w-full py-2 bg-brand-600 hover:bg-brand-800 text-white text-sm
                       font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Next →"}
          </button>
        </div>
      )}

      {step === "dates" && (
        <div className="space-y-4">
          {/* Add date */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              Add exam dates
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                placeholder="Time (optional)"
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
              <button
                onClick={handleAddDate}
                disabled={!newDate}
                className="px-3 py-2 bg-brand-600 hover:bg-brand-800 text-white text-sm
                           font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                Add
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Leave time blank if this exam applies to all time slots on that
              date. If a time is set, it must be at least 1 hour from now.
            </p>
          </div>

          {/* Date list */}
          {dates.length > 0 ? (
            <div className="space-y-1.5">
              {dates.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between px-3 py-2
                             bg-gray-50 border border-gray-200 rounded-lg"
                >
                  <span className="text-sm text-gray-700">
                    {new Date(d.exam_date + "T12:00:00").toLocaleDateString(
                      "en-CA",
                      {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      },
                    )}
                    {d.time_slot && (
                      <span className="text-gray-500 ml-2">
                        at {d.time_slot.slice(0, 5)}
                      </span>
                    )}
                    {!d.time_slot && (
                      <span className="text-gray-400 ml-2 text-xs">
                        all times
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => handleRemoveDate(d.id)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
              Add at least one date to submit this exam
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setStep("details")}
              className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm
                         font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !dates.length}
              className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white text-sm
                         font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Save exam"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
