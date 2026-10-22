import { useEffect, useState } from "react";
import { CalendarPlus, Copy, Download, ExternalLink, Link2, Unplug } from "lucide-react";
import { Modal } from "./Modal";
import { useAccount } from "./accounts/AccountContext";
import { useProfiles } from "./ProfileContext";
import { addDays } from "./model";
import { download } from "./storage";
import { newCalendarToken, profileCalendar, renderCalendar, subscriptionURL } from "./calendar";

export function CalendarConnect({ start, onClose }: { start: string; onClose: () => void }) {
  const account = useAccount();
  const profiles = useProfiles();
  const [scope, setScope] = useState("week");
  const [loading, setLoading] = useState(!!account.user);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const profile = profiles.active;
  const canConnect = !!account.user && !!account.client;
  const synced = profiles.syncStatus === "saved";
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  useEffect(() => {
    if (!account.user || !account.client) return;
    const abort = new AbortController();
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const result = await account.client!.rpc("calendar_subscription_status", { p_profile_id: profile.id }).abortSignal(abort.signal).maybeSingle();
        if (abort.signal.aborted) return;
        if (result.error) throw result.error;
        setEnabled((result.data as { enabled?: boolean } | null)?.enabled === true);
      } catch {
        if (!abort.signal.aborted) setError("Could not check your calendar connection. Connect to the internet and try again.");
      } finally { if (!abort.signal.aborted) setLoading(false); }
    })();
    return () => abort.abort();
  }, [account.client, account.user?.id, profile.id, retry]);
  const document = profileCalendar(profile, scope === "week" ? start : undefined, scope === "week" ? addDays(start, 7) : undefined);
  const filename = `crux-${scope === "week" ? start : "planned-workouts"}.ics`;
  const calendarFile = () => new File([renderCalendar(document)], filename, { type: "text/calendar;charset=utf-8" });
  const createLink = async () => {
    if (!online || !synced || !account.client) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const token = newCalendarToken();
      const url = subscriptionURL(import.meta.env.VITE_SUPABASE_URL, token);
      const result = await account.client.rpc("enable_calendar_subscription", { p_profile_id: profile.id, p_token: token });
      if (result.error) throw result.error;
      setLink(url); setEnabled(true);
      setMessage("Your private link is ready. Add it to Apple Calendar below. Keep the link private.");
    } catch { setError("Could not create the link. Make sure this profile is saved online, then try again."); }
    finally { setBusy(false); }
  };
  return <Modal title="Connect Apple Calendar" onClose={onClose}>
    <div className="form-stack calendar-connection">
      <div className="calendar-intro"><CalendarPlus size={27} /><div><strong>{profile.name}</strong><p className="muted small">Your planned workouts, alongside the rest of your day.</p></div></div>
      <section className="calendar-option form-stack">
        <h3>Keep your calendar up to date</h3>
        <p className="muted small">A read-only subscription for this profile. Add, move and edit workouts in Crux; Apple Calendar picks up changes after they save online and it refreshes. Updates may take time.</p>
        <p className="muted small">Workouts appear as all-day events with their location and exercise sets, reps and rest. Only planned sessions are included; completing or removing a plan removes it from this calendar. Training history stays in Crux.</p>
        {!canConnect ? <p className="calendar-note">Sign in to use an updating calendar. You can download a calendar file below without an account.</p> : <>
          {loading ? <p role="status">Checking connection…</p> : <>
            <span className="calendar-status"><span className={enabled ? "connection-dot active" : "connection-dot"} />{enabled ? "Private link enabled" : "Not connected"}</span>
            {!enabled && <p className="small">Creating a link lets anyone who has it read this profile’s planned dates, workout names, locations and exercise details. Recovery check-ins, notes, projects and account details are excluded. You can disable the link here.</p>}
            {enabled && !link && <p className="muted small">The secret link is shown only when created. To connect another device, replace it and subscribe again on your devices. Your existing link keeps working until then.</p>}
            {link && <>
              <a className="button calendar-subscribe" href={link.replace(/^https:/, "webcal:")} referrerPolicy="no-referrer"><ExternalLink size={16} />Add to Apple Calendar</a>
              <label>Private subscription link<input readOnly value={link} onFocus={(e) => e.currentTarget.select()} /></label>
              <button className="button secondary" onClick={async () => {
                try { await navigator.clipboard.writeText(link); setMessage("Calendar link copied."); }
                catch { setMessage("Select and copy the private link above."); }
              }}><Copy size={15} />Copy subscription link</button>
              <p className="muted small">On iPhone: open Calendar → Calendars → Add Calendar → Add Subscription Calendar, paste the link, then tap Find. Choose iCloud if you want the subscription on your other Apple devices.</p>
            </>}
            {!link && <button className="button" disabled={busy || !online || !synced || !!error} onClick={() => void createLink()}><Link2 size={16} />{busy ? "Creating link…" : enabled ? "Replace link (old link stops working)" : "Create private calendar link"}</button>}
            {enabled && <button className="text-button danger align-start" disabled={busy || !online} onClick={async () => {
              setBusy(true); setError("");
              try {
                const result = await account.client!.rpc("disable_calendar_subscription", { p_profile_id: profile.id });
                if (result.error) throw result.error;
                setEnabled(false); setLink(""); setMessage("Link disabled. Also unsubscribe in Apple Calendar to remove its saved copy.");
              } catch { setError("Could not disable the link. Reconnect and try again."); }
              finally { setBusy(false); }
            }}><Unplug size={15} />Disable calendar link</button>}
          </>}
          {!online && <p className="calendar-note">You’re offline. Downloads still work; reconnect to manage the subscription.</p>}
          {online && !synced && <p className="calendar-note">Wait for “Saved online” before creating a link. Resolve any sync conflict in Account first.</p>}
        </>}
        {error && <div role="alert" className="warning">{error}<button className="text-button" disabled={busy || !online} onClick={() => setRetry((n) => n + 1)}>Try again</button></div>}
        {message && <p role="status" className="calendar-note">{message}</p>}
      </section>
      <section className="calendar-option form-stack">
        <h3>Download a calendar file</h3>
        <p className="muted small">A one-time copy. Later Crux changes won’t update imported events. Use the subscription above for an ongoing connection; repeated imports can create duplicates.</p>
        <label>Include<select value={scope} onChange={(e) => setScope(e.target.value)}><option value="week">Displayed week</option><option value="all">All planned workouts in this profile</option></select></label>
        <p className="small muted">{document.events.length} planned workout{document.events.length === 1 ? "" : "s"}</p>
        <button className="button secondary" disabled={!document.events.length} onClick={() => {
          download(renderCalendar(document), filename, "text/calendar;charset=utf-8");
          setMessage("Calendar file downloaded. Import it into your calendar to add this copy.");
        }}><Download size={16} />Download .ics</button>
        {typeof navigator.canShare === "function" && navigator.canShare({ files: [calendarFile()] }) && <button className="text-button" disabled={!document.events.length} onClick={async () => {
          try { await navigator.share({ files: [calendarFile()], title: "Crux workouts" }); }
          catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setMessage("Sharing unavailable. Use Download .ics instead."); }
        }}>Share calendar file</button>}
      </section>
    </div>
  </Modal>;
}
