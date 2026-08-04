export default function Aviso({
  tipo = 'info',
  children,
}: {
  tipo?: 'info' | 'ok' | 'erro';
  children: React.ReactNode;
}) {
  return <div className={`aviso ${tipo}`}>{children}</div>;
}
