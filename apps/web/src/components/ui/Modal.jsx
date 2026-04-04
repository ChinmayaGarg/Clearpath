export default function Modal({ title, onClose, children, width = 'max-w-lg' }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center
                    z-50 p-4 overflow-y-auto">
      <div className={`bg-white rounded-xl shadow-lg w-full ${width} my-auto`}>
        {title && (
          <div className="flex items-center justify-between px-6 py-4
                          border-b border-gray-100">
            <h2 className="text-base font-medium text-gray-900">{title}</h2>
            <button onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none">
              ×
            </button>
          </div>
        )}
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
