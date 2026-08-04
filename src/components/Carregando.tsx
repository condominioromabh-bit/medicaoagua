export default function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="carregando">
      <span className="eyebrow">{texto}</span>
    </div>
  );
}
