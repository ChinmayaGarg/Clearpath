export default function Spinner({ size = 'md' }) {
  const s = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-8 h-8' }[size];
  return (
    <div className={`${s} border-2 border-brand-600 border-t-transparent
                     rounded-full animate-spin`} />
  );
}
