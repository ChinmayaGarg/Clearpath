const PIPELINE = ['pending', 'emailed', 'received', 'written', 'picked_up'];

const STATUS_META = {
  pending:   { label: 'Pending',   colour: 'bg-gray-100  text-gray-600'  },
  emailed:   { label: 'Emailed',   colour: 'bg-blue-100  text-blue-700'  },
  received:  { label: 'Received',  colour: 'bg-yellow-100 text-yellow-700'},
  written:   { label: 'Written',   colour: 'bg-orange-100 text-orange-700'},
  picked_up: { label: 'Picked up', colour: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', colour: 'bg-red-100   text-red-600'   },
  dropped:   { label: 'Dropped',   colour: 'bg-purple-100 text-purple-700'},
};

export function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { label: status, colour: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${meta.colour}`}>
      {meta.label}
    </span>
  );
}

/**
 * Visual pipeline — shows all steps with the current one highlighted.
 * Clicking a step triggers onAdvance if the transition is valid.
 */
export default function StatusPipeline({ status, onAdvance }) {
  const currentIdx = PIPELINE.indexOf(status);

  return (
    <div className="flex items-center gap-1">
      {PIPELINE.map((step, idx) => {
        const meta      = STATUS_META[step];
        const isPast    = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const isNext    = idx === currentIdx + 1;

        return (
          <button
            key={step}
            onClick={() => isNext && onAdvance?.(step)}
            disabled={!isNext}
            title={isNext ? `Mark as ${meta.label}` : meta.label}
            className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
              isCurrent
                ? `${meta.colour} ring-2 ring-offset-1 ring-current`
                : isPast
                ? 'bg-gray-100 text-gray-400 line-through'
                : isNext
                ? 'bg-gray-100 text-gray-500 hover:bg-blue-50 hover:text-blue-600 cursor-pointer'
                : 'bg-gray-50 text-gray-300 cursor-default'
            }`}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}
