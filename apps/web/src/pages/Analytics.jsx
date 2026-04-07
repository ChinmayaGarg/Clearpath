import { useState, useEffect } from "react";
import TopNav from "../components/ui/TopNav.jsx";
import { api } from "../lib/api.js";
import { toast } from "../components/ui/Toast.jsx";
import Spinner from "../components/ui/Spinner.jsx";

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, colour = "brand" }) {
  const colours = {
    brand: "bg-brand-50 border-brand-600 border-opacity-20 text-brand-800",
    green: "bg-green-50 border-green-200 text-green-800",
    red: "bg-red-50 border-red-200 text-red-700",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    gray: "bg-gray-50 border-gray-200 text-gray-700",
  };
  return (
    <div className={`border rounded-xl p-4 ${colours[colour]}`}>
      <div className="text-2xl font-bold">{value ?? "—"}</div>
      <div className="text-sm font-medium mt-0.5">{label}</div>
      {sub && <div className="text-xs opacity-70 mt-0.5">{sub}</div>}
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
              style={{
                height: `${Math.max(pct, 2)}%`,
                background: colour,
                minHeight: 2,
              }}
            />
            {/* Tooltip */}
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
function Section({ title, children, loading }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Analytics() {
  const today = new Date().toISOString().split("T")[0];
  const now = new Date();
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;

  const [range, setRange] = useState({
    from: `${year}-09-01`,
    to: today,
  });

  const [overview, setOverview] = useState(null);
  const [daily, setDaily] = useState([]);
  const [leads, setLeads] = useState([]);
  const [email, setEmail] = useState(null);
  const [accommodations, setAccommodations] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const q = `from=${range.from}&to=${range.to}`;
    try {
      const [ov, d, l, em, ac] = await Promise.all([
        api.get(`/analytics/overview?${q}`),
        api.get(`/analytics/daily?${q}`),
        api.get(`/analytics/leads?${q}`),
        api.get(`/analytics/email?${q}`),
        api.get(`/analytics/accommodations?${q}`),
      ]);
      setOverview(ov.overview);
      setDaily(d.days);
      setLeads(l.leads);
      setEmail(em);
      setAccommodations(ac.accommodations);
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [range.from, range.to]); // eslint-disable-line

  const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Header + date range */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Analytics</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {range.from} → {range.to}
            </p>
          </div>
          <DateRangePicker
            from={range.from}
            to={range.to}
            onChange={setRange}
          />
        </div>

        {/* Overview stat cards */}
        <Section title="Overview" loading={loading && !overview}>
          {overview && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard
                label="Exam days"
                value={overview.total_days}
                colour="brand"
              />
              <StatCard
                label="Exams"
                value={overview.total_exams}
                sub={`${overview.rwg_exams} RWG`}
                colour="brand"
              />
              <StatCard
                label="Students served"
                value={overview.unique_students}
                sub={`${overview.total_students} seats total`}
                colour="green"
              />
              <StatCard
                label="Completed"
                value={`${pct(overview.completed_exams, overview.total_exams)}%`}
                sub={`${overview.completed_exams} of ${overview.total_exams} exams`}
                colour={
                  pct(overview.completed_exams, overview.total_exams) > 80
                    ? "green"
                    : "amber"
                }
              />
              <StatCard
                label="Emails sent"
                value={overview.emails_sent}
                sub={`${overview.emails_delivered} delivered`}
                colour="gray"
              />
              <StatCard
                label="Pending exams"
                value={overview.pending_exams}
                sub="Not yet emailed"
                colour={overview.pending_exams > 0 ? "amber" : "green"}
              />
              <StatCard
                label="Bounced emails"
                value={overview.emails_bounced}
                colour={overview.emails_bounced > 0 ? "red" : "green"}
              />
              <StatCard
                label="Active leads"
                value={overview.active_senders}
                sub="Sent at least one email"
                colour="gray"
              />
            </div>
          )}
        </Section>

        {/* Daily exam chart */}
        <Section title="Exams per day" loading={loading}>
          <BarChart
            data={daily}
            valueKey="exam_count"
            labelKey="date"
            colour="#534AB7"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>{daily[0]?.date}</span>
            <span>{daily[daily.length - 1]?.date}</span>
          </div>
        </Section>

        {/* Lead activity + accommodations side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Lead activity */}
          <Section title="Lead activity" loading={loading}>
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
                      <div className="text-sm font-medium text-gray-900">
                        {l.lead_name}
                      </div>
                      <div className="text-xs text-gray-500">{l.email}</div>
                    </div>
                    <div className="flex gap-3 text-right">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {l.emails_sent}
                        </div>
                        <div className="text-xs text-gray-400">emails</div>
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-gray-900">
                          {l.status_changes}
                        </div>
                        <div className="text-xs text-gray-400">updates</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Top accommodation codes */}
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
                        <span
                          className={`text-xs font-medium ${
                            a.triggers_rwg_flag
                              ? "text-red-700"
                              : "text-gray-700"
                          }`}
                        >
                          {a.code}
                        </span>
                        <span className="text-xs text-gray-500">
                          {a.usage_count} · {a.student_count} students
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            a.triggers_rwg_flag ? "bg-red-400" : "bg-brand-400"
                          }`}
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

        {/* Email response time */}
        {email?.responseTime && (
          <Section title="Email response times" loading={loading}>
            <div className="flex gap-6">
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {email.responseTime.avg_response_hours ?? "—"}h
                </div>
                <div className="text-sm text-gray-500">
                  Average professor response time
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  Based on {email.responseTime.exams_with_response} exams
                </div>
              </div>
              <div>
                <BarChart
                  data={email.daily}
                  valueKey="sent"
                  labelKey="date"
                  colour="#534AB7"
                />
                <div className="text-xs text-gray-400 text-center mt-1">
                  Emails sent per day
                </div>
              </div>
            </div>
          </Section>
        )}

        {/* Status breakdown */}
        {overview?.status_breakdown && (
          <Section title="Exam status breakdown" loading={loading}>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {[
                {
                  key: "pending",
                  label: "Pending",
                  colour: "bg-gray-100 text-gray-600",
                },
                {
                  key: "emailed",
                  label: "Emailed",
                  colour: "bg-blue-100 text-blue-700",
                },
                {
                  key: "received",
                  label: "Received",
                  colour: "bg-yellow-100 text-yellow-700",
                },
                {
                  key: "written",
                  label: "Written",
                  colour: "bg-orange-100 text-orange-700",
                },
                {
                  key: "picked_up",
                  label: "Picked up",
                  colour: "bg-green-100 text-green-700",
                },
                {
                  key: "cancelled",
                  label: "Cancelled",
                  colour: "bg-red-100 text-red-600",
                },
              ].map(({ key, label, colour }) => (
                <div
                  key={key}
                  className={`rounded-xl px-3 py-2 text-center ${colour}`}
                >
                  <div className="text-xl font-bold">
                    {overview.status_breakdown[key] ?? 0}
                  </div>
                  <div className="text-xs font-medium">{label}</div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
