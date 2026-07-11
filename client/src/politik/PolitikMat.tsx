import type { CSSProperties } from 'react';
import { PolitikCard } from './PolitikBoard';
import type { PolitikCardRef, PolitikSceneDef } from './PolitikScene';

export interface PolitikMatDisplayCard {
  card: PolitikCardRef;
  title: string;
  kind: string;
  ready?: boolean;
}

export interface PolitikMatCompany {
  id: string;
  title: string;
  card?: PolitikCardRef | null;
  industries?: string[];
  ready?: boolean;
  assets?: PolitikMatDisplayCard[];
  markets?: Record<string, number>;
  margin?: number;
}

export interface PolitikMatModel {
  color: string;
  nation?: PolitikMatDisplayCard | null;
  propagandaCards?: PolitikMatDisplayCard[];
  capital?: number;
  carbon?: number;
  food?: number;
  corruption?: number;
  support?: number | Record<string, number>;
  leaders?: number | Record<string, number>;
  companies?: PolitikMatCompany[];
  events?: PolitikMatDisplayCard[];
  stations?: PolitikMatDisplayCard[];
  finalSay?: boolean;
  immunity?: boolean;
}

const BASES = ['capitalism', 'communism', 'statism', 'fascism'] as const;
const INDUSTRIES = ['media', 'energy', 'financial', 'humanities', 'technology', 'manufacturing'] as const;

const total = (value: number | Record<string, number> | undefined): number =>
  typeof value === 'number' ? value : Object.values(value ?? {}).reduce((sum, count) => sum + count, 0);

const countFor = (value: number | Record<string, number> | undefined, key: string): number =>
  typeof value === 'object' ? value[key] ?? 0 : 0;

function InspectableCard({ scene, item, className, onInspect }: {
  scene: PolitikSceneDef;
  item: PolitikMatDisplayCard;
  className: string;
  onInspect?: (card: PolitikCardRef, title: string, kind: string) => void;
}) {
  const art = <PolitikCard scene={scene} card={item.card} label={item.title} />;
  const name = <span className="pk-mat-card-name">{item.title}</span>;
  if (!onInspect) return <div className={className} title={`${item.title} · ${item.kind}`}>{art}{name}</div>;
  return (
    <button
      type="button"
      className={className}
      title={`View ${item.title} close up`}
      aria-label={`View ${item.title} close up`}
      onClick={() => onInspect(item.card, item.title, item.kind)}
    >
      {art}{name}
    </button>
  );
}

function LeaderReserve({ arena, count }: { arena: 'military' | 'political' | 'corporate'; count: number }) {
  return (
    <div className={`pk-mat-leader pk-mat-leader-${arena}`} data-testid={`politik-personal-leader-${arena}`}>
      <i aria-hidden="true" />
      <span><b>{count}</b><small>{arena}</small></span>
    </div>
  );
}

function SupportGrid({ support }: { support: number | Record<string, number> | undefined }) {
  if (typeof support === 'number') {
    return <div className="pk-mat-total-chip"><small>SUPPORT</small><b>{support}</b></div>;
  }
  return (
    <div className="pk-mat-support-grid">
      {BASES.map((base) => (
        <span key={base} className={`pk-mat-base pk-mat-base-${base}`}>
          <small>{base}</small><b>{support?.[base] ?? 0}</b>
        </span>
      ))}
    </div>
  );
}

function CompanyTableau({ scene, company, onInspect }: {
  scene: PolitikSceneDef;
  company: PolitikMatCompany;
  onInspect?: (card: PolitikCardRef, title: string, kind: string) => void;
}) {
  const margin = Math.max(0, Math.min(9, company.margin ?? 0));
  const marginTop = 8 + ((9 - margin) / 9) * 78;
  const markets = INDUSTRIES
    .map((industry) => [industry, company.markets?.[industry] ?? 0] as const)
    .filter(([, amount]) => amount > 0);
  const companyItem = company.card ? { card: company.card, title: company.title, kind: 'Company', ready: company.ready } : null;
  return (
    <article
      className={`pk-mat-company${company.ready === false ? ' used' : ''}`}
      data-testid={`politik-personal-company-${company.id}`}
    >
      <header>
        <div><b>{company.title}</b><small>{(company.industries ?? []).join(' · ') || 'NO INDUSTRY'}</small></div>
        <span>{company.ready === false ? 'USED' : 'READY'}</span>
      </header>

      <div className="pk-mat-company-face">
        {companyItem
          ? <InspectableCard scene={scene} item={companyItem} className="pk-mat-company-card" onInspect={onInspect} />
          : <div className="pk-mat-company-missing">CARD ART UNAVAILABLE</div>}
      </div>

      <div className="pk-mat-company-tracker" aria-label={`${margin} Margin`}>
        {scene.mat.companyBoard && <img src={scene.mat.companyBoard} alt="" draggable={false} />}
        <span className="pk-mat-margin-label">MARGIN <b>{margin}</b></span>
        <span className="pk-mat-margin-marker" style={{ '--pk-margin-top': `${marginTop}%` } as CSSProperties}>
          {scene.mat.margin ? <img src={scene.mat.margin} alt="" draggable={false} /> : <i />}
          <b>{margin}</b>
        </span>
      </div>

      <footer>
        <div className="pk-mat-market-row" aria-label="Company Markets">
          {markets.length === 0 && <small>NO MARKETS</small>}
          {markets.map(([industry, amount]) => (
            <span key={industry} title={`${amount} ${industry} Market`}>
              {scene.mat.markets?.[industry] && <img src={scene.mat.markets[industry]} alt="" draggable={false} />}
              <b>{amount}</b><small>{industry}</small>
            </span>
          ))}
        </div>
        <div className="pk-mat-asset-row" aria-label="Company Assets">
          {(company.assets ?? []).length === 0 && <small>NO ASSETS</small>}
          {(company.assets ?? []).map((asset, index) => (
            <InspectableCard key={`${asset.card.sheet}:${asset.card.cell}:${index}`} scene={scene} item={asset} className="pk-mat-asset-card" onInspect={onInspect} />
          ))}
        </div>
      </footer>
    </article>
  );
}

export function PolitikMat({ scene, model, className, onInspect }: {
  scene: PolitikSceneDef;
  model: PolitikMatModel;
  className?: string;
  onInspect?: (card: PolitikCardRef, title: string, kind: string) => void;
}) {
  const leaders = model.leaders;
  const military = typeof leaders === 'object' ? leaders.military ?? 0 : Math.ceil((leaders ?? 0) / 3);
  const political = typeof leaders === 'object' ? leaders.political ?? 0 : Math.floor(((leaders ?? 0) + 1) / 3);
  const corporate = typeof leaders === 'object' ? leaders.corporate ?? 0 : Math.floor((leaders ?? 0) / 3);
  const companies = model.companies ?? [];
  const companyColumns = companies.length <= 1 ? 1 : companies.length <= 4 ? 2 : 3;
  const boardStyle = { '--pk-seat': model.color } as CSSProperties;
  const companyStyle = { '--pk-company-cols': companyColumns } as CSSProperties;

  return (
    <div className={`${className ?? 'pk-mat'} pk-mat-flat`} style={boardStyle} data-testid="politik-personal-tableau">
      <div className="pk-mat-workspace">
        <section className="pk-mat-zone pk-mat-nation-zone" data-testid="politik-personal-nation">
          <header className="pk-mat-zone-head"><div><span>YOUR NATION</span><b>COMMAND BOARD</b></div><small>TOP-DOWN · AUTHENTIC ART</small></header>
          <div className="pk-mat-nation-board">
            <img className="pk-mat-nation-art" src={scene.mat.board} alt="Politik Nation board" draggable={false} />
            {model.nation && <InspectableCard scene={scene} item={model.nation} className="pk-mat-nation-card" onInspect={onInspect} />}
            <LeaderReserve arena="military" count={military} />
            <LeaderReserve arena="political" count={political} />
            <LeaderReserve arena="corporate" count={corporate} />
          </div>
        </section>

        <aside className="pk-mat-zone pk-mat-ledger-zone">
          <header className="pk-mat-zone-head"><div><span>PRIVATE DEVICE</span><b>NATION LEDGER</b></div><small>EXACT COUNTS</small></header>
          <div className="pk-mat-resource-ledger">
            <img src={scene.mat.resources} alt="" draggable={false} />
            <span><small>CAPITAL</small><b>{model.capital ?? 0}</b></span>
            <span><small>CARBON</small><b>{model.carbon ?? 0}</b></span>
            <span><small>FOOD</small><b>{model.food ?? 0}</b></span>
            <span><small>CORRUPTION · BOARD</small><b>{model.corruption ?? 0}</b></span>
          </div>

          <div className="pk-mat-status-row">
            <span className={model.finalSay ? 'on' : ''}><small>FINAL SAY</small><b>{model.finalSay ? 'HELD' : 'NO'}</b></span>
            <span className={model.immunity ? 'on' : ''}><small>IMMUNITY</small><b>{model.immunity ? 'ACTIVE' : 'NO'}</b></span>
          </div>

          <section className="pk-mat-ledger-section">
            <div className="pk-mat-section-title"><b>SUPPORT ON MAIN BOARD</b><small>{total(model.support)} TOTAL</small></div>
            <SupportGrid support={model.support} />
          </section>

          <section className="pk-mat-ledger-section pk-mat-tableau-cards">
            <div className="pk-mat-section-title"><b>PROPAGANDA</b><small>{model.propagandaCards?.length ?? 0} ACTIVE</small></div>
            <div>
              {(model.propagandaCards ?? []).length === 0 && <small className="pk-mat-empty-copy">NONE IN PLAY</small>}
              {(model.propagandaCards ?? []).map((card, index) => (
                <InspectableCard key={`${card.card.sheet}:${card.card.cell}:${index}`} scene={scene} item={card} className={`pk-mat-tableau-card${card.ready === false ? ' used' : ''}`} onInspect={onInspect} />
              ))}
            </div>
          </section>

          <section className="pk-mat-ledger-section pk-mat-tableau-cards">
            <div className="pk-mat-section-title"><b>BROADCAST STATIONS</b><small>{model.stations?.length ?? 0} CONTROLLED</small></div>
            <div>
              {(model.stations ?? []).length === 0 && <small className="pk-mat-empty-copy">NONE CONTROLLED</small>}
              {(model.stations ?? []).map((card, index) => (
                <InspectableCard key={`${card.card.sheet}:${card.card.cell}:${index}`} scene={scene} item={card} className={`pk-mat-tableau-card${card.ready === false ? ' used' : ''}`} onInspect={onInspect} />
              ))}
            </div>
          </section>

          <section className="pk-mat-ledger-section pk-mat-tableau-cards">
            <div className="pk-mat-section-title"><b>LIVE EVENTS</b><small>{model.events?.length ?? 0} ACTIVE</small></div>
            <div>
              {(model.events ?? []).length === 0 && <small className="pk-mat-empty-copy">NONE IN PLAY</small>}
              {(model.events ?? []).map((card, index) => (
                <InspectableCard key={`${card.card.sheet}:${card.card.cell}:${index}`} scene={scene} item={card} className={`pk-mat-tableau-card${card.ready === false ? ' used' : ''}`} onInspect={onInspect} />
              ))}
            </div>
          </section>
        </aside>

        <section className="pk-mat-zone pk-mat-company-zone" data-testid="politik-personal-companies">
          <header className="pk-mat-zone-head"><div><span>CORPORATE TABLEAU</span><b>COMPANY BOARDS</b></div><small>{companies.length} IN PLAY</small></header>
          {companies.length === 0 ? (
            <div className="pk-mat-companies-empty">
              {scene.mat.companyBoard && <img src={scene.mat.companyBoard} alt="" draggable={false} />}
              <div><b>NO COMPANY IN PLAY</b><p>Your Startup stays in your hand until you play it. Each Company receives its own tracker here.</p></div>
            </div>
          ) : (
            <div className="pk-mat-company-grid" style={companyStyle}>
              {companies.map((company) => <CompanyTableau key={company.id} scene={scene} company={company} onInspect={onInspect} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
