import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import { api } from "../../lib/api.js";
import { toast } from "../../components/ui/Toast.jsx";
import Spinner from "../../components/ui/Spinner.jsx";
import RoleSwitcher from "../../components/ui/RoleSwitcher.jsx";

const EXAM_TYPES = [
  { value: "midterm",    label: "Midterm" },
  { value: "final",      label: "Final" },
  { value: "quiz_1",     label: "Quiz 1" },
  { value: "quiz_2",     label: "Quiz 2" },
  { value: "quiz_3",     label: "Quiz 3" },
  { value: "quiz_4",     label: "Quiz 4" },
  { value: "test_1",     label: "Test 1" },
  { value: "test_2",     label: "Test 2" },
  { value: "test_3",     label: "Test 3" },
  { value: "assignment", label: "Assignment" },
  { value: "other",      label: "Other"      },
];

// Time slots: 7:45 AM – 8:00 PM in 5-minute intervals
const TIME_SLOTS = (() => {
  const slots = [];
  for (let mins = 7 * 60 + 45; mins <= 20 * 60; mins += 5) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    const period = h < 12 ? "AM" : "PM";
    const displayH = h > 12 ? h - 12 : h;
    slots.push({
      value,
      label: `${displayH}:${String(m).padStart(2, "0")} ${period}`,
    });
  }
  return slots;
})();

const STATUS_BADGE = {
  pending: "bg-yellow-100 text-yellow-700",
  professor_approved: "bg-blue-100 text-blue-700",
  professor_rejected: "bg-red-100 text-red-600",
  confirmed: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-400",
};

const STATUS_LABEL = {
  pending: "Awaiting professor",
  professor_approved: "Professor approved, awaiting Accessibility Centre",
  professor_rejected: "Professor rejected",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

const REG_STATUS_BADGE = {
  submitted: "bg-blue-100 text-blue-700",
  under_review: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":");
  const d = new Date();
  d.setHours(parseInt(h, 10), parseInt(m, 10));
  return d.toLocaleTimeString("en-CA", { hour: "numeric", minute: "2-digit" });
}

// ── Accommodation card list ────────────────────────────────────────────────────
function AccomList({ items }) {
  return (
    <div className="space-y-2">
      {items.map((g) => (
        <div
          key={g.id}
          className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-start justify-between gap-4"
        >
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-800">
                {g.label}
              </span>
              <span className="text-xs text-gray-400 font-mono">{g.code}</span>
              {g.triggers_rwg_flag && (
                <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                  RWG
                </span>
              )}
            </div>
            {g.notes && (
              <p className="text-xs text-gray-500 mt-0.5">{g.notes}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Renewal request card ───────────────────────────────────────────────────────
function RenewalRequestCard({ renewal, codeById, upcoming }) {
  const codes = (renewal.requested_code_ids ?? []).map((id) => codeById[id]).filter(Boolean);
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {renewal.term_label}
        </p>
        {upcoming && (
          <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">Upcoming</span>
        )}
      </div>
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs text-gray-500">Accommodation request</span>
          <div className="flex items-center gap-2">
            {renewal.status === "pending"  && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Pending review</span>}
            {renewal.status === "approved" && <span className="text-xs bg-green-100  text-green-700 px-2 py-0.5 rounded-full">Approved</span>}
            {renewal.status === "rejected" && <span className="text-xs bg-red-100    text-red-600   px-2 py-0.5 rounded-full">Not approved</span>}
            {(renewal.status === "approved" || renewal.status === "rejected") && renewal.reviewed_at && (
              <span className="text-xs text-gray-400">
                {new Date(renewal.reviewed_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            )}
          </div>
        </div>
        <div className="divide-y divide-gray-100">
          {codes.length === 0 && (
            <div className="px-4 py-2.5 text-xs text-gray-400">No codes specified</div>
          )}
          {codes.map((c) => (
            <div key={c.id} className="px-4 py-2.5 flex items-center gap-2">
              <span className="text-sm text-gray-700">{c.label}</span>
              <span className="text-xs text-gray-400 font-mono">{c.code}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Accommodations tab ─────────────────────────────────────────────────────────
function AccommodationsTab({ me }) {
  const [terms, setTerms] = useState([]); // [{ term, term_id, items[] }]
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState("Active");
  const [availableTerms, setAvailableTerms] = useState([]); // active current+future terms with no pending/approved request
  const [allTermsData, setAllTermsData] = useState([]); // all active terms (with is_current flag)
  const [renewalRequests, setRenewalRequests] = useState([]);

  const [reqSubTab, setReqSubTab] = useState("Active");
  const [historyTermFilter, setHistoryTermFilter] = useState("all");

  // Modal state
  const [showRenewalModal, setShowRenewalModal] = useState(false);
  const [allCodes, setAllCodes] = useState([]); // { id, code, label }
  const [renewalTermId, setRenewalTermId] = useState("");
  const [selectedCodeIds, setSelectedCodeIds] = useState(new Set()); // checked code ids
  const [disabledCodeIds, setDisabledCodeIds] = useState(new Set()); // can't uncheck
  const [renewalNotes, setRenewalNotes] = useState("");
  const [submittingRenewal, setSubmittingRenewal] = useState(false);

  async function loadAll() {
    try {
      const [accomData, termsData, renewalData, codesData] = await Promise.all([
        api.get("/student/accommodations"),
        api.get("/student/terms"),
        api.get("/student/renewal-requests"),
        api.get("/student/all-accommodation-codes"),
      ]);
      const loadedTerms = accomData.data ?? [];
      const loadedAllTerms = termsData.data ?? [];
      const loadedRenewals = renewalData.data ?? [];
      setTerms(loadedTerms);
      setAllTermsData(loadedAllTerms);
      setRenewalRequests(loadedRenewals);
      setAllCodes(codesData.data ?? []);

      // Available terms: current or future, no PENDING renewal request (approved = re-request allowed)
      const busyTermIds = new Set(
        loadedRenewals
          .filter((r) => r.status === "pending")
          .map((r) => r.term_id),
      );
      const today = new Date().toISOString().slice(0, 10);
      setAvailableTerms(
        loadedAllTerms.filter((t) => {
          if (busyTermIds.has(t.id)) return false;
          // exclude past terms (end_date < today)
          if (t.end_date && t.end_date < today) return false;
          return true;
        }),
      );
    } catch {
      toast("Failed to load accommodations", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  // Recompute pre-selections when the selected term changes — closes over current state
  function applyTermPreselection(termId) {
    const selectedTerm = allTermsData.find((t) => t.id === termId);
    if (!selectedTerm) return;

    // If this term already has granted accommodations, pre-select + grey them out (current or future re-request)
    const termAccomGroup = terms.find((g) => g.items[0]?.term_id === termId);
    if (termAccomGroup && termAccomGroup.items.length > 0) {
      const grantedIds = new Set(termAccomGroup.items.map((i) => i.accommodation_code_id));
      setSelectedCodeIds(new Set(grantedIds));
      setDisabledCodeIds(new Set(grantedIds));
    } else if (selectedTerm.is_current) {
      // Current term with no grants yet → no pre-selection
      setSelectedCodeIds(new Set());
      setDisabledCodeIds(new Set());
    } else {
      // Future term with no grants yet → suggest from most recent term (all toggleable)
      const recentGrantedIds = new Set((terms[0]?.items ?? []).map((i) => i.accommodation_code_id));
      setSelectedCodeIds(new Set(recentGrantedIds));
      setDisabledCodeIds(new Set());
    }
  }

  function openRenewalModal() {
    setShowRenewalModal(true);
    const defaultTermId = availableTerms[0]?.id ?? "";
    setRenewalTermId(defaultTermId);
    setRenewalNotes("");
    if (defaultTermId) applyTermPreselection(defaultTermId);
  }

  function handleTermChange(termId) {
    setRenewalTermId(termId);
    applyTermPreselection(termId);
  }

  function toggleCode(codeId) {
    if (disabledCodeIds.has(codeId)) return;
    setSelectedCodeIds((prev) => {
      const next = new Set(prev);
      next.has(codeId) ? next.delete(codeId) : next.add(codeId);
      return next;
    });
  }

  async function submitRenewal() {
    if (!renewalTermId || selectedCodeIds.size === 0) return;
    setSubmittingRenewal(true);
    try {
      await api.post("/student/renewal-requests", {
        termId: renewalTermId,
        notes: renewalNotes,
        requestedCodeIds: [...selectedCodeIds],
      });
      toast("Request submitted", "success");
      setShowRenewalModal(false);
      loadAll();
    } catch (err) {
      toast(err?.response?.data?.error ?? "Failed to submit request", "error");
    } finally {
      setSubmittingRenewal(false);
    }
  }

  if (loading)
    return (
      <div className="py-12 flex justify-center">
        <Spinner />
      </div>
    );

  const regStatus = me?.registration_status;
  const requested = me?.requested_accommodations ?? [];

  // Not registered at all
  if (!regStatus) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-sm font-medium text-gray-700">
          No accommodations on file
        </p>
        <p className="text-xs text-gray-400 mt-1">
          You have not yet registered with the Accessibility Centre.
        </p>
        <a
          href="/register"
          className="mt-3 inline-block text-sm text-brand-600 hover:text-brand-800"
        >
          Register now
        </a>
      </div>
    );
  }

  // Partition accommodation groups into current / upcoming / past using term metadata
  const today = new Date().toISOString().slice(0, 10);
  const termMetaById = Object.fromEntries(allTermsData.map((t) => [t.id, t]));
  const currentTermAccoms  = [];
  const upcomingTermAccoms = [];
  const pastTermAccoms     = [];
  for (const termGroup of terms) {
    const meta = termMetaById[termGroup.items[0]?.term_id];
    if (!meta) {
      pastTermAccoms.push(termGroup);
    } else if (meta.is_current) {
      currentTermAccoms.push(termGroup);
    } else if (meta.start_date && meta.start_date > today) {
      upcomingTermAccoms.push(termGroup);
    } else {
      pastTermAccoms.push(termGroup);
    }
  }

  // Renewal request classification + code resolution
  const codeById = Object.fromEntries(allCodes.map((c) => [c.id, c]));
  // Active = only PENDING requests (current or upcoming term)
  const currentRenewals  = renewalRequests.filter((r) => r.status === "pending" && termMetaById[r.term_id]?.is_current);
  const upcomingRenewals = renewalRequests.filter((r) => {
    if (r.status !== "pending") return false;
    const meta = termMetaById[r.term_id];
    return meta && !meta.is_current && meta.start_date > today;
  });
  // History = all approved/rejected requests (any term)
  const historyRenewals = renewalRequests.filter((r) => r.status === "approved" || r.status === "rejected");
  const historyTermOptions = [...new Map(historyRenewals.map((r) => [r.term_id, r.term_label])).entries()];
  const filteredHistoryRenewals = historyTermFilter === "all"
    ? historyRenewals
    : historyRenewals.filter((r) => r.term_id === historyTermFilter);
  const showRegistrationInActive  = regStatus !== "approved" && regStatus !== "rejected";
  const showRegistrationInHistory = regStatus === "rejected";

  // Is the selected term a current term?
  const selectedTermMeta = allTermsData.find((t) => t.id === renewalTermId);
  const selectedIsCurrent = selectedTermMeta?.is_current ?? false;

  return (
    <div className="space-y-6">
      {/* ── Requests section ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Requests</h2>
          {regStatus === "approved" && availableTerms.length > 0 && (
            <button
              onClick={openRenewalModal}
              className="text-sm text-brand-600 hover:text-brand-800 font-medium"
            >
              + Request Renewal
            </button>
          )}
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          {["Active", "History"].map((t) => (
            <button
              key={t}
              onClick={() => setReqSubTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
                ${reqSubTab === t
                  ? "text-brand-700 border-b-2 border-brand-600 -mb-px bg-white"
                  : "text-gray-500 hover:text-gray-700"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Active requests — pending only */}
        {reqSubTab === "Active" && (() => {
          const hasContent = showRegistrationInActive || currentRenewals.length > 0 || upcomingRenewals.length > 0;
          if (!hasContent) return (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-400">No active requests</p>
            </div>
          );
          return (
            <div className="space-y-5">
              {showRegistrationInActive && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Registration Request
                  </p>
                  <div className="bg-white rounded-xl border border-gray-200">
                    <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-xs text-gray-500">Initial registration</span>
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Pending review</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {requested.map((acc, i) => (
                        <div key={i} className="px-4 py-2.5">
                          <span className="text-sm text-gray-700">{acc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {currentRenewals.map((r) => (
                <RenewalRequestCard key={r.id} renewal={r} codeById={codeById} />
              ))}
              {upcomingRenewals.map((r) => (
                <RenewalRequestCard key={r.id} renewal={r} codeById={codeById} upcoming />
              ))}
            </div>
          );
        })()}

        {/* History requests — all approved/rejected, filterable by term */}
        {reqSubTab === "History" && (() => {
          const hasContent = historyRenewals.length > 0 || showRegistrationInHistory;
          if (!hasContent) return (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-400">No past requests</p>
            </div>
          );
          return (
            <div className="space-y-4">
              {historyRenewals.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500">Filter by term:</label>
                  <select
                    value={historyTermFilter}
                    onChange={(e) => setHistoryTermFilter(e.target.value)}
                    className="text-xs border border-gray-200 rounded px-2 py-1 text-gray-700 bg-white"
                  >
                    <option value="all">All terms</option>
                    {historyTermOptions.map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-5">
                {filteredHistoryRenewals.map((r) => (
                  <RenewalRequestCard key={r.id} renewal={r} codeById={codeById} />
                ))}
                {showRegistrationInHistory && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      Registration Request
                    </p>
                    <div className="bg-white rounded-xl border border-gray-200">
                      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-xs text-gray-500">Initial registration</span>
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Not approved</span>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {requested.map((acc, i) => (
                          <div key={i} className="px-4 py-2.5">
                            <span className="text-sm text-gray-700">{acc}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Sub-tabs: Active / History */}
      <div>
        <div className="flex gap-1 mb-4 border-b border-gray-200">
          {["Active", "History"].map((t) => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
                ${subTab === t
                  ? "text-brand-700 border-b-2 border-brand-600 -mb-px bg-white"
                  : "text-gray-500 hover:text-gray-700"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {subTab === "Active" &&
          (currentTermAccoms.length === 0 && upcomingTermAccoms.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <p className="text-sm font-medium text-gray-700">No active accommodations</p>
              <p className="text-xs text-gray-400 mt-1">
                {regStatus === "approved"
                  ? "Your registration was approved but no codes have been assigned yet. Contact your accessibility counsellor."
                  : regStatus === "rejected"
                    ? "Your registration was not approved. Contact the accessibility centre for more information."
                    : "Accommodations will appear here once a counsellor reviews your registration."}
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {currentTermAccoms.map((g) => (
                <div key={g.term}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    {g.term}
                  </p>
                  <AccomList items={g.items} />
                </div>
              ))}
              {upcomingTermAccoms.map((g) => (
                <div key={g.term}>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{g.term}</p>
                    <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded">Upcoming</span>
                  </div>
                  <AccomList items={g.items} />
                </div>
              ))}
            </div>
          ))}

        {subTab === "History" &&
          (pastTermAccoms.length ? (
            <div className="space-y-5">
              {pastTermAccoms.map(({ term, items }) => (
                <div key={term}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    {term}
                  </p>
                  <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                    {items.map((g) => (
                      <div key={g.id} className="px-4 py-2.5 flex items-center gap-3">
                        <span className="text-sm text-gray-700">{g.label}</span>
                        <span className="text-xs text-gray-400 font-mono">{g.code}</span>
                        {g.triggers_rwg_flag && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                            RWG
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <p className="text-sm text-gray-400">No past accommodation history</p>
            </div>
          ))}
      </div>

      {/* Renewal / modification modal */}
      {showRenewalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">
                Request Accommodations
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Select the term and the accommodations you need.
              </p>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {/* Term picker */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Term</label>
                <select
                  value={renewalTermId}
                  onChange={(e) => handleTermChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {availableTerms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}{t.is_current ? " (current)" : ""}
                    </option>
                  ))}
                </select>
                {selectedIsCurrent && (
                  <p className="text-xs text-blue-500 mt-1">
                    Already-granted accommodations are pre-selected and cannot be removed — select additional ones below.
                  </p>
                )}
                {!selectedIsCurrent && (
                  <p className="text-xs text-gray-400 mt-1">
                    Pre-selected from your most recent term. Adjust as needed.
                  </p>
                )}
              </div>

              {/* Accommodation checklist */}
              <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">
                    Accommodations requested
                    <span className="ml-1 text-gray-400 font-normal">({selectedCodeIds.size} selected)</span>
                  </label>
                  <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-64 overflow-y-auto">
                    {allCodes.map((c) => {
                      const checked = selectedCodeIds.has(c.id);
                      const disabled = disabledCodeIds.has(c.id);
                      return (
                        <label
                          key={c.id}
                          className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer
                            ${disabled ? "opacity-60 cursor-not-allowed" : "hover:bg-gray-50"}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleCode(c.id)}
                            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                          <div className="min-w-0">
                            <span className="text-sm text-gray-800">{c.label}</span>
                            <span className="ml-2 text-xs text-gray-400 font-mono">{c.code}</span>
                            {disabled && (
                              <span className="ml-2 text-xs text-blue-500">already granted</span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Notes <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  value={renewalNotes}
                  onChange={(e) => setRenewalNotes(e.target.value)}
                  rows={2}
                  placeholder="Any changes to your situation or specific needs..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-2 justify-end">
              <button
                onClick={() => setShowRenewalModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={submitRenewal}
                disabled={submittingRenewal || selectedCodeIds.size === 0 || !renewalTermId}
                className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {submittingRenewal ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Exam requests tab ──────────────────────────────────────────────────────────
function ExamRequestsTab() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(null); // null or booking id
  const [showRequestModal, setShowRequestModal] = useState(null); // null or booking id
  const [cancellationReason, setCancellationReason] = useState("");
  const [requestingCancellation, setRequestingCancellation] = useState(false);
  const [filterCourseCode, setFilterCourseCode] = useState("");
  const [filterExamType, setFilterExamType] = useState("");

  async function load() {
    try {
      const d = await api.get("/student/exam-requests");
      setBookings(d.data ?? []);
    } catch {
      toast("Failed to load exam requests", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  // Calculate hours until exam start
  function hoursUntilExam(examDate, examTime) {
    if (!examTime) return Infinity;
    const dateObj = new Date(examDate);
    const [hours, minutes] = examTime.split(":").map(Number);
    const examDateTime = new Date(dateObj);
    examDateTime.setHours(hours, minutes, 0, 0);
    const now = new Date();
    return (examDateTime - now) / (1000 * 60 * 60);
  }

  async function handleDirectCancel(id) {
    setCancelling(id);
    try {
      await api.delete(`/student/exam-requests/${id}`);
      toast("Request cancelled");
      load();
      setShowCancelModal(null);
    } catch (err) {
      toast(err.message || "Could not cancel request", "error");
    } finally {
      setCancelling(null);
    }
  }

  async function handleRequestCancellation(id) {
    if (!cancellationReason.trim()) {
      toast("Please enter a reason", "error");
      return;
    }
    setRequestingCancellation(true);
    try {
      await api.post(`/student/exam-requests/${id}/cancellation-request`, {
        studentReason: cancellationReason,
      });
      toast("Cancellation request submitted for admin review");
      setCancellationReason("");
      setShowRequestModal(null);
      load();
    } catch (err) {
      toast(err.message || "Could not submit cancellation request", "error");
    } finally {
      setRequestingCancellation(false);
    }
  }

  const [subTab, setSubTab] = useState("Upcoming");

  if (loading)
    return (
      <div className="py-12 flex justify-center">
        <Spinner />
      </div>
    );

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = bookings.filter(
    (b) => b.exam_date >= today && b.status !== "cancelled",
  );
  const history = bookings.filter(
    (b) => b.exam_date < today || b.status === "cancelled",
  );

  // Get unique course codes and exam types for filter dropdowns
  const uniqueCourseCodes = [...new Set(bookings.map((b) => b.course_code))].sort();
  const uniqueExamTypes = [...new Set(bookings.map((b) => b.exam_type))].sort();

  // Apply filters
  const filterBookings = (arr) => {
    return arr.filter((b) => {
      if (filterCourseCode && b.course_code !== filterCourseCode) return false;
      if (filterExamType && b.exam_type !== filterExamType) return false;
      return true;
    });
  };

  const filteredUpcoming = filterBookings(upcoming);
  const filteredHistory = filterBookings(history);

  function BookingCard({ b }) {
    const isPending = b.status === "pending";
    const isApprovedOrConfirmed = ["professor_approved", "confirmed"].includes(
      b.status,
    );
    const hoursLeft = hoursUntilExam(b.exam_date, b.exam_time);
    const isInFuture = b.exam_date >= today;
    const canCancel = isInFuture && (hoursLeft >= 24 || hoursLeft === Infinity);

    return (
      <div
        className={`bg-white rounded-xl border border-gray-200 px-4 py-3 ${b.status === "cancelled" ? "opacity-50" : ""}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-800">
                {b.course_code}
              </span>
              <span className="text-xs text-gray-500 capitalize">
                {b.exam_type.replace("_", " ")}
              </span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE[b.status] ?? ""}`}
              >
                {STATUS_LABEL[b.status] ?? b.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {formatDate(b.exam_date)}
              {b.exam_time ? ` at ${formatTime(b.exam_time)}` : ""}
            </p>
            {b.computed_duration_mins ? (
              <p className="text-xs text-indigo-600 mt-0.5">
                Est. {b.computed_duration_mins} min
                {b.base_duration_mins &&
                b.computed_duration_mins !== b.base_duration_mins
                  ? ` (${b.base_duration_mins} base${b.extra_mins > 0 ? ` + ${b.extra_mins} extra` : ""}${b.stb_mins > 0 ? ` + ${b.stb_mins} STB` : ""})`
                  : ""}
              </p>
            ) : null}
            {b.special_materials_note && (
              <p className="text-xs text-gray-400 mt-1">
                {b.special_materials_note}
              </p>
            )}
            {isApprovedOrConfirmed && !b.has_pending_cancellation && b.last_cancellation_rejection_reason && (
              <div className="mt-2 flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                <span className="text-amber-500 text-xs shrink-0 mt-0.5">⚠</span>
                <p className="text-xs text-amber-700">
                  <span className="font-semibold">Cancellation request declined: </span>
                  {b.last_cancellation_rejection_reason}
                </p>
              </div>
            )}
          </div>
          <div className="flex-shrink-0">
            {isPending && canCancel && (
              <button
                onClick={() => setShowCancelModal(b.id)}
                className="text-xs text-red-400 hover:text-red-600 font-medium"
              >
                Cancel
              </button>
            )}
            {isPending && !canCancel && (
              <button
                disabled
                title="Cannot cancel within 24 hours of exam"
                className="text-xs text-gray-300 cursor-not-allowed"
              >
                Cannot cancel
              </button>
            )}
            {isApprovedOrConfirmed && b.has_pending_cancellation && (
              <span className="text-xs text-orange-500 font-medium italic">
                Cancellation pending…
              </span>
            )}
            {isApprovedOrConfirmed && !b.has_pending_cancellation && canCancel && (
              <button
                onClick={() => setShowRequestModal(b.id)}
                className="text-xs text-orange-500 hover:text-orange-600 font-medium"
              >
                Request Cancel
              </button>
            )}
            {isApprovedOrConfirmed && !b.has_pending_cancellation && !canCancel && (
              <button
                disabled
                title="Cannot cancel within 24 hours of exam"
                className="text-xs text-gray-300 cursor-not-allowed"
              >
                Cannot cancel
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Schedule button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowForm(true)}
          className="px-3 py-1.5 bg-brand-600 hover:bg-brand-800 text-white text-xs
                     font-medium rounded-lg transition-colors"
        >
          + Schedule exam
        </button>
      </div>

      {showForm && (
        <BookingForm
          onSuccess={() => {
            setShowForm(false);
            load();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Direct Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Cancel Exam Request?
            </h3>
            <p className="text-sm text-gray-600 mb-6">
              You can create a new request anytime.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowCancelModal(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDirectCancel(showCancelModal)}
                disabled={cancelling === showCancelModal}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {cancelling === showCancelModal ? "Cancelling…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Cancellation Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Request Cancellation
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Your request will be reviewed by the admin. Please provide a
              reason:
            </p>
            <textarea
              value={cancellationReason}
              onChange={(e) => setCancellationReason(e.target.value)}
              placeholder="Reason for cancellation..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-6"
              rows="3"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowRequestModal(null);
                  setCancellationReason("");
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRequestCancellation(showRequestModal)}
                disabled={requestingCancellation || !cancellationReason.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {requestingCancellation ? "Submitting…" : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {["Upcoming", "History"].map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
              ${
                subTab === t
                  ? "text-brand-700 border-b-2 border-brand-600 -mb-px bg-white"
                  : "text-gray-500 hover:text-gray-700"
              }`}
          >
            {t}
            <span className="ml-1.5 text-xs text-gray-400">
              {t === "Upcoming" ? filteredUpcoming.length : filteredHistory.length}
            </span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 bg-gray-50 rounded-lg p-3 border border-gray-200">
        <select
          value={filterCourseCode}
          onChange={(e) => setFilterCourseCode(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All courses</option>
          {uniqueCourseCodes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>

        <select
          value={filterExamType}
          onChange={(e) => setFilterExamType(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">All exam types</option>
          {uniqueExamTypes.map((type) => (
            <option key={type} value={type}>
              {type.replace("_", " ").charAt(0).toUpperCase() + type.replace("_", " ").slice(1)}
            </option>
          ))}
        </select>

        {(filterCourseCode || filterExamType) && (
          <button
            onClick={() => {
              setFilterCourseCode("");
              setFilterExamType("");
            }}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium"
          >
            Clear filters
          </button>
        )}
      </div>

      {subTab === "Upcoming" &&
        (filteredUpcoming.length ? (
          <div className="space-y-3">
            {filteredUpcoming.map((b) => (
              <BookingCard key={b.id} b={b} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-500">No upcoming exams scheduled</p>
          </div>
        ))}

      {subTab === "History" &&
        (filteredHistory.length ? (
          <div className="space-y-3">
            {filteredHistory.map((b) => (
              <BookingCard key={b.id} b={b} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-sm text-gray-500">No past exam requests</p>
          </div>
        ))}
    </div>
  );
}

// ── Duration helpers (mirrors backend durationCalc.js) ────────────────────────
function computeStudentTotalMins(baseMins, codes) {
  let maxExtra = 0;
  let maxStb = 0;
  for (const code of codes) {
    const m = code.match(/^(\d+)MIN\/HR$/);
    if (m) maxExtra = Math.max(maxExtra, parseInt(m[1], 10));
    const s = code.match(/^(\d+)MIN\/HR STB$/);
    if (s) maxStb = Math.max(maxStb, parseInt(s[1], 10));
  }
  const extra = Math.round((baseMins / 60) * maxExtra);
  const stb = Math.round((baseMins / 60) * maxStb);
  return { extra, stb, total: baseMins + extra + stb };
}

// ── Booking form ───────────────────────────────────────────────────────────────
function BookingForm({ onSuccess, onCancel }) {
  const [form, setForm] = useState({
    courseId: "",
    examDate: "",
    examTime: "",
    examType: "midterm",
    examDurationMins: "",
    specialMaterialsNote: "",
  });
  const [courses, setCourses] = useState([]);
  const [accommodationCodes, setAccommodationCodes] = useState([]);
  const [professorDuration, setProfessorDuration] = useState(null); // number | null
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/student/courses")
      .then((d) => setCourses(d.data ?? []))
      .catch(() => {});
    api
      .get("/student/accommodation-codes")
      .then((d) => setAccommodationCodes(d.data ?? []))
      .catch(() => {});
  }, []);

  // Fetch professor's uploaded duration when course + type + date are all set
  useEffect(() => {
    const { courseId, examType, examDate, examTime } = form;
    if (!courseId || !examType || !examDate) {
      setProfessorDuration(null);
      return;
    }
    const params = new URLSearchParams({ courseId, examType, examDate });
    if (examTime) params.set("examTime", examTime);
    api
      .get(`/student/exam-upload-duration?${params}`)
      .then((d) => {
        const mins = d.data ?? null;
        setProfessorDuration(mins);
        if (mins !== null) set("examDurationMins", String(mins));
      })
      .catch(() => setProfessorDuration(null));
  }, [form.courseId, form.examType, form.examDate, form.examTime]); // eslint-disable-line

  // Live-compute estimated end time for display
  const estimatedEnd = (() => {
    const base = parseInt(form.examDurationMins, 10);
    if (!form.examTime || !base) return null;
    const [h, m] = form.examTime.split(":").map(Number);
    const { extra, stb, total } = computeStudentTotalMins(
      base,
      accommodationCodes,
    );
    const endMins = h * 60 + m + total;
    const endH = String(Math.floor(endMins / 60) % 24).padStart(2, "0");
    const endM = String(endMins % 60).padStart(2, "0");
    return {
      time: `${endH}:${endM}`,
      base,
      extra,
      stb,
      totalMins: total,
      past10pm: endMins > 22 * 60,
    };
  })();

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!form.courseId) {
      setError("Course is required.");
      return;
    }
    if (!form.examDate) {
      setError("Exam date is required.");
      return;
    }
    if (!form.examTime) {
      setError("Start time is required.");
      return;
    }
    if (!form.examDurationMins) {
      setError("Exam duration is required.");
      return;
    }

    // 10 PM check with accommodations applied
    if (estimatedEnd?.past10pm) {
      setError(
        `Your exam (including accommodations) would end at ${estimatedEnd.time}, which is past 10:00 PM. Please choose an earlier start time.`,
      );
      return;
    }

    setLoading(true);
    try {
      await api.post("/student/exam-requests", {
        courseId: form.courseId,
        examDate: form.examDate,
        examTime: form.examTime || undefined,
        examType: form.examType,
        examDurationMins: Number(form.examDurationMins),
        specialMaterialsNote: form.specialMaterialsNote || undefined,
      });
      toast("Exam request submitted");
      onSuccess();
    } catch (err) {
      setError(err.message || "Failed to submit request");
    } finally {
      setLoading(false);
    }
  }

  // Minimum date = 9 days from today
  const earliest = new Date();
  earliest.setDate(earliest.getDate() + 9);
  const minDate = earliest.toISOString().split("T")[0];

  return (
    <div className="bg-white rounded-xl border border-brand-200 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">New exam request</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Course code <span className="text-red-500">*</span>
            </label>
            {courses.length > 0 ? (
              <select
                value={form.courseId}
                onChange={(e) => set("courseId", e.target.value)}
                className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
              >
                <option value="">Select course…</option>
                {courses.map((c) => (
                  <option key={c.course_offering_id ?? c.id} value={c.id}>
                    {c.code}{c.term_label ? ` (${c.term_label})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-gray-400 py-1.5">
                No courses found. Contact your accessibility centre.
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Exam type
            </label>
            <select
              value={form.examType}
              onChange={(e) => set("examType", e.target.value)}
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
            >
              {EXAM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Exam date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={form.examDate}
              min={minDate}
              onChange={(e) => set("examDate", e.target.value)}
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Start time <span className="text-red-500">*</span>
            </label>
            <select
              value={form.examTime}
              onChange={(e) => set("examTime", e.target.value)}
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                         focus:outline-none focus:ring-2 focus:ring-brand-600 bg-white"
            >
              <option value="">Select time…</option>
              {TIME_SLOTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Exam duration <span className="text-red-500">*</span>{" "}
            <span className="text-gray-400 font-normal">
              (minutes, without accommodations)
            </span>
          </label>
          <input
            type="number"
            min="1"
            max="600"
            value={form.examDurationMins}
            onChange={(e) => set("examDurationMins", e.target.value)}
            placeholder="e.g. 120"
            readOnly={professorDuration !== null}
            className={`w-full px-2.5 py-1.5 border rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-600
                       ${professorDuration !== null
                         ? "border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed"
                         : "border-gray-300"}`}
          />
          {professorDuration !== null && (
            <p className="text-xs text-brand-600 mt-0.5">
              Duration set by your professor — cannot be changed
            </p>
          )}
          {estimatedEnd && (
            <p
              className={`text-xs mt-1 ${estimatedEnd.past10pm ? "text-red-600" : "text-gray-400"}`}
            >
              Est. end: {estimatedEnd.time}
              {estimatedEnd.extra > 0 || estimatedEnd.stb > 0 ? (
                <>
                  {" "}
                  — {estimatedEnd.base} min
                  {estimatedEnd.extra > 0 &&
                    ` + ${estimatedEnd.extra} min extra time`}
                  {estimatedEnd.stb > 0 && ` + ${estimatedEnd.stb} min STB`} ={" "}
                  {estimatedEnd.totalMins} min total
                </>
              ) : (
                <> — {estimatedEnd.totalMins} min</>
              )}
              {estimatedEnd.past10pm && " — past 10:00 PM"}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Notes (optional)
          </label>
          <textarea
            value={form.specialMaterialsNote}
            onChange={(e) => set("specialMaterialsNote", e.target.value)}
            rows={2}
            placeholder="e.g. calculator required, open-book"
            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-brand-600 resize-none"
          />
        </div>

        {error && (
          <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-1.5 bg-brand-600 hover:bg-brand-800 text-white text-sm
                       font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
const TABS = ["Accommodations", "Exam requests"];

export default function StudentPortal() {
  const { user, roles, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("Accommodations");
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/student/me")
      .then((d) => setMe(d.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 h-14">
              <span className="font-semibold text-brand-800">Clearpath</span>
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                Student portal
              </span>
            </div>
            <div className="flex h-14">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 text-sm font-medium border-b-2 transition-colors h-full
                    ${
                      tab === t
                        ? "border-brand-600 text-brand-700"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <RoleSwitcher roles={roles} />
            <span className="text-xs text-gray-400">{user?.email}</span>
            <button
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">
            {me ? `${me.first_name} ${me.last_name}` : user?.email}
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {me?.student_number && (
              <span className="text-xs text-gray-400">{me.student_number}</span>
            )}
            {me?.registration_status && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded font-medium capitalize
                ${REG_STATUS_BADGE[me.registration_status] ?? "bg-gray-100 text-gray-500"}`}
              >
                Registration: {me.registration_status.replace("_", " ")}
              </span>
            )}
          </div>
        </div>

        {tab === "Accommodations" && <AccommodationsTab me={me} />}
        {tab === "Exam requests" && <ExamRequestsTab />}
      </div>
    </div>
  );
}
