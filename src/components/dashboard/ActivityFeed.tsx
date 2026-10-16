import { useMemo } from "react";
import { Link } from "react-router-dom";
import { History, Sparkles } from "lucide-react";
import { activityWhen, buildActivity } from "../../lib/dashboard/activity";
import type { Project } from "../../lib/types";

/**
 * The last handful of things that happened, across every project: "tadi aku
 * ngerjain apa ya?" answered without opening each project.
 *
 * It reads the version history (labels + timestamps) and creation times, and
 * says so — chat messages are not timestamped in this app, so they are not used
 * to pretend the feed is a conversation log.
 */
export default function ActivityFeed({ projects }: { projects: Project[] }) {
  const items = useMemo(() => buildActivity(projects, 8), [projects]);
  if (!items.length) return null;
  return (
    <section className="dashboard-activity" aria-label="Aktivitas terbaru">
      <header>
        <h2>
          <History size={13} /> Aktivitas terbaru
        </h2>
        <span className="activity-note">
          Dari riwayat project — pesan chat belum punya stempel waktu.
        </span>
      </header>
      <ol>
        {items.map((item) => (
          <li key={item.id}>
            <Link to={`/project/${item.projectId}`}>
              <span className="activity-when">{activityWhen(item.at)}</span>
              <b>{item.label}</b>
              <span className="activity-project">
                {item.kind === "created" ? (
                  <Sparkles size={10} />
                ) : (
                  <History size={10} />
                )}{" "}
                {item.projectName}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
