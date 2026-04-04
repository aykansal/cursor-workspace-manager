import type { Workspace } from "../../../../electron/preload";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PAGE_SIZE, getProjectName } from "../lib/workspace-utils";

type WorkspaceTableCardProps = {
  currentPage: number;
  items: Workspace[];
  sourceHash: string | null;
  searchIsStale: boolean;
  searchQuery: string;
  totalPages: number;
  totalRows: number;
  onSearchChange: (value: string) => void;
  visiblePages: number[];
  onPageChange: (page: number) => void;
  onSelectSource: (hash: string) => void;
  onTransfer: (targetHash: string) => void;
};

export function WorkspaceTableCard({
  currentPage,
  items,
  sourceHash,
  searchIsStale,
  searchQuery,
  totalPages,
  totalRows,
  onSearchChange,
  visiblePages,
  onPageChange,
  onSelectSource,
  onTransfer,
}: WorkspaceTableCardProps) {
  return (
    <Card className="min-h-0 overflow-hidden border border-border/80 bg-card/90">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle>All Folders</CardTitle>
          <div className="flex w-full items-center justify-end gap-2 md:w-auto">
            {searchIsStale ? (
              <span className="text-xs text-muted-foreground">Updating...</span>
            ) : null}
            <Input
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search all entries"
              className="w-full md:w-72"
            />
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="min-h-0 flex-1 px-0">
        <div className="workspace-scroll h-full overflow-auto">
          <Table className="table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead className="w-72 pl-4">Project</TableHead>
                <TableHead className="w-52">Hash</TableHead>
                <TableHead className="w-20 text-center">Chats</TableHead>
                <TableHead className="w-56">Updated</TableHead>
                <TableHead className="w-44 pr-4 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((workspace) => {
                const isSource = sourceHash === workspace.hash;

                return (
                  <TableRow key={workspace.hash}>
                    <TableCell className="pl-4 font-medium">
                      <div className="flex flex-col gap-0.5">
                        <span>{getProjectName(workspace.projectPath)}</span>
                        <span className="max-w-70 truncate text-xs text-muted-foreground">
                          {workspace.projectPath}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell
                      className="font-mono text-xs text-muted-foreground"
                      title={workspace.hash}
                    >
                      {workspace.hash.slice(0, 12)}...
                    </TableCell>
                    <TableCell className="text-center">
                      {workspace.chatCount}
                    </TableCell>
                    <TableCell>
                      {workspace.lastModified
                        ? new Date(workspace.lastModified).toLocaleString()
                        : "-"}
                    </TableCell>
                    <TableCell className="pr-4">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant={isSource ? "default" : "secondary"}
                          onClick={() => onSelectSource(workspace.hash)}
                        >
                          {isSource ? "Selected" : "Source"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onTransfer(workspace.hash)}
                          disabled={
                            !sourceHash || sourceHash === workspace.hash
                          }
                        >
                          Transfer
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <CardFooter className="justify-between border-t bg-card/85">
        <span className="text-xs text-muted-foreground">
          Rows per page: {PAGE_SIZE}/{totalRows}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          {visiblePages.map((page) => (
            <Button
              key={page}
              size="sm"
              variant={page === currentPage ? "default" : "outline"}
              onClick={() => onPageChange(page)}
            >
              {page}
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
