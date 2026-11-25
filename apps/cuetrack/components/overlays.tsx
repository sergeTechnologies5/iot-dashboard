"use client";

import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useStore } from '@/context/Store';
import { timeAgo } from '@/lib/format';
import type { Activity } from '@/lib/types';
import { Icon, IconName } from './Icon';

/* ---------------- Activity feed ---------------- */
const KIND: Record<Activity['kind'], [IconName, string, string]> = {
  PAYMENT: ['wallet', 'var(--felt-dim)', 'var(--felt-2)'],
  TOKEN: ['coins', 'var(--brass-dim)', 'var(--brass-2)'],
  GAME_START: ['play', 'var(--felt-dim)', 'var(--felt-2)'],
  GAME_END: ['stop', 'var(--surface-3)', 'var(--text-2)'],
  LOCK: ['lock', 'var(--amber-dim)', 'var(--amber)'],
  UNLOCK: ['unlock', 'var(--surface-3)', 'var(--text-2)'],
  OFFLINE: ['wifiOff', 'var(--danger-dim)', 'var(--danger)'],
  ONLINE: ['wifi', 'var(--felt-dim)', 'var(--felt-2)'],
};

export function ActivityFeed({ items, limit = 12, title = 'Live activity' }: { items: Activity[]; limit?: number; title?: string }) {
  const { now, liveEnabled } = useStore();
  return (
    <div className="card" style={{ alignSelf: 'start' }}>
      <div className="card-head">
        <div>
          <h3>{title}</h3>
          <div className="sub">Device and payment events</div>
        </div>
        <span className={`pill ${liveEnabled ? 'pill-felt pulse' : 'pill-grey'}`}>
          <span className="dot" /> {liveEnabled ? 'Live' : 'Paused'}
        </span>
      </div>
      <div className="feed">
        {items.length === 0 && <div className="empty">No activity yet</div>}
        {items.slice(0, limit).map((a) => {
          const [icon, bg, fg] = a.mode === 'MANUAL' ? (['cash', 'var(--brass-dim)', 'var(--brass-2)'] as const) : KIND[a.kind];
          return (
            <Link key={a.id} href={`/billiards/${a.billiardId}`} className="feed-item">
              <span className="feed-icon" style={{ background: bg, color: fg }}>
                <Icon name={icon} size={15} />
              </span>
              <div style={{ minWidth: 0 }}>
                <b>{a.title}</b>
                <div className="d">{a.detail}</div>
              </div>
              <span className="t">{timeAgo(a.at, now)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Toasts ---------------- */
export function Toasts() {
  const { toasts, dismissToast } = useStore();
  const tone: Record<string, [IconName, string, string]> = {
    success: ['check', 'var(--felt-dim)', 'var(--felt-2)'],
    info: ['bolt', 'var(--brass-dim)', 'var(--brass-2)'],
    danger: ['x', 'var(--danger-dim)', 'var(--danger)'],
  };
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => {
        const [icon, bg, fg] = tone[t.tone];
        return (
          <div key={t.id} className="toast" onClick={() => dismissToast(t.id)}>
            <span className="ti" style={{ background: bg, color: fg }}>
              <Icon name={icon} size={15} />
            </span>
            <div>
              <b>{t.title}</b>
              {t.detail && <span>{t.detail}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Drawer & Modal ---------------- */
function useEsc(onClose: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
}

/** Renders overlays at <body> level: ancestors with transform/containment (e.g. billiard cards) would otherwise trap position:fixed. */
function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

export function Drawer({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEsc(onClose);
  return (
    <Portal>
      <div className="overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal>
        <div className="panel-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="panel-body">{children}</div>
        {footer && <div className="panel-foot">{footer}</div>}
      </aside>
    </Portal>
  );
}

export function Modal({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEsc(onClose);
  return (
    <Portal>
      <div className="overlay" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal>
        <div className="panel-head">
          <h3>{title}</h3>
          <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="panel-body">{children}</div>
        {footer && <div className="panel-foot">{footer}</div>}
      </div>
    </Portal>
  );
}

export function Confirm({
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            id="confirm-action"
            className={`btn ${danger ? 'btn-danger' : 'btn-brass'}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="muted" style={{ lineHeight: 1.6 }}>{body}</div>
    </Modal>
  );
}
