import { useStore } from '../store';

export function Hud() {
  const { businesses, currentId, nearby, panel, locked, setPanel, serverOnline, notice, setNotice } = useStore();
  const current = businesses.find((b) => b.id === currentId) ?? businesses[0];
  return (
    <>
      <div className="hud-top">
        <div className="hud-title" style={{ borderColor: current.color }}>
          <strong>{current.name}</strong>
          <span>
            Våning {businesses.indexOf(current) + 1} av {businesses.length}
          </span>
        </div>
        <div className="hud-buttons">
          <button onClick={() => setPanel({ type: 'kanban' })}>Kanban</button>
          <button onClick={() => setPanel({ type: 'stats' })}>Statistik</button>
          <button onClick={() => setPanel({ type: 'elevator' })}>Hiss</button>
          <button className="primary" onClick={() => setPanel({ type: 'addBusiness' })}>
            + Ny business
          </button>
        </div>
      </div>
      {current.live && !serverOnline && (
        <div className="banner bad">Backend offline – agenterna kan inte jobba. Starta den med <code>npm run server</code> (se README).</div>
      )}
      {notice && (
        <div className="banner warn" onClick={() => setNotice(null)}>
          {notice} <small>(klicka för att stänga)</small>
        </div>
      )}
      {!panel && !locked && <div className="hud-center">Klicka i scenen för att gå runt</div>}
      {!panel && nearby && <div className="hud-prompt">Tryck <kbd>E</kbd> – {nearby.label}</div>}
      <div className="hud-help">WASD/pilar: gå · Mus: titta · E: interagera · Esc: släpp musen</div>
    </>
  );
}
