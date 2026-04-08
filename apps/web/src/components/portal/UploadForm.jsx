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
  { value: "pickup", label: "AC picks it up" },
  { value: "delivery", label: "Delivered to room" },
  { value: "file_upload", label: "I will upload the file" },
];

export default function UploadForm({ uploadId, onClose, onSaved }) {
  const isEdit = !!uploadId;

  const [form, setForm] = useState({
    courseCode: "",
    examTypeLabel: "midterm",
    versionLabel: "",
    delivery: "pending",
    materials: "",
    password: "",
    rwgFlag: false,
    isMakeup: false,
    makeupNotes: "",
    estimatedCopies: "",
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

  // File upload state
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileUploading, setFileUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const fileInputRef = useRef(null);

  // Load existing upload if editing
  useEffect(() => {
    if (!uploadId) return;
    api
      .get(`/portal/uploads/${uploadId}`)
      .then((d) => {
        const u = d.upload;
        setForm({
          courseCode: u.course_code,
          examTypeLabel: u.exam_type_label,
          versionLabel: u.version_label ?? "",
          delivery: u.delivery,
          materials: u.materials ?? "",
          password: u.password ?? "",
          rwgFlag: u.rwg_flag,
          isMakeup: u.is_makeup,
          makeupNotes: u.makeup_notes ?? "",
          estimatedCopies: u.estimated_copies ?? "",
        });
        setDates(u.dates ?? []);
        // Load existing file info if present
        if (u.file_path) {
          setUploadedFile({
            originalName: u.file_original_name,
            size: u.file_size,
            uploadedAt: u.file_uploaded_at,
            url: u.file_url,
          });
        }
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

  async function handleSaveDetails() {
    if (form.delivery === "file_upload" && !uploadedFile && !selectedFile) {
      toast("Please select an exam PDF file before continuing", "error");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        estimatedCopies: form.estimatedCopies !== "" ? Number(form.estimatedCopies) : null,
      };
      let currentUploadId = uploadId_;
      if (currentUploadId) {
        await api.put(`/portal/uploads/${currentUploadId}`, payload);
      } else {
        const data = await api.post("/portal/uploads", payload);
        currentUploadId = data.uploadId;
        setUploadId_(currentUploadId);
      }

      // Upload the file now that we have an uploadId
      if (form.delivery === "file_upload" && selectedFile && !uploadedFile) {
        setFileUploading(true);
        const formData = new FormData();
        formData.append("file", selectedFile);
        const result = await api.upload(
          `/portal/uploads/${currentUploadId}/file`,
          formData,
        );
        setUploadedFile(result.file);
      }

      setStep("dates");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
      setFileUploading(false);
    }
  }

  async function handleAddDate() {
    if (!newDate) return;
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
              Version label{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              value={form.versionLabel}
              onChange={(e) =>
                setForm((f) => ({ ...f, versionLabel: e.target.value }))
              }
              placeholder="e.g. Midterm 2 — Section A"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
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
                // Clear file selection if not file_upload
                if (newDelivery !== "file_upload") {
                  setSelectedFile(null);
                  setUploadedFile(null);
                }
                // Clear estimated copies if not dropped
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
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <label className="block text-xs font-medium text-gray-700 mb-2">
                Exam file <span className="text-red-500">*</span>
              </label>

              {!uploadedFile ? (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm
                                 font-medium rounded-lg transition-colors"
                    >
                      {selectedFile ? "Change file" : "Choose PDF file"}
                    </button>
                    {selectedFile && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!uploadId_ || !selectedFile) return;
                          setFileUploading(true);
                          try {
                            const formData = new FormData();
                            formData.append("file", selectedFile);
                            const result = await api.upload(
                              `/portal/uploads/${uploadId_}/file`,
                              formData,
                            );
                            setUploadedFile(result.file);
                            toast("File uploaded successfully", "success");
                          } catch (err) {
                            toast(err.message || "Failed to upload file", "error");
                          } finally {
                            setFileUploading(false);
                          }
                        }}
                        disabled={fileUploading}
                        className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm
                                   font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        {fileUploading ? "Uploading..." : "Upload"}
                      </button>
                    )}
                  </div>
                  {selectedFile && (
                    <p className="text-xs text-gray-600 mt-2">
                      Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                  <p className="text-xs text-blue-600 mt-2">
                    Only PDF files up to 10MB are allowed.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {uploadedFile.originalName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {(uploadedFile.size / 1024).toFixed(1)} KB • Uploaded{" "}
                      {new Date(uploadedFile.uploadedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={uploadedFile.url}
                      download
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setUploadedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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
              placeholder="e.g. Scientific calculator, one double-sided cue sheet"
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

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.rwgFlag}
                onChange={(e) =>
                  setForm((f) => ({ ...f, rwgFlag: e.target.checked }))
                }
                className="accent-brand-600"
              />
              <span className="text-sm text-gray-700">
                Some students require a Word file (RWG accommodation)
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isMakeup}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isMakeup: e.target.checked }))
                }
                className="accent-purple-600"
              />
              <span className="text-sm text-gray-700">
                This is a makeup exam
              </span>
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
              !form.courseCode ||
              (form.delivery === "file_upload" && !uploadedFile && !selectedFile)
            }
            className="w-full py-2 bg-brand-600 hover:bg-brand-800 text-white text-sm
                       font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {fileUploading ? "Uploading file…" : saving ? "Saving…" : "Next →"}
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
              date
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
