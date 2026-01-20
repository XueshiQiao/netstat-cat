interface ProcessNamePathInfo {
  name: string
  path: string
}

interface ProcessInfo {
  protocol: string
  local: { address: string | null; port: number | null }
  remote: { address: string | null; port: number | null }
  state: string
  pid: number
  processName: string
  uid?: number // uid is not supported on Windows
  fileDescriptor?: string // fileDescriptor is not supported on Windows
  fileType?: string // fileType is not supported on Windows
}

interface ProcessFetcher {
  fetchProcessInfoList(): Promise<ProcessInfo[]>
  fetchProcessNamePathInfo(pid: number): Promise<ProcessNamePathInfo>
}

export type { ProcessNamePathInfo, ProcessInfo, ProcessFetcher }
