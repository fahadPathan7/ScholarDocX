import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { api, RecordMap } from "../lib/api";
import { avatarImageSrc, getAvatarById } from "../data/avatars";

export function SplashScreen({ message }: { message: string }) {
  const [profile, setProfile] = useState<RecordMap | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    api.get<RecordMap[]>("/local_profiles").then((rows) => {
      if (rows[0]) {
        setProfile(rows[0]);
        setTimeout(() => setShowProfile(true), 300);
      }
    });
  }, []);

  const avatar = profile?.avatar ? getAvatarById(profile.avatar) : null;
  const initials = profile?.display_name
    ? profile.display_name.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "SD";

  return (
    <div className="splash-screen">
      <div className="splash-content">
        <div className="splash-brand">
          <div className="splash-icon">
            {avatar ? (
              <img
                className="splash-icon-avatar"
                src={avatarImageSrc(avatar)}
                alt={avatar.label}
              />
            ) : (
              <div className="splash-icon-initials">{initials}</div>
            )}
            <Sparkles size={20} className="splash-sparkle" />
          </div>
          <h1>ScholarDock</h1>
          <p className="splash-tagline">Application planning workspace</p>
        </div>

        {profile?.display_name && showProfile && (
          <div className="splash-profile">
            <p className="splash-welcome">
              Welcome back, <strong>{profile.display_name}</strong>
            </p>
          </div>
        )}

        <div className="splash-loader">
          <div className="splash-loader-bar" />
        </div>
        <p className="splash-message">{message}</p>
      </div>
    </div>
  );
}
