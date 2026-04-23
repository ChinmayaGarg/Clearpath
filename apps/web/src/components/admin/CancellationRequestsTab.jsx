import { useState, useEffect } from "react";
import { api } from "../../lib/api.js";
import { toast } from "../../components/ui/Toast.jsx";
import Spinner from "../../components/ui/Spinner.jsx";

function CancellationRequestsTab() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("pending");
  const [counts, setCounts] = useState({
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [expandedId, setExpandedId] = useState(null);
  const [modalState, setModalState] = useState(null); // { action: 'approve'|'reject', id, reason: '' }
  const [submitting, setSubmitting] = useState(false);

  async function loadRequests() {
    try {
      const response = await api.get(
        `/institution/cancellation-requests?status=${status}`,
      );
      setRequests(response.data ?? []);
    } catch {
      toast("Failed to load cancellation requests", "error");
    } finally {
      setLoading(false);
    }
  }

  async function loadCounts() {
    try {
      const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
        api.get("/institution/cancellation-requests?status=pending"),
        api.get("/institution/cancellation-requests?status=approved"),
        api.get("/institution/cancellation-requests?status=rejected"),
      ]);
      setCounts({
        pending: (pendingRes.data ?? []).length,
        approved: (approvedRes.data ?? []).length,
        rejected: (rejectedRes.data ?? []).length,
      });
    } catch {
      // Silently fail on count load
    }
  }

  useEffect(() => {
    loadCounts();
  }, []);

  useEffect(() => {
    setLoading(true);
    loadRequests();
  }, [status]);

  async function handleApprove(requestId, adminReason) {
    if (!adminReason.trim()) {
      toast("Please enter a reason", "error");
      return;
    }
    setSubmitting(true);
    try {
      await api.patch(
        `/institution/cancellation-requests/${requestId}/approve`,
        {
          adminReason: adminReason.trim(),
        },
      );
      toast("Cancellation request approved");
      setModalState(null);
      loadRequests();
      loadCounts();
    } catch (err) {
      toast(err.message || "Failed to approve request", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject(requestId, adminReason) {
    if (!adminReason.trim()) {
      toast("Please enter a reason", "error");
      return;
    }
    setSubmitting(true);
    try {
      await api.patch(
        `/institution/cancellation-requests/${requestId}/reject`,
        {
          adminReason: adminReason.trim(),
        },
      );
      toast("Cancellation request rejected");
      setModalState(null);
      loadRequests();
      loadCounts();
    } catch (err) {
      toast(err.message || "Failed to reject request", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading)
    return (
      <div className="py-12 flex justify-center">
        <Spinner />
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {["pending", "approved", "rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors
              ${
                status === s
                  ? "bg-brand-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            <span className="ml-2 text-xs">{counts[s]}</span>
          </button>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-sm text-gray-500">
            No {status} cancellation requests
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => (
            <div
              key={req.id}
              className="bg-white rounded-lg border border-gray-200"
            >
              <div
                onClick={() =>
                  setExpandedId(expandedId === req.id ? null : req.id)
                }
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-800">
                        {req.first_name} {req.last_name}
                      </span>
                      <span className="text-xs text-gray-500">
                        {req.student_number}
                      </span>
                      <span className="text-xs text-gray-500">
                        {req.course_code}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-medium
                        ${req.request_status === "pending" ? "bg-yellow-100 text-yellow-700" : ""}
                        ${req.request_status === "approved" ? "bg-green-100 text-green-700" : ""}
                        ${req.request_status === "rejected" ? "bg-red-100 text-red-700" : ""}
                      `}
                      >
                        {req.request_status.charAt(0).toUpperCase() +
                          req.request_status.slice(1)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Exam:{" "}
                      {new Date(req.exam_date).toLocaleDateString("en-CA", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                      {req.exam_time ? ` at ${req.exam_time}` : ""}
                    </p>
                  </div>
                  <span className="text-gray-400">
                    {expandedId === req.id ? "▼" : "▶"}
                  </span>
                </div>
              </div>

              {expandedId === req.id && (
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-700">
                      Exam Status
                    </label>
                    <p className="text-sm text-gray-600 mt-0.5">
                      {req.exam_status}
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700">
                      Student's Reason
                    </label>
                    <p className="text-sm text-gray-600 mt-0.5 p-2 bg-white rounded border border-gray-200">
                      {req.student_reason}
                    </p>
                  </div>

                  {req.admin_reason && (
                    <div>
                      <label className="text-xs font-medium text-gray-700">
                        Admin's Reason
                      </label>
                      <p className="text-sm text-gray-600 mt-0.5 p-2 bg-white rounded border border-gray-200">
                        {req.admin_reason}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-gray-700">
                      Student Email
                    </label>
                    <p className="text-sm text-gray-600 mt-0.5">{req.email}</p>
                  </div>

                  {req.request_status === "pending" && (
                    <div className="flex gap-2 pt-3 border-t border-gray-200">
                      <button
                        onClick={() =>
                          setModalState({
                            action: "approve",
                            id: req.id,
                            reason: "",
                          })
                        }
                        className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() =>
                          setModalState({
                            action: "reject",
                            id: req.id,
                            reason: "",
                          })
                        }
                        className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Admin Action Modal */}
      {modalState && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg p-6 max-w-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {modalState.action === "approve" ? "Approve" : "Reject"}{" "}
              Cancellation Request
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Please provide a reason for your decision:
            </p>
            <textarea
              value={modalState.reason}
              onChange={(e) =>
                setModalState({ ...modalState, reason: e.target.value })
              }
              placeholder="Reason..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-6"
              rows="3"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setModalState(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (modalState.action === "approve") {
                    handleApprove(modalState.id, modalState.reason);
                  } else {
                    handleReject(modalState.id, modalState.reason);
                  }
                }}
                disabled={submitting || !modalState.reason.trim()}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50
                  ${
                    modalState.action === "approve"
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-red-600 hover:bg-red-700"
                  }`}
              >
                {submitting
                  ? "Submitting…"
                  : modalState.action === "approve"
                    ? "Approve"
                    : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CancellationRequestsTab;
