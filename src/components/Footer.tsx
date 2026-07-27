export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-xs text-faint">
          admin@nymbx.dev · NYMBX Toolbox · {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  )
}
