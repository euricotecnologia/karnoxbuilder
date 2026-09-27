import { useEffect, useRef, useState } from 'react'
import './ModelCombobox.css'

interface ModelComboboxProps {
  id: string
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
}

export function ModelCombobox({ id, value, onChange, options, placeholder }: ModelComboboxProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // O valor selecionado não deve atuar como filtro ao abrir o menu. Caso
  // contrário, apenas o modelo atual aparece e um catálogo recém-carregado
  // parece vazio. A filtragem começa somente quando o usuário digita.
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = normalizedQuery ? options.filter((o) => o.toLowerCase().includes(normalizedQuery)) : options

  return (
    <div className="model-combobox" ref={containerRef}>
      <input
        id={id}
        value={value}
        autoComplete="off"
        placeholder={placeholder}
        onFocus={() => {
          setQuery('')
          setOpen(true)
        }}
        onChange={(e) => {
          const nextValue = e.target.value
          onChange(nextValue)
          setQuery(nextValue)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && filtered.length > 0 && (
        <ul className="model-combobox-list">
          {filtered.map((option) => (
            <li
              key={option}
              onClick={() => {
                onChange(option)
                setQuery('')
                setOpen(false)
              }}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
