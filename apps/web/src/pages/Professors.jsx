import { useState, useEffect } from "react";
import TopNav from "../components/ui/TopNav.jsx";
import { api } from "../lib/api.js";
import { toast } from "../components/ui/Toast.jsx";
import Modal from "../components/ui/Modal.jsx";
import Spinner from "../components/ui/Spinner.jsx";
import ProfessorDetail from "../components/professors/ProfessorDetail.jsx";
import CreateProfessorModal from "../components/professors/CreateProfessorModal.jsx";

function ProfRow({ prof, onClick }) {
  return (
    <tr
      onClick={onClick}
      className="hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
    >
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900 text-sm">
          {prof.first_name} {prof.last_name}
        </div>
        <div className="text-xs text-gray-500">{prof.email}</div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {prof.department ?? <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {prof.phone ?? <span className="text-gray-300">—</span>}
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">
          {prof.dossier_count}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-xs text-gray-500">{prof.exam_count}</span>
      </td>
      <td className="px-4 py-3 text-xs text-gray-400">
        {prof.last_exam_date
          ? new Date(prof.last_exam_date).toLocaleDateString("en-CA", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "—"}
      </td>
    </tr>
  );
}

export default function Professors() {
  const [professors, setProfessors] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get("/professors");
      setProfessors(data.professors);
      setFiltered(data.professors);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []); // eslint-disable-line

  useEffect(() => {
    const q = search.toLowerCase().trim();
    if (!q) {
      setFiltered(professors);
      return;
    }
    setFiltered(
      professors.filter(
        (p) =>
          `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          (p.department ?? "").toLowerCase().includes(q),
      ),
    );
  }, [search, professors]);

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              Professor directory
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {professors.length} professor{professors.length !== 1 ? "s" : ""}{" "}
              in this institution
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 bg-brand-600 hover:bg-brand-800 text-white
                       text-sm font-medium rounded-lg transition-colors"
          >
            + Add professor
          </button>
        </div>

        {/* Search */}
        <div className="mb-4">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or department…"
            className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg
                       text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-400">
            {search
              ? "No professors match your search"
              : "No professors yet — add one to get started"}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                    Department
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                    Phone
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">
                    Dossiers
                  </th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">
                    Exams
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">
                    Last exam
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <ProfRow
                    key={p.id}
                    prof={p}
                    onClick={() => setSelected(p.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Professor detail modal */}
      {selected && (
        <Modal
          title="Professor"
          onClose={() => setSelected(null)}
          width="max-w-2xl"
        >
          <ProfessorDetail
            professorId={selected}
            onClose={() => setSelected(null)}
            onUpdated={load}
          />
        </Modal>
      )}

      {/* Create professor modal */}
      {showCreate && (
        <CreateProfessorModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}
    </div>
  );
}
