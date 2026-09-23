import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/constants";
import { logout } from "@/app/actions";

const NAV_ITEMS = [
  { href: "/", label: "ダッシュボード" },
  { href: "/students", label: "生徒名簿" },
  { href: "/clubs", label: "部活動" },
];

const ADMIN_NAV_ITEMS = [
  { href: "/classes", label: "クラス管理" },
  { href: "/admin/teachers", label: "教員アカウント" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen flex-1 flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-gray-200 bg-white md:w-56 md:border-b-0 md:border-r">
        <div className="border-b border-gray-200 px-4 py-5">
          <p className="text-sm font-bold text-gray-900">
            生徒情報管理システム
          </p>
          <p className="mt-3 text-sm font-medium text-gray-900">
            {session.name}
          </p>
          <p className="text-xs text-gray-500">
            {ROLE_LABEL[session.role]} ・ {session.email}
          </p>
          <form action={logout} className="mt-2">
            <button
              type="submit"
              className="text-xs font-medium text-gray-500 underline hover:text-gray-900"
            >
              ログアウト
            </button>
          </form>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-2 py-3">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
            >
              {item.label}
            </Link>
          ))}
          {session.role === "ADMIN" && (
            <>
              <p className="mt-4 px-3 text-xs font-semibold text-gray-400">
                管理者メニュー
              </p>
              {ADMIN_NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  {item.label}
                </Link>
              ))}
            </>
          )}
        </nav>
      </aside>
      <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
