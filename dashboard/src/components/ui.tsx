import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { revealControls } from '../lib/format';
import { href, type Page } from '../lib/router';
import { Icon, type IconName } from './Icon';

/** A repository-relative path that opens its module card. */
/** Text that may wrap only after "/" (paths, rule ids), never inside a name. */
export function Breakable({ text }: { text: string }) {
  const parts = revealControls(text).split('/');
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part}
          {index < parts.length - 1 && (
            <>
              /<wbr />
            </>
          )}
        </Fragment>
      ))}
    </>
  );
}

/** A path set like a call number: the folder recedes, the file name reads first. */
export function PathText({ id: raw }: { id: string }) {
  const id = revealControls(raw);
  const slash = id.lastIndexOf('/');
  if (slash === -1) return <span className="path-file">{id}</span>;
  return (
    <>
      <span className="path-dir">
        <Breakable text={id.slice(0, slash + 1)} />
      </span>
      <span className="path-file">{id.slice(slash + 1)}</span>
    </>
  );
}

/** A repository-relative path that opens its module card. */
export function ModuleLink({ id, label }: { id: string; label?: string }) {
  return (
    <a className="path-link" href={href('modules', { file: id })}>
      {label ?? <PathText id={id} />}
    </a>
  );
}

/**
 * The detail column of a list page. When it opens it takes focus (and, when
 * it is stacked below the list on narrow screens, scrolls into view); Close
 * returns focus to the list entry that opened it.
 */
export function DetailPane({
  label,
  closeTo,
  returnHref,
  children,
}: {
  label: string;
  /** Hash to go to on Close (no Close button when absent). */
  closeTo?: string;
  /** The href of the list entry that opened this pane. */
  returnHref: string;
  children: ReactNode;
}) {
  const pane = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = pane.current;
    if (!element) return;
    const stacked =
      typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1080px)').matches;
    const heading = element.querySelector<HTMLElement>('h2');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: !stacked });
    }
    if (stacked) element.scrollIntoView({ block: 'start' });
  }, [returnHref]);
  const close = () => {
    if (closeTo === undefined) return;
    window.location.hash = closeTo;
    requestAnimationFrame(() => {
      for (const link of document.querySelectorAll<HTMLAnchorElement>('main a[href]')) {
        if (link.getAttribute('href') === returnHref) {
          link.focus();
          break;
        }
      }
    });
  };
  return (
    <aside ref={pane} className="split-detail" aria-label={label}>
      {closeTo !== undefined && (
        <button type="button" className="button ghost small close-detail" onClick={close}>
          <Icon name="close" /> Close
        </button>
      )}
      {children}
    </aside>
  );
}

export function PageLink({
  page,
  params,
  children,
}: {
  page: Page;
  params?: Record<string, string | number | null | undefined>;
  children: ReactNode;
}) {
  return <a href={href(page, params)}>{children}</a>;
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => {
      setState('idle');
    }, 1600);
  };
  return (
    <button
      type="button"
      className="button ghost small"
      onClick={() => void copy()}
      title={`${label}: ${value}`}
    >
      <Icon name={state === 'copied' ? 'check' : 'copy'} />
      <span aria-live="polite">
        {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}
      </span>
    </button>
  );
}

export function SeverityBadge({ severity }: { severity: 'error' | 'warning' | 'note' | 'off' }) {
  const icon: IconName =
    severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'info';
  return (
    <span className={`badge severity-${severity}`}>
      <Icon name={icon} size={14} />
      {severity}
    </span>
  );
}

export function BaselineBadge({ status }: { status: 'new' | 'existing' | 'resolved' }) {
  return (
    <span className={`badge baseline-${status}`}>
      {status === 'existing' ? 'accepted' : status}
    </span>
  );
}

export function EmptyState({
  title,
  children,
  icon = 'info',
}: {
  title: string;
  children?: ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="empty-state" role="status">
      <Icon name={icon} size={22} />
      <div>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

/** A red-ruled catalog card: the signature container for one selected thing. */
export function CatalogCard({
  title,
  meta,
  actions,
  children,
  label,
}: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  label: string;
}) {
  return (
    <article className="catalog-card" aria-label={label}>
      <header className="catalog-card-head">
        <h2 className="catalog-call">{title}</h2>
        {meta && <div className="catalog-meta">{meta}</div>}
        {actions && <div className="catalog-actions">{actions}</div>}
      </header>
      {children}
    </article>
  );
}

export function CardSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="card-section">
      <h3>
        {title}
        {count !== undefined && <span className="count">{count.toLocaleString('en-US')}</span>}
      </h3>
      {children}
    </section>
  );
}

/** A dependency path: each step imports the next. */
export function PathChain({ ids, closed = false }: { ids: string[]; closed?: boolean }) {
  return (
    <ol className="path-chain">
      {ids.map((id, index) => (
        <li key={`${String(index)}:${id}`}>
          {index > 0 && <span className="chain-step">imports</span>}
          <ModuleLink id={id} />
          {closed && index === ids.length - 1 && index > 0 && (
            <span className="chain-step">(back to the start)</span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total <= pageSize) return null;
  const last = Math.ceil(total / pageSize) - 1;
  const start = page * pageSize;
  return (
    <nav className="pager" aria-label="Pages">
      <button
        type="button"
        className="button small"
        disabled={page === 0}
        onClick={() => {
          onPage(page - 1);
        }}
      >
        <Icon name="arrowLeft" /> Previous
      </button>
      <span>
        {(start + 1).toLocaleString('en-US')}–
        {Math.min(start + pageSize, total).toLocaleString('en-US')} of{' '}
        {total.toLocaleString('en-US')}
      </span>
      <button
        type="button"
        className="button small"
        disabled={page >= last}
        onClick={() => {
          onPage(page + 1);
        }}
      >
        Next <Icon name="arrowRight" />
      </button>
    </nav>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'error';
  children: ReactNode;
}) {
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={tone === 'info' ? 'info' : tone} />
      <div>{children}</div>
    </div>
  );
}

/** Horizontal bars with the exact value printed beside each one. */
export function BarList({
  rows,
  label,
}: {
  label: string;
  rows: { key: string; label: ReactNode; value: number; color?: string; title?: string }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <table className="bar-list">
      <caption className="visually-hidden">{label}</caption>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} title={row.title}>
            <th scope="row">{row.label}</th>
            <td className="bar-cell">
              <span
                className="bar"
                style={{
                  width: `${String((row.value / max) * 100)}%`,
                  ...(row.color && { background: row.color }),
                }}
              />
            </td>
            <td className="bar-value">{row.value.toLocaleString('en-US')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} style={{ width: `${String(90 - index * 17)}%` }} />
      ))}
    </div>
  );
}
