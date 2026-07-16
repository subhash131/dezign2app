import { Button } from '@workspace/ui/components/button'
import Link from 'next/link'
import React from 'react'

const DocumentsPage = () => {
  return (
    <div className='w-full flex flex-col items-center justify-center h-screen gap-4'>DocumentsPage
    <Button asChild>
        <Link href="/projects">Go to Projects</Link>
    </Button>
    </div>
  )
}

export default DocumentsPage