import { useState, useEffect } from "react";
import Modal from "../ui/Modal.jsx";
import { api } from "../../lib/api.js";
import { toast } from "../ui/Toast.jsx";

const DELIVERY_OPTIONS = [
  { value: "pickup", label: "Pickup" },
  { value: "dropped", label: "Dropped off" },
  { value: "delivery", label: "Delivery" },
  { value: "pending", label: "Pending" },
];

export default function AddDossierModal({ onClose, onCreated }) {
  const [professors, setProfessors] = useState([]);
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState({
    professorId: "",
    courseId: "",
    preferredDelivery: "pending",
    typicalMaterials: "",
    passwordReminder: false,
    notes: "",
  });
  const [loadingProfessors, setLoadingProfessors] = useState(true);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [profData, courseData] = await Promise.all([
          api.get("/professors"),
          api.get("/institution/course-list"),
        ]);
        setProfessors(profData.professors || []);
        setCourses(courseData.courses ?? []);
      } catch (err) {
        toast(err.message, "error");
      } finally {
        setLoadingProfessors(false);
        setLoadingCourses(false);
      }
    }
    load();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const professor = professors.find((p) => p.id === form.professorId);
      if (!professor) throw new Error("Please select a professor");
      if (!form.courseId) throw new Error("Please select a course");

      const selectedCourse = courses.find((c) => c.id === form.courseId);

      await api.post("/professors/link-courses", {
        professorEmail: professor.email,
        courseId: form.courseId,
        preferredDelivery: form.preferredDelivery,
        typicalMaterials: form.typicalMaterials || undefined,
        passwordReminder: form.passwordReminder,
        notes: form.notes || undefined,
      });
      toast(`Dossier added for ${selectedCourse?.code ?? form.courseId}`, "success");
      onCreated?.();
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Add dossier" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-500">
          Select a professor and course, then record the drop-off dossier
          details.
        </p>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Professor
          </label>
          <select
            required
            value={form.professorId}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, professorId: e.target.value }))
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            <option value="" disabled>
              {loadingProfessors ? "Loading professors…" : "Select a professor"}
            </option>
            {professors.map((prof) => (
              <option key={prof.id} value={prof.id}>
                {prof.first_name} {prof.last_name} — {prof.email}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Course
          </label>
          <select
            required
            disabled={loadingCourses || courses.length === 0}
            value={form.courseId}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, courseId: e.target.value }))
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 disabled:bg-gray-100"
          >
            <option value="" disabled>
              {loadingCourses ? "Loading courses…" : courses.length === 0 ? "No courses in master list" : "Select a course"}
            </option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}{c.name ? ` — ${c.name}` : ""}
              </option>
            ))}
          </select>
          {!loadingCourses && courses.length === 0 && (
            <p className="mt-1 text-xs text-gray-500">
              Add courses under the Courses tab first.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Delivery
          </label>
          <select
            value={form.preferredDelivery}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                preferredDelivery: e.target.value,
              }))
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            {DELIVERY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Typical materials
          </label>
          <input
            value={form.typicalMaterials}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, typicalMaterials: e.target.value }))
            }
            placeholder="e.g. blue book, calculator allowed"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="cursor-pointer text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.passwordReminder}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  passwordReminder: e.target.checked,
                }))
              }
              className="mr-2 leading-tight"
            />
            Password reminder required
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            value={form.notes}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, notes: e.target.value }))
            }
            placeholder="Add any follow-up details for the lead…"
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !form.professorId || !form.courseId}
            className="flex-1 py-2 bg-brand-600 hover:bg-brand-800 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add dossier"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
