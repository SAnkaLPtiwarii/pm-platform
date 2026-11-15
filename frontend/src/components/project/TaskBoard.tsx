import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { STATUSES, STATUS_LABEL, formatDate } from '../../lib/format'
import type { Task, TaskStatus } from '../../lib/types'
import { useMediaQuery } from '../../lib/useMediaQuery'
import { Button, PriorityBadge, Segmented } from '../ui'

interface BoardProps {
  tasks: Task[]
  onMove: (task: Task, status: TaskStatus) => void
  pendingId: string | null
}

function TaskMeta({ task }: { task: Task }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
      <PriorityBadge priority={task.priority} />
      <span>{task.assignee?.name ?? 'Unassigned'}</span>
      {task.due_date && <span>Due {formatDate(task.due_date)}</span>}
    </div>
  )
}

const TITLE_LINK = 'break-words font-medium text-slate-900 underline-offset-2 hover:underline'

// ---------------------------------------------------------------- desktop: drag and drop

function DraggableCard({ task, pending }: { task: Task; pending: boolean }) {
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
      className={`border bg-white p-3 ${task.permissions.update ? 'cursor-grab' : ''} ${
        isDragging ? 'relative z-10 border-indigo-700 shadow-md' : 'border-slate-200'
      } ${pending ? 'opacity-50' : ''}`}
    >
      <Link to={`/tasks/${task.id}`} className={TITLE_LINK}>
        {task.title}
      </Link>
      <TaskMeta task={task} />
    </div>
  )
}

function Column({ status, tasks, pendingId }: { status: TaskStatus; tasks: Task[]; pendingId: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <section
      ref={setNodeRef}
      aria-label={STATUS_LABEL[status]}
      className={`flex min-h-48 flex-col gap-2 border p-3 ${
        isOver ? 'border-indigo-700 bg-indigo-50' : 'border-slate-200 bg-slate-100'
      }`}
    >
      <h3 className="flex items-center justify-between text-sm font-semibold text-slate-800">
        {STATUS_LABEL[status]}
        <span className="text-xs font-normal text-slate-500">{tasks.length}</span>
      </h3>
      {tasks.length === 0 && <p className="py-6 text-center text-xs text-slate-400">Drop tasks here</p>}
      {tasks.map((task) => (
        <DraggableCard key={task.id} task={task} pending={task.id === pendingId} />
      ))}
    </section>
  )
}

function DesktopBoard({ tasks, onMove, pendingId }: BoardProps) {
  // Mouse drags start after a small movement; touch drags start after a short press,
  // so a finger can still scroll the page. The keyboard works too (Space, arrows, Space).
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

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

// ---------------------------------------------------------------- mobile: tabs and buttons

function MobileBoard({ tasks, onMove, pendingId }: BoardProps) {
  const [active, setActive] = useState<TaskStatus>('todo')
  const [tabDirection, setTabDirection] = useState<'forward' | 'backward'>('forward')
  const visible = tasks.filter((task) => task.status === active)

  function changeTab(nextTab: TaskStatus) {
    const currentIndex = STATUSES.indexOf(active)
    const nextIndex = STATUSES.indexOf(nextTab)
    if (currentIndex !== nextIndex) setTabDirection(nextIndex > currentIndex ? 'forward' : 'backward')
    setActive(nextTab)
  }

  return (
    <div className="space-y-3">
      <Segmented
        label="Board column"
        value={active}
        onChange={changeTab}
        options={STATUSES.map((status) => ({
          value: status,
          label: `${STATUS_LABEL[status]} (${tasks.filter((task) => task.status === status).length})`,
        }))}
      />

      <div key={active} className={`tab-transition-${tabDirection}`}>
        {visible.length === 0 && (
          <p className="border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
            No tasks in {STATUS_LABEL[active]}
          </p>
        )}

        <ul className="space-y-2">
          {visible.map((task) => {
            const index = STATUSES.indexOf(task.status)
            const previous = STATUSES[index - 1]
            const next = STATUSES[index + 1]
            const locked = !task.permissions.update || task.id === pendingId
            return (
              <li
                key={task.id}
                className={`border border-slate-200 bg-white p-3 ${task.id === pendingId ? 'opacity-50' : ''}`}
              >
                <Link to={`/tasks/${task.id}`} className={TITLE_LINK}>
                  {task.title}
                </Link>
                <TaskMeta task={task} />
                {task.permissions.update && (
                  <div className="mt-3 flex gap-2">
                    {previous && (
                      <Button variant="secondary" className="flex-1" disabled={locked} onClick={() => onMove(task, previous)}>
                        {'< '}
                        {STATUS_LABEL[previous]}
                      </Button>
                    )}
                    {next && (
                      <Button variant="secondary" className="flex-1" disabled={locked} onClick={() => onMove(task, next)}>
                        {STATUS_LABEL[next]}
                        {' >'}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export default function TaskBoard(props: BoardProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  return isDesktop ? <DesktopBoard {...props} /> : <MobileBoard {...props} />
}
