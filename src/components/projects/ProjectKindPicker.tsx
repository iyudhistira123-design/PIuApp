import { Globe2, Smartphone, Box, Check } from "lucide-react";
import { projectKinds, type ProjectKind } from "../../lib/project-kinds";
import "./project-kind.css";
export default function ProjectKindPicker({
  value,
  onChange,
  compact = false,
}: {
  value: ProjectKind;
  onChange: (value: ProjectKind) => void;
  compact?: boolean;
}) {
  const icons = [Globe2, Smartphone, Box];
  const hints = {
    webapp: "Website & aplikasi web",
    mobile: "Android & iOS · Expo",
    roblox: "Game, script & dunia 3D",
  };
  return (
    <fieldset className={`project-kind-picker${compact ? " is-compact" : ""}`}>
      <legend className={compact ? "sr-only" : ""}>Jenis project</legend>
      <div className="project-kind-options">
        {projectKinds.map((kind, i) => {
          const Icon = icons[i];
          return (
            <label
              key={kind.id}
              className={value === kind.id ? "selected" : ""}
            >
              <input
                type="radio"
                name="project-kind"
                value={kind.id}
                checked={value === kind.id}
                onChange={() => onChange(kind.id)}
              />
              <Icon size={compact ? 16 : 20} aria-hidden="true" />
              <span>
                <strong>{kind.name}</strong>
                {!compact && <small>{kind.detail}</small>}
              </span>
              {!compact && (
                <Check
                  className="project-kind-check"
                  size={14}
                  aria-hidden="true"
                />
              )}
            </label>
          );
        })}
      </div>
      {compact && (
        <span className="project-kind-hint" aria-live="polite">
          {hints[value]}
        </span>
      )}
    </fieldset>
  );
}
