import { useState, useEffect } from "react";
import { api } from "../../lib/api.js";

export default function CourseProfessorLinkForm() {
  const [activeTab, setActiveTab] = useState("form");
  const [availableTerms, setAvailableTerms] = useState([]);
  const [availableCourses, setAvailableCourses] = useState([]);
  const [formData, setFormData] = useState({
    courseId: "",
    professorEmail: "",
    term: "current",
  });
  const [csvText, setCsvText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadTerms();
    loadCourses();
  }, []);

  const loadTerms = async () => {
    try {
      const response = await api.get("/professors/terms");
      if (response.ok) setAvailableTerms(response.terms);
    } catch (err) {
      console.error("Failed to load terms:", err);
    }
  };

  const loadCourses = async () => {
    try {
      const response = await api.get("/institution/course-list");
      if (response.ok) setAvailableCourses(response.courses ?? []);
    } catch (err) {
      console.error("Failed to load courses:", err);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value.trim(),
    }));
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!formData.courseId) {
      setError("Please select a course");
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post("/professors/link-courses", {
        courseId: formData.courseId,
        professorEmail: formData.professorEmail.trim().toLowerCase(),
      });

      if (response.ok) {
        setSuccess(
          response.result.isNewProfessor
            ? `✓ Professor invited and course linked`
            : `✓ Course linked to professor`,
        );

        if (response.result.magicLink) {
          setResults(response.result);
        }

        setFormData({ courseId: "", professorEmail: "", term: "current" });
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Link Courses to Professors
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Assign courses to professors via email and generate invitations for
          new professors
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
                Course Code <span className="text-red-500">*</span>
              </label>
              {availableCourses.length > 0 ? (
                <select
                  name="courseId"
                  value={formData.courseId}
                  onChange={handleFormChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="" disabled>Select a course</option>
                  {availableCourses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.code}{c.name ? ` — ${c.name}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-500 py-2">
                  No courses in master list. Add courses under the <strong>Courses</strong> tab first.
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Academic Term <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="term"
                placeholder="e.g., Fall 2025, Winter 2026"
                value={formData.term}
                onChange={handleFormChange}
                list="terms-list"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <datalist id="terms-list">
                {availableTerms.map((term) => (
                  <option key={term} value={term} />
                ))}
              </datalist>
              <p className="text-xs text-gray-500 mt-1">
                e.g., "Fall 2025", "Winter 2026", "current"
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Professor Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                name="professorEmail"
                placeholder="professor@university.edu"
                value={formData.professorEmail}
                onChange={handleFormChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isLoading ? "Linking..." : "Link Course"}
            </button>
          </form>

          {results && results.courseId && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-900">
                ✓ {availableCourses.find(c => c.id === results.courseId)?.code ?? results.courseId} ({results.term}) linked to{" "}
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
              Required columns: "course_code", "professor_email". Optional:
              "term" (defaults to "current")
            </p>
            <pre className="text-xs bg-gray-100 p-2 rounded mb-2 overflow-x-auto text-gray-700">
              {`course_code,professor_email,term
ABCD 1234,professor1@university.edu,Fall 2025
EFGH 5678,professor2@university.edu,Winter 2026
IJKL 9012,professor3@university.edu`}
            </pre>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`course_code,professor_email,term\nABCD 1234,professor@university.edu,Fall 2025\nEFGH 5678,another@university.edu,Winter 2026`}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={handleCsvSubmit}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
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
                  <p className="text-sm font-medium text-green-900 mb-2">
                    New Professors:
                  </p>
                  <div className="space-y-1">
                    {results.created.map((item, idx) => (
                      <div key={idx} className="text-xs text-green-700">
                        <p>
                          {item.courseCode} ({item.term}) →{" "}
                          {item.professorEmail}
                        </p>
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
                  <p className="text-sm font-medium text-amber-900 mb-2">
                    Linked to Existing:
                  </p>
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
                  <p className="text-sm font-medium text-red-900 mb-2">
                    Errors:
                  </p>
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
