import { Link, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import ProjectDetails from './pages/ProjectDetails'
import Projects from './pages/Projects'
import Register from './pages/Register'
import TaskDetails from './pages/TaskDetails'

function NotFound() {
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-slate-500">The page you are looking for does not exist.</p>
      <Link to="/" className="mt-4 inline-block text-indigo-600 hover:underline">
        Back to the dashboard
      </Link>
    </div>
  )
}

export default function App() {
  const location = useLocation()

  return (
    <div key={location.pathname} className="route-transition">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="projects" element={<Projects />} />
            <Route path="projects/:projectId" element={<ProjectDetails />} />
            <Route path="tasks/:taskId" element={<TaskDetails />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  )
}