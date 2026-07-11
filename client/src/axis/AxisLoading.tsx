export function AxisLoading({ label, overlay }: { label: string; overlay?: boolean }) {
  return (
    <div className="ax-loading" style={overlay ? { position: 'absolute', inset: 0, zIndex: 60 } : undefined}>
      <div className="ig-lab">Axis & Allies Anniversary</div>
      <h2>{label}</h2>
      <div className="ax-loading-bar"><span /></div>
    </div>
  );
}
