export default function TermSelector({ terms, selectedTermId, onChange }) {
  if (!terms || terms.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 font-medium">Term</span>
      <select
        value={selectedTermId}
        onChange={e => onChange(e.target.value)}
        className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700
                   focus:outline-none focus:ring-1 focus:ring-brand-400 cursor-pointer"
      >
        {terms.map(t => (
          <option key={t.id} value={t.id}>{t.label}</option>
        ))}
        <option value="all">All terms</option>
      </select>
    </div>
  );
}
