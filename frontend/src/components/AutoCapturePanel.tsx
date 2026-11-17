import { Button, ComposedModal, InlineNotification, ModalBody } from '@carbon/react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, CheckmarkFilled } from '@carbon/icons-react'
import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { POSES } from '../enrollment/types'
import type { PoseId } from '../enrollment/types'
import type { useAutoEnrollment } from '../hooks/useAutoEnrollment'

interface Props extends Omit<ReturnType<typeof useAutoEnrollment>, 'start' | 'clear'> {
  disabled: boolean
  invalidIndex: number | null
  onStart: (pose?: PoseId, restart?: boolean) => void
}

export function AutoCapturePanel({ photos, state, target, progress, hint, error, frameSize, videoRef, stop, disabled, invalidIndex, onStart }: Props) {
  const busy = state === 'loading' || state === 'capturing' || state === 'checking'
  const count = POSES.filter(pose => photos[pose.id]).length
  const activePose = POSES.find(pose => pose.id === target) ?? POSES[0]
  const holding = state === 'capturing' && progress > 0
  const launcherRef = useRef<HTMLButtonElement>(null)
  const Direction = holding ? CheckmarkFilled : state !== 'capturing' ? Camera
    : { front: Camera, left: ArrowLeft, right: ArrowRight, up: ArrowUp, down: ArrowDown }[target]

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const inlineVideo = video as HTMLVideoElement & {
      webkitPresentationMode?: string
      webkitSetPresentationMode?: (mode: 'inline') => void
    }
    const keepInline = () => {
      if (document.pictureInPictureElement === video) void document.exitPictureInPicture().catch(() => {})
      if (inlineVideo.webkitPresentationMode && inlineVideo.webkitPresentationMode !== 'inline') {
        try { inlineVideo.webkitSetPresentationMode?.('inline') } catch { /* Browser controls the presentation mode. */ }
      }
    }
    video.addEventListener('enterpictureinpicture', keepInline)
    video.addEventListener('webkitpresentationmodechanged', keepInline)
    return () => {
      video.removeEventListener('enterpictureinpicture', keepInline)
      video.removeEventListener('webkitpresentationmodechanged', keepInline)
    }
  }, [videoRef])

  return <div className="auto-capture" data-capture-state={state}>
    <div className="camera-toolbar" hidden={busy}>
      <Button ref={launcherRef} type="button" disabled={disabled} onClick={() => onStart(undefined, count === 5)}>
          {count === 5 ? 'Thu lại 5 góc' : count > 0 ? 'Tiếp tục thu' : 'Bắt đầu thu 5 góc'}
      </Button>
      {count > 0 && count < 5 && !busy ? <Button kind="ghost" type="button" disabled={disabled} onClick={() => onStart(undefined, true)}>Thu lại từ đầu</Button> : null}
      {!busy ? <span className="capture-count" role="status" aria-live="polite">Đã kiểm tra {count}/5 góc</span> : null}
    </div>
    {error ? <InlineNotification kind="error" role="alert" title="Chưa thu được ảnh" subtitle={error} hideCloseButton lowContrast /> : null}
    {count < 5 ? <div className="camera-frame capture-placeholder" aria-hidden={busy}>
      <div className="camera-placeholder"><div>
        <strong>{count ? 'Tiếp tục thu các góc còn thiếu' : 'Tự thu ảnh theo hướng dẫn'}</strong>
        <p>{count ? 'Các góc đã kiểm tra được giữ lại.' : 'Nhập tên, xác nhận đồng ý và bắt đầu. Hướng dẫn sẽ hiện ngay tại camera.'}</p>
      </div></div>
    </div> : null}
    {count === 5 ? <div className="capture-complete" aria-hidden={busy}>
      <CheckmarkFilled size={24} aria-hidden="true" /><div><strong>Đã thu đủ 5 góc khuôn mặt</strong><p>Kiểm tra ảnh bên dưới rồi lưu hồ sơ. Có thể chụp lại từng góc.</p></div>
    </div> : null}
    <ComposedModal open={busy} className="capture-dialog" containerClassName="capture-dialog-container"
      aria-label="Thu 5 góc khuôn mặt" onClose={stop} preventCloseOnClickOutside launcherButtonRef={launcherRef}
      selectorPrimaryFocus=".capture-stop" size="lg">
      <div className="capture-session-header">
        <div><h3>Thu khuôn mặt</h3>
          {busy ? <span className="capture-count" role="status" aria-live="polite">Đã kiểm tra {count}/5 góc</span> : null}
        </div>
        <Button className="capture-stop" kind="tertiary" type="button" onClick={stop}>Dừng thu</Button>
      </div>
      <ModalBody className="capture-session-body">
        <div className={`capture-stage${holding ? ' holding' : ''}`} data-pose={target}>
          <div className="capture-direction" aria-live="polite">
            <Direction size={32} aria-hidden="true" />
            <strong>{state === 'loading' ? 'Đang chuẩn bị camera…' : state === 'checking' ? `Đang kiểm tra · ${activePose.label}` : activePose.instruction}</strong>
          </div>
          <div className="capture-video-area">
            <div className="camera-frame enrollment-camera" style={{ aspectRatio: `${frameSize.width} / ${frameSize.height}`, '--capture-aspect': frameSize.width / frameSize.height } as CSSProperties}>
              <video ref={videoRef} muted playsInline disablePictureInPicture disableRemotePlayback aria-label="Camera đăng ký trực tiếp" className="mirrored-preview" />
              {busy ? <div className="enrollment-guide" aria-hidden="true"><span /></div> : null}
            </div>
          </div>
          <div className="capture-instruction">
            <p role="status" className="capture-hint">{hint}</p>
            <div className="capture-hold" role="progressbar" aria-label="Giữ ổn định đúng góc" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
        <ol className="capture-steps" aria-label="Tiến độ thu năm góc">
          {POSES.map((pose, index) => <li key={pose.id} className={photos[pose.id] ? 'complete' : undefined}
            aria-current={busy && target === pose.id ? 'step' : undefined}>
            <span className="capture-step-number" aria-hidden="true">{photos[pose.id] ? <CheckmarkFilled size={20} /> : index + 1}</span>
            <span>{pose.label}</span>
            <span className="cds--visually-hidden">{photos[pose.id] ? 'Đã kiểm tra' : busy && target === pose.id ? 'Đang thu' : 'Chưa thu'}</span>
          </li>)}
        </ol>
      </ModalBody>
    </ComposedModal>
    <ol className="pose-grid" aria-label="Năm góc khuôn mặt" hidden={busy || count === 0}>
      {POSES.map((pose, index) => {
        const photo = photos[pose.id]
        return <li key={pose.id} className={`pose-card${photo ? ' complete' : ''}${invalidIndex === index ? ' invalid' : ''}`}
          aria-current={state === 'capturing' && target === pose.id ? 'step' : undefined}>
          {photo ? <img src={photo.url} alt={`Góc ${pose.label} đã thu`} /> : <span className="pose-number" aria-hidden="true">{index + 1}</span>}
          <strong>{pose.label}</strong>
          <span>{invalidIndex === index ? 'Cần chụp lại' : photo ? 'Đã kiểm tra' : state === 'checking' && target === pose.id ? 'Đang kiểm tra…' : 'Chưa thu'}</span>
          {photo ? <Button kind="ghost" size="sm" type="button" disabled={disabled || busy} onClick={() => onStart(pose.id)} aria-label={`Chụp lại góc ${pose.label}`}>Chụp lại</Button> : null}
        </li>
      })}
    </ol>
    {!busy ? <p className="capture-note">Ảnh chưa đạt sẽ tự thu lại; hồ sơ chỉ được lưu khi bạn xác nhận.</p> : null}
  </div>
}
