import { useState, useEffect, useRef } from "react";
import { api } from "../../lib/api.js";

function ProfessorPicker({ value, onChange, professors }) {
  const [query,    setQuery]    = useState("");
  const [open,     setOpen]     = useState(false);
  const [inviting, setInviting] = useState(false);
  const closeTimer              = useRef(null);

  const selectedProf = value
    ? professors.find(p => p.email.toLowerCase() === value.toLowerCase())
    : null;

  const filtered = query.trim()
    ? professors.filter(p => {
        const q = query.toLowerCase();
        return (
          `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q)
        );
      })
    : professors;

  function select(prof) {
    onChange(prof.email);
    setQuery("");
    setOpen(false);
    setInviting(false);
  }

  function startInvite() {
    onChange("");
    setInviting(true);
    setOpen(false);
    setQuery("");
  }

  function reset() {
    onChange("");
    setQuery("");
    setInviting(false);
    setOpen(false);
  }

  // ── Invite mode ──────────────────────────────────────────────────────────────
  if (inviting) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="email"
            placeholder="professor@university.edu"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={reset}
            className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap shrink-0"
          >
            ← Back to search
          </button>
        </div>
        <p className="text-xs text-gray-400">
          An invitation link will be generated for this email address.
        </p>
      </div>
    );
  }

  // ── Selected mode ─────────────────────────────────────────────────────────────
  if (selectedProf) {
    return (
      <div className="flex items-center justify-between px-3 py-2.5 border border-gray-300
                      rounded-lg bg-gray-50">
        <div className="min-w-0">
          <span className="text-sm font-medium text-gray-900">
            {selectedProf.first_name} {selectedProf.last_name}
          </span>
          {selectedProf.department && (
            <span className="ml-2 text-xs text-gray-400">{selectedProf.department}</span>
          )}
          <div className="text-xs text-gray-400 mt-0.5">{selectedProf.email}</div>
        </div>
        <button
          type="button"
          onClick={reset}
          className="ml-3 text-xs text-blue-600 hover:text-blue-800 shrink-0"
        >
          Change
        </button>
      </div>
    );
  }

  // ── Search mode ───────────────────────────────────────────────────────────────
  return (
    <div className="relative">
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { closeTimer.current = setTimeout(() => setOpen(false), 150); }}
        placeholder="Search by name or email…"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                   focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {open && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200
                        rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 && query.trim() ? (
            <div className="px-3 py-2.5 text-xs text-gray-400">
              No professors match &quot;{query}&quot;
            </div>
          ) : (
            filtered.map(p => (
              <button
                key={p.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => select(p)}
                className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors
                           border-b border-gray-100 last:border-0"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    {p.first_name} {p.last_name}
                  </span>
                  {p.department && (
                    <span className="text-xs text-gray-400">{p.department}</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">{p.email}</div>
              </button>
            ))
          )}

          {/* Always-pinned invite option */}
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={startInvite}
            className="w-full text-left px-3 py-2.5 text-sm text-blue-600 hover:bg-blue-50
                       font-medium border-t border-gray-200 transition-colors"
          >
            + Invite new professor by email
          </button>
        </div>
      )}
    </div>
  );
}

export default function CourseProfessorLinkForm() {
  const [activeTab,  setActiveTab]  = useState("form");
  const [terms,      setTerms]      = useState([]);
  const [offerings,  setOfferings]  = useState([]);
  const [professors, setProfessors] = useState([]);
  const [formData,   setFormData]   = useState({
    termId: "",
    courseOfferingId: "",
    professorEmail: "",
  });
  const [csvText,   setCsvText]   = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results,   setResults]   = useState(null);
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState("");

  useEffect(() => {
    loadTerms();
    loadProfessors();
  }, []);

  useEffect(() => {
    if (!formData.termId) {
      setOfferings([]);
      setFormData(prev => ({ ...prev, courseOfferingId: "" }));
      return;
    }
    loadOfferings(formData.termId);
  }, [formData.termId]); // eslint-disable-line

  async function loadTerms() {
    try {
      const res = await api.get("/institution/terms");
      setTerms(res.terms ?? []);
    } catch (err) {
      console.error("Failed to load terms:", err);
    }
  }

  async function loadOfferings(termId) {
    try {
      const res = await api.get(`/institution/course-offerings?termId=${termId}`);
      setOfferings(res.offerings ?? []);
    } catch (err) {
      console.error("Failed to load offerings:", err);
    }
  }

  async function loadProfessors() {
    try {
      const res = await api.get("/professors");
      setProfessors(res.professors ?? []);
    } catch (err) {
      console.error("Failed to load professors:", err);
    }
  }

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!formData.courseOfferingId) {
      setError("Please select a course offering");
      return;
    }
    if (!formData.professorEmail.trim()) {
      setError("Please select or invite a professor");
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post("/professors/link-courses", {
        courseOfferingId: formData.courseOfferingId,
        professorEmail: formData.professorEmail.trim().toLowerCase(),
      });

      if (response.ok) {
        setSuccess(
          response.result.isNewProfessor
            ? "✓ Professor invited and course linked"
            : "✓ Course linked to professor",
        );

        if (response.result.magicLink) {
          setResults(response.result);
        }

        setFormData({ termId: formData.termId, courseOfferingId: "", professorEmail: "" });
        loadProfessors();
      } else {
        setError(response.error ?? "Failed to link course");
      }
    } catch (err) {
      setError(err.message ?? "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCsvSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!csvText.trim()) {
      setError("Please enter CSV data");
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post("/professors/link-courses/bulk", {
        csv: csvText,
      });

      if (response.ok) {
        setResults(response.results);
        setCsvText("");
        setSuccess(
          `✓ ${response.results.summary.success} links created, ${response.results.summary.failed} errors`,
        );
      } else {
        setError(response.error ?? "Failed to process CSV");
      }
    } catch (err) {
      setError(err.message ?? "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const selectedOffering = offerings.find(o => o.id === formData.courseOfferingId);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Link Courses to Professors
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Assign courses to professors and generate invitations for new professors
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("form")}
          className={`px-4 py-2 font-medium text-sm ${
            activeTab === "form"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-700 hover:text-gray-900"
          }`}
        >
          Single Link
        </button>
        <button
          onClick={() => setActiveTab("csv")}
          className={`px-4 py-2 font-medium text-sm ${
            activeTab === "csv"
              ? "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-700 hover:text-gray-900"
          }`}
        >
          Bulk Upload (CSV)
        </button>
      </div>

      {/* Form Tab */}
      {activeTab === "form" && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700">{success}</p>
            </div>
          )}

          <form onSubmit={handleFormSubmit} className="space-y-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Term <span className="text-red-500">*</span>
              </label>
              {terms.length > 0 ? (
                <select
                  name="termId"
                  value={formData.termId}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select a term…</option>
                  {terms.filter(t => t.is_active).map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-500 py-2">
                  No terms found. Create terms under the <strong>Terms</strong> tab first.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Course <span className="text-red-500">*</span>
              </label>
              {!formData.termId ? (
                <p className="text-sm text-gray-400 py-2">Select a term first.</p>
              ) : offerings.length > 0 ? (
                <select
                  name="courseOfferingId"
                  value={formData.courseOfferingId}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="">Select a course…</option>
                  {offerings.map(o => (
                    <option key={o.id} value={o.id}>
                      {o.code}{o.name ? ` — ${o.name}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-500 py-2">
                  No course offerings for this term. Add offerings under the{" "}
                  <strong>Terms</strong> tab first.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Professor <span className="text-red-500">*</span>
              </label>
              <ProfessorPicker
                value={formData.professorEmail}
                onChange={email => setFormData(prev => ({ ...prev, professorEmail: email }))}
                professors={professors}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium
                         text-sm hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isLoading ? "Linking..." : "Link Course"}
            </button>
          </form>

          {results && results.courseOfferingId && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-900">
                ✓ {selectedOffering?.code ?? results.courseOfferingId} linked to{" "}
                {results.professorEmail}
              </p>
              {results.magicLink && (
                <div className="mt-2">
                  <p className="text-xs text-green-700">
                    New professor created. Magic link:
                  </p>
                  <p className="text-xs text-gray-600 break-all mt-1 font-mono">
                    {results.magicLink.url}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CSV Tab */}
      {activeTab === "csv" && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700">{success}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              CSV Data <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Required columns: "course_code", "professor_email", "term" (must match an existing term label exactly)
            </p>
            <pre className="text-xs bg-gray-100 p-2 rounded mb-2 overflow-x-auto text-gray-700">
              {`course_code,professor_email,term\nABCD 1234,professor1@university.edu,Fall 2025\nEFGH 5678,professor2@university.edu,Winter 2026`}
            </pre>
            <textarea
              value={csvText}
              onChange={e => setCsvText(e.target.value)}
              placeholder={`course_code,professor_email,term\nABCD 1234,professor@university.edu,Fall 2025`}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono
                         focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={handleCsvSubmit}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm
                       hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? "Processing..." : "Process CSV"}
          </button>

          {results?.summary && (
            <div className="mt-6 space-y-3">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-900">
                  Summary: {results.summary.success} created,{" "}
                  {results.summary.failed} failed
                </p>
              </div>

              {results.created?.length > 0 && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm font-medium text-green-900 mb-2">New Professors:</p>
                  <div className="space-y-1">
                    {results.created.map((item, idx) => (
                      <div key={idx} className="text-xs text-green-700">
                        <p>{item.courseCode} ({item.term}) → {item.professorEmail}</p>
                        <p className="text-gray-600 break-all font-mono text-[10px]">
                          {item.magicLink}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.linkedExisting?.length > 0 && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm font-medium text-amber-900 mb-2">Linked to Existing:</p>
                  <div className="space-y-1">
                    {results.linkedExisting.map((item, idx) => (
                      <p key={idx} className="text-xs text-amber-700">
                        {item.courseCode} ({item.term}) → {item.professorEmail}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {results.errors?.length > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm font-medium text-red-900 mb-2">Errors:</p>
                  <div className="space-y-1">
                    {results.errors.map((err, idx) => (
                      <p key={idx} className="text-xs text-red-700">
                        Row {err.rowNumber}: {err.error}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
