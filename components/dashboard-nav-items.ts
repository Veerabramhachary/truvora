import {
  BookOpen,
  ChartNoAxesColumn,
  HandCoins,
  History,
  HomeIcon,
  Settings2,
} from "lucide-react"

export const dashboardNavItems = [
  {
    title: "Dashboard",
    mobileTitle: "Home",
    url: "/dashboard",
    icon: HomeIcon,
  },
  {
    title: "Expenses",
    mobileTitle: "Expenses",
    url: "/expenses",
    icon: HandCoins,
  },
  {
    title: "Subscriptions",
    mobileTitle: "Subs",
    url: "/subscriptions",
    icon: BookOpen,
  },
  {
    title: "Reports & Insights",
    mobileTitle: "Reports",
    url: "/reports",
    icon: ChartNoAxesColumn,
  },
  {
    title: "Transactions",
    mobileTitle: "History",
    url: "/transactions",
    icon: History,
  },
  {
    title: "Settings",
    mobileTitle: "Settings",
    url: "/settings",
    icon: Settings2,
  },
]
