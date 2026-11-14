import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, errorMessage } from '../../lib/api'
import { describeActivity, formatDateTime } from '../../lib/format'
import { EmptyState, ErrorState, PageSpinner, Pagination } from '../ui'

const PAGE_SIZE = 15

export default function ActivityPanel({ projectId }: { projectId: string }) {
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['activity', projectId, page],
    queryFn: () => api.activity(projectId, { page, page_size: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  if (query.isPending) return <PageSpinner label="Loading activity..." />
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
  if (query.data.items.length === 0) return <EmptyState title="No activity yet" />

  return (
    <div>
      <ol className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
        {query.data.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
            <span>
              <strong className="font-medium">{item.actor?.name ?? 'Someone'}</strong> {describeActivity(item)}
            </span>
            <time className="text-xs text-slate-500" dateTime={item.created_at}>
              {formatDateTime(item.created_at)}
            </time>
          </li>
        ))}
      </ol>
      <Pagination page={page} pageSize={PAGE_SIZE} total={query.data.total} onChange={setPage} />
    </div>
  )
}