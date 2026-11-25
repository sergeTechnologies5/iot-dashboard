"use client";

import { Modal } from '@/components/overlays';
import { API_URL } from '@/lib/api';
import type { Billiard } from '@/lib/types';

/** Customer portal QR for one table: big, printable and downloadable (backend renders the SVG). */
export function qrSrc(ref: string) {
  return `${API_URL}/api/v1/public/tables/${encodeURIComponent(ref)}/qr.svg`;
}

export function TableQrModal({ b, onClose }: { b: Billiard; onClose: () => void }) {
  const ref = b.accountRef;
  const src = ref ? qrSrc(ref) : '';

  const print = () => {
    const w = window.open('', '_blank', 'width=600,height=800');
    if (!w) return;
    const abs = new URL(src, window.location.href).href;
    w.document.write(`<!doctype html><html><head><title>${b.name} QR</title><style>
      body{font-family:system-ui,sans-serif;text-align:center;margin:40px}
      img{width:80vmin;max-width:520px;image-rendering:pixelated}
      h1{margin:0 0 4px;font-size:32px} p{margin:6px 0;color:#333;font-size:18px}
      .acc{font-family:monospace;font-size:22px;letter-spacing:2px}
    </style></head><body>
      <h1>${b.name}</h1><p>Scan to pay &amp; play</p>
      <img src="${abs}" onload="setTimeout(()=>{window.print()},150)"/>
      <p>Or pay via M-Pesa · Account <span class="acc">${ref}</span></p>
    </body></html>`);
    w.document.close();
  };

  return (
    <Modal
      title={`${b.name} · Pay QR`}
      onClose={onClose}
      footer={
        ref ? (
          <>
            <a id="qr-download" className="btn btn-ghost" href={src} download={`${b.name.replace(/\s+/g, '-')}-qr.svg`}>Download</a>
            <button id="qr-print" className="btn btn-brass" onClick={print}>Print</button>
          </>
        ) : undefined
      }
    >
      {ref ? (
        <div className="qr-modal">
          <div className="qr-frame">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`QR code to pay for ${b.name}`} />
          </div>
          <p className="muted" style={{ margin: '12px 0 4px' }}>Customers scan this to pick games, pay with M-Pesa and release the balls.</p>
          <div className="faint mono" style={{ fontSize: 12 }}>Account {ref}</div>
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 0 }}>Set an account reference for this table in its payment settings to get a QR code.</p>
      )}
    </Modal>
  );
}
