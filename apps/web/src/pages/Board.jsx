/**
 * Board page — displays the live status board in an iframe.
 * Route: /board/:token
 * This page requires NO authentication — it's designed to be
 * opened on a front desk monitor or TV.
 */
import { useParams } from 'react-router-dom';
import { useEffect } from 'react';

export default function Board() {
  const { token } = useParams();

  // Full-screen iframe to the HTML board endpoint
  const src = `/api/status/${token}/board`;

  useEffect(() => {
    document.title = 'Live Status Board — Clearpath';
  }, []);

  return (
    <iframe
      src={src}
      title="Live Status Board"
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100vw',
        height: '100vh',
        border: 'none',
        background: '#f8f7ff',
      }}
    />
  );
}
