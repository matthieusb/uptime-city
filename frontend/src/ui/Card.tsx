import type { ReactNode } from 'react'

export default function Card({
  title,
  aside,
  testId,
  children,
}: {
  title: string
  aside?: ReactNode
  testId?: string
  children: ReactNode
}) {
  return (
    <section className="card" data-testid={testId}>
      <header className="card-header">
        <h2 className="card-title">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  )
}
