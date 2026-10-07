import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from './client'

const read = (res) => (res.data.meta ? { items: res.data.data, meta: res.data.meta } : res.data.data)

export const useApi = (path, params, options = {}) =>
  useQuery({
    queryKey: ['api', path, params ?? {}],
    queryFn: () => api.get(path, { params }).then(read),
    enabled: Boolean(path),
    placeholderData: (prev) => prev,
    ...options,
  })

export const useApiMutation = (fn, { success } = {}) => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, vars) => {
      if (success) toast.success(typeof success === 'function' ? success(data, vars) : success)
      return qc.invalidateQueries()
    },
  })
}

export const http = {
  post: (path, body) => api.post(path, body).then((r) => r.data.data),
  put: (path, body) => api.put(path, body).then((r) => r.data.data),
  patch: (path, body) => api.patch(path, body).then((r) => r.data.data),
  delete: (path, body) => api.delete(path, body ? { data: body } : undefined).then((r) => r.data?.data),
}
