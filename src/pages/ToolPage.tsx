import { Suspense } from 'react'
import { useParams } from 'react-router'
import { getTool } from '../tools/registry'
import { toolComponents } from '../tools/routes'
import { ProgressBar } from '../components/ProgressBar'
import { NotFound } from './NotFound'
import { ToolPlaceholder } from './ToolPlaceholder'

export function ToolPage() {
  const { slug = '' } = useParams()
  const tool = getTool(slug)
  if (!tool) return <NotFound />

  const Component = toolComponents[slug]
  if (tool.status !== 'available' || !Component) {
    return <ToolPlaceholder tool={tool} />
  }

  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-4xl px-6 py-16">
          <ProgressBar label={`Loading ${tool.name}…`} />
        </div>
      }
    >
      <Component />
    </Suspense>
  )
}
