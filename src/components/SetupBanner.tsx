// Shown when Supabase env vars are missing. The app stays usable to look at,
// but saving is disabled until the connection is wired up.
export default function SetupBanner() {
  return (
    <div className="banner" role="status">
      <div className="banner__title">Connect your Supabase project to start saving</div>
      <ol className="banner__steps">
        <li>
          Copy <code>.env.example</code> to <code>.env</code>.
        </li>
        <li>
          Fill in <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> from your
          project's <strong>Settings → API</strong>.
        </li>
        <li>
          Run the SQL in <code>supabase/schema.sql</code> from the Supabase SQL editor to create the{" "}
          <code>species</code> table.
        </li>
        <li>Restart the dev server.</li>
      </ol>
    </div>
  );
}
