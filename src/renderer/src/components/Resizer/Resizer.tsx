import { useRef, useState } from 'react'
import './Resizer.css'

interface ResizerProps {
  direction: 'vertical' | 'horizontal'
  onResize: (deltaPx: number) => void
}

export function Resizer({ direction, onResize }: ResizerProps): JSX.Element {
  const [active, setActive] = useState(false)
  const lastPos = useRef(0)

  function handleMouseDown(e: React.MouseEvent): void {
    e.preventDefault()
    setActive(true)
    lastPos.current = direction === 'vertical' ? e.clientX : e.clientY

    function handleMouseMove(ev: MouseEvent): void {
      const pos = direction === 'vertical' ? ev.clientX : ev.clientY
      const delta = pos - lastPos.current
      lastPos.current = pos
      onResize(delta)
    }

    function handleMouseUp(): void {
      setActive(false)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  return <div className={`resizer ${direction}${active ? ' active' : ''}`} onMouseDown={handleMouseDown} />
}
