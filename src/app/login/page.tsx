import { login } from "./actions";

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const hasError = searchParams.error === "1";
  const fromRaw = searchParams.from;
  const from = typeof fromRaw === "string" ? fromRaw : "/";

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-bold text-gray-900">
          生徒情報管理システム
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          教職員アカウントでログインしてください
        </p>

        {hasError && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            メールアドレスまたはパスワードが正しくありません。
          </p>
        )}

        <form action={login} className="mt-6 space-y-4">
          <input type="hidden" name="from" value={from} />
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              メールアドレス
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              パスワード
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700"
          >
            ログイン
          </button>
        </form>
      </div>
    </main>
  );
}
