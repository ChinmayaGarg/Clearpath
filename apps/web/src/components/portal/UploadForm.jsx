import { useState, useEffect, useRef } from "react";
import Modal from "../ui/Modal.jsx";
import { api } from "../../lib/api.js";
import { toast } from "../ui/Toast.jsx";

// Time slots: 7:45 AM – 8:00 PM in 5-minute intervals
const TIME_SLOTS = (() => {
  const slots = [];
  for (let mins = 7 * 60 + 45; mins <= 20 * 60; mins += 5) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const period = h < 12 ? 'AM' : 'PM';
    const displayH = h > 12 ? h - 12 : h;
    slots.push({ value, label: `${displayH}:${String(m).padStart(2, '0')} ${period}` });
  }
  return slots;
})();

const EXAM_TYPES = [
  { value: "final",      label: "Final"      },
  { value: "midterm",    label: "Midterm"    },
  { value: "quiz_1",     label: "Quiz 1"     },
  { value: "quiz_2",     label: "Quiz 2"     },
  { value: "quiz_3",     label: "Quiz 3"     },
  { value: "quiz_4",     label: "Quiz 4"     },
  { value: "test_1",     label: "Test 1"     },
  { value: "test_2",     label: "Test 2"     },
  { value: "test_3",     label: "Test 3"     },
  { value: "assignment", label: "Assignment" },
];

const DELIVERIES_PROF = [
  { value: "dropped",     label: "I will drop it off" },
  { value: "file_upload", label: "I will upload"       },
];

const DELIVERIES_ADMIN = [
  { value: "dropped",     label: "Dropped off" },
  { value: "file_upload", label: "Emailed"     },
];

const EXAM_FORMATS = [
  { value: "", label: "Select…" },
  { value: "paper", label: "Paper" },
  { value: "crowdmark", label: "Crowdmark" },
  { value: "brightspace", label: "Brightspace" },
];

const CALCULATOR_TYPES = [
  { value: "", label: "Select…" },
  { value: "none", label: "No Calculator Allowed" },
  { value: "basic", label: "Basic calculator" },
  { value: "scientific", label: "Scientific calculator" },
  { value: "non_programmable", label: "Non-programmable & non-communicable calculator" },
  { value: "financial", label: "Financial calculator" },
];

const COLLECTION_METHODS = [
  { value: "", label: "Select…" },
  { value: "delivery", label: "Delivered to room after exam" },
  { value: "pickup_mah", label: "Pickup from MAH (Studley Campus)" },
  { value: "pickup_sexton", label: "Pickup from Sexton Campus" },
];

const BOOKLET_TYPES = [
  { value: "", label: "Select…" },
  { value: "not_needed", label: "Not needed" },
  { value: "engineering_booklet", label: "Engineering booklet" },
  { value: "essay_booklet", label: "Essay booklet" },
];

export default function UploadForm({ uploadId, isWordDoc: isWordDocProp = false, profId = null, onClose, onSaved }) {
  const isEdit = !!uploadId;
  // When editing an existing upload, `isWordDoc` comes from the server; when creating, from the prop
  const [isWordDoc, setIsWordDoc] = useState(isWordDocProp);

  // If profId is set we are in lead/admin context — use /professor/:profId/... routes
  const uploadsBase = profId ? `/portal/professor/${profId}/uploads` : `/portal/uploads`;

  const [form, setForm] = useState({
    courseCode:        "",
    examTypeLabel:     "midterm",
    delivery:          profId ? "dropped" : "file_upload",
    materials:         "",
    password:          "",
    isMakeup:          false,
    makeupNotes:       "",
    estimatedCopies:   "",
    examDurationMins:     "",
    examFormat:           "",
    bookletType:          "",
    scantronNeeded:       "",
    calculatorType:       "",
    studentInstructions:  "",
    examCollectionMethod: "",
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
      .get(`${uploadsBase}/${uploadId}`)
      .then((d) => {
        const u = d.upload;
        setIsWordDoc(!!u.is_word_doc);
        setForm({
          courseCode:        u.course_code,
          examTypeLabel:     u.exam_type_label,
          delivery:          u.delivery,
          materials:         u.materials          ?? "",
          password:          u.password           ?? "",
          isMakeup:          u.is_makeup,
          makeupNotes:       u.makeup_notes       ?? "",
          estimatedCopies:   u.estimated_copies   ?? "",
          examDurationMins:     u.exam_duration_mins      ?? "",
          examFormat:           u.exam_format             ?? "",
          bookletType:          u.booklet_type            ?? "",
          scantronNeeded:       u.scantron_needed ?? "",
          calculatorType:       u.calculator_type         ?? "",
          studentInstructions:  u.student_instructions    ?? "",
          examCollectionMethod: u.exam_collection_method  ?? "",
        });
        setDates(u.dates ?? []);
        setUploadedFiles(u.files ?? []);
      })
      .catch((err) => toast(err.message, "error"))
      .finally(() => setLoading(false));
  }, [uploadId]); // eslint-disable-line

  useEffect(() => {
    let mounted = true;
    const endpoint = profId ? `/portal/professor/${profId}/courses` : `/portal/courses`;
    api
      .get(endpoint)
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
  }, []); // eslint-disable-line

  function buildPayload() {
    return {
      ...form,
      isWordDoc,
      delivery: isWordDoc ? "file_upload" : form.delivery,
      estimatedCopies:   form.estimatedCopies   !== "" ? Number(form.estimatedCopies)   : null,
      examDurationMins:  form.examDurationMins  !== "" ? Number(form.examDurationMins)  : null,
      examFormat:           form.examFormat           || null,
      bookletType:          form.bookletType          || null,
      scantronNeeded:       form.scantronNeeded || null,
      calculatorType:       form.calculatorType       || null,
      studentInstructions:  form.studentInstructions  || null,
      examCollectionMethod: form.examCollectionMethod || null,
    };
  }

  async function handleUploadFile() {
    if (!pendingFile) return;

    // If no upload exists yet, create the draft first
    let currentUploadId = uploadId_;
    if (!currentUploadId) {
      if (!form.courseCode) { toast("Please select a course before uploading", "error"); return; }
      if (!isWordDoc) {
        if (!form.examDurationMins)       { toast("Exam duration is required", "error"); return; }
        if (!form.examFormat)             { toast("Exam format is required", "error"); return; }
        if (!form.bookletType)            { toast("Booklet selection is required", "error"); return; }
        if (form.scantronNeeded === "")   { toast("Scantron selection is required", "error"); return; }
        if (!form.calculatorType)         { toast("Calculator selection is required", "error"); return; }
        if (!form.examCollectionMethod)   { toast("Exam collection method is required", "error"); return; }
      }
      try {
        const data = await api.post(uploadsBase, buildPayload());
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
      const result = await api.upload(`${uploadsBase}/${currentUploadId}/files`, formData);
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
      await api.delete(`${uploadsBase}/${uploadId_}/files/${fileId}`);
      setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
    } catch (err) {
      toast(err.message, "error");
    }
  }

  async function handleSaveDetails() {
    if (!isWordDoc) {
      if (!form.examDurationMins)     { toast("Exam duration is required", "error"); return; }
      if (!form.examFormat)           { toast("Exam type is required", "error"); return; }
      if (!form.bookletType)          { toast("Booklet selection is required", "error"); return; }
      if (form.scantronNeeded === "") { toast("Scantron selection is required", "error"); return; }
      if (!form.calculatorType)       { toast("Calculator selection is required", "error"); return; }
      if (!form.examCollectionMethod) { toast("Exam collection method is required", "error"); return; }
    }
    if ((isWordDoc || form.delivery === "file_upload") && uploadedFiles.length === 0) {
      toast("Please upload at least one file before continuing", "error");
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload();
      let currentUploadId = uploadId_;
      if (currentUploadId) {
        await api.put(`${uploadsBase}/${currentUploadId}`, payload);
      } else {
        const data = await api.post(uploadsBase, payload);
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
      const data = await api.post(`${uploadsBase}/${uploadId_}/dates`, {
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
      await api.delete(`${uploadsBase}/${uploadId_}/dates/${dateId}`);
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
      await api.post(`${uploadsBase}/${uploadId_}/submit`, {});
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
      title={isWordDoc
        ? (isEdit ? "Edit Word document (RWG)" : "Upload Word document (RWG students)")
        : (isEdit ? "Edit exam upload" : "New exam upload")}
      onClose={onClose}
      width="max-w-lg"
    >
      {isWordDoc && (
        <div className="mb-4 flex items-start gap-2 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
          <span className="text-purple-500 shrink-0 text-sm">⚠</span>
          <p className="text-xs text-purple-700 font-medium">
            Word document upload for students with RWG accommodation. Only .docx / .doc files are accepted.
          </p>
        </div>
      )}

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
                    : "Select course"}
                </option>
                {courseOptions.map((course) => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
              </select>
              {!coursesLoading && courses.length === 0 && (
                <p className="text-xs text-red-600 mt-2">
                  {profId
                    ? "No courses assigned to this professor yet."
                    : "No assigned courses found. Contact your lead to assign your courses."}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Exam Category
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
              {profId ? "How are the exams delivered?" : "How will the exam be delivered?"}
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
              {(profId ? DELIVERIES_ADMIN : DELIVERIES_PROF).map((d) => (
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

          {/* File upload section — shown for file_upload delivery or Word doc uploads */}
          {(isWordDoc || form.delivery === "file_upload") && (
            <div className={`p-4 rounded-lg space-y-3 border ${isWordDoc ? 'bg-purple-50 border-purple-200' : 'bg-blue-50 border-blue-200'}`}>
              <label className="block text-xs font-medium text-gray-700">
                {isWordDoc ? "Word document" : "Exam files"} <span className="text-red-500">*</span>
              </label>

              {/* List of uploaded files */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-1.5">
                  {uploadedFiles.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-gray-100"
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
                  accept={isWordDoc ? ".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword" : "application/pdf"}
                  onChange={(e) => setPendingFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`px-3 py-2 text-white text-sm font-medium rounded-lg transition-colors ${isWordDoc ? 'bg-purple-600 hover:bg-purple-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    {pendingFile ? "Change file" : isWordDoc ? "Add Word file" : "Add PDF file"}
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
                <p className={`text-xs mt-1 ${isWordDoc ? 'text-purple-600' : 'text-blue-600'}`}>
                  {isWordDoc ? ".docx or .doc files up to 10 MB." : "PDF files up to 10 MB each."}
                </p>
              </div>
            </div>
          )}

          {/* Exam-specific fields — hidden for Word doc uploads */}
          {!isWordDoc && (<>
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
                  Exam Format <span className="text-red-500">*</span>
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

            {/* Booklet + scantron side by side */}
            <div className="grid grid-cols-2 gap-3">
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

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Scantron needed? <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.scantronNeeded}
                  onChange={(e) => setForm((f) => ({ ...f, scantronNeeded: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-brand-600"
                >
                  <option value="">Select…</option>
                  <option value="not_needed">Not needed</option>
                  <option value="purple">Purple</option>
                  <option value="green">Green</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Calculator Needed? <span className="text-red-500">*</span>
              </label>
              <select
                value={form.calculatorType}
                onChange={(e) => setForm((f) => ({ ...f, calculatorType: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {CALCULATOR_TYPES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                How would you like to collect completed exams? <span className="text-red-500">*</span>
              </label>
              <select
                value={form.examCollectionMethod}
                onChange={(e) => setForm((f) => ({ ...f, examCollectionMethod: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600"
              >
                {COLLECTION_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Instructions for students{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={form.studentInstructions}
                onChange={(e) => setForm((f) => ({ ...f, studentInstructions: e.target.value }))}
                rows={3}
                placeholder="e.g. Allowed to use phone/laptop to submit PDF during the last 10 minutes"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                           resize-none focus:outline-none focus:ring-2 focus:ring-brand-600"
              />
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
          </>)}

          <button
            onClick={handleSaveDetails}
            disabled={
              saving ||
              fileUploading ||
              !form.courseCode ||
              (!isWordDoc && (
                !form.examDurationMins ||
                !form.examFormat ||
                !form.bookletType ||
                form.scantronNeeded === "" ||
                !form.calculatorType ||
                !form.examCollectionMethod
              )) ||
              ((isWordDoc || form.delivery === "file_upload") && uploadedFiles.length === 0)
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
              <select
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="w-36 px-3 py-2 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
              >
                <option value="">All day</option>
                {TIME_SLOTS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
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
              Select "All day" if this exam applies to all time slots on that
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
