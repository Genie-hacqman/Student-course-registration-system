import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from './client'

export const useRoles = () => useQuery({ queryKey: ['admin', 'roles'], queryFn: () => api.get('/admin/roles').then(unwrap) })

export const usePermissionCatalog = () =>
  useQuery({ queryKey: ['admin', 'permissions'], queryFn: () => api.get('/admin/permissions').then(unwrap), staleTime: Infinity })

export const useSetRolePermissions = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, permissions }) => api.put(`/admin/roles/${id}/permissions`, { permissions }).then(unwrap),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin', 'roles'] }),
  })
}
