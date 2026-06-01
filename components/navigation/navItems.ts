import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  CalendarPlus,
  Users,
  UserCog,
  ListTree,
  Clock,
  MessageSquare,
  History,
} from "lucide-react";

/**
 * Single source of truth for app navigation (UI-STRUCTURE §2). The sidebar and
 * bottom nav both derive their items from this list — no hardcoded nav buttons.
 *
 * PREVÁDZKA items show for all roles (with icons). SPRÁVA items are manager-only
 * and render text-only inside the burger dropdown (the `icon` is carried for
 * type consistency but not rendered there).
 */
export interface NavItem {
  href: string;
  label: string; // Slovak
  icon: LucideIcon;
  managerOnly?: boolean; // SPRÁVA items → true
  group: "prevadzka" | "sprava";
}

export const navItems: NavItem[] = [
  // PREVÁDZKA — always shown, with icons
  { href: "/", label: "Kalendár", icon: Calendar, group: "prevadzka" },
  { href: "/orders/new", label: "Nová rezervácia", icon: CalendarPlus, group: "prevadzka" },
  { href: "/clients", label: "Zákazníci", icon: Users, group: "prevadzka" },

  // SPRÁVA — manager-only, text-only in the dropdown
  { href: "/staff", label: "Správa zamestnancov", icon: UserCog, managerOnly: true, group: "sprava" },
  { href: "/services", label: "Katalóg služieb", icon: ListTree, managerOnly: true, group: "sprava" },
  { href: "/settings/hours", label: "Otváracie hodiny", icon: Clock, managerOnly: true, group: "sprava" },
  { href: "/settings/sms-templates", label: "SMS šablóny", icon: MessageSquare, managerOnly: true, group: "sprava" },
  { href: "/audit", label: "Záznam zmien", icon: History, managerOnly: true, group: "sprava" },
];

export const prevadzkaItems = navItems.filter((i) => i.group === "prevadzka");
export const spravaItems = navItems.filter((i) => i.group === "sprava");

/**
 * Active-link test: exact match for the calendar root `/`, prefix match for the
 * rest (so e.g. `/orders/new` stays active under itself but `/` doesn't light up
 * everywhere).
 */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
