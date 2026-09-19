import { NavLink, Outlet } from "react-router";
import { useCapabilities } from "@/auth/access-control";
import { PERMISSION } from "@/auth/permissions";
import "./ai-content.css";

/** Shared, permission-aware navigation for the editorial workspace. */
export function AiWorkspace() {
  const { can } = useCapabilities();
  const links = [
    ["/ai-content", "Overview"], ["/ai-content/topics", "Topics"],
    ["/ai-content/fact-review", "Fact review"], ["/ai-content/schedule", "Schedule"],
    ...(can(PERMISSION.aiContentConfigure) ? [
      ["/ai-content/sources", "Sources"], ["/ai-content/pricing", "Pricing & budget"],
      ["/ai-content/settings", "Settings"],
    ] : []),
  ];
  return <div className="as-ai-workspace">
    <nav className="as-ai-nav" aria-label="AI content sections">
      {links.map(([to, label]) => <NavLink key={to} to={to} end={to === "/ai-content"}>{label}</NavLink>)}
    </nav>
    <Outlet />
  </div>;
}
