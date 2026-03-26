import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

type TransferStatusAlertProps = {
  status: string
}

export function TransferStatusAlert({ status }: TransferStatusAlertProps) {
  if (!status) return null

  return (
    <Alert>
      <AlertTitle>Transfer Result</AlertTitle>
      <AlertDescription>{status}</AlertDescription>
    </Alert>
  )
}
