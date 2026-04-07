import { useState, useEffect, useCallback } from "react";
import TopNav from "../components/ui/TopNav.jsx";
import { api } from "../lib/api.js";
import { toast } from "../components/ui/Toast.jsx";
import Modal from "../components/ui/Modal.jsx";
import Spinner from "../components/ui/Spinner.jsx";
import StudentDetail from "../components/students/StudentDetail.jsx";

function AccommodationPill({ code }) {
  const rwg = code.triggers_rwg_flag;
  return (
    <span
      className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
        rwg ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
      }`}
    >
      {code.code}
    </span>
  );
}

function StudentRow({ student, onClick }) {
  return (
    <tr
      onClick={onClick}
      className="hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
    >
      <td className="px-4 py-3">
        <div className="text-sm font-medium text-gray-900">
          {student.first_name || student.last_name ? (
            `${student.first_name} ${student.last_name}`.trim()
          ) : (
            <span className="text-gray-400 italic">Unknown</span>
          )}
        </div>
        <div className="text-xs text-gray-500 font-mono">
          {student.student_number}
        </div>
      </td>
      <td className="px-4 py-3">
        {student.do_not_call ? (
          <span
            className="text-xs text-red-600 font-medium bg-red-50
                           px-2 py-0.5 rounded border border-red-200"
          >
            † Do not call
          </span>
        ) : (
          <span className="text-xs text-gray-500">{student.phone ?? "—"}</span>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-xs text-gray-500">
          {student.appointment_count}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-400">
        {student.last_seen_date
          ? new Date(student.last_seen_date).toLocaleDateString("en-CA", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "—"}
      </td>
    </tr>
  );
}

export default function Students() {
  const [students, setStudents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);

  const LIMIT = 50;

  async function loadPage(p = 1) {
    setLoading(true);
    try {
      const data = await api.get(`/students?page=${p}&limit=${LIMIT}`);
      setStudents(data.students);
      setTotal(data.total);
      setPage(p);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage(1);
  }, []); // eslint-disable-line

  // Debounced search
  useEffect(() => {
    if (!search.trim()) {
      loadPage(1);
      return;
    }
    if (search.trim().length < 2) return;

    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await api.get(
          `/students/search?q=${encodeURIComponent(search)}`,
        );
        setStudents(data.students);
        setTotal(data.students.length);
      } catch (err) {
        toast(err.message, "error");
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-5">
          <h1 className="text-xl font-semibold text-gray-900">
            Student profiles
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {total} student{total !== 1 ? "s" : ""} on record
          </p>
        </div>

        {/* Search */}
        <div className="mb-4 flex items-center gap-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or student number…"
            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg
                       text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          {searching && (
            <span className="text-xs text-gray-400">Searching…</span>
          )}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : students.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-400">
            {search
              ? "No students match your search"
              : "No students on record yet"}
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Student
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Phone
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">
                      Appointments
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                      Last seen
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <StudentRow
                      key={s.id}
                      student={s}
                      onClick={() => setSelected(s.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {!search && totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  disabled={page === 1}
                  onClick={() => loadPage(page - 1)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg
                             hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                <span className="text-sm text-gray-500">
                  Page {page} of {totalPages}
                </span>
                <button
                  disabled={page === totalPages}
                  onClick={() => loadPage(page + 1)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg
                             hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Student detail modal */}
      {selected && (
        <Modal
          title="Student profile"
          onClose={() => setSelected(null)}
          width="max-w-2xl"
        >
          <StudentDetail
            studentId={selected}
            onClose={() => setSelected(null)}
            onUpdated={() => loadPage(page)}
          />
        </Modal>
      )}
    </div>
  );
}
