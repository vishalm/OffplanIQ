'use client'

import { AiChat } from './AiChat'

export function ChatProvider({ projectData }: { projectData: string }) {
  return <AiChat projectData={projectData} />
}
