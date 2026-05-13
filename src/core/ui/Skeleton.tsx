import type { HTMLAttributes } from 'react'
import { clsx } from 'clsx'

export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx('animate-pulse rounded-lg bg-slate-200/80 dark:bg-slate-700/80', className)}
      {...rest}
    />
  )
}
