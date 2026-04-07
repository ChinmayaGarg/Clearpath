import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import TopNav from "../components/ui/TopNav.jsx";
import { useBookStore } from "../store/bookStore.js";
import { useBook } from "../hooks/useBook.js";
import { formatDateShort } from "../lib/utils.js";

function CalCell({ date, summary, isToday, isViewing, onClick }) {
  const d = new Date(date + "T12:00:00");
  return (
    <button
      onClick={onClick}
      className={`aspect-square p-1.5 rounded-lg text-left transition-colors
                  border text-xs flex flex-col ${
                    isViewing
                      ? "border-brand-600 bg-brand-50"
                      : isToday
                        ? "border-gray-400 bg-gray-50"
                        : summary
                          ? "border-gray-200 bg-white hover:border-gray-300"
                          : "border-transparent bg-transparent hover:bg-gray-100"
                  }`}
    >
      <span
        className={`font-medium ${isToday ? "text-brand-800" : "text-gray-700"}`}
      >
        {d.getDate()}
      </span>
      {summary && (
        <span className="text-gray-400 mt-auto">
          {summary.exam_count} exams
        </span>
      )}
    </button>
  );
}

export default function Calendar() {
  const navigate = useNavigate();
  const { date, setDate } = useBook();
  const allDates = useBookStore((s) => s.allDates);
  const loadAllDates = useBookStore((s) => s.loadAllDates);

  const today = new Date().toISOString().split("T")[0];
  const [year, month] = date.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const dateMap = Object.fromEntries(allDates.map((d) => [d.date, d]));

  useEffect(() => {
    loadAllDates();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function prevMonth() {
    const d = new Date(year, month - 2, 1);
    setDate(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
    );
  }
  function nextMonth() {
    const d = new Date(year, month, 1);
    setDate(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`,
    );
  }

  const monthName = new Date(year, month - 1).toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <TopNav />
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={prevMonth}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100"
          >
            ←
          </button>
          <h1 className="text-lg font-semibold text-gray-900">{monthName}</h1>
          <button
            onClick={nextMonth}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100"
          >
            →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              className="text-center text-xs font-medium text-gray-400 py-1"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDay }, (_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = String(i + 1).padStart(2, "0");
            const d = `${year}-${String(month).padStart(2, "0")}-${day}`;
            return (
              <CalCell
                key={d}
                date={d}
                summary={dateMap[d]}
                isToday={d === today}
                isViewing={d === date}
                onClick={() => {
                  setDate(d);
                  navigate("/");
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
