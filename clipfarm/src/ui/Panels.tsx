import { useEffect, useState } from 'react';
import { api } from '../api';
import { runCeo } from '../ceo';
import { defaultCeo, MAX_AGENTS, useStore } from '../store';
import { TEMPLATES } from '../templates';
import type { Health } from '../types';

function Modal({ title, children }: { title: string; children: React.ReactNode }) {
  const setPanel = useStore((s) => s.setPanel);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && setPanel(null)}>
      <div className="modal">
        <header>
          <h2>{title}</h2>
          <button onClick={() => setPanel(null)} aria-label="Stäng">
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

function useCurrent() {
  const { businesses, currentId } = useStore();
  return businesses.find((b) => b.id === currentId) ?? businesses[0];
}

function Kanban() {
  const b = useCurrent();
  const tasks = useStore((s) => s.tasks).filter((t) => t.businessId === b.id);
  const agents = useStore((s) => s.agents);
  const { addTask, startTask, startAll, removeTask, retryTask } = useStore();
  const [title, setTitle] = useState('');
  return (
    <Modal title={`Kanban – ${b.name}`}>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) addTask(b.id, title.trim());
          setTitle('');
        }}
      >
        <input autoFocus placeholder={b.live ? 'Klistra in länk till hela avsnittet (YouTube m.fl.)' : 'Nytt jobb (t.ex. produktidé)'} value={title} onChange={(e) => setTitle(e.target.value)} />
        <button className="primary">Lägg till</button>
        <button type="button" onClick={() => startAll(b.id)}>
          Starta alla
        </button>
      </form>
      <div className="kanban" style={{ gridTemplateColumns: `repeat(${b.stages.length}, minmax(140px, 1fr))` }}>
        {b.stages.map((stage, i) => (
          <div key={stage + i} className="col">
            <h3 style={{ color: b.color }}>
              {stage} <small>{tasks.filter((t) => t.stage === i).length}</small>
            </h3>
            {tasks
              .filter((t) => t.stage === i)
              .map((t) => {
                const who = agents.find((a) => a.id === t.assignee);
                return (
                  <div key={t.id} className={'card' + (who ? ' active' : '')}>
                    <div>{t.title}</div>
                    {t.delegatedTo && !who && (
                      <div className="muted">→ delegerat till {agents.find((a) => a.id === t.delegatedTo)?.name ?? '?'}</div>
                    )}
                    {t.queued && !who && !t.error && !t.delegatedTo && <div className="muted">I kö…</div>}
                    {t.error && <div className="err">{t.error}</div>}
                    {t.clips && t.clips.length > 0 && i === b.stages.length - 1 && (
                      <ul className="clips">
                        {t.clips.map((c) => (
                          <li key={c.file}>
                            <a href={c.file} target="_blank" rel="noreferrer">{c.title}</a>
                          </li>
                        ))}
                      </ul>
                    )}
                    {who && (
                      <div className="bar">
                        <i style={{ width: `${Math.round(t.progress * 100)}%` }} />
                        <span>{who.name}</span>
                      </div>
                    )}
                    <div className="card-actions">
                      {i === 0 && <button onClick={() => startTask(t.id)}>▶ Starta</button>}
                      {t.error && <button onClick={() => retryTask(t.id)}>↻ Försök igen</button>}
                      <button onClick={() => removeTask(t.id)}>Ta bort</button>
                    </div>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </Modal>
  );
}


const PLATFORM_NAMES: Record<string, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', discord: 'Discord' };

function Check({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <li className={ok ? 'ok' : 'miss'}>
      {ok ? '✓' : '✗'} {label}
      {!ok && hint && <small> – {hint}</small>}
    </li>
  );
}

function LiveInfo() {
  const { platformStats, health, serverOnline, setPanel } = useStore();
  const h: Health | null = health;
  return (
    <>
      <h3>Plattformar (live)</h3>
      {!serverOnline && <p className="err">Backend offline – ingen live-data. Kör <code>npm run server</code>.</p>}
      <div className="platforms">
        {platformStats.map((p) => (
          <div key={p.platform} className="platform">
            <strong>{PLATFORM_NAMES[p.platform]}</strong>
            {p.error ? (
              <span className="err">{p.error}</span>
            ) : p.configured ? (
              Object.entries(p.metrics).map(([k, v]) => (
                <span key={k}>
                  {typeof v === 'number' ? v.toLocaleString('sv-SE') : v} <small>{k}</small>
                </span>
              ))
            ) : (
              <span className="muted">{p.hint}</span>
            )}
          </div>
        ))}
      </div>
      <h3>Systemstatus</h3>
      {h ? (
        <ul className="checks">
          <Check ok={h.anthropic || h.mock} label={h.mock ? 'Claude (MOCK-läge – inga riktiga anrop)' : `Claude API (${h.model})`} hint="sätt ANTHROPIC_API_KEY i .env" />
          <Check ok={h.ffmpeg} label="ffmpeg" hint="installera ffmpeg" />
          <Check ok={h.ytdlp} label="yt-dlp (hämtar video)" hint="pip install yt-dlp" />
          <Check ok={h.rulesSet || h.mock} label="Communityts regler inlagda" hint="öppna Regler nedan" />
          <Check ok={h.discordPost} label="Postning till Discord" hint="valfritt: DISCORD_WEBHOOK_URL" />
        </ul>
      ) : (
        <p className="muted">Ingen status än.</p>
      )}
      <button onClick={() => setPanel({ type: 'rules' })}>🗒 Regler för clipping-communityt</button>
    </>
  );
}

function Rules() {
  const { health, setPanel } = useStore();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    api<{ text: string }>('GET', '/api/rules').then((r) => setText(r.text)).catch((e: Error) => setMsg(e.message));
  }, []);
  const save = () =>
    api('PUT', '/api/rules', { text }).then(() => setMsg('Sparat – nästa jobb använder de nya reglerna.')).catch((e: Error) => setMsg(e.message));
  const sync = () =>
    api<{ text: string }>('POST', '/api/rules/sync')
      .then((r) => {
        setText(r.text);
        setMsg('Hämtade regler från Discord.');
      })
      .catch((e: Error) => setMsg(e.message));
  return (
    <Modal title="Regler och kriterier">
      <p className="muted">
        Alla agenter (Scout, QA) får hela den här texten före varje jobb. Klistra in reglerna från Discord-communityt.
      </p>
      <textarea className="rules" value={text} onChange={(e) => setText(e.target.value)} rows={18} />
      <div className="row">
        <button className="primary" onClick={save}>Spara</button>
        {health?.discordRules && <button onClick={sync}>Hämta från Discord-kanal</button>}
        <button onClick={() => setPanel({ type: 'stats' })}>Tillbaka</button>
        <span className="muted">{msg}</span>
      </div>
    </Modal>
  );
}

function Stats() {
  const b = useCurrent();
  const agents = useStore((s) => s.agents).filter((a) => a.businessId === b.id);
  const { hireAgent, setPanel } = useStore();
  const [name, setName] = useState('');
  const [stage, setStage] = useState(1);
  const workStages = b.stages.map((s, i) => ({ s, i })).filter(({ i }) => i > 0 && i < b.stages.length - 1);
  return (
    <Modal title={`Statistik – ${b.name}`}>
      <div className="tiles">
        <div><b>{b.done}</b><span>klara jobb</span></div>
        <div><b>{b.units.toLocaleString('sv-SE')}</b><span>{b.unitLabel}</span></div>
        {!b.live && <div><b>{b.revenue.toLocaleString('sv-SE')} kr</b><span>intäkt</span></div>}
      </div>
      {b.live ? <LiveInfo /> : <p className="muted">Siffrorna är simulerade (intäkt per klart jobb: {b.revenuePerTask} kr). Den här businessen har inga riktiga agenter än.</p>}
      <h3>Agenter ({agents.length}/{MAX_AGENTS})</h3>
      <ul className="agents">
        {agents.map((a) => (
          <li key={a.id}>
            <i style={{ background: a.color }} />
            <button className="link" onClick={() => setPanel({ type: 'agent', id: a.id })}>{a.name}</button>
            <span>{b.stages[a.stage]} · {a.taskId ? 'jobbar' : 'väntar'}</span>
          </li>
        ))}
      </ul>
      {agents.length < MAX_AGENTS && workStages.length > 0 && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            hireAgent(b.id, name, stage);
            setName('');
          }}
        >
          <input placeholder="Namn på ny agent" value={name} onChange={(e) => setName(e.target.value)} />
          <select value={stage} onChange={(e) => setStage(Number(e.target.value))}>
            {workStages.map(({ s, i }) => (
              <option key={i} value={i}>{s}</option>
            ))}
          </select>
          <button className="primary">Anställ</button>
        </form>
      )}
    </Modal>
  );
}

function AgentPanel({ id }: { id: string }) {
  const agent = useStore((s) => s.agents.find((a) => a.id === id));
  const b = useCurrent();
  const task = useStore((s) => s.tasks.find((t) => t.id === agent?.taskId));
  const { updateAgent, fireAgent } = useStore();
  if (!agent) return null;
  return (
    <Modal title={agent.name}>
      <p>Roll: <b>{b.stages[agent.stage]}</b> → {b.stages[agent.stage + 1]}</p>
      <p>Just nu: {task ? <b>{task.title} ({Math.round(task.progress * 100)}%)</b> : 'väntar på jobb'}</p>
      <div className="row">
        <input value={agent.name} onChange={(e) => updateAgent(id, { name: e.target.value })} />
        <label>
          Hastighet {agent.speed.toFixed(1)}×
          <input type="range" min="0.5" max="3" step="0.5" value={agent.speed} onChange={(e) => updateAgent(id, { speed: Number(e.target.value) })} />
        </label>
      </div>
      <button className="danger" onClick={() => fireAgent(id)}>Avsluta anställning</button>
    </Modal>
  );
}


function CeoPanel() {
  const b = useCurrent();
  const store = useStore();
  const { serverOnline, health, resolveProposal, patchCeo } = store;
  const ceo = store.ceo[b.id] ?? defaultCeo(store.businesses.indexOf(b));
  const busy = !!store.ceoBusy[b.id];
  const [msg, setMsg] = useState('');
  const canThink = serverOnline && (health?.anthropic || health?.mock);
  const send = () => {
    const m = msg.trim();
    if (!m) return;
    setMsg('');
    runCeo(b.id, m);
  };
  return (
    <Modal title={`CEO ${ceo.name} – ${b.name}`}>
      {!canThink && (
        <p className="err">
          CEO:n kan inte tänka just nu: {serverOnline ? 'ANTHROPIC_API_KEY saknas i backend (.env).' : 'backend är offline (npm run server).'}
        </p>
      )}
      <p className="muted">
        CEO:n ser hela teamet och alla jobb, delegerar jobb till rätt agent och föreslår nya anställningar när något steg blir flaskhals. Du godkänner anställningar{ceo.autoApprove ? ' (just nu: automatiskt)' : ''}.
      </p>

      {ceo.proposals.length > 0 && (
        <>
          <h3>Anställningsförslag</h3>
          <ul className="proposals">
            {ceo.proposals.map((p) => (
              <li key={p.id}>
                <div>
                  <b>{p.name}</b> <small>i steget "{b.stages[p.stage]}"</small>
                  <div className="muted">{p.rationale}</div>
                </div>
                <div className="row" style={{ margin: 0 }}>
                  <button className="primary" onClick={() => resolveProposal(b.id, p.id, true)}>Godkänn</button>
                  <button onClick={() => resolveProposal(b.id, p.id, false)}>Avslå</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Chatta med CEO</h3>
      <div className="chat">
        {ceo.chat.length === 0 && <div className="muted">Fråga om läget, be CEO:n prioritera, anställa eller omfördela.</div>}
        {ceo.chat.map((m, i) => (
          <div key={i} className={'msg ' + m.role}>{m.text}</div>
        ))}
        {busy && <div className="msg ceo muted">CEO:n tänker…</div>}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input placeholder="Skriv till CEO:n…" value={msg} onChange={(e) => setMsg(e.target.value)} disabled={!canThink} />
        <button className="primary" disabled={!canThink || busy}>Skicka</button>
        <button type="button" disabled={!canThink || busy} onClick={() => runCeo(b.id)}>Gör genomgång nu</button>
      </form>

      <h3>Logg</h3>
      <ul className="log">
        {ceo.log.length === 0 && <li className="muted">Inget har hänt än.</li>}
        {[...ceo.log].reverse().slice(0, 12).map((l, i) => (
          <li key={i}><small>{new Date(l.t).toLocaleTimeString('sv-SE')}</small> {l.text}</li>
        ))}
      </ul>

      <h3>Inställningar</h3>
      <div className="settings">
        <label><input type="checkbox" checked={ceo.auto} onChange={(e) => patchCeo(b.id, { auto: e.target.checked })} /> CEO:n gör egna genomgångar när jobb köar (kostar Claude-anrop)</label>
        <label><input type="checkbox" checked={ceo.autoApprove} onChange={(e) => patchCeo(b.id, { autoApprove: e.target.checked })} /> Anställ automatiskt utan att fråga mig</label>
        <label>Max antal agenter: <input type="number" min="1" max={MAX_AGENTS} value={ceo.maxAgents} onChange={(e) => patchCeo(b.id, { maxAgents: Math.max(1, Math.min(MAX_AGENTS, Number(e.target.value) || 1)) })} /></label>
        <label>CEO:ns namn: <input value={ceo.name} onChange={(e) => patchCeo(b.id, { name: e.target.value })} /></label>
      </div>
    </Modal>
  );
}

function Elevator() {
  const { businesses, currentId, goTo, setPanel, removeBusiness } = useStore();
  return (
    <Modal title="Hiss – välj våning">
      <ul className="floors">
        {[...businesses].reverse().map((b) => (
          <li key={b.id} className={b.id === currentId ? 'current' : ''}>
            <i style={{ background: b.color }} />
            <button
              className="link"
              onClick={() => {
                goTo(b.id);
                setPanel(null);
              }}
            >
              Våning {businesses.indexOf(b) + 1}: {b.name}
            </button>
            {businesses.length > 1 && (
              <button className="danger small" onClick={() => confirm(`Ta bort ${b.name} och alla dess jobb/agenter?`) && removeBusiness(b.id)}>
                Ta bort
              </button>
            )}
          </li>
        ))}
      </ul>
      <button className="primary" onClick={() => setPanel({ type: 'addBusiness' })}>+ Ny business</button>
    </Modal>
  );
}

function AddBusiness() {
  const { addBusiness, setPanel } = useStore();
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('pod');
  const [color, setColor] = useState(TEMPLATES.pod.color);
  const [revenue, setRevenue] = useState(TEMPLATES.pod.revenuePerTask);
  const [stages, setStages] = useState('Idé, Arbete, Granskning, Klart');
  const pick = (t: string) => {
    setTemplate(t);
    setColor(TEMPLATES[t].color);
    setRevenue(TEMPLATES[t].revenuePerTask);
  };
  const customStages = stages.split(',').map((s) => s.trim()).filter(Boolean);
  const invalid = !name.trim() || (template === 'custom' && customStages.length < 3);
  return (
    <Modal title="Ny business">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (invalid) return;
          addBusiness({ name: name.trim(), template, color, revenuePerTask: revenue, customStages });
          setPanel(null);
        }}
      >
        <label>Namn<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="t.ex. POD Store" /></label>
        <label>Mall
          <select value={template} onChange={(e) => pick(e.target.value)}>
            {Object.entries(TEMPLATES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
          </select>
        </label>
        {template === 'custom' ? (
          <label>Steg i flödet (kommaseparerade, minst 3 – första är inkorg, sista är klart)
            <input value={stages} onChange={(e) => setStages(e.target.value)} />
          </label>
        ) : (
          <p className="muted">Flöde: {TEMPLATES[template].stages.join(' → ')}</p>
        )}
        <div className="row">
          <label>Färg<input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
          <label>Intäkt per klart jobb (kr)<input type="number" min="0" value={revenue} onChange={(e) => setRevenue(Number(e.target.value))} /></label>
        </div>
        <button className="primary" disabled={invalid}>Skapa våning</button>
      </form>
    </Modal>
  );
}

export function Panels() {
  const panel = useStore((s) => s.panel);
  if (!panel) return null;
  switch (panel.type) {
    case 'kanban': return <Kanban />;
    case 'stats': return <Stats />;
    case 'agent': return <AgentPanel id={panel.id} />;
    case 'elevator': return <Elevator />;
    case 'addBusiness': return <AddBusiness />;
    case 'rules': return <Rules />;
    case 'ceo': return <CeoPanel />;
  }
}
