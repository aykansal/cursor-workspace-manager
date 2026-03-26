import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function HeroCard() {
  return (
    <Card className="border border-border/80 bg-card/85">
      <CardHeader>
        <CardTitle className="text-2xl tracking-tight md:text-4xl">Cursor Workspace Manager</CardTitle>
        <CardDescription>
          Minimal transfer control plane inspired by Linear and Notion: clean rows, fast actions, no visual noise.
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
