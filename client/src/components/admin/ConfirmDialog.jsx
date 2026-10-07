import { useState } from 'react'
import { toast } from 'sonner'
import { Button, Modal } from '../ui'
import { friendlyMessage } from '../../lib/forms'

export default function ConfirmDialog({ open, onClose, title, children, confirmLabel = 'Confirm', danger = true, onConfirm }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const close = () => {
    setError(null)
    onClose()
  }

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      close()
    } catch (err) {
      if (err.status >= 400 && err.status < 500) setError(friendlyMessage(err))
      else toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      footer={(
        <>
          <Button variant="secondary" onClick={close}>{error ? 'Close' : 'Cancel'}</Button>
          {!error && <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={confirm}>{confirmLabel}</Button>}
        </>
      )}
    >
      <div className="space-y-3 text-sm text-slate-600">
        {children}
        {error && <p className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
      </div>
    </Modal>
  )
}
