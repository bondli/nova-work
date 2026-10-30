import { Lightbulb } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'

interface SuggestionProps {
  items: string[]
  onSelect: (value: string) => void
}

/** 空态建议问题：点击回填输入框 */
export function Suggestion({ items, onSelect }: SuggestionProps) {
  return (
    <div className="grid w-full max-w-[560px] gap-2">
      {items.map((item) => (
        <Button
          key={item}
          type="button"
          variant="outline"
          className="h-auto justify-start px-3 py-2.5 text-left text-body font-normal"
          onClick={() => onSelect(item)}
        >
          <Lightbulb className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          {item}
        </Button>
      ))}
    </div>
  )
}
