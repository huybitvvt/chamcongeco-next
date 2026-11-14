import type { EmployeeAttendance, EmployeeCreated, RecognitionResponse, RequestStatus, Session } from '../types/face'

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
const KEY = 'attendly.access-key'
export const getAccessKey = () => sessionStorage.getItem(KEY) ?? ''
export const setAccessKey = (key: string) => key ? sessionStorage.setItem(KEY, key) : sessionStorage.removeItem(KEY)

export class ApiError extends Error {
  status: number
  code: string
  constructor(message: string, status: number, code = '') {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(15_000)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  const headers = new Headers(options.headers)
  const key = getAccessKey()
  if (key) headers.set('Authorization', `Bearer ${key}`)
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers, signal, cache: 'no-store' })
  } catch {
    if (options.signal?.aborted) throw new DOMException('Đã hủy yêu cầu.', 'AbortError')
    throw new ApiError(timeout.aborted
      ? 'Máy chủ phản hồi chậm. Đang kiểm tra lại kết quả chấm công.'
      : 'Không kết nối được máy chủ chấm công. Kiểm tra kết nối.', 0, timeout.aborted ? 'timeout' : 'network')
  }
  if (!response.ok) {
    let message = `Yêu cầu thất bại (mã ${response.status}).`
    let code = ''
    try {
      const body = await response.json() as { detail?: unknown; code?: string }
      if (typeof body.detail === 'string') message = body.detail
      code = body.code ?? ''
    } catch { /* Keep the HTTP fallback for non-JSON proxy errors. */ }
    if (response.status === 401 && path !== '/api/session') window.dispatchEvent(new Event('attendly:authentication-required'))
    throw new ApiError(message, response.status, code)
  }
  return response.json() as Promise<T>
}

export const getSession = (signal?: AbortSignal) => request<Session>('/api/session', { signal })
export const getEmployees = (signal?: AbortSignal) => request<EmployeeAttendance[]>('/api/employees', { signal })
export const getRequestStatus = (id: string, signal?: AbortSignal) => request<RequestStatus>(`/api/recognition-requests/${encodeURIComponent(id)}`, { signal })

export function enrollEmployee(name: string, images: File[], employeeId?: string, signal?: AbortSignal): Promise<EmployeeCreated> {
  const body = new FormData()
  body.append('name', name)
  body.append('consent', 'true')
  images.forEach(image => body.append('image', image))
  return request<EmployeeCreated>(employeeId ? `/api/employees/${encodeURIComponent(employeeId)}/face` : '/api/employees', {
    method: employeeId ? 'PUT' : 'POST', body, signal,
  })
}

export function recognizeFrame(image: Blob, requestId: string, signal?: AbortSignal): Promise<RecognitionResponse> {
  const body = new FormData()
  body.append('image', image, 'camera-frame.jpg')
  body.append('request_id', requestId)
  body.append('action', 'auto')
  return request<RecognitionResponse>('/api/recognize', { method: 'POST', body, signal })
}
