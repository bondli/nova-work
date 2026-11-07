import { useEffect, useState } from 'react'
import { Download, HardDrive, Monitor, Plus, RefreshCw, Smartphone, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { EmptyState } from '@renderer/components/common/EmptyState'
import { SegmentedControl } from '@renderer/components/common/SegmentedControl'
import { unwrap } from '@renderer/lib/ipc'

interface ShareFile {
  name: string
  size: number
  mtime: number
}

interface Peer {
  deviceId: string
  name: string
  role: 'desktop' | 'phone'
  online: boolean
}

interface RelayStatus {
  connected: boolean
  peers: Peer[]
  lastError: string | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 文件共享设置页：设备列表 / 本机共享 */
export function FileShareTab() {
  const [status, setStatus] = useState<RelayStatus | null>(null)
  const [tab, setTab] = useState<'devices' | 'local'>('devices')
  const [activeDevice, setActiveDevice] = useState<Peer | null>(null)
  const [remoteFiles, setRemoteFiles] = useState<ShareFile[]>([])
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [localFiles, setLocalFiles] = useState<ShareFile[]>([])
  const [localLoading, setLocalLoading] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  // 订阅中继状态变更
  useEffect(() => {
    const off = window.nova.share.onStatus((s) => setStatus(s))
    void window.nova.share.status().then((res) => {
      const ok = unwrap(res)
      if (ok) setStatus(ok)
    })
    return off
  }, [])

  const refreshLocal = async () => {
    setLocalLoading(true)
    try {
      const res = await window.nova.share.localList()
      const files = unwrap(res)
      if (files) setLocalFiles(files)
    } finally {
      setLocalLoading(false)
    }
  }

  useEffect(() => {
    void refreshLocal()
  }, [])

  const handleUpload = async () => {
    const res = await window.nova.share.localUpload()
    const result = unwrap(res)
    if (result) {
      toast.success(`已添加到共享目录：${result.name}`)
      void refreshLocal()
    }
  }

  const handleDelete = async (name: string) => {
    try {
      await unwrap(await window.nova.share.localDelete(name))
      toast.success(`已删除：${name}`)
      void refreshLocal()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败')
    }
  }

  const enterDevice = async (peer: Peer) => {
    setActiveDevice(peer)
    setRemoteLoading(true)
    setRemoteFiles([])
    try {
      const res = await window.nova.share.remoteList(peer.deviceId)
      const files = unwrap(res)
      if (files) setRemoteFiles(files)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '获取文件列表失败')
    } finally {
      setRemoteLoading(false)
    }
  }

  const handleDownload = async (peer: Peer, name: string) => {
    setDownloading(name)
    try {
      const res = await window.nova.share.remoteDownload(peer.deviceId, name)
      const ok = unwrap(res)
      if (ok?.filePath) {
        toast.success(`已下载到：${ok.filePath}`)
      } else {
        toast.info('已取消下载')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '下载失败')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* 中继连接状态 */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${status?.connected ? 'bg-emerald-500' : 'bg-muted-foreground'}`}
          />
          <span className="text-ui">
            中继{status?.connected ? '已连接' : '未连接'}
            {status?.lastError ? `（${status.lastError}）` : ''}
          </span>
        </div>
        <Badge variant="secondary">同组设备 {status?.peers.length ?? 0}</Badge>
      </div>

      <SegmentedControl
        className="self-start"
        value={tab}
        options={[
          { key: 'devices', label: '设备列表' },
          { key: 'local', label: '本机共享' }
        ]}
        onChange={(key) => setTab(key as 'devices' | 'local')}
      />

      {/* 设备列表 */}
      {tab === 'devices' ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {activeDevice ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setActiveDevice(null)}>
                  ← 返回设备列表
                </Button>
                <span className="text-ui font-medium">{activeDevice.name} 的共享文件</span>
              </div>
              {remoteLoading ? (
                <div className="flex flex-1 items-center justify-center text-muted-foreground">
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> 加载中…
                </div>
              ) : remoteFiles.length === 0 ? (
                <EmptyState icon={HardDrive} title="该设备暂无共享文件" description="等待对方上传文件到共享目录" />
              ) : (
                <FileTable
                  files={remoteFiles}
                  action={(file) => (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={downloading === file.name}
                      onClick={() => handleDownload(activeDevice, file.name)}
                    >
                      {downloading === file.name ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1 h-3.5 w-3.5" />}
                      {downloading === file.name ? '下载中' : '下载'}
                    </Button>
                  )}
                />
              )}
            </div>
          ) : (status?.peers.length ?? 0) === 0 ? (
            <EmptyState icon={Monitor} title="暂无其他设备" description="同门店其他设备登录后会出现在这里" />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {status?.peers.map((peer) => (
                <button
                  key={peer.deviceId}
                  type="button"
                  onClick={() => enterDevice(peer)}
                  disabled={!peer.online}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-left transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
                    {peer.role === 'desktop' ? <Monitor className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-ui font-medium">{peer.name}</p>
                    <p className="text-meta text-muted-foreground">{peer.role === 'desktop' ? '桌面端' : '手机端'}</p>
                  </div>
                  <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${peer.online ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* 本机共享 */
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-meta text-muted-foreground">共享目录：~/.nova/sharefiles</p>
            <Button size="sm" onClick={handleUpload}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              上传文件
            </Button>
          </div>
          {localLoading ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> 加载中…
            </div>
          ) : localFiles.length === 0 ? (
            <EmptyState icon={HardDrive} title="本机暂无共享文件" description="点击「上传文件」把文件复制到共享目录" action={
              <Button onClick={handleUpload}><Plus className="mr-1 h-4 w-4" />上传文件</Button>
            } />
          ) : (
            <FileTable
              files={localFiles}
              action={(file) => (
                <Button size="sm" variant="outline" onClick={() => handleDelete(file.name)}>
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  删除
                </Button>
              )}
            />
          )}
        </div>
      )}
    </div>
  )
}

/** 文件列表表格 */
function FileTable({ files, action }: { files: ShareFile[]; action: (file: ShareFile) => React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border text-left text-meta text-muted-foreground">
            <th className="px-4 py-2 font-medium">文件名</th>
            <th className="px-4 py-2 font-medium">大小</th>
            <th className="px-4 py-2 font-medium">修改时间</th>
            <th className="px-4 py-2 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr key={file.name} className="border-b border-border last:border-0 hover:bg-accent/40">
              <td className="px-4 py-2.5 font-medium">{file.name}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{formatBytes(file.size)}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{formatTime(file.mtime)}</td>
              <td className="px-4 py-2.5 text-right">{action(file)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
