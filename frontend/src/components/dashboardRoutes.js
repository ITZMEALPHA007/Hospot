export const ROLE_DASHBOARD_SLUGS = {
  PATIENT: "patient",
  DOCTOR: "doctor",
  HOSPITAL_ADMIN: "hospital-admin",
  PLATFORM_ADMIN: "platform-admin",
};

export const dashboardPathForRole = (role) => {
  const slug = ROLE_DASHBOARD_SLUGS[role];
  return slug ? `/dashboard/${slug}/overview` : "/login";
};

export const roleForDashboardSlug = (slug) => {
  const entry = Object.entries(ROLE_DASHBOARD_SLUGS).find(([, value]) => value === slug);
  return entry?.[0] || null;
};
