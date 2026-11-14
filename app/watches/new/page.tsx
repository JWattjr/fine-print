import { Topline } from '@/components/topline';
import { WatchForm } from '@/components/watch-form';

export default function NewWatchPage() {
  return <><Topline /><div className="page"><header className="subhead"><div><h1>Start a watch</h1><p>Make the concern observable. Validators freeze one to three checks against an archived baseline.</p></div><span className="tag gray">StudioNet · 61999</span></header><div className="form-layout"><WatchForm /><aside className="form-aside"><h3>First the baseline</h3><p>Code selects the newest successful Wayback capture at or before the watch’s creation time. Its immutable snapshot, normalized digest and compiled criteria are frozen.</p><h3>Then the bounty</h3><p>Review the compiled result, prepare a deposit ticket, and fund it from the sponsor wallet. Code owns every wei amount. An unexpected deposit becomes refundable credit.</p><div className="notice">Production watches use their creation time as the as-of time. Historical replays are labeled in the separate recorded proof.</div></aside></div></div></>;
}
