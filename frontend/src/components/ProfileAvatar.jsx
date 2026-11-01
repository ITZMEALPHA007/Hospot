import React, { useEffect, useState } from "react";
import { API } from "../lib/authClient";

export function profilePictureSource(user) {
  const path = user?.profilePictureUrl;
  return typeof path === "string" && path.startsWith("/auth/me/profile-picture") ? `${API}${path}` : null;
}

export default function ProfileAvatar({ user, name, className, alt = "" }) {
  const displayName = name || user?.name || "";
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  const initials = (words.length > 1 ? `${words[0][0]}${words[words.length - 1][0]}` : words[0]?.slice(0, 2) || "H").toUpperCase();
  const source = profilePictureSource(user);
  const [failedSource, setFailedSource] = useState(null);
  useEffect(() => setFailedSource(null), [source]);
  return <div className={className} aria-hidden={alt ? undefined : "true"}>
    {source && failedSource !== source ? <img src={source} alt={alt} className="profile-avatar-image" onError={() => setFailedSource(source)} /> : initials}
  </div>;
}
