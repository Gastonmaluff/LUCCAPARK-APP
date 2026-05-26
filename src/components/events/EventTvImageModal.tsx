import { useEffect, useState } from 'react'
import { ImageUp, X } from 'lucide-react'
import { updateEventTvSettings, uploadEventTvImage } from '../../services/eventService'
import { formatEventTimeRange } from '../../utils/eventCapacity'
import { StatusPill } from '../StatusPill'
import type { LuccaEvent } from '../../types'

interface EventTvImageModalProps {
  event: LuccaEvent
  onClose: () => void
}

export function EventTvImageModal({ event, onClose }: EventTvImageModalProps) {
  const [displayEnabled, setDisplayEnabled] = useState(event.tvDisplayEnabled ?? event.tvModeEnabled)
  const [imageUrl] = useState(event.tvImageUrl || event.tvBannerImageUrl || '')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl('')
      return undefined
    }

    const objectUrl = URL.createObjectURL(imageFile)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [imageFile])

  const saveSettings = async () => {
    setMessage(null)

    if (displayEnabled && !imageFile && !imageUrl) {
      setMessage('Selecciona una imagen antes de activar la TV del evento.')
      return
    }

    setIsSaving(true)
    try {
      const nextImageUrl = imageFile ? await uploadEventTvImage(event.id, imageFile) : imageUrl
      await updateEventTvSettings(event.id, {
        tvModeEnabled: displayEnabled,
        tvDisplayEnabled: displayEnabled,
        tvImageUrl: nextImageUrl,
        tvBannerImageUrl: nextImageUrl,
        tvTitle: event.tvTitle,
        tvMessage: event.tvMessage,
        showGuestCounterOnTv: false,
        showEventNameOnTv: false,
        hideSensitiveInfoOnTv: true,
      })
      onClose()
    } catch (error) {
      console.error('[Evento TV] No se pudo guardar la imagen', error)
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar la configuracion de TV.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card event-tv-image-modal" role="dialog" aria-modal="true" aria-labelledby="event-tv-image-title">
        <div className="modal-header">
          <div>
            <span className="eyebrow">TV del evento</span>
            <h2 id="event-tv-image-title">Imagen para TV del evento</h2>
            <p>
              {event.title} · {event.date} · {formatEventTimeRange(event)}
            </p>
          </div>
          <div className="modal-header-actions">
            <StatusPill tone={event.status === 'active' ? 'available' : 'warning'}>{event.status === 'active' ? 'En curso' : 'Reservado'}</StatusPill>
            <button className="icon-button" disabled={isSaving} onClick={onClose} type="button" aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="event-tv-preview">
          {previewUrl || imageUrl ? (
            <img alt="Vista previa de TV del evento" src={previewUrl || imageUrl} />
          ) : (
            <div>
              <ImageUp size={34} />
              <strong>Sin imagen cargada</strong>
            </div>
          )}
        </div>

        <label className="field">
          <span>Subir imagen horizontal 16:9</span>
          <input accept="image/png,image/jpeg,image/webp" disabled={isSaving} onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} type="file" />
        </label>

        <div className="tv-display-choice" role="group" aria-label="Estado de TV del evento">
          <button className={displayEnabled ? 'active' : ''} disabled={isSaving} onClick={() => setDisplayEnabled(true)} type="button">
            Mostrar imagen en TV
          </button>
          <button className={!displayEnabled ? 'active' : ''} disabled={isSaving} onClick={() => setDisplayEnabled(false)} type="button">
            TV desactivada para este evento
          </button>
        </div>

        {message ? <div className="form-alert error">{message}</div> : null}

        <div className="modal-actions">
          <button className="button ghost" disabled={isSaving} onClick={onClose} type="button">
            Cancelar
          </button>
          <button className="button primary" disabled={isSaving} onClick={saveSettings} type="button">
            {isSaving ? 'Guardando...' : 'Guardar configuracion'}
          </button>
        </div>
      </section>
    </div>
  )
}
