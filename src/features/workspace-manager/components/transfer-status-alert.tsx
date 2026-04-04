import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CheckCircle2Icon, CircleAlertIcon, InfoIcon } from 'lucide-react'

type TransferStatusAlertProps = {
  status: string
}

function getAlertPresentation(status: string) {
  const normalized = status.toLowerCase()

  if (normalized.startsWith('transfer failed') || normalized.includes('unable') || normalized.includes('missing')) {
    return {
      variant: 'destructive' as const,
      title: 'Transfer failed',
      icon: CircleAlertIcon,
    }
  }

  if (normalized.includes('already exists') || normalized.startsWith('source set') || normalized.includes('select a source')) {
    return {
      variant: 'default' as const,
      title: 'Transfer status',
      icon: InfoIcon,
    }
  }

  return {
    variant: 'default' as const,
    title: 'Transfer complete',
    icon: CheckCircle2Icon,
  }
}

export function TransferStatusAlert({ status }: TransferStatusAlertProps) {
  if (!status) return null

  const { variant, title, icon: Icon } = getAlertPresentation(status)

  return (
    <Alert variant={variant} className="border-white/10 bg-white/3 px-3 py-2.5">
      <Icon />
      <AlertTitle className="text-[13px]">{title}</AlertTitle>
      <AlertDescription className="text-[13px] leading-5 whitespace-pre-wrap break-words">
        {status.replace(/^Transfer failed:\s*/i, '')}
      </AlertDescription>
    </Alert>
  )
}
