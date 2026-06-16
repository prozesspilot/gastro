/**
 * NoTenantHint — einheitlicher Hinweis, wenn kein Mandant aktiv ist (A3-Reboot T059).
 *
 * Staff-Sessions haben tenant_id null; die belege-Endpoints brauchen den Header
 * x-pp-tenant-id (sonst 400). Statt eines technischen 400-Fehlers zeigen alle
 * belege-Seiten konsistent diesen Hinweis, bis oben rechts ein Mandant gewählt ist.
 */
export default function NoTenantHint({ what = 'die Belege' }: { what?: string }) {
  return (
    <div className="card empty" style={{ padding: 32, textAlign: 'center' }}>
      <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Kein Mandant gewählt</p>
      <p style={{ color: 'var(--text-muted)', marginTop: 6 }}>
        Bitte oben rechts einen Mandanten wählen, um {what} zu sehen.
      </p>
    </div>
  );
}
