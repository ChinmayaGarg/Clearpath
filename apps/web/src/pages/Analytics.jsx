import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import TopNav from "../components/ui/TopNav.jsx";
import Modal from "../components/ui/Modal.jsx";
import { api } from "../lib/api.js";
import { toast } from "../components/ui/Toast.jsx";
import Spinner from "../components/ui/Spinner.jsx";
import { useAuth } from "../hooks/useAuth.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLOURS = {
  pending:             "bg-amber-100 text-amber-700",
  professor_approved:  "bg-blue-100 text-blue-700",
  professor_rejected:  "bg-red-100 text-red-600",
  confirmed:           "bg-green-100 text-green-700",
  cancelled:           "bg-red-100 text-red-600",
};
const STATUS_LABELS = {
  pending:             "Pending",
  professor_approved:  "Prof. Approved",
  professor_rejected:  "Prof. Rejected",
  confirmed:           "Confirmed",
  cancelled:           "Cancelled",
};

function fmtTime(t) {
  if (!t) return "—";
  return String(t).slice(0, 5);
}

function fmtDate(d) {
  if (!d) return "—";
  return String(d).slice(0, 10);
}

function daysAgo(d) {
  if (!d) return "—";
  const diff = Math.floor((Date.now() - new Date(d)) / 86_400_000);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  return `${diff}d ago`;
}

// ── Column definitions for detail modals ──────────────────────────────────────

const REQUEST_COLS = [
  { key: "student_name",  label: "Student" },
  { key: "course_code",   label: "Course" },
  { key: "exam_date",     label: "Date",   render: (r) => fmtDate(r.exam_date) },
  { key: "exam_type",     label: "Type",   render: (r) => <span className="capitalize">{r.exam_type ?? "—"}</span> },
  { key: "status",        label: "Status", render: (r) => (
    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLOURS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
      {STATUS_LABELS[r.status] ?? r.status}
    </span>
  )},
  { key: "is_rwg",        label: "RWG",    render: (r) => r.is_rwg
      ? <span className="text-xs font-semibold text-red-600">RWG</span>
      : <span className="text-gray-300">—</span>
  },
];

const CONFIRMED_COLS = [
  { key: "student_name",      label: "Student" },
  { key: "course_code",       label: "Course" },
  { key: "exam_date",         label: "Date",         render: (r) => fmtDate(r.exam_date) },
  { key: "exam_time",         label: "Time",         render: (r) => fmtTime(r.exam_time) },
  { key: "confirmed_by_name", label: "Confirmed by", render: (r) => r.confirmed_by_name ?? "—" },
  { key: "room_name",         label: "Room",         render: (r) => r.room_name ?? "—" },
];

const PENDING_COLS = [
  { key: "student_name",  label: "Student" },
  { key: "course_code",   label: "Course" },
  { key: "exam_date",     label: "Exam Date",  render: (r) => fmtDate(r.exam_date) },
  { key: "professor_name",label: "Professor",  render: (r) => r.professor_name ?? "—" },
  { key: "created_at",    label: "Submitted",  render: (r) => daysAgo(r.created_at) },
];

const PROF_APPROVED_COLS = [
  { key: "student_name",  label: "Student" },
  { key: "course_code",   label: "Course" },
  { key: "exam_date",     label: "Exam Date",   render: (r) => fmtDate(r.exam_date) },
  { key: "exam_time",     label: "Time",        render: (r) => fmtTime(r.exam_time) },
  { key: "professor_name",label: "Professor",   render: (r) => r.professor_name ?? "—" },
  { key: "created_at",    label: "Approved",    render: (r) => daysAgo(r.created_at) },
];

const CANCELLED_COLS = [
  { key: "student_name",  label: "Student" },
  { key: "course_code",   label: "Course" },
  { key: "exam_date",     label: "Exam Date",  render: (r) => fmtDate(r.exam_date) },
  { key: "created_at",    label: "Cancelled",  render: (r) => daysAgo(r.created_at) },
];

const STUDENT_COLS = [
  { key: "student_name",       label: "Student" },
  { key: "student_number",     label: "Student #",     render: (r) => r.student_number ?? "—" },
  { key: "request_count",      label: "Requests" },
  { key: "confirmed_count",    label: "Confirmed" },
  { key: "accommodation_codes",label: "Accommodations" },
];

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, colour = "brand", onClick, onSubClick }) {
  const colours = {
    brand: "bg-brand-50 border-brand-600 border-opacity-20 text-brand-800",
    green: "bg-green-50 border-green-200 text-green-800",
    red:   "bg-red-50 border-red-200 text-red-700",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    gray:  "bg-gray-50 border-gray-200 text-gray-700",
  };
  return (
    <div
      className={`border rounded-xl p-4 ${colours[colour]} ${
        onClick ? "cursor-pointer hover:opacity-75 transition-opacity select-none" : ""
      }`}
      onClick={onClick}
    >
      <div className="text-2xl font-bold">{value ?? "—"}</div>
      <div className="text-sm font-medium mt-0.5">{label}</div>
      {sub && (
        <div
          className={`text-xs opacity-70 mt-0.5 ${
            onSubClick ? "underline cursor-pointer hover:opacity-100" : ""
          }`}
          onClick={
            onSubClick
              ? (e) => { e.stopPropagation(); onSubClick(); }
              : undefined
          }
        >
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Mini bar chart ────────────────────────────────────────────────────────────
function BarChart({ data, valueKey, labelKey, colour = "#534AB7" }) {
  if (!data?.length)
    return (
      <p className="text-sm text-gray-400 text-center py-6">
        No data for this period
      </p>
    );
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0));
  return (
    <div className="flex items-end gap-1 h-32">
      {data.map((d, i) => {
        const pct = max > 0 ? (Number(d[valueKey]) / max) * 100 : 0;
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center gap-1 group relative"
          >
            <div
              className="w-full rounded-t transition-all"
              style={{ height: `${Math.max(pct, 2)}%`, background: colour, minHeight: 2 }}
            />
            <div
              className="absolute bottom-full mb-1 hidden group-hover:block
                         bg-gray-900 text-white text-xs px-2 py-1 rounded
                         whitespace-nowrap z-10"
            >
              {d[labelKey]}: {d[valueKey]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children, loading, id }) {
  return (
    <div id={id} className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-4">{title}</h2>
      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : (
        children
      )}
    </div>
  );
}

// ── Date range picker ─────────────────────────────────────────────────────────
function DateRangePicker({ from, to, onChange }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <label className="text-gray-500">From</label>
      <input
        type="date"
        value={from}
        onChange={(e) => onChange({ from: e.target.value, to })}
        className="px-2 py-1 border border-gray-300 rounded-lg text-sm
                   focus:outline-none focus:ring-2 focus:ring-brand-600"
      />
      <label className="text-gray-500">to</label>
      <input
        type="date"
        value={to}
        onChange={(e) => onChange({ from, to: e.target.value })}
        className="px-2 py-1 border border-gray-300 rounded-lg text-sm
                   focus:outline-none focus:ring-2 focus:ring-brand-600"
      />
    </div>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────────
const SEARCH_FIELDS = ["student_name", "course_code", "student_number",
                       "professor_name", "confirmed_by_name", "room_name",
                       "email", "exam_type", "accommodation_codes"];

function DetailModal({ title, columns, rows, loading, filterKeys = [], onClose }) {
  const [search,  setSearch]  = useState("");
  const [filters, setFilters] = useState({});

  // Derive unique options for each filter key from the loaded rows
  const filterOptions = useMemo(() => {
    const opts = {};
    for (const key of filterKeys) {
      opts[key] = [...new Set(rows.map(r => r[key]).filter(Boolean))].sort();
    }
    return opts;
  }, [rows, filterKeys]); // eslint-disable-line

  // Reset filters when a new modal opens (rows change identity)
  useEffect(() => {
    setSearch("");
    setFilters({});
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;

    // Search across all text-like fields
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(row =>
        SEARCH_FIELDS.some(f => String(row[f] ?? "").toLowerCase().includes(q))
      );
    }

    // Dropdown filters
    for (const [key, val] of Object.entries(filters)) {
      if (val) result = result.filter(row => String(row[key] ?? "") === val);
    }

    return result;
  }, [rows, search, filters]);

  function filterLabel(key) {
    // Use STATUS_LABELS for status key, otherwise title-case the key
    if (key === "status") return "Status";
    return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  function optionLabel(key, val) {
    if (key === "status") return STATUS_LABELS[val] ?? val;
    return String(val).replace(/_/g, " ");
  }

  return (
    <Modal title={title} onClose={onClose} width="max-w-4xl">
      {/* Search + filters toolbar */}
      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input
            type="search"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[160px] px-3 py-1.5 text-sm border border-gray-300
                       rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
          {filterKeys.map(key => (
            <select
              key={key}
              value={filters[key] ?? ""}
              onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-brand-600 text-gray-700"
            >
              <option value="">All {filterLabel(key)}</option>
              {(filterOptions[key] ?? []).map(opt => (
                <option key={opt} value={opt}>{optionLabel(key, opt)}</option>
              ))}
            </select>
          ))}
          {(search || Object.values(filters).some(Boolean)) && (
            <button
              onClick={() => { setSearch(""); setFilters({}); }}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">
          {rows.length === 0 ? "No data for this period" : "No results match your filters"}
        </p>
      ) : (
        <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-gray-100">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className="text-left py-2 pr-4 text-xs font-medium text-gray-500 whitespace-nowrap"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  {columns.map((c) => (
                    <td key={c.key} className="py-2.5 pr-4 text-gray-700 whitespace-nowrap">
                      {c.render ? c.render(row) : (row[c.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <p className="text-xs text-gray-400 mt-3">
          {filtered.length === rows.length
            ? `${rows.length} record${rows.length !== 1 ? "s" : ""}`
            : `${filtered.length} of ${rows.length} records`}
        </p>
      )}
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Analytics() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const today = new Date().toISOString().split("T")[0];
  const now   = new Date();
  const year  = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;

  const [range, setRange] = useState({ from: `${year}-09-01`, to: today });

  const [overview,       setOverview]       = useState(null);
  const [daily,          setDaily]          = useState([]);
  const [leads,          setLeads]          = useState([]);
  const [types,          setTypes]          = useState([]);
  const [accommodations, setAccommodations] = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [modal,          setModal]          = useState(null);
  // modal = { title, columns, rows, loading, filterKeys } | null

  async function load() {
    setLoading(true);
    const q = `from=${range.from}&to=${range.to}`;
    try {
      const [ov, d, l, ty, ac] = await Promise.all([
        api.get(`/analytics/overview?${q}`),
        api.get(`/analytics/daily?${q}`),
        api.get(`/analytics/leads?${q}`),
        api.get(`/analytics/types?${q}`),
        api.get(`/analytics/accommodations?${q}`),
      ]);
      setOverview(ov.overview);
      setDaily(d.days);
      setLeads(l.leads);
      setTypes(ty.types);
      setAccommodations(ac.accommodations);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [range.from, range.to]); // eslint-disable-line

  // ── Card interactions ────────────────────────────────────────────────────────

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function openModal(title, columns, endpoint, params = {}, filterKeys = []) {
    setModal({ title, columns, rows: [], loading: true, filterKeys });
    const q = new URLSearchParams({ from: range.from, to: range.to, ...params }).toString();
    try {
      const data = await api.get(`/analytics/${endpoint}?${q}`);
      const rows = data.requests ?? data.students ?? [];
      setModal({ title, columns, rows, loading: false, filterKeys });
    } catch (err) {
      toast(err.message, "error");
      setModal(null);
    }
  }

  const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      {modal && (
        <DetailModal
          title={modal.title}
          columns={modal.columns}
          rows={modal.rows}
          loading={modal.loading}
          filterKeys={modal.filterKeys}
          onClose={() => setModal(null)}
        />
      )}

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Header + date range */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {range.from} → {range.to}
            </p>
          </div>
          <DateRangePicker from={range.from} to={range.to} onChange={setRange} />
        </div>

        {/* Overview stat cards */}
        <Section title="Overview" loading={loading && !overview}>
          {overview && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Exam days"
                value={overview.total_days}
                colour="brand"
                onClick={() => scrollTo("section-daily")}
              />
              <StatCard
                label="Exams"
                value={overview.total_exams}
                sub={`${overview.rwg_exams ?? 0} RWG`}
                colour="brand"
                onClick={() => openModal("All Exam Requests", REQUEST_COLS, "requests", {}, ["status", "exam_type"])}
                onSubClick={() => openModal("RWG Exam Requests", REQUEST_COLS, "requests", { rwg: "true" }, ["status", "exam_type"])}
              />
              <StatCard
                label="Students served"
                value={overview.unique_students}
                sub="unique students"
                colour="green"
                onClick={() => openModal("Students Served", STUDENT_COLS, "students", {}, [])}
              />
              <StatCard
                label="Confirmed"
                value={`${pct(overview.confirmed_exams, overview.total_exams)}%`}
                sub={`${overview.confirmed_exams} of ${overview.total_exams} exams`}
                colour={pct(overview.confirmed_exams, overview.total_exams) > 80 ? "green" : "amber"}
                onClick={() => openModal("Confirmed Bookings", CONFIRMED_COLS, "requests", { status: "confirmed" }, ["exam_type", "room_name"])}
              />
              <StatCard
                label="Pending (student)"
                value={overview.pending_exams}
                sub="awaiting professor approval"
                colour={overview.pending_exams > 0 ? "amber" : "green"}
                onClick={() => openModal("Pending Requests", PENDING_COLS, "requests", { status: "pending" }, ["professor_name"])}
              />
              <StatCard
                label="Prof. Approved"
                value={overview.professor_approved_exams}
                sub="awaiting admin confirmation"
                colour={overview.professor_approved_exams > 0 ? "amber" : "green"}
                onClick={() =>
                  isAdmin
                    ? navigate("/admin?tab=Bookings")
                    : openModal("Awaiting Confirmation", PROF_APPROVED_COLS, "requests", { status: "professor_approved" }, ["professor_name"])
                }
              />
              <StatCard
                label="Cancellations"
                value={overview.cancelled_exams}
                colour={overview.cancelled_exams > 0 ? "red" : "green"}
                onClick={() =>
                  isAdmin
                    ? navigate("/admin?tab=Cancellation+Requests")
                    : openModal("Cancelled Requests", CANCELLED_COLS, "requests", { status: "cancelled" }, [])
                }
              />
              <StatCard
                label="Active leads"
                value={overview.active_leads}
                sub="confirmed at least one booking"
                colour="gray"
                onClick={() => scrollTo("section-leads")}
              />
            </div>
          )}
        </Section>

        {/* Daily exam chart */}
        <Section id="section-daily" title="Exams per day" loading={loading}>
          <BarChart data={daily} valueKey="exam_count" labelKey="date" colour="#534AB7" />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{daily[0]?.date}</span>
            <span>{daily[daily.length - 1]?.date}</span>
          </div>
        </Section>

        {/* Lead activity + accommodations side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Section id="section-leads" title="Lead activity" loading={loading}>
            {leads.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No activity in this period
              </p>
            ) : (
              <div className="space-y-2">
                {leads.map((l, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between
                               py-2 border-b border-gray-100 last:border-0"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">{l.lead_name}</div>
                      <div className="text-xs text-gray-500">{l.email}</div>
                    </div>
                    <div className="flex gap-3 text-right">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{l.bookings_confirmed}</div>
                        <div className="text-xs text-gray-400">confirmed</div>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">{l.cancellations_reviewed}</div>
                        <div className="text-xs text-gray-400">cancellations</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Accommodation codes" loading={loading}>
            {accommodations.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No data for this period
              </p>
            ) : (
              <div className="space-y-2">
                {accommodations.slice(0, 8).map((a, i) => {
                  const maxCount = accommodations[0].usage_count;
                  const pctWidth = Math.round((a.usage_count / maxCount) * 100);
                  return (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-xs font-medium ${a.triggers_rwg_flag ? "text-red-700" : "text-gray-700"}`}>
                          {a.code}
                        </span>
                        <span className="text-xs text-gray-500">
                          {a.usage_count} · {a.student_count} students
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${a.triggers_rwg_flag ? "bg-red-400" : "bg-brand-400"}`}
                          style={{ width: `${pctWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        {/* Exam types */}
        <Section title="Exam types" loading={loading}>
          {!types?.length ? (
            <p className="text-sm text-gray-400 text-center py-6">No data for this period</p>
          ) : (
            <div className="space-y-2">
              {types.map((t, i) => {
                const maxCount = types[0].count;
                const pctWidth = Math.round((t.count / maxCount) * 100);
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-medium text-gray-700 capitalize">{t.exam_type}</span>
                      <span className="text-xs text-gray-500">{t.count} · {t.student_count} students</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-brand-400" style={{ width: `${pctWidth}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* Status breakdown */}
        {overview?.status_breakdown && (
          <Section title="Exam status breakdown" loading={loading}>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {[
                { key: "pending",            label: "Pending",        colour: "bg-amber-100 text-amber-700" },
                { key: "professor_approved", label: "Prof. Approved", colour: "bg-blue-100 text-blue-700"   },
                { key: "professor_rejected", label: "Prof. Rejected", colour: "bg-red-100 text-red-600"     },
                { key: "confirmed",          label: "Confirmed",      colour: "bg-green-100 text-green-700" },
                { key: "cancelled",          label: "Cancelled",      colour: "bg-red-100 text-red-600"     },
              ].map(({ key, label, colour }) => (
                <div key={key} className={`rounded-xl px-3 py-2 text-center ${colour}`}>
                  <div className="text-xl font-bold">{overview.status_breakdown[key] ?? 0}</div>
                  <div className="text-xs font-medium">{label}</div>
                </div>
              ))}
            </div>
            {(overview.shows > 0 || overview.no_shows > 0) && (
              <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-3">
                <div className="rounded-xl px-3 py-2 text-center bg-green-100 text-green-700">
                  <div className="text-xl font-bold">{overview.shows ?? 0}</div>
                  <div className="text-xs font-medium">Shows</div>
                </div>
                <div className="rounded-xl px-3 py-2 text-center bg-red-100 text-red-600">
                  <div className="text-xl font-bold">{overview.no_shows ?? 0}</div>
                  <div className="text-xs font-medium">No Shows</div>
                </div>
              </div>
            )}
          </Section>
        )}
      </div>
    </div>
  );
}
