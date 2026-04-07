import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useBook } from "../hooks/useBook.js";
import { useBookStore } from "../store/bookStore.js";
import { useAuth } from "../hooks/useAuth.js";
import BookView from "../components/book/BookView.jsx";
import PdfImport from "../components/book/PdfImport.jsx";
import Modal from "../components/ui/Modal.jsx";
import ExportButton from "../components/book/ExportButton.jsx";
import TopNav from "../components/ui/TopNav.jsx";
import { formatDate, shiftDate, todayStr } from "../lib/utils.js";

export default function Book() {
  const { date, setDate } = useBook();
  const loadAllDates = useBookStore((s) => s.loadAllDates);
  const { user, isAdmin, logout } = useAuth();
  const [showImport, setShowImport] = useState(false);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    loadAllDates();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filters = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "emailed", label: "Emailed" },
    { key: "received", label: "Received" },
    { key: "rwg", label: "RWG" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <TopNav />

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Date nav */}
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => setDate(shiftDate(date, -1))}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100
                       text-gray-500 transition-colors text-sm"
          >
            ←
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-gray-900">
              {formatDate(date)}
            </h1>
          </div>
          <button
            onClick={() => setDate(shiftDate(date, 1))}
            className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100
                       text-gray-500 transition-colors text-sm"
          >
            →
          </button>
          <button
            onClick={() => setDate(todayStr())}
            className="px-3 py-1.5 text-sm text-gray-600 border border-gray-200
                       rounded-lg hover:bg-gray-50 transition-colors"
          >
            Today
          </button>
          <ExportButton date={date} />
          <button
            onClick={() => setShowImport(true)}
            className="px-3 py-1.5 text-sm font-medium text-white bg-brand-600
                       hover:bg-brand-800 rounded-lg transition-colors"
          >
            Import PDF
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-1.5 mb-4">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-brand-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Book */}
        <BookView filter={filter} />
      </div>

      {/* PDF import modal */}
      {showImport && (
        <Modal title="Import SARS PDFs" onClose={() => setShowImport(false)}>
          <PdfImport onImportComplete={() => setShowImport(false)} />
        </Modal>
      )}
    </div>
  );
}
