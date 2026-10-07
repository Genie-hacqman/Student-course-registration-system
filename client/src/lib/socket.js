import { useEffect } from 'react'
import { io } from 'socket.io-client'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { API_ORIGIN, getToken, refreshAccessToken } from '../api/client'
import { invalidateRegistration, keys } from '../api/student'
import { staffKeys } from '../api/staff'
import { useAuth } from '../auth/AuthProvider'

export const EVENTS = {
  CAPACITY: 'course.capacity.updated',
  REGISTRATION_CREATED: 'registration.created',
  REGISTRATION_STATUS: 'registration.status.changed',
  TIMETABLE: 'timetable.updated',
  WAITLIST_SEAT: 'waitlist.seat.available',
  NOTIFICATION: 'notification.created',
}

let socket = null
export const getSocket = () => socket

const patchSeats = (qc, { sectionId, seatsTaken, seatsAvailable }) => {
  qc.setQueryData(keys.available, (data) => data && ({
    ...data,
    courses: data.courses.map((c) => ({
      ...c,
      sections: c.sections.map((s) => (s.id === sectionId ? { ...s, seatsTaken, seatsAvailable } : s)),
    })),
  }))
}

export function SocketBridge() {
  const { user, refreshUser } = useAuth()
  const qc = useQueryClient()

  useEffect(() => {
    if (!user) return undefined
    socket = io(API_ORIGIN || undefined, { auth: (cb) => cb({ token: getToken() }), transports: ['websocket'] })
    socket.on('connect', joinWanted)

    let retried = false
    socket.on('connect', () => { retried = false })
    socket.on('connect_error', async (err) => {
      if (retried || !/auth|token|jwt|unauthor/i.test(err.message)) return
      retried = true
      try {
        await refreshAccessToken()
        socket?.connect()
      } catch {}
    })
    socket.on(EVENTS.NOTIFICATION, (n) => {
      toast(n.title, { description: n.message })
      qc.invalidateQueries({ queryKey: ['notifications'] })
      if (n.type?.startsWith('ACCOUNT_REQUEST')) {
        qc.invalidateQueries({ queryKey: ['change-requests'] })
        qc.invalidateQueries({ queryKey: ['api', '/admin/account-requests'] })
        if (n.type === 'ACCOUNT_REQUEST_APPROVED') refreshUser().catch(() => {})
      }
      if (n.type?.endsWith('_BY_STAFF')) invalidateRegistration(qc)
    })
    let staffTimer = null
    const refreshStaff = () => {
      clearTimeout(staffTimer)
      staffTimer = setTimeout(() => qc.invalidateQueries({ queryKey: staffKeys.all }), 1000)
    }
    const isStudent = user.role?.name === 'STUDENT'

    socket.on(EVENTS.REGISTRATION_CREATED, () => !isStudent && refreshStaff())
    socket.on(EVENTS.REGISTRATION_STATUS, () => (isStudent ? invalidateRegistration(qc) : refreshStaff()))
    socket.on(EVENTS.TIMETABLE, () => invalidateRegistration(qc))
    socket.on(EVENTS.WAITLIST_SEAT, () => invalidateRegistration(qc))
    socket.on(EVENTS.CAPACITY, (payload) => (isStudent ? patchSeats(qc, payload) : refreshStaff()))

    return () => {
      clearTimeout(staffTimer)
      socket?.disconnect()
      socket = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, qc])

  return null
}

const wantedRooms = new Map()
const joinWanted = () => {
  if (socket?.connected && wantedRooms.size) socket.emit('section:join', [...wantedRooms.keys()])
}

export function useSectionRooms(sectionIds) {
  const key = [...sectionIds].sort((a, b) => a - b).join(',')
  useEffect(() => {
    const ids = key ? key.split(',').map(Number) : []
    const added = ids.filter((id) => !wantedRooms.has(id))
    ids.forEach((id) => wantedRooms.set(id, (wantedRooms.get(id) ?? 0) + 1))
    if (added.length && socket?.connected) socket.emit('section:join', added)
    return () => {
      const removed = ids.filter((id) => {
        const n = (wantedRooms.get(id) ?? 1) - 1
        if (n > 0) wantedRooms.set(id, n)
        else wantedRooms.delete(id)
        return n <= 0
      })
      if (removed.length && socket?.connected) socket.emit('section:leave', removed)
    }
  }, [key])
}
