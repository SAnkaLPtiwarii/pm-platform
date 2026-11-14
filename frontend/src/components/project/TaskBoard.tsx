import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { Link } from 'react-router-dom'
import { STATUSES, STATUS_LABEL, formatDate } from '../../lib/format'
import type { Task, TaskStatus } from '../../lib/types'
import { PriorityBadge } from '../ui'

function TaskCard({ task, pending }: { task: Task; pending: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    disabled: !task.permissions.update,
  })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${
        task.permissions.update ? 'cursor-grab touch-none' : ''
      } ${isDragging ? 'relative z-10 shadow-lg ring-2 ring-indigo-300' : ''} ${pending ? 'opacity-50' : ''}`}
    >
      <Link to={`/tasks/${task.id}`} className="font-medium text-slate-900 hover:text-indigo-600">
        {task.title}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <PriorityBadge priority={task.priority} />
        <span>{task.assignee?.name ?? 'Unassigned'}</span>
        {task.due_date && <span>Due {formatDate(task.due_date)}</span>}
      </div>
    </div>
  )
}

function Column({ status, tasks, pendingId }: { status: TaskStatus; tasks: Task[]; pendingId: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <section
      ref={setNodeRef}
      aria-label={STATUS_LABEL[status]}
      className={`flex min-h-48 flex-col gap-2 rounded-xl border p-3 ${
        isOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-100'
      }`}
    >
      <h3 className="flex items-center justify-between text-sm font-semibold text-slate-700">
        {STATUS_LABEL[status]}
        <span className="rounded-full bg-white px-2 text-xs">{tasks.length}</span>
      </h3>
      {tasks.length === 0 && <p className="py-6 text-center text-xs text-slate-400">Drop tasks here</p>}
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} pending={task.id === pendingId} />
      ))}
    </section>
  )
}

export default function TaskBoard({
  tasks,
  onMove,
  pendingId,
}: {
  tasks: Task[]
  onMove: (task: Task, status: TaskStatus) => void
  pendingId: string | null
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function handleDragEnd(event: DragEndEvent) {
    const target = event.over?.id
    const task = tasks.find((item) => item.id === event.active.id)
    if (!task || typeof target !== 'string') return
    if (STATUSES.includes(target as TaskStatus) && target !== task.status) onMove(task, target as TaskStatus)
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid gap-4 md:grid-cols-3">
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={tasks.filter((task) => task.status === status)}
            pendingId={pendingId}
          />
        ))}
      </div>
    </DndContext>
  )
}