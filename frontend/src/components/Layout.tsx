import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `-mb-px border-b-2 px-0.5 py-3 text-sm font-medium transition-colors duration-200 motion-reduce:transition-none ${
    isActive ? 'border-indigo-700 text-slate-900' : 'border-transparent text-slate-500'
  }`

export default function Layout() {
  const { user, logout } = useAuth()
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 pt-2">
          <div className="flex items-center justify-between gap-3">
            <span className="font-serif text-lg font-semibold tracking-tight">PM Platform</span>
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-slate-500 sm:inline">{user?.name}</span>
              <button
                type="button"
                onClick={() => void logout()}
                className="min-h-10 px-1 font-medium text-slate-700 underline underline-offset-4"
              >
                Log out
              </button>
            </div>
          </div>
          <nav className="flex gap-6" aria-label="Main">
            <NavLink to="/" end className={linkClass}>
              Dashboard
            </NavLink>
            <NavLink to="/projects" className={linkClass}>
              Projects
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
